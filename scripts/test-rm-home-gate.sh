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

# Browser, worktree and cd shapes. Literals are split so this file's own command
# line never trips the gate; ASK = exit 0 with permissionDecision ask.
j() { # $1 = name, $2 = want (deny|ask|warn|pass), $3 = payload, $4 = AGENT_HOOK_ASK_OK
  out="$(printf '%s' "$3" | AGENT_HOOK_ASK_OK="${4:-}" bash "$H" 2>/dev/null)"; ec=$?
  got=pass
  [ "$ec" = 2 ] && got=deny
  [ "$ec" = 0 ] && [ "$(jq -r '.hookSpecificOutput.permissionDecision // empty' <<<"$out" 2>/dev/null)" = ask ] && got=ask
  [ "$ec" = 0 ] && [ -n "$(jq -r '.hookSpecificOutput.additionalContext // empty' <<<"$out" 2>/dev/null)" ] && got=warn
  if [ "$got" = "$2" ]; then printf 'ok   %-28s %s\n' "$1" "$got"
  else printf 'FAIL %-28s want=%s got=%s\n' "$1" "$2" "$got"; fail=1; fi
}
b() { jq -cn --arg c "$1" --arg d "${2:-$PWD}" '{tool_name:"Bash",cwd:$d,tool_input:{command:$c}}'; }
GC='Google Chrome'; MAC='.app/Contents/MacOS'; HL='--head''less'; WA='worktree a''dd'
j "chrome headless (ask CLI)"   ask  "$(b "\"/Applications/$GC$MAC/$GC\" $HL=new --screenshot=x.png file:///tmp/a.html")" 1
j "chrome headless (no ask)"    deny "$(b "\"/Applications/$GC$MAC/$GC\" $HL=new --screenshot=x.png file:///tmp/a.html")"
j "open -a chrome headless"     ask  "$(b "open -a \"$GC\" --args $HL")" 1
j "chrome headed"               pass "$(b "open -a \"$GC\" https://example.com")" 1
j "chrome binary no headless"   pass "$(b "\"/Applications/$GC$MAC/$GC\" --version")" 1
j "arc binary"                  deny "$(b "/Applications/Arc$MAC/Arc --version")" 1
j "open -a Arc"                 deny "$(b "open -a Arc https://example.com")" 1
j "open -a Brave quoted"        deny "$(b "open -a \"Brave Browser\"")" 1
j "playwright chromium"         deny "$(b "~/Library/Caches/ms-playwright/chromium-1228/chrome-mac/Chromium.app/Contents/MacOS/Chromium $HL")" 1
j "tmux worker headless flag"   pass "$(b "agent-tmux codex start w1 /tmp b.md $HL")" 1
j "soffice headless"            pass "$(b "python scripts/office/soffice.py $HL --convert-to pdf a.doc")" 1
j "e2e test runner"             pass "$(b "npm run test:e2e")" 1
j "worktree retro case"         deny "$(b "git $WA -q --detach /tmp/x origin/main")"
j "worktree ask CLI"            ask  "$(b "git $WA -q --detach /tmp/x origin/main")" 1
j "worktree -C quoted"          deny "$(b "git -C \"/repo with space\" $WA /tmp/x")"
j "worktree after sibling"      deny "$(b "git fetch && git $WA /tmp/x")"
j "worktree list"               pass "$(b "git worktree list")"
j "worktree remove"             pass "$(b "git worktree remove /tmp/x")"
j "EnterWorktree ask CLI"       ask  '{"tool_name":"EnterWorktree","tool_input":{}}' 1
j "EnterWorktree no ask"        deny '{"tool_name":"EnterWorktree","tool_input":{}}'
j "Agent isolation"             ask  '{"tool_name":"Agent","tool_input":{"prompt":"x","isolation":"worktree"}}' 1
j "Agent plain"                 pass '{"tool_name":"Agent","tool_input":{"prompt":"x"}}' 1
# cd cases run in a scratch repo: deploy's Layer 0 runs this file in a tarball, not a clone.
R0="$(mktemp -d)"; trap 'rm -rf "$R0" "$N0"' EXIT
git -C "$R0" init -q && mkdir "$R0/scripts"
N0="$(mktemp -d)"
j "cd subdir warns"             warn "$(b "cd scripts && ls" "$R0")"
j "cd quoted space warns"       warn "$(b "cd -- \"/tmp/no such dir\"" "$R0")"
j "cd var warns"                warn "$(b "cd \$X && ls" "$R0")"
j "cd repo root"                pass "$(b "cd $R0 && make" "$R0")"
j "cd root from subdir"         pass "$(b "cd .." "$R0/scripts")"
j "subshell cd"                 pass "$(b "(cd scripts && ls)" "$R0")"
j "cd in echo"                  pass "$(b "echo 'cd x'" "$R0")"
j "cd after sibling"            pass "$(b "echo ok && cd scripts" "$R0")"
j "cd outside a repo"           pass "$(b "cd /" "$N0")"
exit "$fail"
