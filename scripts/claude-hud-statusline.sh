#!/usr/bin/env bash
# Shared statusline for Claude Code and Cursor CLI.
#
# Canonical copy lives in this repo. Restore:
#   cp scripts/claude-hud-statusline.sh ~/.claude/claude-hud-statusline.sh
#   chmod +x ~/.claude/claude-hud-statusline.sh
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
# Requires: jq, bun, claude-hud plugin under ~/.claude/plugins/cache/claude-hud/
#
# Renders claude-hud, then the session id (HUD has no HudElement for it).
# Cursor-only fields (worktree / max_mode / vim) print only when present, so
# Claude sessions stay the same length.
#
# Cursor spawn()s with no login shell — Homebrew + bun must be on PATH here.
export PATH="/opt/homebrew/bin:/usr/local/bin:${HOME}/.bun/bin:${PATH}"

input=$(cat)

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
