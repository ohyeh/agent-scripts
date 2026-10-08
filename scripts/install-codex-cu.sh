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

# The base dir existing is NOT readiness: a half-finished download leaves it
# empty, and the old gate then installed and registered a server that could
# never launch. Ask the launcher itself.
# SKIP, not FAIL: a mid-download cache is transient, and nothing is registered
# yet, so skipping leaves no broken server behind. Same policy as an absent dir.
if ! resolved_version="$(python3 "$ROOT/scripts/codex-cu-mcp" --resolve 2>&1)"; then
  echo "SKIP [codex-cu] no usable Computer Use version yet: $resolved_version"
  exit 0
fi
echo "==> [codex-cu] using $resolved_version"

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

# Approval policy: the proxy answers per-app prompts from this file (format in
# the proxy docstring). Owner ruling 2026-10-08: FULL mode fleet-wide, so agy and
# cursor-agent can use computer use at all. Seed once; never overwrite the
# owner's choice. Safe mode: replace `all` with display names, one per line
# (live, no restart). Full + the forbidden-targets switch = any app, incl.
# Terminal and Keychain Access, with no prompt.
POLICY="${HOME}/.config/codex-cu/approve"
if [ ! -e "$POLICY" ]; then
  mkdir -p "$(dirname "$POLICY")"
  printf '%s\n' '# codex-cu approval policy: `all` alone = accept every prompt; else one app name per line.' \
    all > "$POLICY"
  chmod 600 "$POLICY"
  echo "==> [codex-cu] seeded full approval policy at $POLICY"
fi
echo "==> [codex-cu] approval policy: $(grep -v '^#' "$POLICY" | paste -sd, -)"

# --- register at user scope on every present runtime ------------------------
# jq merge, not `claude mcp add`: ~/.claude.json is large and live, and the
# merge keeps every other key untouched and is safe to re-run.
# ponytail: last-writer-wins against a RUNNING Claude Code. jq reads a snapshot
# and the replace lands whole, so a config write made between the two is lost
# (reproduced by two independent reviewers, 2026-10-05). Only the writer itself
# can close that window; the backup below is the recovery path, not a cure.
# Upgrade path: a write mode Claude Code co-operates with, or deploy while it is
# not running.
register_json() {
  local file="$1" label="$2" tmp backup
  [ -f "$file" ] || { echo "==> [codex-cu] $label absent, skipped"; return 0; }

  # Temp in the TARGET dir so the replace is a same-filesystem rename, and seed
  # it from the original so mode/owner survive the move.
  tmp="$(mktemp "${file}.codex-cu.XXXXXX")" || { echo "FAIL [codex-cu] cannot create temp beside $file" >&2; return 1; }
  backup="${file}.codex-cu.bak"
  cp -p "$file" "$backup" || { rm -f "$tmp"; echo "FAIL [codex-cu] cannot back up $file" >&2; return 1; }
  chmod 600 "$backup"

  if ! jq --arg cmd "$PROXY" '
    .mcpServers = (.mcpServers // {})
    | .mcpServers["codex-cu"] = ((.mcpServers["codex-cu"] // {}) | .command = $cmd | .args = (.args // []))
  ' "$file" > "$tmp"; then
    rm -f "$tmp"
    echo "FAIL [codex-cu] jq could not rewrite $label ($file); original untouched, backup at $backup" >&2
    return 1
  fi
  # jq exiting 0 on an empty read would truncate the file; refuse that.
  if [ ! -s "$tmp" ]; then
    rm -f "$tmp"
    echo "FAIL [codex-cu] jq produced empty output for $label; original untouched" >&2
    return 1
  fi
  chmod --reference="$file" "$tmp" 2>/dev/null || chmod "$(stat -f '%Lp' "$file")" "$tmp"
  if ! mv "$tmp" "$file"; then
    rm -f "$tmp"
    echo "FAIL [codex-cu] could not replace $file; backup at $backup" >&2
    return 1
  fi
  echo "==> [codex-cu] registered in $label (backup: $backup)"
}

register_json "${HOME}/.claude.json" "Claude Code (user scope)"
register_json "${HOME}/.cursor/mcp.json" "Cursor"

# agy owns its own store; `mcp add` is an upsert (re-run returns 0).
if command -v agy >/dev/null 2>&1; then
  if agy_err="$(agy mcp add codex-cu "$PROXY" 2>&1 >/dev/null)"; then
    echo "==> [codex-cu] registered in agy"
  else
    echo "==> [codex-cu] agy registration failed (exit $?, non-fatal): ${agy_err:-<no output>}" >&2
  fi
fi

# Codex needs no registration: cua_repl is native there.
bash "$ROOT/scripts/check-codex-cu.sh"
