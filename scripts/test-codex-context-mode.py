#!/usr/bin/env python3
"""Offline fixtures for Codex plugin links and the app-server boundary."""
import importlib.util
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import time

helper = Path(sys.argv[1])
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("codex_context_mode", helper)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

with tempfile.TemporaryDirectory() as temporary:
    home = Path(temporary)
    root = home / ".codex/plugins/cache/context-mode/context-mode/fixture"
    manifest = root / ".codex-plugin"
    manifest.mkdir(parents=True)
    (manifest / "plugin.json").write_text('{"name":"context-mode"}')
    (manifest / "hooks.json").write_text(json.dumps({"hooks": {
        "PreToolUse": [{"hooks": [{"type": "command", "command": "node hook.mjs"}]}],
    }}))
    directory = root / "node_modules/.bin"
    directory.mkdir(parents=True)
    target = root / "node_modules/package space/cli's $name"
    target.parent.mkdir()
    target.write_text('#!/bin/sh\nprintf "%s\\n" "$@"\n')
    target.chmod(0o755)
    link = directory / "cli"
    link.symlink_to("../package space/cli's $name")
    os.environ.update(HOME=str(home), CODEX_HOME=str(home / ".codex"), XDG_STATE_HOME=str(home / "state"))
    links = module.bin_links(root)
    assert len(links) == 1
    broken = directory / "broken"
    broken.symlink_to("../missing")
    try:
        module.bin_links(root)
        raise AssertionError("broken link accepted")
    except OSError:
        assert link.is_symlink()
    broken.unlink()
    outside = home / "outside"
    outside.write_text("#!/bin/sh\nexit 0\n")
    outside.chmod(0o755)
    escape = directory / "escape"
    escape.symlink_to(outside)
    try:
        module.bin_links(root)
        raise AssertionError("escaping link accepted")
    except RuntimeError:
        assert link.is_symlink()
    escape.unlink()
    module.repair(root, module.bin_links(root))
    assert not link.is_symlink() and not module.bin_links(root)
    args = ["space value", "quote'", "$HOME", "--flag"]
    result = subprocess.run([str(link), *args], capture_output=True, text=True, check=True)
    assert result.stdout.splitlines() == args
    before = link.read_bytes()
    module.repair(root, module.bin_links(root))
    assert link.read_bytes() == before
    assert target.stat().st_mode & 0o777 == 0o755
    print("PASS: bin-link repair preserves targets, special characters, argv and idempotence; invalid preflight leaves links unchanged")

    # Shape and enum values copied from Codex 0.164.0 hooks/list on this host.
    hook = {"pluginId": "context-mode@context-mode", "sourcePath": str(manifest / "hooks.json"),
            "eventName": "preToolUse", "enabled": True, "trustStatus": "trusted"}
    fixture = home / "fixture.json"
    cli_dir = home / "bin"
    cli_dir.mkdir()
    fake = cli_dir / "codex"
    fake.write_text('#!' + sys.executable + '\n' + '''
import json,os,pathlib,sys,time
home=pathlib.Path(os.environ["HOME"])
for line in sys.stdin:
    request=json.loads(line)
    fixture=json.loads((home/"fixture.json").read_text())
    if fixture.get("hang"):
        (home/"server.pid").write_text(str(os.getpid()))
        time.sleep(60)
    method=request["method"]
    if method=="initialize": result={}
    elif method=="config/read": result={"config":{"plugins":{"context-mode@context-mode":{"enabled":fixture.get("enabled",True)}}}}
    elif method=="hooks/list": result={"data":[fixture["entry"]]}
    else: raise RuntimeError("unexpected RPC: "+method)
    print(json.dumps({"id":request["id"],"result":result}),flush=True)
''')
    fake.chmod(0o755)
    os.environ["PATH"] = str(cli_dir) + os.pathsep + os.environ["PATH"]
    def run(entry, check=True, **extra):
        fixture.write_text(json.dumps({"entry": entry, **extra}))
        return subprocess.run([sys.executable, str(helper), "--check" if check else "--repair"],
                              capture_output=True, text=True, timeout=5)
    entry = {"hooks": [hook], "warnings": [], "errors": []}
    assert run(entry).returncode == 0
    assert run({"hooks": [], "warnings": [], "errors": []}).returncode == 1
    assert run(entry, enabled=False).returncode == 0
    assert run({**entry, "hooks": [{**hook, "trustStatus": "modified"}]}).returncode == 1
    assert run({**entry, "hooks": [{**hook, "enabled": False}]}).returncode == 1
    assert run({**entry, "hooks": []}).returncode == 1
    link.unlink()
    link.symlink_to("../package space/cli's $name")
    warning = f"skipping plugin hook in {manifest}/hooks.json: failed to fingerprint plugin contents: unsupported plugin entry type: {link}"
    skipped = {"hooks": [], "warnings": [warning], "errors": []}
    checked = run(skipped)
    assert checked.returncode == 1 and "incompatible bin links" in checked.stderr
    assert link.is_symlink()
    repaired = run(skipped, check=False)
    assert repaired.returncode == 0 and "REPAIRED" in repaired.stdout
    assert not link.is_symlink()
    assert run({**entry, "hooks": [{**hook, "trustStatus": "modified"}]}).returncode == 1
    assert "config/batchWrite" not in fake.read_text()
    print("PASS: RPC checks trusted, modified, disabled and missing hooks; --check preserves symlinks; repair never approves trust")

    if sys.platform == "darwin":
        try:
            module.set_locked(root, True)
            module.set_locked(root, True)
            for path in (target, directory / "new-file"):
                try:
                    path.write_text("must fail")
                    raise AssertionError(f"locked plugin accepted a write: {path}")
                except PermissionError:
                    pass
            fixture.write_text(json.dumps({"entry": entry}))
            assert subprocess.run([sys.executable, str(helper), "--unlock"],
                                  capture_output=True, text=True, timeout=5).returncode == 0
        finally:
            module.set_locked(root, False)
        target.write_bytes(target.read_bytes())
        assert run(entry).returncode == 0
        print("PASS: macOS lock blocks overwrite and creation; repeated lock and CLI unlock preserve hook checks")

    fixture.write_text(json.dumps({"hang": True}))
    with module.Codex() as cli:
        cli.deadline = time.monotonic() + 0.2
        try:
            cli.rpc("initialize", {})
            raise AssertionError("deadline not enforced")
        except RuntimeError as error:
            assert "deadline" in str(error)
        pid = int((home / "server.pid").read_text())
    try:
        os.kill(pid, 0)
        raise AssertionError("app-server survived timeout cleanup")
    except ProcessLookupError:
        pass
    print("PASS: app-server deadline terminates and reaps its process")
