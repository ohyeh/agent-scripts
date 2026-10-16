#!/usr/bin/env bash
# SubagentStart / SubagentStop / SessionStart hook: keeps one marker file per live subagent at
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
[ -n "$SESSION_ID" ] || exit 0
STATE="${XDG_STATE_HOME:-$HOME/.local/state}/agent-hooks/$SESSION_ID"
LEDGER="$STATE/subagents"

# A new process for this session id (startup, resume, clear): the old process's
# subagents died without SubagentStop (W43-2 ③: 14 leftover markers on 2026-10-16).
# Compaction keeps the process and its background subagents, so it keeps the ledger.
if [ "$EVENT" = SessionStart ]; then
  case "$(printf '%s' "$IN" | jq -r '.source // empty')" in
    startup|resume|clear) rm -rf "$LEDGER" "$STATE/pending" ;;
  esac
  exit 0
fi
[ -n "$AGENT_ID" ] || exit 0

case "$EVENT" in
  SubagentStart)
    # No lock (W43-2 ②: a busy lock left the pending in place and counted this
    # subagent twice). Write the live marker FIRST, then claim one pending by an
    # atomic rename out of pending/: the count is briefly one high, never one low.
    mkdir -p "$LEDGER" "$STATE/pending"
    printf '%s %s\n' "$AGENT_TYPE" "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" > "$LEDGER/$AGENT_ID"
    # Prefer the oldest pending of this agent_type: it carries the W42-12 `nested`
    # flag, kept in nested/<agent_id>. That file outlives SubagentStop, because a
    # subagent woken by a background child stops and starts again under the same id.
    # shortcut: same-type dispatches in one message with mixed flags, or a restart
    # under the same id, can take another subagent's pending (and its flag); match on
    # the prompt if SubagentStart ever carries it.
    claim="$STATE/subagent-claim-$AGENT_ID-$$"
    for _ in 1 2 3 4 5; do
      oldest="$(cd "$STATE/pending" 2>/dev/null && grep -l -E "^[0-9]+ $AGENT_TYPE( |\$)" * 2>/dev/null | sort | head -1)"
      [ -n "$oldest" ] || oldest="$(ls -1 "$STATE/pending" 2>/dev/null | sort | head -1)"
      [ -n "$oldest" ] || break
      mv "$STATE/pending/$oldest" "$claim" 2>/dev/null || continue   # another start took it
      grep -qE "^[0-9]+ $AGENT_TYPE nested" "$claim" && mkdir -p "$STATE/nested" && : > "$STATE/nested/$AGENT_ID"
      rm -f "$claim"
      break
    done
    ;;
  SubagentStop)
    rm -f "$LEDGER/$AGENT_ID"
    ;;
esac
exit 0
