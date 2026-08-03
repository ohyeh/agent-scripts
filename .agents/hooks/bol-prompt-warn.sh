#!/usr/bin/env bash
# PreToolUse hook for the Agent tool (A2): warns (never blocks) when a
# delegated-agent prompt is missing GOAL/ACCEPTANCE/REPORT sections, and
# appends one JSONL stat line per invocation to a stats file under the user
# data dir. Validator: scripts/check-bol-prompt.sh (kept in the repo so it
# ships with the same deploy layer as the other sentinel hooks).
set -u

IN="$(cat)"
command -v jq >/dev/null 2>&1 || exit 0

TOOL_NAME="$(printf '%s' "$IN" | jq -r '.tool_name // empty')"
[ "$TOOL_NAME" = "Agent" ] || exit 0

PROMPT="$(printf '%s' "$IN" | jq -r '.tool_input.prompt // empty')"
SUBAGENT_TYPE="$(printf '%s' "$IN" | jq -r '.tool_input.subagent_type // empty')"

DATA_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/agent-hooks"
mkdir -p "$DATA_DIR"
STATS_FILE="$DATA_DIR/bol-prompt-stats.jsonl"
VALIDATOR="$HOME/.agents/hooks/check-bol-prompt.sh"
[ -x "$VALIDATOR" ] || VALIDATOR="$(dirname "$0")/../../scripts/check-bol-prompt.sh"

# Search-shaped subagents (Explore/Plan) are read-only lookups whose prompts are
# a question, not a work order — GOAL/ACCEPTANCE/REPORT does not apply. Log them
# as "exempt" so stats keep full coverage, and never warn.
case "$SUBAGENT_TYPE" in
  Explore|Plan)
    ts="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
    jq -cn --arg ts "$ts" --arg st "$SUBAGENT_TYPE" \
      '{timestamp: $ts, result: "exempt", subagent_type: $st, missing: []}' >> "$STATS_FILE"
    exit 0
    ;;
esac

output="$(printf '%s' "$PROMPT" | "$VALIDATOR" 2>&1)"
rc=$?
missing=()
if [ "$rc" -eq 0 ]; then
  result="pass"
else
  result="fail"
  IFS=',' read -ra missing <<< "$(printf '%s' "$output" | sed -n 's/^FAIL: missing sections: //p')"
fi

ts="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
if [ "${#missing[@]}" -eq 0 ]; then
  result="pass"
  missing_json="[]"
else
  result="fail"
  missing_json="$(printf '%s\n' "${missing[@]}" | jq -R . | jq -s -c .)"
fi
jq -cn --arg ts "$ts" --arg result "$result" --argjson missing "$missing_json" \
  '{timestamp: $ts, result: $result, missing: $missing}' >> "$STATS_FILE"

if [ "$result" = "fail" ]; then
  echo "bill-of-lading warning: delegated Agent prompt is missing sections: ${missing[*]}. See ~/.agents/skills/delegation-templates/SKILL.md. (warn-only, not blocking)" >&2
fi
exit 0
