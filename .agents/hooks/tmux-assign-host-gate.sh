#!/usr/bin/env bash
# PreToolUse probe for `agent-tmux <cli> assign` (2026-08-13, user ruling).
#
# Rule being enforced (model-dispatch.md §4): an external CLI worker is
# dispatched with ONE blocking `assign` call, hosted where a long wait is
# appropriate — a background task, or a `general-purpose` subagent on
# `sonnet` low. Running that blocking call in the parent session's foreground
# puts the whole supervise on the expensive main context; reaching for
# `--detach` to dodge it is the documented EXCEPTION, valid only when the
# harness reaps long background tasks (exit-144 kill after ~10 min).
#
# MODE: DENY. Keyed on hook-stdin `agent_type`, re-probed live on CLI 2.1.229
# (2026-08-13): ABSENT in the parent session, present (carrying the agent NAME,
# not the type) inside a subagent. Samples in
# ~/.local/state/agent-scripts/tmux-assign-host-probe.jsonl.
#
# Parent-session foreground blocking `assign` is denied. §4 permits a short
# foreground --detach call only after the reaping premise is verified in-session;
# this gate allows that exception and leaves premise verification to the caller.
set -u

IN="$(cat)"
command -v jq >/dev/null 2>&1 || exit 0
[ "$(printf '%s' "$IN" | jq -r '.tool_name // ""')" = "Bash" ] || exit 0

CMD="$(printf '%s' "$IN" | jq -r '.tool_input.command // ""')"
# Per shell segment: a sibling command must not authorize this one.
printf '%s' "$CMD" | awk -v RS='[|;&]+' '
  /agent-tmux[[:space:]]+[A-Za-z0-9._-]+[[:space:]]+assign([[:space:]]|$)/ { found=1 }
  END { exit !found }
' || exit 0

AGENT_TYPE="$(printf '%s' "$IN" | jq -r '.agent_type // "ABSENT"')"
BACKGROUND="$(printf '%s' "$IN" | jq -r '.tool_input.run_in_background // false | tostring')"

LOG="${HOME}/.local/state/agent-scripts/tmux-assign-host-probe.jsonl"
mkdir -p "$(dirname "$LOG")" 2>/dev/null && jq -cn \
  --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg agent_type "$AGENT_TYPE" \
  --arg background "$BACKGROUND" \
  --arg detach "$(printf '%s' "$CMD" | grep -q -- '--detach' && echo true || echo false)" \
  --arg session "$(printf '%s' "$IN" | jq -r '.session_id // empty')" \
  '{ts: $ts, agent_type: $agent_type, background: $background, detach: $detach, session: $session}' \
  >> "$LOG" 2>/dev/null

# Hosted correctly: inside a subagent, or dispatched as a background task.
[ "$AGENT_TYPE" = "ABSENT" ] || exit 0
[ "$BACKGROUND" != "true" ] || exit 0

# The short foreground exception is valid only for the assign shell segment.
printf '%s' "$CMD" | awk -v RS='[|;&]+' '
  /agent-tmux[[:space:]]+[A-Za-z0-9._-]+[[:space:]]+assign([[:space:]]|$)/ && /(^|[[:space:]])--detach([[:space:]]|$)/ { found=1 }
  END { exit !found }
' && exit 0

echo "BLOCKED: blocking \`agent-tmux <cli> assign\` must not run in the parent session's foreground — its supervise would sit on the expensive main context. Per model-dispatch.md §4 (2026-08-17 ruling), the canonical host is a supervision proxy: ONE \`general-purpose\` subagent on sonnet low whose brief orders it to run the single assign call FIRST, then report exit code + status/summary (no status/capture/probe/result, no reading the worker's output). run_in_background is a FALLBACK, allowed only after a proxy attempt failed, with the reason logged in the run dir. A short foreground --detach call is allowed only after its reaping premise is verified in-session." >&2
exit 2
