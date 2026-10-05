#!/usr/bin/env bash
# Idempotent install: Codex computer use as an MCP server named "codex-cu",
# registered at USER scope on every present runtime so it works in every
# project without a per-repo .mcp.json.
#
# Two binaries land in ~/.local/bin, side by side (the proxy resolves its
# child as a sibling, so the pair must stay together):
#   codex-cu-mcp    launches the NEWEST unified-computer-use cua_repl, so a
#                   ChatGPT app upgrade that renames the version dir cannot
#                   break the config.
#   codex-cu-proxy  wraps it and injects _meta["x-codex-turn-metadata"] into
#                   every tools/call. Without that the BROWSER surface answers
#                   `Missing required Codex turn metadata: session_id, turn_id`.
#                   The computer surface never needed it; the proxy is a strict
#                   superset, so one registration covers both (verified
#                   2026-10-05: apps + DOM + page JS + Playwright locator).
#
# SKIP, never FAIL, when the Computer Use plugin is absent — the fleet includes
# hosts that have no ChatGPT app. The gate is the plugin dir, NOT `uname`:
# the runtime supports Linux, so a Linux host that HAS the plugin gets it.
#
# Usage: scripts/install-codex-cu.sh
# Then:  scripts/check-codex-cu.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLUGIN_DIR="${HOME}/.codex/plugins/cache/openai-bundled/unified-computer-use"
BIN="${HOME}/.local/bin"
CHILD="${BIN}/codex-cu-mcp"
PROXY="${BIN}/codex-cu-proxy"

if [ ! -d "$PLUGIN_DIR" ]; then
  echo "SKIP [codex-cu] no Computer Use plugin at $PLUGIN_DIR"
  exit 0
fi

mkdir -p "$BIN"
# Child first: the proxy resolves it as a sibling at startup.
install -m 755 "$ROOT/scripts/codex-cu-mcp" "$CHILD"
install -m 755 "$ROOT/scripts/codex-cu-proxy" "$PROXY"
echo "==> [codex-cu] installed $CHILD and $PROXY"

# Self-test the injection before registering anything that would call it.
if ! python3 "$PROXY" --self-test 2>&1 | grep -q 'self-test ok'; then
  echo "FAIL [codex-cu] proxy self-test did not pass" >&2
  exit 1
fi

# --- register at user scope on every present runtime ------------------------
# jq merge, not `claude mcp add`: ~/.claude.json is large and live, and the
# merge keeps every other key untouched and is safe to re-run.
register_json() {
  local file="$1" label="$2" tmp
  [ -f "$file" ] || { echo "==> [codex-cu] $label absent, skipped"; return 0; }
  tmp="$(mktemp)"
  jq --arg cmd "$PROXY" '
    .mcpServers = (.mcpServers // {})
    | .mcpServers["codex-cu"] = ((.mcpServers["codex-cu"] // {}) | .command = $cmd | .args = (.args // []))
  ' "$file" > "$tmp" && mv "$tmp" "$file"
  echo "==> [codex-cu] registered in $label"
}

register_json "${HOME}/.claude.json" "Claude Code (user scope)"
register_json "${HOME}/.cursor/mcp.json" "Cursor"

# agy owns its own store; `mcp add` is an upsert (re-run returns 0).
if command -v agy >/dev/null 2>&1; then
  agy mcp add codex-cu "$PROXY" >/dev/null 2>&1 \
    && echo "==> [codex-cu] registered in agy" \
    || echo "==> [codex-cu] agy registration failed (non-fatal)" >&2
fi

# Codex needs no registration: cua_repl is native there.
bash "$ROOT/scripts/check-codex-cu.sh"
