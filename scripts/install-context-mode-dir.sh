#!/usr/bin/env bash
# Idempotent pin: every present runtime writes context-mode storage to
# $HOME/.claude/context-mode. Survives plugin upgrades that rewrite MCP env
# and drop CONTEXT_MODE_DIR (incident 2026-08-26: Codex kept PLATFORM=codex
# only; Cursor MCP defaulted to ~/.gemini).
#
# Usage: scripts/install-context-mode-dir.sh
# Then:  scripts/check-context-mode-dir.sh
set -euo pipefail

CANON="${HOME}/.claude/context-mode"
CHECK="$(cd "$(dirname "$0")" && pwd)/check-context-mode-dir.sh"
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

write_cursor_mcp() {
  mkdir -p "${HOME}/.cursor"
  if [ ! -f "${HOME}/.cursor/mcp.json" ]; then
    printf '%s\n' '{"mcpServers":{}}' > "${HOME}/.cursor/mcp.json"
  fi
  pin_json_mcp "${HOME}/.cursor/mcp.json" "cursor"
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
ensure_codex_mcp_env_section
pin_toml "${HOME}/.codex/config.toml" "mcp_servers.context-mode.env"
pin_toml "${HOME}/.codex/config.toml" "shell_environment_policy.set"
if [ -d "${HOME}/.cursor" ]; then
  write_cursor_mcp
  pin_cursor_symlink
fi
pin_json_mcp "${HOME}/.gemini/settings.json" ""
pin_json_mcp "${HOME}/.gemini/antigravity/mcp_config.json" ""
pin_zshrc
echo "PASS [context-mode-dir] install wrote pins"
exec "$CHECK"
