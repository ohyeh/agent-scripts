#!/usr/bin/env bash
# SubagentStart / SubagentStop hook: keeps one marker file per live subagent at
#   ${XDG_STATE_HOME:-~/.local/state}/agent-hooks/<session_id>/subagents/<agent_id>
# subagent-concurrency-gate.sh counts these files to enforce the concurrency cap. Marker
# content is the agent_type + start timestamp, so `ls` of the dir is a live
# roster. State is per session_id, so a crashed session leaves no phantom
# count for the next one. Never blocks.
set -u

IN="$(cat)"
command -v jq >/dev/null 2>&1 || exit 0

EVENT="$(printf '%s' "$IN" | jq -r '.hook_event_name // empty')"
SESSION_ID="$(printf '%s' "$IN" | jq -r '.session_id // empty')"
AGENT_ID="$(printf '%s' "$IN" | jq -r '.agent_id // empty')"
AGENT_TYPE="$(printf '%s' "$IN" | jq -r '.agent_type // "unknown"')"
[ -n "$SESSION_ID" ] && [ -n "$AGENT_ID" ] || exit 0

LEDGER="${XDG_STATE_HOME:-$HOME/.local/state}/agent-hooks/$SESSION_ID/subagents"
case "$EVENT" in
  SubagentStart)
    mkdir -p "$LEDGER"
    printf '%s %s\n' "$AGENT_TYPE" "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" > "$LEDGER/$AGENT_ID"
    ;;
  SubagentStop)
    rm -f "$LEDGER/$AGENT_ID"
    ;;
esac
exit 0
