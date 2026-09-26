#!/usr/bin/env bash
# Self-check for .agents/hooks/agy-adapt.sh with inline agy-shaped fixtures.
# Runs from a FILE on purpose: poll strings would trip the host gate on the tester.
cd "$(dirname "$0")/.." || exit 1
A="${AGY_ADAPT:-.agents/hooks/agy-adapt.sh}"
export AGY_ADAPT_HOOKS_DIR="${AGY_ADAPT_HOOKS_DIR:-$PWD/.agents/hooks}"
W="$(mktemp -d)"; export HOME="$W/home"; mkdir -p "$HOME"
trap 'rm -rf "$W"' EXIT
fail=0
ok() { if [ "$2" = "$3" ]; then echo "ok   $1"; else echo "FAIL $1: want [$2] got [$3]"; fail=1; fi; }
pre() { jq -cn --arg c "$1" '{conversationId:"c1",transcriptPath:"/x/.gemini/antigravity-cli/brain/c1/t.jsonl",toolCall:{name:"run_command",args:{CommandLine:$c,Cwd:"/tmp"}}}'; }

ok "plain command asks"   ask  "$(pre 'echo hi' | "$A" PreToolUse tmux-assign-host-gate | jq -r .decision)"
ok "parent poll denied"   deny "$(pre 'agent-tmux codex sta''tus w1' | "$A" PreToolUse tmux-assign-host-gate | jq -r .decision)"
ok "missing hook is {}"   '{}' "$("$A" PreToolUse no-such-hook < /dev/null 2>/dev/null)"

trx() { # $1 = final reply, $2 = conversation id (default: fresh), $3 = shell output
  printf '%s\n' '{"type":"USER_INPUT","created_at":"2026-09-26T11:00:00Z","content":"x"}' \
    '{"type":"PLANNER_RESPONSE","created_at":"2026-09-26T11:00:01Z","tool_calls":[{"name":"run_command"}]}' \
    > "$W/t.jsonl"
  jq -cn --arg o "${3:-ok}" '{type:"GENERIC",created_at:"2026-09-26T11:00:02Z",content:("The command exited with code 0.\nOutput:\n"+$o)}' >> "$W/t.jsonl"
  jq -cn --arg c "$1" '{type:"PLANNER_RESPONSE",created_at:"2026-09-26T11:00:03Z",content:$c}' >> "$W/t.jsonl"
  jq -cn --arg t "$W/t.jsonl" --arg id "${2:-s$RANDOM}" '{conversationId:$id,transcriptPath:$t}'
}
ok "unquoted claim continues" continue "$(trx '全部已完成並驗證通過。' | "$A" Stop claim-evidence-gate | jq -r '.decision // "none"')"
ok "quoted exit=0 stops"      none     "$(trx '完成，exit=0。' | "$A" Stop claim-evidence-gate | jq -r '.decision // "none"')"
ok "plain answer stops"       none     "$(trx 'The file has 3 lines.' | "$A" Stop claim-evidence-gate | jq -r '.decision // "none"')"
ok "second unquoted reply, same prompt, stops" none \
  "$(trx '全部已完成並驗證通過。' loopid | "$A" Stop claim-evidence-gate >/dev/null; trx '確認完成，全部修好了。' loopid | "$A" Stop claim-evidence-gate | jq -r '.decision // "none"')"
# The model typed "12 passed" into the command: echoing it is not evidence.
echotrx() {
  printf '%s\n' '{"type":"USER_INPUT","created_at":"2026-09-26T11:00:00Z","content":"x"}' \
    '{"type":"PLANNER_RESPONSE","created_at":"2026-09-26T11:00:01Z","tool_calls":[{"name":"run_command","args":{"CommandLine":"echo 12 passed"}}]}' \
    '{"type":"GENERIC","created_at":"2026-09-26T11:00:02Z","content":"Output:\n12 passed"}' \
    '{"type":"PLANNER_RESPONSE","created_at":"2026-09-26T11:00:03Z","content":"完成，12 passed。"}' > "$W/e.jsonl"
  jq -cn --arg t "$W/e.jsonl" '{conversationId:"echoid",transcriptPath:$t}'
}
ok "echoed token is not evidence" continue "$(echotrx | "$A" Stop claim-evidence-gate | jq -r '.decision // "none"')"
# Two output tokens, one echoed from the command: only the observed one counts.
two() { # $1 = final reply
  printf '%s\n' '{"type":"USER_INPUT","created_at":"2026-09-26T11:00:00Z","content":"x"}' \
    '{"type":"PLANNER_RESPONSE","created_at":"2026-09-26T11:00:01Z","tool_calls":[{"name":"run_command","args":{"CommandLine":"echo 12 passed; make t"}}]}' \
    '{"type":"GENERIC","created_at":"2026-09-26T11:00:02Z","content":"The command exited with code 0.\nOutput:\n12 passed\n3/3 passed"}' > "$W/two.jsonl"
  jq -cn --arg c "$1" '{type:"PLANNER_RESPONSE",created_at:"2026-09-26T11:00:03Z",content:$c}' >> "$W/two.jsonl"
  jq -cn --arg t "$W/two.jsonl" --arg id "two$RANDOM" '{conversationId:$id,transcriptPath:$t}'
}
ok "two tokens: echoed one still blocks" continue "$(two '完成，12 passed。' | "$A" Stop claim-evidence-gate | jq -r '.decision // "none"')"
ok "two tokens: observed one passes"     none     "$(two '完成，3/3 passed。' | "$A" Stop claim-evidence-gate | jq -r '.decision // "none"')"
ok "two tokens: exit code passes"        none     "$(two '完成，exit=0。' | "$A" Stop claim-evidence-gate | jq -r '.decision // "none"')"
bash -n "$A" && echo "ok   bash -n"
exit $fail
