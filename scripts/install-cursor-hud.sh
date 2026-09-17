#!/usr/bin/env bash
# Restore the shared Claude/Cursor statusline scripts and point both runtimes
# at them. Never copies ~/.cursor/cli-config.json (auth). Merges statusLine
# only when that file already exists.
#
# Usage: scripts/install-cursor-hud.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HUD_SRC="${ROOT}/scripts/claude-hud-statusline.sh"
USAGE_SRC="${ROOT}/scripts/cursor-plan-usage.py"
HUD_DST="${HOME}/.claude/claude-hud-statusline.sh"
USAGE_DST="${HOME}/.claude/cursor-plan-usage.py"
CURSOR_CFG="${HOME}/.cursor/cli-config.json"
CLAUDE_SETTINGS="${HOME}/.claude/settings.json"

if [ ! -f "$HUD_SRC" ] || [ ! -f "$USAGE_SRC" ]; then
  echo "FAIL [cursor-hud] missing sources in $ROOT/scripts" >&2
  exit 1
fi

mkdir -p "${HOME}/.claude"
install -m 0755 "$HUD_SRC" "$HUD_DST"
install -m 0755 "$USAGE_SRC" "$USAGE_DST"

hud_src_md5="$(md5 -q "$HUD_SRC")"
usage_src_md5="$(md5 -q "$USAGE_SRC")"
if [ "$hud_src_md5" != "$(md5 -q "$HUD_DST")" ] || [ "$usage_src_md5" != "$(md5 -q "$USAGE_DST")" ]; then
  echo "FAIL [cursor-hud] md5 mismatch after install" >&2
  exit 1
fi

if [ -f "$CURSOR_CFG" ]; then
  tmp="$(mktemp)"
  jq '
    .statusLine = ((.statusLine // {}) + {
      type: "command",
      command: "~/.claude/claude-hud-statusline.sh",
      updateIntervalMs: 1000,
      timeoutMs: 5000
    })
    | .statusLine.padding = (.statusLine.padding // 2)
  ' "$CURSOR_CFG" > "$tmp" && mv "$tmp" "$CURSOR_CFG"
  cmd="$(jq -r '.statusLine.command // empty' "$CURSOR_CFG")"
  if [ "$cmd" != "~/.claude/claude-hud-statusline.sh" ]; then
    echo "FAIL [cursor-hud] cli-config statusLine.command not pinned" >&2
    exit 1
  fi
  echo "PASS [cursor-hud] merged statusLine into existing cli-config.json"
else
  echo "WARN [cursor-hud] no cli-config.json; scripts installed, statusLine not wired" >&2
fi

if [ -f "$CLAUDE_SETTINGS" ]; then
  tmp="$(mktemp)"
  jq --arg cmd "bash -c '~/.claude/claude-hud-statusline.sh'" '
    .statusLine = ((.statusLine // {}) + {
      type: "command",
      command: $cmd
    })
  ' "$CLAUDE_SETTINGS" > "$tmp" && mv "$tmp" "$CLAUDE_SETTINGS"
  echo "PASS [cursor-hud] Claude settings.json statusLine command"
else
  echo "WARN [cursor-hud] no ~/.claude/settings.json; Claude statusLine not wired" >&2
fi

echo "PASS [cursor-hud] $HUD_DST (md5=$hud_src_md5) $USAGE_DST (md5=$usage_src_md5)"
