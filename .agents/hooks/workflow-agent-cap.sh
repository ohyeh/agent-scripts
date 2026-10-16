#!/usr/bin/env bash
# W43-1: total subagents per workflow run (owner ruling 2026-10-16 「控制別太氾濫我沒意見」, cap 25).
# W42 L2-2: one unattended night ran design-vs-code-audit with 33, 42 and 46 agents.
#
# Why here: workflow agents never reach PreToolUse(Agent) (W42: no bol-gate row during
# the 10-10 runs), and Claude Code 2.1.301 has no total cap, only
# CLAUDE_CODE_WORKFLOW_SIZE_WARNING_AGENTS (the `small` guideline was live on 10-09 and
# stopped nothing). SubagentStart does fire, with agent_type `workflow-subagent`.
# SubagentStart cannot cancel a launch: exit 2 puts this message into the new subagent's
# context, so agents 26+ each run one short turn and return CAPPED. The run goes on.
#
#   PreToolUse(Workflow)            -> new run key in $STATE/workflow-run
#   SubagentStart workflow-subagent -> count distinct agent_id under that key; > cap -> exit 2
# shortcut: two workflow runs live at once in one session share the newer key, so the
# count runs high (never low); key by run id if SubagentStart ever carries one.
set -u

IN="$(cat)"
command -v jq >/dev/null 2>&1 || exit 0
SESSION_ID="$(printf '%s' "$IN" | jq -r '.session_id // empty')"
[ -n "$SESSION_ID" ] || exit 0
EVENT="$(printf '%s' "$IN" | jq -r '.hook_event_name // empty')"
STATE="${XDG_STATE_HOME:-$HOME/.local/state}/agent-hooks/$SESSION_ID"
CAP="${WORKFLOW_AGENT_CAP:-25}"
DATA_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/agent-hooks"
mkdir -p "$DATA_DIR" "$STATE"
STATS_FILE="$DATA_DIR/workflow-agent-cap-stats.jsonl"
log() {
  jq -cn --arg ts "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" --arg r "$1" --arg run "$2" --argjson n "$3" --arg name "${4:-}" \
    '{timestamp:$ts, result:$r, run:$run, agents:$n, workflow:$name}' >> "$STATS_FILE"
}

if [ "$EVENT" = PreToolUse ]; then
  [ "$(printf '%s' "$IN" | jq -r '.tool_name // empty')" = Workflow ] || exit 0
  NAME="$(printf '%s' "$IN" | jq -r '.tool_input.name // .tool_input.scriptPath // "inline"')"
  KEY="$(date +%s)-$$-$RANDOM"
  mkdir -p "$STATE/workflow-runs/$KEY"
  printf '%s %s\n' "$KEY" "$NAME" > "$STATE/workflow-run"
  log start "$KEY" 0 "$NAME"
  exit 0
fi

[ "$EVENT" = SubagentStart ] || exit 0
[ "$(printf '%s' "$IN" | jq -r '.agent_type // empty')" = workflow-subagent ] || exit 0
AGENT_ID="$(printf '%s' "$IN" | jq -r '.agent_id // empty')"
KEY="" NAME=""
read -r KEY NAME < "$STATE/workflow-run" 2>/dev/null
# no run on record (hook installed mid-run, state cleared): count nothing, never deny
[ -n "$KEY" ] && [ -n "$AGENT_ID" ] && [ -d "$STATE/workflow-runs/$KEY" ] || { log no-run "" 0; exit 0; }
: > "$STATE/workflow-runs/$KEY/$AGENT_ID"   # a restart under the same id is not a new agent
N="$(find "$STATE/workflow-runs/$KEY" -type f | wc -l | tr -d ' ')"
if [ "$N" -gt "$CAP" ]; then
  log capped "$KEY" "$N" "$NAME"
  echo "CAPPED (W43-1): this workflow run ($NAME) already started $CAP subagents; you are number $N. The owner capped one run at $CAP. Do no work and call no tools. Reply with exactly one line: CAPPED: W43-1 $NAME agent $N/$CAP" >&2
  exit 2
fi
log counted "$KEY" "$N" "$NAME"
exit 0
