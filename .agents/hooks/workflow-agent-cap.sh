#!/usr/bin/env bash
# W43-1: total subagents per workflow run (owner ruling 2026-10-16 「控制別太氾濫我沒意見」, cap 25).
# W42 L2-2: one unattended night ran design-vs-code-audit with 33, 42 and 46 agents.
#
# Why here: workflow agents never reach PreToolUse(Agent) (W42: no bol-gate row during
# the 10-10 runs), and Claude Code 2.1.301 has no total cap, only
# CLAUDE_CODE_WORKFLOW_SIZE_WARNING_AGENTS (the `small` guideline was live on 10-09 and
# stopped nothing).
#
#   PreToolUse(Workflow) -> new run key in $STATE/workflow-run (this file)
#   SubagentStart        -> subagent-ledger.sh counts it (W44-2 B1): a recipe-typed workflow
#                           agent arrives as `general-purpose`, so the old `workflow-subagent`
#                           matcher missed it; the ledger tells it apart by its missing pending.
set -u

IN="$(cat)"
command -v jq >/dev/null 2>&1 || exit 0
SESSION_ID="$(printf '%s' "$IN" | jq -r '.session_id // empty')"
[ -n "$SESSION_ID" ] || exit 0
EVENT="$(printf '%s' "$IN" | jq -r '.hook_event_name // empty')"
STATE="${XDG_STATE_HOME:-$HOME/.local/state}/agent-hooks/$SESSION_ID"
DATA_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/agent-hooks"
mkdir -p "$DATA_DIR" "$STATE"
STATS_FILE="$DATA_DIR/workflow-agent-cap-stats.jsonl"
log() {
  jq -cn --arg ts "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" --arg r "$1" --arg run "$2" --argjson n "$3" --arg name "${4:-}" \
    '{timestamp:$ts, result:$r, run:$run, agents:$n, workflow:$name}' >> "$STATS_FILE"
}

[ "$EVENT" = PreToolUse ] || exit 0
[ "$(printf '%s' "$IN" | jq -r '.tool_name // empty')" = Workflow ] || exit 0
NAME="$(printf '%s' "$IN" | jq -r '.tool_input.name // .tool_input.scriptPath // "inline"')"
KEY="$(date +%s)-$$-$RANDOM"
mkdir -p "$STATE/workflow-runs/$KEY"
printf '%s %s\n' "$KEY" "$NAME" > "$STATE/workflow-run"
log start "$KEY" 0 "$NAME"
exit 0
