#!/usr/bin/env bash
# Self-check for .agents/hooks/tmux-assign-host-gate.sh.
# Runs from a FILE on purpose: the gate inspects tool_input.command, so inline
# test strings containing the dispatch verb would trip the gate on the tester.
cd "$(dirname "$0")/.." || exit 1
H=.agents/hooks/tmux-assign-host-gate.sh
fail=0
t() {
  printf '%s' "$3" | "$H" >/dev/null 2>&1
  got=$?
  if [ "$got" = "$2" ]; then printf 'ok   %-28s exit=%s\n' "$1" "$got"
  else printf 'FAIL %-28s want=%s got=%s\n' "$1" "$2" "$got"; fail=1; fi
}
V='agent-tmux codex assign a /tmp /p.md'
t "parent blocking"   2 "{\"tool_name\":\"Bash\",\"session_id\":\"s\",\"tool_input\":{\"command\":\"$V\"}}"
t "parent --detach"   2 "{\"tool_name\":\"Bash\",\"session_id\":\"s\",\"tool_input\":{\"command\":\"agent-tmux codex assign --detach a /tmp /p.md\"}}"
t "detach in sibling" 2 "{\"tool_name\":\"Bash\",\"session_id\":\"s\",\"tool_input\":{\"command\":\"echo --detach && $V\"}}"
t "subagent host"     0 "{\"tool_name\":\"Bash\",\"agent_type\":\"h\",\"session_id\":\"s\",\"tool_input\":{\"command\":\"$V\"}}"
t "background task"   0 "{\"tool_name\":\"Bash\",\"session_id\":\"s\",\"tool_input\":{\"command\":\"$V\",\"run_in_background\":true}}"
t "unrelated command" 0 '{"tool_name":"Bash","session_id":"s","tool_input":{"command":"git status"}}'
t "assign --help"     0 '{"tool_name":"Bash","session_id":"s","tool_input":{"command":"agent-tmux codex assign --help"}}'
t "parent status"     2 '{"tool_name":"Bash","session_id":"s","tool_input":{"command":"agent-tmux codex status --json w1"}}'
t "parent capture"    2 '{"tool_name":"Bash","session_id":"s","tool_input":{"command":"agent-tmux codex capture w1 2>&1 | tail -5"}}'
t "parent probe"      2 '{"tool_name":"Bash","session_id":"s","tool_input":{"command":"agent-tmux codex probe --metric tool_active w1"}}'
t "parent result"     2 '{"tool_name":"Bash","session_id":"s","tool_input":{"command":"agent-tmux codex result wait-required w1 --fields status --wait 900 --json"}}'
t "subagent result"   0 '{"tool_name":"Bash","agent_type":"h","session_id":"s","tool_input":{"command":"agent-tmux codex result wait-required w1 --fields status --wait 900 --json"}}'
t "background result" 0 '{"tool_name":"Bash","session_id":"s","tool_input":{"command":"agent-tmux codex result wait-required w1 --fields status --json","run_in_background":true}}'
t "parent stop ok"    0 '{"tool_name":"Bash","session_id":"s","tool_input":{"command":"agent-tmux codex stop w1"}}'
t "result --help"     0 '{"tool_name":"Bash","session_id":"s","tool_input":{"command":"agent-tmux codex result --help"}}'
bash -n "$H" && echo "ok   bash -n"
exit $fail
