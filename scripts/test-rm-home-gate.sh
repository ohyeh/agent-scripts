#!/usr/bin/env bash
# Self-check for .agents/hooks/rm-home-gate.sh.
# Runs from a FILE on purpose: the gate inspects tool_input.command, so inline
# test strings would trip the gate on the tester. No case here runs rm.
cd "$(dirname "$0")/.." || exit 1
H=.agents/hooks/rm-home-gate.sh
fail=0
t() {
  jq -cn --arg c "$3" '{tool_name:"Bash",session_id:"s",tool_input:{command:$c}}' | bash "$H" >/dev/null 2>&1
  got=$?
  if [ "$got" = "$2" ]; then printf 'ok   %-28s exit=%s\n' "$1" "$got"
  else printf 'FAIL %-28s want=%s got=%s\n' "$1" "$2" "$got"; fail=1; fi
}
R='rm'
t "tilde"                 2 "$R -rf ~"
t "tilde slash"           2 "$R -rf ~/"
t "tilde glob"            2 "$R -fr ~/*"
t "HOME var"              2 "$R -r \"\$HOME\""
t "HOME braces slash"     2 "$R -Rf \${HOME}/"
t "HOME expanded"         2 "$R -rf $HOME"
t "root"                  2 "sudo $R -rf --no-preserve-root /"
t "root glob"             2 "/bin/$R -rf /*"
t "split flags"           2 "$R -r -f ~"
t "long flag"             2 "$R --recursive ~"
t "after sibling"         2 "cd /tmp && $R -rf ~"
t "fixture literal"       2 "start-ssh --on-exit '$R -rf ~' --on-exit-allow x"
t "bash -c"               2 "bash -c \"$R -rf ~\""
t "home subdir"           0 "$R -rf ~/tmp/build"
t "HOME subdir"           0 "$R -rf \"\$HOME/.cache/x\""
t "not recursive"         0 "$R -f ~/.zshrc"
t "tmp dir"               0 "$R -rf /tmp/tas-solo.abc"
t "relative dir"          0 "$R -rf node_modules"
t "unrelated"             0 "git status"
t "grep bracket pattern"  0 "rg -n '$R -rf [~]' scripts/"
t "no command field"      0 ""
exit "$fail"
