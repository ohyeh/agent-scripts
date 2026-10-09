#!/usr/bin/env bash
# PreToolUse hook for the Agent tool: concurrency cap on live subagents.
# Split out of bol-prompt-gate.sh on 2026-08-27 so each gate owns one rule
# (bol = the brief's content; this = how many workers are live).
#
# User ruling 2026-08-21: soft warning at 3 live subagents, hard deny at 5.
# Live count = marker files kept by subagent-ledger.sh (SubagentStart touches,
# SubagentStop removes), independent of foreground/background and of how the
# Agent call returns. Sessions without a session_id skip the count.
set -u

IN="$(cat)"
command -v jq >/dev/null 2>&1 || exit 0
[ "$(printf '%s' "$IN" | jq -r '.tool_name // empty')" = "Agent" ] || exit 0
SESSION_ID="$(printf '%s' "$IN" | jq -r '.session_id // empty')"
[ -n "$SESSION_ID" ] || exit 0

SOFT_CAP="${BOL_CONCURRENCY_SOFT:-3}"
HARD_CAP="${BOL_CONCURRENCY_HARD:-5}"
DATA_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/agent-hooks"
mkdir -p "$DATA_DIR"
STATS_FILE="$DATA_DIR/bol-prompt-stats.jsonl"   # same stream as bol, result=concurrency

# Check and reserve in ONE locked step (W42-1). Six Agent calls in one message
# all passed the old check: none had reached SubagentStart, so none was counted.
# The gate now writes a pending marker under the lock; subagent-ledger.sh turns
# one pending into a live marker on SubagentStart. A pending marker that never
# starts (call denied by a later hook, launch failure) expires after PENDING_TTL.
STATE="${XDG_STATE_HOME:-$HOME/.local/state}/agent-hooks/$SESSION_ID"
LEDGER="$STATE/subagents"
PENDING="$STATE/pending"
PENDING_TTL="${BOL_CONCURRENCY_PENDING_TTL:-120}"
mkdir -p "$LEDGER" "$PENDING"
ST="$(printf '%s' "$IN" | jq -r '.tool_input.subagent_type // empty')"; ST="${ST:-general-purpose}"

# W42-12: a subagent may dispatch its own subagent only when its dispatcher's brief
# carries the line `NESTED: allowed`. The gate records that flag in the pending
# marker; subagent-ledger.sh carries it to the live marker keyed by agent_id.
# A call is nested when it carries agent_id outside a SubagentStart event (Cursor
# runs this gate AT subagentStart, where agent_id names the subagent being started).
AGENT_ID="$(printf '%s' "$IN" | jq -r '.agent_id // empty')"
EVENT="$(printf '%s' "$IN" | jq -r '.hook_event_name // empty')"
if [ -n "$AGENT_ID" ] && [ "$EVENT" != "SubagentStart" ] && ! grep -q " nested$" "$LEDGER/$AGENT_ID" 2>/dev/null; then
  jq -cn --arg ts "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" --arg st "$ST" \
    '{timestamp: $ts, result: "nested", missing: [], blocked: true, subagent_type: $st}' >> "$STATS_FILE"
  echo "BLOCKED: this subagent may not dispatch subagents. Nested dispatch needs the line \`NESTED: allowed\` in the brief that started this subagent (W42-12). Do this work yourself, or report back and let your dispatcher delegate it." >&2
  exit 2
fi
NESTED_OK=""
printf '%s' "$IN" | jq -r '.tool_input.prompt // empty' | grep -Eq '^[[:space:]]*NESTED:[[:space:]]*allowed' && NESTED_OK=" nested"
. "$(dirname "$0")/subagent-lock.sh"
ledger_lock "$STATE" || { echo "subagent-concurrency-gate: lock busy; not counted" >&2; exit 0; }
now="$(date +%s)"
for p in "$PENDING"/*; do
  [ -f "$p" ] || continue
  t=0; read -r t _ < "$p" 2>/dev/null
  [ $(( now - ${t:-0} )) -lt "$PENDING_TTL" ] || rm -f "$p"
done
live="$(find "$LEDGER" "$PENDING" -type f | wc -l | tr -d ' ')"
[ "$live" -ge "$HARD_CAP" ] || printf '%s %s%s\n' "$now" "$ST" "$NESTED_OK" > "$PENDING/$now-$$-$RANDOM"
ledger_unlock "$STATE"

if [ "$live" -ge "$HARD_CAP" ]; then
  jq -cn --arg ts "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" --argjson live "$live" --arg st "$ST" \
    '{timestamp: $ts, result: "concurrency", missing: [], blocked: true, live_subagents: $live, subagent_type: $st}' >> "$STATS_FILE"
  echo "BLOCKED: $live subagents are already live in this session; hard cap is $HARD_CAP (user ruling 2026-08-21, model-dispatch.md §4). Wait for a running subagent to finish, or fold this work into one of them." >&2
  exit 2
fi
if [ "$live" -ge "$SOFT_CAP" ]; then
  echo "subagent-concurrency-gate: $live subagents live (soft cap $SOFT_CAP, hard cap $HARD_CAP). Each extra concurrent worker is the top friction source on record (lesson 2026-08-21); prefer feeding a running worker." >&2
fi
exit 0
