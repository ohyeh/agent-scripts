#!/usr/bin/env python3
"""Check, repair, lock or unlock the active Codex context-mode plugin."""
import collections
import json
import os
from pathlib import Path
import re
import select
import shlex
import shutil
import signal
import stat
import subprocess
import sys
import tempfile
import time

FORK = "https://github.com/ohyeh/context-mode.git"

class Codex:
    def __enter__(self):
        self.process = subprocess.Popen(
            ["codex", "app-server", "--stdio"], stdin=subprocess.PIPE,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True,
        )
        self.buffers = {self.process.stdout: b"", self.process.stderr: b""}
        self.deadline = time.monotonic() + 30
        self.sequence = 0
        return self

    def __exit__(self, *_):
        try:
            os.killpg(self.process.pid, signal.SIGTERM)
            self.process.wait(timeout=3)
        except (ProcessLookupError, subprocess.TimeoutExpired):
            pass
        finally:
            try:
                os.killpg(self.process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            self.process.wait()
            for stream in (self.process.stdin, self.process.stdout, self.process.stderr):
                stream.close()

    def rpc(self, method, params):
        self.sequence += 1
        self.process.stdin.write((json.dumps({
            "id": self.sequence, "method": method, "params": params,
        }) + "\n").encode())
        self.process.stdin.flush()
        while True:
            out = self.process.stdout
            while b"\n" in self.buffers[out]:
                line, self.buffers[out] = self.buffers[out].split(b"\n", 1)
                message = json.loads(line)
                if message.get("id") == self.sequence:
                    if "error" in message:
                        raise RuntimeError(f"{method}: {message['error']}")
                    return message["result"]
            remaining = self.deadline - time.monotonic()
            if remaining <= 0:
                raise RuntimeError(f"Codex RPC deadline exceeded during {method}")
            ready, _, _ = select.select(list(self.buffers), [], [], remaining)
            for stream in ready:
                chunk = os.read(stream.fileno(), 65536)
                if not chunk:
                    if stream is out:
                        raise RuntimeError(f"Codex closed stdout during {method}")
                    del self.buffers[stream]
                elif stream is out:
                    self.buffers[stream] += chunk
                else:
                    # Keep CLI diagnostics visible without buffering a full log.
                    sys.stderr.buffer.write(chunk)
                    sys.stderr.buffer.flush()


def active_root(entry, plugin_id, codex_home):
    roots = {Path(h["sourcePath"]).parent.parent for h in entry["hooks"]
             if h.get("pluginId") == plugin_id}
    for warning in entry["warnings"]:
        match = re.fullmatch(
            r"skipping plugin hook in (.+/\.codex-plugin/hooks\.json): "
            r"failed to fingerprint plugin contents: .+", warning,
        )
        if match:
            candidate = Path(match[1]).parent.parent
            manifest = candidate / ".codex-plugin/plugin.json"
            if manifest.is_file() and json.loads(manifest.read_text()).get("name") == "context-mode":
                roots.add(candidate)
    if len(roots) != 1:
        raise RuntimeError(f"enabled context-mode needs one active plugin root; found {len(roots)}")
    root = roots.pop()
    if root.is_symlink() or not root.resolve().is_relative_to((codex_home / "plugins/cache").resolve()):
        raise RuntimeError(f"active context-mode root is outside the local plugin cache: {root}")
    return root


def bin_links(root):
    links = []
    for base, dirs, files in os.walk(root):
        for name in dirs + files:
            path = Path(base) / name
            mode = path.lstat().st_mode
            if stat.S_ISLNK(mode):
                target = os.readlink(path)
                resolved = path.resolve(strict=True)
                if (path.parent.name != ".bin" or "node_modules" not in path.relative_to(root).parts
                        or os.path.isabs(target) or not resolved.is_relative_to(root.resolve())
                        or not resolved.is_file() or not resolved.stat().st_mode & 0o111):
                    raise RuntimeError(f"unsupported plugin link: {path}")
                links.append((path, target, stat.S_IMODE(resolved.stat().st_mode)))
            elif not (stat.S_ISDIR(mode) or stat.S_ISREG(mode)):
                raise RuntimeError(f"unsupported plugin entry: {path}")
    return links


def repair(root, links):
    if not links:
        return
    state = Path(os.environ.get("XDG_STATE_HOME", str(Path.home() / ".local/state")))
    backups = state / "agent-scripts/context-mode-backups"
    backups.mkdir(parents=True, exist_ok=True)
    backup = Path(tempfile.mkdtemp(prefix="bin-links-", dir=backups))
    for path, target, mode in links:
        saved = backup / path.relative_to(root)
        saved.parent.mkdir(parents=True, exist_ok=True)
        saved.symlink_to(target)
        with tempfile.NamedTemporaryFile(mode="w", dir=path.parent, delete=False) as output:
            output.write('#!/bin/sh\nexec "$(dirname "$0")"/' + shlex.quote(target) + ' "$@"\n')
            temporary = Path(output.name)
        try:
            temporary.chmod(mode)
            os.replace(temporary, path)
        finally:
            temporary.unlink(missing_ok=True)
    print(f"REPAIRED [codex-context-mode] {len(links)} bin links; backup: {backup}")


def check_hooks(root, entry, plugin_id):
    hooks = [h for h in entry["hooks"] if h.get("pluginId") == plugin_id]
    manifest = json.loads((root / ".codex-plugin/hooks.json").read_text())
    expected = collections.Counter()
    for event, groups in manifest["hooks"].items():
        expected[event.lower()] += sum(len(group["hooks"]) for group in groups)
    actual = collections.Counter(h["eventName"].lower() for h in hooks)
    diagnostics = [x for x in entry["warnings"] + entry["errors"] if str(root) in str(x)]
    if not hooks or expected != actual or diagnostics:
        raise RuntimeError("context-mode hook registration differs from its manifest or has diagnostics")
    if not all(h["enabled"] and h["trustStatus"] in ("trusted", "managed") for h in hooks):
        raise RuntimeError("context-mode hooks are disabled or need approval; review /hooks in Codex, then rerun deploy --check")
    print(f"PASS [codex-context-mode] {len(hooks)} hooks registered, enabled and trusted; no plugin diagnostics")


def set_locked(root, locked):
    if sys.platform != "darwin":
        raise RuntimeError("plugin locking requires macOS user immutable flags")
    if bin_links(root):
        raise RuntimeError("repair bin links before locking the plugin")
    paths = [root]
    for base, dirs, files in os.walk(root):
        paths.extend(Path(base) / name for name in dirs + files)
    # Lock children first; unlock parents first so updates can resume.
    paths.sort(key=lambda path: len(path.parts), reverse=locked)
    for path in paths:
        flags = path.stat().st_flags
        wanted = flags | stat.UF_IMMUTABLE if locked else flags & ~stat.UF_IMMUTABLE
        if flags != wanted:
            os.chflags(path, wanted)
    if any(bool(path.stat().st_flags & stat.UF_IMMUTABLE) != locked for path in paths):
        raise RuntimeError("plugin lock verification failed")
    action = "LOCKED" if locked else "UNLOCKED"
    print(f"{action} [codex-context-mode] {len(paths)} entries: {root}; hook trust unchanged")


def check_locked(root):
    if sys.platform != "darwin":
        return
    paths = [root]
    for base, dirs, files in os.walk(root):
        paths.extend(Path(base) / name for name in dirs + files)
    if any(not path.stat().st_flags & stat.UF_IMMUTABLE for path in paths):
        raise RuntimeError("plugin lock is incomplete; rerun deploy to lock it")
    print(f"PASS [codex-context-mode] {len(paths)} entries immutable")


def main():
    if sys.argv[1:] not in ([], ["--check"], ["--repair"], ["--lock"], ["--unlock"]):
        raise RuntimeError("usage: python3 scripts/codex-context-mode.py [--check|--repair|--lock|--unlock]")
    codex_home = Path(os.environ.get("CODEX_HOME", str(Path.home() / ".codex")))
    if not shutil.which("codex"):
        if (codex_home / "config.toml").exists():
            raise RuntimeError("Codex config exists but codex executable is unavailable")
        print("SKIP [codex-context-mode] Codex is not installed")
        return
    with Codex() as cli:
        cli.rpc("initialize", {"clientInfo": {"name": "agent-scripts-deploy", "version": "1"},
                               "capabilities": {"experimentalApi": True}})
        config = cli.rpc("config/read", {"includeLayers": False})["config"]
        enabled = [key for key, value in config.get("plugins", {}).items()
                   if key.split("@")[0] == "context-mode" and value.get("enabled", True)]
        if not enabled:
            print("SKIP [codex-context-mode] plugin is not enabled")
            return
        if len(enabled) != 1:
            raise RuntimeError("multiple context-mode plugin identities are enabled")
        params = {"cwds": [str(Path.cwd())]}
        entry = cli.rpc("hooks/list", params)["data"][0]
        root = active_root(entry, enabled[0], codex_home)
        if "--lock" in sys.argv or "--unlock" in sys.argv:
            set_locked(root, "--lock" in sys.argv)
            return
        links = bin_links(root)
        if links and "--repair" not in sys.argv:
            raise RuntimeError(f"{len(links)} incompatible bin links; rerun deploy to repair")
        if "--repair" in sys.argv:
            repair(root, links)
            print("OK [codex-context-mode] plugin entries compatible; hook trust still needs deployment verification")
            return
        # Pinned fork: upstream moved Insight to a hosted product after 1.0.162.
        source = config.get("marketplaces", {}).get("context-mode", {}).get("source")
        if source != FORK:
            raise RuntimeError(f"context-mode marketplace source is {source}, not {FORK}; "
                               "run `codex plugin marketplace remove context-mode && "
                               "codex plugin marketplace add ohyeh/context-mode --ref main`, "
                               "reinstall deps, rerun deploy, then approve /hooks again")
        print(f"PASS [codex-context-mode] marketplace source {FORK}")
        check_locked(root)
        check_hooks(root, entry, enabled[0])


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, KeyError, RuntimeError) as error:
        print(f"FAIL [codex-context-mode] {type(error).__name__}: {error}", file=sys.stderr)
        sys.exit(1)
