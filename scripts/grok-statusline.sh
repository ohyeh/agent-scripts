#!/usr/bin/env bash
# Statusline for Grok Build. Same shape as antigravity-statusline.sh: render
# through the claude-hud engine, keep Claude- and Cursor-only data out.
#
# - Grok's stdin is close to Claude's (model, workspace, context_window, cost);
#   see ~/.grok/docs/user-guide/25-status-line.md "Available data".
# - transcript_path is Grok's own updates.jsonl, not a Claude transcript: dropped.
# - No rate_limits: the Cursor plan snapshot is not exported, so the HUD shows none.
# - Footer: session id, compaction threshold, Ponytail badge.
#
# Installed by scripts/install-grok-runtime.sh to ~/.grok/statusline.sh and set in
# ~/.grok/config.toml: [ui.status_line] type = "command", command = "~/.grok/statusline.sh"
export PATH="/opt/homebrew/bin:/usr/local/bin:${HOME}/.bun/bin:${PATH}"
unset CURSOR_STATUSLINE_USAGE_SNAPSHOT

input=$(cat)
printf '%s' "$input" | jq -e 'type == "object"' >/dev/null 2>&1 || input='{}'

sid=$(printf '%s' "$input" | jq -r '.session_id // empty')
# Effort is already in the HUD model badge; the threshold is Grok-only; the
# worktree name matches the Cursor wrapper's extras.
footer=$(printf '%s' "$input" | jq -r '[
  (if .context_window.auto_compact_threshold_percent then "compact \(.context_window.auto_compact_threshold_percent)%" else empty end),
  (if .worktree.name then "wt \(.worktree.name)" else empty end)
] | join("  ")')

# Grok omits model when the agent cannot read it: fall back to the config default (agy does the same).
cfg_model=$(awk -F'"' '/^\[/{s=($0=="[models]")} s && /^default[[:space:]]*=/{print $2; exit}' "${HOME}/.grok/config.toml" 2>/dev/null)
hud_in=$(printf '%s' "$input" | jq --arg m "$cfg_model" '
  del(.transcript_path)
  | .workspace.project_dir = (.workspace.repo_root // .workspace.current_dir // .cwd)
  | if (.model.display_name // "") == "" and $m != "" then .model = {id: $m, display_name: $m} else . end')

dir=$(ls -d ~/.claude/plugins/cache/claude-hud/claude-hud/*/ 2>/dev/null | sort -V | tail -1)
if [ -n "$dir" ] && [ -x "$HOME/.bun/bin/bun" ]; then
  # Strip Claude-only config counts (CLAUDE.md / hooks count), as the agy wrapper does.
  printf '%s' "$hud_in" | "$HOME/.bun/bin/bun" "${dir}src/index.ts" 2>/dev/null | grep -v 'CLAUDE\.md'
else
  printf '%s' "$input" | jq -r '[.model.display_name, (if .context_window.used_percentage then "\(.context_window.used_percentage)% ctx" else empty end)] | map(select(.)) | join(" │ ")'
fi

badge=""
if [ -f "${HOME}/.claude/.ponytail-active" ]; then
  pmode=$(head -n1 "${HOME}/.claude/.ponytail-active" | tr -d '[:space:]')
  case "$pmode" in
    "") ;;
    full) badge='[PONYTAIL]' ;;
    *) badge="[PONYTAIL:$(printf '%s' "$pmode" | tr '[:lower:]' '[:upper:]')]" ;;
  esac
fi

meta=""
[ -n "$sid" ] && meta="sid: $sid"
[ -n "$footer" ] && meta="${meta:+$meta  }$footer"
[ -n "$meta" ] && printf '\033[2;38;5;245m%s\033[0m' "$meta"
[ -n "$badge" ] && printf '%s\033[38;5;108m%s\033[0m' "${meta:+  }" "$badge"
{ [ -n "$meta" ] || [ -n "$badge" ]; } && printf '\n'
exit 0
