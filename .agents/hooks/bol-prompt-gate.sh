#!/usr/bin/env bash
# PreToolUse hook for the Agent tool (A2, blocking): a delegated-agent prompt
# missing any of GOAL/ACCEPTANCE/REPORT is denied (exit 2, reason fed back to
# the model), and dispatch above the concurrency cap is denied too.
#
# History: shipped 2026-08 as bol-prompt-warn.sh (warn-only). In session
# c42d1927 (2026-08-25) it detected 13/13 malformed prompts and changed
# nothing — a detector with no actuator. Codex adversarial review
# (.workflow/202608251105-negative-claim-symmetry/) ruled: mechanical gates
# with full action-surface coverage beat non-blocking warnings for the exact
# action they cover. This is that gate.
#
# Concurrency (user ruling 2026-08-21): soft warning at 3 live subagents,
# hard deny at 5. Live count = files in the per-session ledger kept by
# subagent-ledger.sh (SubagentStart touches, SubagentStop removes), so it is
# independent of foreground/background and of how the Agent call returns.
# Sessions without a session_id (old runtimes, unit tests) skip the count.
#
# Validator: scripts/check-bol-prompt.sh (installed next to this hook).
# Stats: one JSONL line per invocation under the user data dir, same shape as
# before plus `blocked`.
set -u

IN="$(cat)"
command -v jq >/dev/null 2>&1 || exit 0

TOOL_NAME="$(printf '%s' "$IN" | jq -r '.tool_name // empty')"
[ "$TOOL_NAME" = "Agent" ] || exit 0

PROMPT="$(printf '%s' "$IN" | jq -r '.tool_input.prompt // empty')"
SUBAGENT_TYPE="$(printf '%s' "$IN" | jq -r '.tool_input.subagent_type // empty')"
SESSION_ID="$(printf '%s' "$IN" | jq -r '.session_id // empty')"

SOFT_CAP="${BOL_CONCURRENCY_SOFT:-3}"
HARD_CAP="${BOL_CONCURRENCY_HARD:-5}"

DATA_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/agent-hooks"
mkdir -p "$DATA_DIR"
STATS_FILE="$DATA_DIR/bol-prompt-stats.jsonl"
VALIDATOR="$HOME/.agents/hooks/check-bol-prompt.sh"
[ -x "$VALIDATOR" ] || VALIDATOR="$(dirname "$0")/../../scripts/check-bol-prompt.sh"

ts="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
log_stat() { # $1 result, $2 missing_json, $3 blocked(true|false), $4 live
  jq -cn --arg ts "$ts" --arg result "$1" --argjson missing "$2" \
    --argjson blocked "$3" --argjson live "$4" --arg st "$SUBAGENT_TYPE" \
    '{timestamp: $ts, result: $result, missing: $missing, blocked: $blocked, live_subagents: $live, subagent_type: $st}' \
    >> "$STATS_FILE"
}

# --- concurrency -------------------------------------------------------------
live=0
if [ -n "$SESSION_ID" ]; then
  LEDGER="${XDG_STATE_HOME:-$HOME/.local/state}/agent-hooks/$SESSION_ID/subagents"
  if [ -d "$LEDGER" ]; then
    live="$(find "$LEDGER" -type f | wc -l | tr -d ' ')"
  fi
fi
if [ "$live" -ge "$HARD_CAP" ]; then
  log_stat "concurrency" "[]" true "$live"
  echo "BLOCKED: $live subagents are already live in this session; hard cap is $HARD_CAP (user ruling 2026-08-21, model-dispatch.md §4). Wait for a running subagent to finish, or fold this work into one of them." >&2
  exit 2
fi

# --- bill of lading -----------------------------------------------------------
# Search-shaped subagents (Explore/Plan) are read-only lookups whose prompts are
# a question, not a work order — GOAL/ACCEPTANCE/REPORT does not apply.
case "$SUBAGENT_TYPE" in
  Explore|Plan)
    log_stat "exempt" "[]" false "$live"
    ;;
  *)
    output="$(printf '%s' "$PROMPT" | "$VALIDATOR" 2>&1)"
    if [ $? -eq 0 ]; then
      log_stat "pass" "[]" false "$live"
    else
      missing_csv="$(printf '%s' "$output" | sed -n 's/^FAIL: missing sections: //p')"
      if [ -n "$missing_csv" ]; then
        missing_json="$(printf '%s' "$missing_csv" | tr ',' '\n' | jq -R . | jq -s -c .)"
        log_stat "fail" "$missing_json" true "$live"
        echo "BLOCKED: delegated Agent prompt is missing sections: ${missing_csv}. Every delegation brief carries GOAL, ACCEPTANCE and REPORT (model-dispatch.md §3; templates in ~/.agents/skills/delegation-templates/SKILL.md). Rewrite the prompt with all three and dispatch again." >&2
      else
        log_stat "fail" '["RUNNABLE_CHECK"]' true "$live"
        echo "BLOCKED: ${output#FAIL: }. A build-shaped brief ships with the command that proves it (delegation-templates §2/§3: \`{test command}\` exits 0, VERIFY BEFORE REPORTING: run {command}). Add it and dispatch again." >&2
      fi
      exit 2
    fi
    ;;
esac

if [ "$live" -ge "$SOFT_CAP" ]; then
  echo "bol-prompt-gate: $live subagents live (soft cap $SOFT_CAP, hard cap $HARD_CAP). Each extra concurrent worker is the top friction source on record (lesson 2026-08-21); prefer feeding a running worker." >&2
fi
exit 0
