#!/usr/bin/env bash
# PreToolUse gate: one PR per session unless the user approves another (lesson
# 2026-09-11: two sessions opened 2+ PRs for one task, unstacked, and burned the
# owner's review time). The first `gh pr create` in a session passes and is
# counted; a later one is denied until the user approves it, and the approved
# call carries `PR_CREATE_GATE=allow` in the command. `gh pr view/edit/...` and
# `--help` pass. Claude and Codex send the same payload (session_id, tool_input).
set -u

IN="$(cat)"
command -v jq >/dev/null 2>&1 || { echo "pr-create-gate: jq missing; not checked" >&2; exit 0; }
[ "$(printf '%s' "$IN" | jq -r '.tool_name // empty')" = Bash ] || exit 0
cmd="$(printf '%s' "$IN" | jq -r '.tool_input.command // empty')"
printf '%s' "$cmd" | grep -Eq -- '(^|[^[:alnum:]_-])gh[[:space:]]+pr[[:space:]]+create([[:space:]]|$)' || exit 0
printf '%s' "$cmd" | grep -Eq -- '(^|[[:space:]])--help([[:space:]]|$)' && exit 0

sid="$(printf '%s' "$IN" | jq -r '.session_id // empty')"
[ -n "$sid" ] || { echo "pr-create-gate: no session_id; not counted" >&2; exit 0; }
state="${XDG_STATE_HOME:-$HOME/.local/state}/agent-hooks/$sid"
mkdir -p "$state"
count="$(cat "$state/pr-create-count" 2>/dev/null || echo 0)"

if [ "$count" -ge 1 ] && ! printf '%s' "$cmd" | grep -Eq -- '(^|[[:space:]])PR_CREATE_GATE=allow([[:space:]]|$)'; then
  echo "BLOCKED by pr-create-gate: this session already opened $count PR(s). One task gets one PR; stack follow-ups on its branch. Ask the user before a second PR; once approved, rerun with PR_CREATE_GATE=allow in front of gh." >&2
  exit 2
fi
echo $((count + 1)) > "$state/pr-create-count"
exit 0
