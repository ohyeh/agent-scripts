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

LEDGER="${XDG_STATE_HOME:-$HOME/.local/state}/agent-hooks/$SESSION_ID/subagents"
live=0
[ -d "$LEDGER" ] && live="$(find "$LEDGER" -type f | wc -l | tr -d ' ')"

if [ "$live" -ge "$HARD_CAP" ]; then
  jq -cn --arg ts "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" --argjson live "$live" \
    --arg st "$(printf '%s' "$IN" | jq -r '.tool_input.subagent_type // empty')" \
    '{timestamp: $ts, result: "concurrency", missing: [], blocked: true, live_subagents: $live, subagent_type: $st}' >> "$STATS_FILE"
  echo "BLOCKED: $live subagents are already live in this session; hard cap is $HARD_CAP (user ruling 2026-08-21, model-dispatch.md §4). Wait for a running subagent to finish, or fold this work into one of them." >&2
  exit 2
fi
if [ "$live" -ge "$SOFT_CAP" ]; then
  echo "subagent-concurrency-gate: $live subagents live (soft cap $SOFT_CAP, hard cap $HARD_CAP). Each extra concurrent worker is the top friction source on record (lesson 2026-08-21); prefer feeding a running worker." >&2
fi
exit 0
