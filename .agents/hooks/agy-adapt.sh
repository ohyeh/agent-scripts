#!/usr/bin/env bash
# Antigravity (agy) → Claude payload adapter for fleet hooks in ~/.agents/hooks/.
#
# Usage (agy .agents/hooks.json named-hook command): agy-adapt.sh <Event> <hook>
#   PreToolUse — toolCall.name run_command → Bash, args.CommandLine →
#     tool_input.command; hook exit 2 → {"decision":"deny","reason":…}.
#   Stop — agy sends no reply text and PostToolUse carries no tool output, so
#     the ledger/transcript the Claude gates read are synthesized from agy's
#     transcript_full.jsonl: last USER_INPUT = the human prompt, tool_calls =
#     ledger tools, GENERIC step output = ledger evidence (evidence-tokens.sh),
#     last PLANNER_RESPONSE content = last_assistant_message.
#     Hook {"decision":"block"} → {"decision":"continue","reason":…}.
# Pass-through: PreToolUse {"decision":"ask"} (agy reads {} as deny, measured;
# "allow" would bypass agy permissions); other events {}.
set -u
HOOKS_DIR="${AGY_ADAPT_HOOKS_DIR:-$HOME/.agents/hooks}"
EVENT="${1:-}"; NAME="${2:-}"
HOOK="$HOOKS_DIR/${NAME%.sh}.sh"
IN="$(cat)"
if [ -z "$EVENT" ] || [ ! -x "$HOOK" ] || ! command -v jq >/dev/null; then
  echo "agy-adapt: bad args or missing $HOOK/jq" >&2; echo '{}'; exit 0
fi
sid="$(printf '%s' "$IN" | jq -r '.conversationId // ""')"
trx="$(printf '%s' "$IN" | jq -r '.transcriptPath // ""')"

case "$EVENT" in
PreToolUse)
  mapped="$(printf '%s' "$IN" | jq -c --arg ev "$EVENT" '{
    hook_event_name:$ev, session_id:.conversationId, transcript_path:.transcriptPath,
    agent_type:"ABSENT",
    tool_name:(.toolCall.name | if .=="run_command" then "Bash" else . end),
    tool_input:((.toolCall.args // {}) + {command:(.toolCall.args.CommandLine // ""), run_in_background:false})}')"
  err="$(printf '%s' "$mapped" | "$HOOK" 2>&1 >/dev/null)"; ec=$?
  if [ "$ec" -eq 2 ]; then jq -cn --arg r "$err" '{decision:"deny", reason:$r}'; else echo '{"decision":"ask"}'; fi
  ;;
Stop)
  [ -f "$trx" ] || { echo '{}'; exit 0; }
  state="$HOME/.local/state/agent-hooks/$sid"; mkdir -p "$state"
  since="$(jq -r 'select(.type=="USER_INPUT") | .created_at' "$trx" | tail -1)"
  printf '{"type":"user","timestamp":"%s"}\n' "$since" > "$state/agy-transcript.jsonl"
  # The ledger is rebuilt from agy's transcript on every Stop: agy has no other ledger writer.
  : > "$state/ledger.jsonl"
  tok() { sed -E 's/exited with code/exit code/g' | bash "$HOOKS_DIR/evidence-tokens.sh"; }
  intok=""
  jq -c --arg s "$since" 'select(.created_at >= $s and .type != "USER_INPUT")' "$trx" | while IFS= read -r step; do
    ts="$(printf '%s' "$step" | jq -r '.created_at')"
    case "$(printf '%s' "$step" | jq -r '.type')" in
      PLANNER_RESPONSE)
        # A token the model typed into the call (echo "12 passed") is not a tool observation.
        intok="$(printf '%s' "$step" | jq -r '[.tool_calls[]?.args] | tostring' | tok)"
        printf '%s' "$step" | jq -r '.tool_calls[]?.name' | while IFS= read -r t; do
          case "$t" in run_command) t=Bash;; write_to_file|replace_file_content|multi_replace_file_content) t=Edit;; esac
          jq -cn --arg ts "$ts" --arg t "$t" '{timestamp:$ts, tool:$t, evidence:[]}' >> "$state/ledger.jsonl"
        done ;;
      GENERIC)
        ev="$(comm -23 <(printf '%s' "$step" | jq -r '.content // ""' | tok) <(printf '%s\n' "$intok" | sed '/^$/d') \
          | jq -R . | jq -sc .)"
        jq -cn --arg ts "$ts" --argjson ev "$ev" '{timestamp:$ts, tool:"output", evidence:$ev}' >> "$state/ledger.jsonl" ;;
    esac
  done
  last="$(jq -c 'select(.type=="PLANNER_RESPONSE" and (.content // "") != "") | .content' "$trx" | tail -1)"
  # agy sends no stop_hook_active. A stop after our own continue in the same human
  # turn is that case: pass true so the gate blocks once per prompt, as on Claude.
  again=false; [ "$(cat "$state/agy-blocked-since" 2>/dev/null)" = "$since" ] && again=true
  mapped="$(jq -cn --arg sid "$sid" --arg t "$state/agy-transcript.jsonl" --argjson last "${last:-\"\"}" --argjson again "$again" \
    '{hook_event_name:"Stop", session_id:$sid, transcript_path:$t, stop_hook_active:$again, last_assistant_message:$last}')"
  out="$(printf '%s' "$mapped" | "$HOOK" 2>/dev/null)"
  if [ "$(printf '%s' "$out" | jq -r '.decision // ""' 2>/dev/null)" = "block" ]; then
    printf '%s\n' "$since" > "$state/agy-blocked-since"
    printf '%s' "$out" | jq -c '{decision:"continue", reason:.reason}'
  else echo '{}'; fi
  ;;
*) echo '{}' ;;
esac
exit 0
