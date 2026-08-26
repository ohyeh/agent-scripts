#!/usr/bin/env bash
# Idempotent pin: every present runtime writes context-mode storage to
# $HOME/.claude/context-mode. Survives plugin upgrades that rewrite MCP env
# and drop CONTEXT_MODE_DIR (incident 2026-08-26: Codex kept PLATFORM=codex
# only; Cursor MCP defaulted to ~/.gemini).
#
# Cursor CLI ignores mcpServers.env (doctor still reports (default) after a
# pin). The live Cursor server is the plugin MCP, not ~/.cursor/mcp.json.
# Wrap that command so CONTEXT_MODE_DIR is in-process.
#
# Usage: scripts/install-context-mode-dir.sh
# Then:  scripts/check-context-mode-dir.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CANON="${HOME}/.claude/context-mode"
WRAPPER_SRC="${ROOT}/scripts/context-mode-mcp.sh"
WRAPPER="${HOME}/.claude/context-mode-mcp.sh"
CHECK="${ROOT}/scripts/check-context-mode-dir.sh"
mkdir -p "$CANON/sessions" "$CANON/content"

pin_toml() {
  local file="$1" section="$2"
  [ -f "$file" ] || return 0
  python3 - "$file" "$section" "$CANON" <<'PY'
import pathlib, sys
path, section, canon = pathlib.Path(sys.argv[1]), sys.argv[2], sys.argv[3]
header = f"[{section}]"
assignment = f'CONTEXT_MODE_DIR = "{canon}"\n'
lines = path.read_text().splitlines(keepends=True)
out, in_sec, found, inserted = [], False, False, False
for i, line in enumerate(lines):
    stripped = line.strip()
    if stripped.startswith("[") and stripped.endswith("]"):
        if in_sec and not found:
            out.append(assignment)
            inserted = True
        in_sec = stripped == header
        found = False
        out.append(line)
        continue
    if in_sec and stripped.startswith("CONTEXT_MODE_DIR"):
        out.append(assignment)
        found = True
        continue
    out.append(line)
if in_sec and not found:
    out.append(assignment)
    inserted = True
    found = True
if not any(ln.strip() == header for ln in lines):
    sys.exit(0)  # no such section; do not invent an MCP server
path.write_text("".join(out))
PY
}

pin_json_mcp() {
  local file="$1" platform="$2"
  [ -f "$file" ] || return 0
  local tmp
  tmp="$(mktemp)"
  jq --arg dir "$CANON" --arg plat "$platform" '
    .mcpServers = (.mcpServers // {})
    | .mcpServers["context-mode"] = (
        (.mcpServers["context-mode"] // {"command": "context-mode"})
        | .env = ((.env // {}) + {"CONTEXT_MODE_DIR": $dir})
        | if $plat != "" and ((.env.CONTEXT_MODE_PLATFORM // "") == "")
          then .env.CONTEXT_MODE_PLATFORM = $plat
          else . end
      )
  ' "$file" > "$tmp" && mv "$tmp" "$file"
}

wrap_json_mcp_command() {
  local file="$1"
  [ -f "$file" ] || return 0
  python3 - "$file" "$WRAPPER" <<'PY'
import json, pathlib, sys
path, wrapper = pathlib.Path(sys.argv[1]), sys.argv[2]
raw = path.read_text()
if not raw.strip():
    sys.exit(0)
try:
    data = json.loads(raw)
except json.JSONDecodeError:
    sys.exit(0)
servers = data.get("mcpServers")
if not isinstance(servers, dict) or "context-mode" not in servers:
    sys.exit(0)
srv = servers["context-mode"]
if not isinstance(srv, dict):
    sys.exit(0)
cmd = srv.get("command")
if cmd == wrapper:
    sys.exit(0)
args = srv.get("args") if isinstance(srv.get("args"), list) else []
prefix = [cmd] if isinstance(cmd, str) and cmd else []
srv["command"] = wrapper
srv["args"] = prefix + args
path.write_text(json.dumps(data, indent=2) + "\n")
PY
}

wrap_codex_toml_command() {
  local file="${HOME}/.codex/config.toml"
  [ -f "$file" ] || return 0
  python3 - "$file" "$WRAPPER" <<'PY'
from pathlib import Path
import sys
path, wrapper = Path(sys.argv[1]), sys.argv[2]
lines = path.read_text().splitlines(keepends=True)
out, i, changed = [], 0, False
while i < len(lines):
    line = lines[i]
    if line.strip() == "[mcp_servers.context-mode]":
        out.append(line)
        i += 1
        cmd = None
        args_line = None
        rest = []
        while i < len(lines) and not lines[i].strip().startswith("["):
            stripped = lines[i].strip()
            if stripped.startswith("command") and cmd is None:
                cmd = lines[i]
            elif stripped.startswith("args") and args_line is None:
                args_line = lines[i]
            else:
                rest.append(lines[i])
            i += 1
        def quoted(val: str) -> str:
            inner = val.split("=", 1)[1].strip().strip('"')
            return inner
        current = quoted(cmd) if cmd else ""
        if current == wrapper:
            if cmd:
                out.append(cmd)
            if args_line:
                out.append(args_line)
            out.extend(rest)
            continue
        old_cmd = current
        old_args = []
        if args_line:
            raw = args_line.split("=", 1)[1].strip()
            if raw.startswith("[") and raw.endswith("]"):
                inner = raw[1:-1].strip()
                if inner:
                    old_args = [p.strip().strip('"') for p in inner.split(",")]
        new_args = ([old_cmd] if old_cmd else []) + old_args
        out.append(f'command = "{wrapper}"\n')
        rendered = ", ".join(f'"{a}"' for a in new_args)
        out.append(f"args = [{rendered}]\n")
        out.extend(rest)
        changed = True
        continue
    out.append(line)
    i += 1
if changed:
    path.write_text("".join(out))
PY
}

install_wrapper() {
  if [ ! -f "$WRAPPER_SRC" ]; then
    echo "FAIL [context-mode-dir] missing wrapper source $WRAPPER_SRC" >&2
    exit 1
  fi
  mkdir -p "${HOME}/.claude"
  install -m 0755 "$WRAPPER_SRC" "$WRAPPER"
}

write_cursor_mcp() {
  mkdir -p "${HOME}/.cursor"
  if [ ! -f "${HOME}/.cursor/mcp.json" ]; then
    printf '%s\n' '{"mcpServers":{}}' > "${HOME}/.cursor/mcp.json"
  fi
  pin_json_mcp "${HOME}/.cursor/mcp.json" "cursor"
  wrap_json_mcp_command "${HOME}/.cursor/mcp.json"
}

wrap_cursor_plugin_mcp() {
  [ -d "${HOME}/.cursor/plugins" ] || return 0
  python3 - "${HOME}/.cursor/plugins" <<'PY'
import os, sys
root = sys.argv[1]
for dirpath, dirnames, filenames in os.walk(root):
    dirnames[:] = [d for d in dirnames if d not in (".git", "node_modules")]
    for name in filenames:
        if name in ("plugin.json", "mcp.json"):
            print(os.path.join(dirpath, name))
PY
}

pin_zshrc() {
  local file="${HOME}/.zshrc"
  [ -f "$file" ] || return 0
  python3 - "$file" "$CANON" <<'PY'
import pathlib, re, sys
path, canon = pathlib.Path(sys.argv[1]), sys.argv[2]
line = f'export CONTEXT_MODE_DIR="{canon}"\n'
text = path.read_text()
pat = re.compile(r'^export CONTEXT_MODE_DIR=.*$', re.M)
if pat.search(text):
    path.write_text(pat.sub(line.rstrip("\n"), text, count=1))
else:
    path.write_text(text.rstrip() + "\n\n# context-mode: one FTS5/session store (Claude Code)\n" + line)
PY
}

pin_cursor_symlink() {
  local dest="${HOME}/.cursor/context-mode"
  mkdir -p "${HOME}/.cursor"
  if [ -L "$dest" ]; then
    ln -sfn "$CANON" "$dest"
    return 0
  fi
  if [ -e "$dest" ]; then
    local bak="${dest}.bak-$(date +%Y%m%d%H%M%S)"
    mv "$dest" "$bak"
    echo "moved $dest -> $bak"
  fi
  ln -s "$CANON" "$dest"
}

ensure_codex_mcp_env_section() {
  local file="${HOME}/.codex/config.toml"
  [ -f "$file" ] || return 0
  grep -q '^\[mcp_servers\.context-mode\]' "$file" || return 0
  grep -q '^\[mcp_servers\.context-mode.env\]' "$file" && return 0
  python3 - "$file" <<'PY'
from pathlib import Path
import sys
path = Path(sys.argv[1])
lines = path.read_text().splitlines(keepends=True)
out, i = [], 0
inserted = False
while i < len(lines):
    out.append(lines[i])
    if lines[i].strip() == "[mcp_servers.context-mode]":
        i += 1
        while i < len(lines) and not lines[i].strip().startswith("["):
            out.append(lines[i])
            i += 1
        out.append("\n[mcp_servers.context-mode.env]\nCONTEXT_MODE_PLATFORM = \"codex\"\n")
        inserted = True
        continue
    i += 1
if inserted:
    path.write_text("".join(out))
PY
}

echo "==> pinning context-mode storage to $CANON"
install_wrapper
ensure_codex_mcp_env_section
pin_toml "${HOME}/.codex/config.toml" "mcp_servers.context-mode.env"
pin_toml "${HOME}/.codex/config.toml" "shell_environment_policy.set"
wrap_codex_toml_command
if [ -d "${HOME}/.cursor" ]; then
  write_cursor_mcp
  pin_cursor_symlink
  while IFS= read -r plugin_json; do
    [ -n "$plugin_json" ] || continue
    wrap_json_mcp_command "$plugin_json"
  done < <(wrap_cursor_plugin_mcp)
fi
pin_json_mcp "${HOME}/.gemini/settings.json" ""
pin_json_mcp "${HOME}/.gemini/antigravity/mcp_config.json" ""
wrap_json_mcp_command "${HOME}/.gemini/settings.json"
wrap_json_mcp_command "${HOME}/.gemini/antigravity/mcp_config.json"
pin_zshrc
echo "PASS [context-mode-dir] install wrote pins"
exec "$CHECK"
