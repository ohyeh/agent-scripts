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

STATE="${XDG_STATE_HOME:-$HOME/.local/state}/agent-hooks/$SESSION_ID"
LEDGER="$STATE/subagents"
case "$EVENT" in
  SubagentStart)
    # Turn the oldest pending reservation (written by the gate) into this live
    # marker under the shared lock, so the count never drops between the two.
    mkdir -p "$LEDGER" "$STATE/pending"
    . "$(dirname "$0")/subagent-lock.sh"
    held=0
    if ledger_lock "$STATE"; then held=1; else echo "subagent-ledger: lock busy; pending not consumed" >&2; fi
    # Prefer the oldest pending of this agent_type: it carries the W42-12 `nested`
    # flag, kept in nested/<agent_id>. That file outlives SubagentStop, because a
    # subagent woken by a background child stops and starts again under the same id.
    # shortcut: same-type dispatches in one message with mixed flags, or a restart
    # under the same id, can take another subagent's pending (and its flag); match on
    # the prompt if SubagentStart ever carries it.
    if [ "$held" = 1 ]; then
      oldest="$(cd "$STATE/pending" 2>/dev/null && grep -l -E "^[0-9]+ $AGENT_TYPE( |\$)" * 2>/dev/null | sort | head -1)"
      [ -n "$oldest" ] || oldest="$(ls -1 "$STATE/pending" 2>/dev/null | sort | head -1)"
      if [ -n "$oldest" ]; then
        grep -qE "^[0-9]+ $AGENT_TYPE nested" "$STATE/pending/$oldest" && mkdir -p "$STATE/nested" && : > "$STATE/nested/$AGENT_ID"
        rm -f "$STATE/pending/$oldest"
      fi
    fi
    printf '%s %s\n' "$AGENT_TYPE" "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" > "$LEDGER/$AGENT_ID"
    [ "$held" = 1 ] && ledger_unlock "$STATE"
    ;;
  SubagentStop)
    rm -f "$LEDGER/$AGENT_ID"
    ;;
esac
exit 0
