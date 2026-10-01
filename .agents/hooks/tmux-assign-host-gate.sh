#!/usr/bin/env bash
# PreToolUse gate for `agent-tmux <cli> <verb>` (2026-08-13; tightened 2026-08-18
# after a live session bypassed the ruling via parent `assign --detach` plus
# 30+ status/capture/probe/result polling calls).
#
# Rule being enforced (owner: using-tmux-agent-tools §ONE OWNER; pointer in
# model-dispatch.md §4): with the tmux-agent mod, dispatch via
# mcp__tmux-agent__assign; without it, a `general-purpose` proxy subagent runs
# `assign --detach` and the parent owns the wait. The parent session
# must not host the assign in its foreground (with OR without --detach — the
# gate cannot verify the reaping premise, so the exception is not machine-
# grantable), and must not poll workers with status/capture/probe/result
# (the retired W32 per-worker polling proxy).
#
# MODE: DENY. Keyed on hook-stdin `agent_type`: ABSENT in the parent session,
# present inside a subagent. run_in_background=true is the documented logged
# FALLBACK and stays allowed.
set -u

IN="$(cat)"
command -v jq >/dev/null 2>&1 || exit 0
[ "$(printf '%s' "$IN" | jq -r '.tool_name // ""')" = "Bash" ] || exit 0

CMD="$(printf '%s' "$IN" | jq -r '.tool_input.command // ""')"
# Per shell segment: a sibling command must not authorize this one.
# --help segments are read-only inspection, never a dispatch or a poll.
seg_match() {
  printf '%s' "$CMD" | awk -v RS='[|;&]+' -v verbs="$1" '
    $0 ~ ("agent-tmux[[:space:]]+[A-Za-z0-9._-]+[[:space:]]+" verbs "([[:space:]]|$)") \
      && $0 !~ /(^|[[:space:]])--help([[:space:]]|$)/ { found=1 }
    END { exit !found }
  '
}

HIT=""
seg_match "assign" && HIT="assign"
[ -n "$HIT" ] || { seg_match "(status|capture|probe|result)" && HIT="poll"; }
[ -n "$HIT" ] || exit 0

AGENT_TYPE="$(printf '%s' "$IN" | jq -r '.agent_type // "ABSENT"')"
BACKGROUND="$(printf '%s' "$IN" | jq -r '.tool_input.run_in_background // false | tostring')"

LOG="${HOME}/.local/state/agent-scripts/tmux-assign-host-probe.jsonl"
mkdir -p "$(dirname "$LOG")" 2>/dev/null && jq -cn \
  --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg hit "$HIT" \
  --arg agent_type "$AGENT_TYPE" \
  --arg background "$BACKGROUND" \
  --arg session "$(printf '%s' "$IN" | jq -r '.session_id // empty')" \
  '{ts: $ts, hit: $hit, agent_type: $agent_type, background: $background, session: $session}' \
  >> "$LOG" 2>/dev/null

# Hosted correctly: inside a subagent, or dispatched as a background task.
[ "$AGENT_TYPE" = "ABSENT" ] || exit 0
[ "$BACKGROUND" != "true" ] || exit 0

# Codex has no subagent host or run_in_background; its supported host is the
# commander, whose collector delivers the result into this pane.
case "$(printf '%s' "$IN" | jq -r '.transcript_path // ""')" in
  */.codex/*|*/antigravity-cli/*)
    echo "BLOCKED: on Codex or agy, dispatch with \`tmux-agent-commander assign <profile> <name> <dir> <prompt-file>\` (resolve it from the installed tmux-agent-tools bundle), then end your turn — the commander collector sends the worker result into this pane. Do not host \`agent-tmux <cli> assign\` or poll status|capture|probe|result in the foreground." >&2
    exit 2 ;;
esac

if [ "$HIT" = "assign" ]; then
  echo "BLOCKED: \`agent-tmux <cli> assign\` (including --detach) must not run in the parent session's foreground. Per using-tmux-agent-tools §ONE OWNER: with the tmux-agent mod loaded, dispatch with mcp__tmux-agent__assign and end the turn; without it, ONE \`general-purpose\` proxy subagent runs \`assign --detach\` and reports exit code + status/summary, and the parent owns the wait with background \`result wait-required\` calls." >&2
else
  echo "BLOCKED: parent-session foreground \`agent-tmux <cli> status|capture|probe|result\` is per-worker polling — retired (W32); see using-tmux-agent-tools §ONE OWNER. Re-run this SAME command as a background task (run_in_background:true) and log the reason in the run dir — that is the supported form, not a last resort. Do NOT read this denial as 'do nothing and wait': if the proxy reported backgrounded/in-flight rather than terminal, a parent-owned background listener is REQUIRED (measured 2026-08-30: a reaped subagent cannot wait on its own task and its completion notifies nobody). Do not pipe the listener command — a trailing \`| tail\` masks the wrapper's exit code." >&2
fi
exit 2
