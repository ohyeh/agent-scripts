#!/usr/bin/env bash
# Shared statusline for Claude Code and Cursor CLI.
#
# Canonical copy lives in this repo. Restore:
#   cp scripts/claude-hud-statusline.sh scripts/cursor-plan-usage.py ~/.claude/
#   chmod +x ~/.claude/claude-hud-statusline.sh ~/.claude/cursor-plan-usage.py
# Claude Code (~/.claude/settings.json):
#   "statusLine": { "type": "command", "command": "bash -c '~/.claude/claude-hud-statusline.sh'" }
# Cursor CLI (~/.cursor/cli-config.json) — add this key only; never copy a full
# cli-config (it contains auth):
#   "statusLine": {
#     "type": "command",
#     "command": "~/.claude/claude-hud-statusline.sh",
#     "padding": 2,
#     "timeoutMs": 5000,
#     "updateIntervalMs": 1000
#   }
# Requires: jq, python3, bun, claude-hud plugin under ~/.claude/plugins/cache/claude-hud/
# Companion: scripts/cursor-plan-usage.py (same directory after restore).
#
# Renders claude-hud, then the session id (HUD has no HudElement for it).
# Cursor-only fields (worktree / max_mode / vim) print only when present, so
# Claude sessions stay the same length.
#
# Cursor spawn()s with no login shell — Homebrew + bun must be on PATH here.
export PATH="/opt/homebrew/bin:/usr/local/bin:${HOME}/.bun/bin:${PATH}"

input=$(cat)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
USAGE_HELPER="${SCRIPT_DIR}/cursor-plan-usage.py"
[ -f "$USAGE_HELPER" ] || USAGE_HELPER="${HOME}/.claude/cursor-plan-usage.py"
if [ -f "$USAGE_HELPER" ]; then
  input=$(printf '%s' "$input" | python3 "$USAGE_HELPER")
fi

sid=$(printf '%s' "$input" | jq -r '.session_id // empty' 2>/dev/null)
cols=$(printf '%s' "$input" | jq -r '.render_width_chars // empty' 2>/dev/null)
if [ -n "$cols" ] && [ "$cols" != "null" ]; then
  export COLUMNS="$cols"
fi

dir=$(ls -td ~/.claude/plugins/cache/claude-hud/claude-hud/*/ 2>/dev/null | head -1)

hud=$(printf '%s' "$input" | "$HOME/.bun/bin/bun" "${dir}src/index.ts")
printf '%s\n' "$hud"

if [ -n "$sid" ]; then
  printf '\033[2;38;5;245msid: %s\033[0m\n' "$sid"
fi

extras=$(printf '%s' "$input" | jq -r '
  [
    (if .worktree.name then "wt \(.worktree.name)" else empty end),
    (if .model.max_mode == true then "max" else empty end),
    (if .vim.mode then "vim \(.vim.mode)" else empty end)
  ] | join("  ")
' 2>/dev/null)
if [ -n "$extras" ]; then
  printf '\033[2;38;5;245m%s\033[0m\n' "$extras"
fi
