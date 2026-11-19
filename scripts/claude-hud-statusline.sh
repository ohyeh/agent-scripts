#!/usr/bin/env bash
# Shared statusline for Claude Code and Cursor CLI.
#
# Canonical copy lives in this repo. Restore: scripts/install-cursor-hud.sh
# (copies these two files into ~/.claude/, merges statusLine only).
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
# Cursor plan/auto/api is a snapshot file. claude-hud 0.11.2 reads it only when
# display.externalUsagePath is set. The placeholder stays inert until this
# script exports CURSOR_STATUSLINE_USAGE_SNAPSHOT, which it does only when
# stdin has no rate_limits (Cursor). Claude's 5h/7d payload is left alone.
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

# ${VAR} is literal here so the shell does not expand it before jq stores it.
usage_path_placeholder='${CURSOR_STATUSLINE_USAGE_SNAPSHOT}'
usage_override="${HOME}/.claude/claude-hud.json"
if [ ! -f "$usage_override" ] || ! jq -e '.display.externalUsagePath | type == "string" and length > 0' "$usage_override" >/dev/null 2>&1; then
  mkdir -p "${HOME}/.claude"
  usage_tmp="${usage_override}.tmp.$$"
  if [ -f "$usage_override" ] && jq -e . "$usage_override" >/dev/null 2>&1; then
    jq --arg p "$usage_path_placeholder" '.display.externalUsagePath = $p' "$usage_override" > "$usage_tmp" && mv "$usage_tmp" "$usage_override" || rm -f "$usage_tmp"
  elif [ ! -f "$usage_override" ]; then
    jq -n --arg p "$usage_path_placeholder" '{display:{externalUsagePath:$p}}' > "$usage_tmp" && mv "$usage_tmp" "$usage_override" || rm -f "$usage_tmp"
  else
    rm -f "$usage_tmp"
  fi
fi

unset CURSOR_STATUSLINE_USAGE_SNAPSHOT
usage_snapshot="${HOME}/.cursor/statusline-usage-snapshot.json"
has_rate_limits=$(printf '%s' "$input" | jq -r 'if .rate_limits then "yes" else "no" end' 2>/dev/null || echo no)
if [ "$has_rate_limits" != "yes" ] && [ -f "$usage_snapshot" ]; then
  export CURSOR_STATUSLINE_USAGE_SNAPSHOT="$usage_snapshot"
fi

sid=$(printf '%s' "$input" | jq -r '.session_id // empty' 2>/dev/null)
cols=$(printf '%s' "$input" | jq -r '.render_width_chars // empty' 2>/dev/null)
if [ -n "$cols" ] && [ "$cols" != "null" ]; then
  export COLUMNS="$cols"
fi

# Highest version, not newest mtime: mtime order differs per host and picked stale 0.8.0/0.9.0 over 0.10.0.
dir=$(ls -d ~/.claude/plugins/cache/claude-hud/claude-hud/*/ 2>/dev/null | sort -V | tail -1)

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
