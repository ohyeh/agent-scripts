#!/usr/bin/env bash
# Self-check for .agents/hooks/pr-create-gate.sh (lessons #18): the first PR of a
# session passes, a second is denied until PR_CREATE_GATE=allow, a new session starts
# over, and other gh pr verbs and --help pass. Runs from a FILE: the gate inspects
# tool_input.command, so inline strings would trip it on the tester.
cd "$(dirname "$0")/.." || exit 1
H=.agents/hooks/pr-create-gate.sh
export XDG_STATE_HOME; XDG_STATE_HOME="$(mktemp -d)"
trap 'rm -rf "$XDG_STATE_HOME"' EXIT
fail=0
t() { # $1 label, $2 want exit, $3 session, $4 command
  jq -cn --arg s "$3" --arg c "$4" '{tool_name:"Bash",session_id:$s,tool_input:{command:$c}}' | bash "$H" >/dev/null 2>&1
  got=$?
  if [ "$got" = "$2" ]; then printf 'ok   %-30s exit=%s\n' "$1" "$got"
  else printf 'FAIL %-30s want=%s got=%s\n' "$1" "$2" "$got"; fail=1; fi
}
C='gh pr create --title t --body b'
t "view before any create"       0 s1 'gh pr view 12'
t "first create passes"          0 s1 "$C"
t "edit passes"                  0 s1 'gh pr edit 12 --title x'
t "help passes"                  0 s1 'gh pr create --help'
t "second create denied"         2 s1 "cd /r && $C"
t "approved second create"       0 s1 "PR_CREATE_GATE=allow $C"
t "third create denied again"    2 s1 "$C"
t "new session starts over"      0 s2 "$C"
t "empty command passes"         0 s1 ''
exit $fail
