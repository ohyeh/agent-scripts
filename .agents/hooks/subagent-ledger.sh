#!/usr/bin/env bash
# SubagentStart / SubagentStop / SessionStart hook: keeps one marker file per live subagent at
#   ${XDG_STATE_HOME:-~/.local/state}/agent-hooks/<session_id>/subagents/<agent_id>
# subagent-concurrency-gate.sh counts these files to enforce the concurrency cap. Marker
# content is the agent_type + start timestamp, so `ls` of the dir is a live
# roster. State is per session_id, so a crashed session leaves no phantom
# count for the next one.
# Also (W44-2): SubagentStart counts workflow agents per run (W43-1 cap; exit 2 past the cap);
# PostToolUse(TaskStop), forwarded by context-ledger.sh, drops the markers of a stopped workflow.
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

# W44-2 B2: a workflow stopped by TaskStop sends no SubagentStop, so its markers stayed and the
# concurrency gate over-counted (10-19: a false block). The Workflow launch result in the session
# transcript maps the task id to the run's transcriptDir, which holds agent-<id>.meta.json.
if [ "$EVENT" = PostToolUse ]; then
  [ "$(printf '%s' "$IN" | jq -r '.tool_name // empty')" = TaskStop ] || exit 0
  [ "$(printf '%s' "$IN" | jq -r '.tool_response.task_type? // empty')" = local_workflow ] || exit 0
  TASK_ID="$(printf '%s' "$IN" | jq -r '.tool_input.task_id // empty')"
  TRANSCRIPT="$(printf '%s' "$IN" | jq -r '.transcript_path // empty')"
  RUN_DIR="$(grep -F "\"taskId\":\"$TASK_ID\"" "$TRANSCRIPT" 2>/dev/null \
    | jq -r --arg t "$TASK_ID" 'select(.toolUseResult.taskId? == $t) | .toolUseResult.transcriptDir // empty' 2>/dev/null | head -1)"
  [ -n "$TASK_ID" ] && [ -n "$RUN_DIR" ] || { echo "subagent-ledger: TaskStop $TASK_ID: no Workflow launch with transcriptDir in $TRANSCRIPT" >&2; exit 0; }
  for m in "$LEDGER"/*; do
    [ -e "$RUN_DIR/agent-${m##*/}.meta.json" ] && rm -f "$m"
  done
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
    claim="$STATE/subagent-claim-$AGENT_ID-$$" claimed=""
    for _ in 1 2 3 4 5; do
      oldest="$(cd "$STATE/pending" 2>/dev/null && grep -l -E "^[0-9]+ $AGENT_TYPE( |\$)" * 2>/dev/null | sort | head -1)"
      [ -n "$oldest" ] || oldest="$(ls -1 "$STATE/pending" 2>/dev/null | sort | head -1)"
      [ -n "$oldest" ] || break
      mv "$STATE/pending/$oldest" "$claim" 2>/dev/null || continue   # another start took it
      claimed=1
      grep -qE "^[0-9]+ $AGENT_TYPE nested" "$claim" && mkdir -p "$STATE/nested" && : > "$STATE/nested/$AGENT_ID"
      rm -f "$claim"
      break
    done
    # W44-2 B1 (W43-1 cap, owner 10-16, cap 25): an Agent-tool subagent always passed
    # PreToolUse(Agent), which wrote a pending; a workflow agent never does, and its agent_type
    # can be any recipe type. No pending claimed + a run on record -> workflow agent.
    # shortcut: the run key outlives the run, so any pending-less start (also a restart under the
    # same id) counts to the newest run, even a stale
    # run (high, never low); clear the key when a Workflow end event exists. Two runs live at
    # once share the newer key. A claim race can swap one workflow agent with one Agent subagent.
    [ -z "$claimed" ] || exit 0
    CAP="${WORKFLOW_AGENT_CAP:-25}"
    DATA_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/agent-hooks"
    mkdir -p "$DATA_DIR"
    log() {
      jq -cn --arg ts "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" --arg r "$1" --arg run "$2" --argjson n "$3" --arg name "${4:-}" \
        '{timestamp:$ts, result:$r, run:$run, agents:$n, workflow:$name}' >> "$DATA_DIR/workflow-agent-cap-stats.jsonl"
    }
    KEY="" NAME=""
    read -r KEY NAME 2>/dev/null < "$STATE/workflow-run"
    # no run on record (hook installed mid-run, state cleared): count nothing, never deny
    [ -n "$KEY" ] && [ -d "$STATE/workflow-runs/$KEY" ] || { log no-run "" 0; exit 0; }
    : > "$STATE/workflow-runs/$KEY/$AGENT_ID"   # a restart under the same id is not a new agent
    N="$(find "$STATE/workflow-runs/$KEY" -type f | wc -l | tr -d ' ')"
    if [ "$N" -gt "$CAP" ]; then
      log capped "$KEY" "$N" "$NAME"
      echo "CAPPED (W43-1): this workflow run ($NAME) already started $CAP subagents; you are number $N. The owner capped one run at $CAP. Do no work and call no tools. Reply with exactly one line: CAPPED: W43-1 $NAME agent $N/$CAP" >&2
      exit 2
    fi
    log counted "$KEY" "$N" "$NAME"
    ;;
  SubagentStop)
    rm -f "$LEDGER/$AGENT_ID"
    ;;
esac
exit 0
