#!/usr/bin/env bash
# Self-check for .agents/hooks/review-dispatch-gate.sh: each check is tested in both directions.
cd "$(dirname "$0")/.." || exit 1
H="$PWD/.agents/hooks/review-dispatch-gate.sh"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
export TMUX_AGENT_STATE_V3="$T/v3" XDG_DATA_HOME="$T/data" CLAUDE_CONFIG_DIR="$T/cc"
fail=0
S=sess-1
git init -q --bare "$T/remote.git"
git clone -q "$T/remote.git" "$T/pushed" 2>/dev/null
git -C "$T/pushed" -c user.email=t@t -c user.name=t commit -q --allow-empty -m one
git -C "$T/pushed" push -q origin HEAD 2>/dev/null
git clone -q "$T/remote.git" "$T/ahead" 2>/dev/null
git -C "$T/ahead" -c user.email=t@t -c user.name=t commit -q --allow-empty -m two
REV='GOAL: review x
Last line exactly: VERDICT: PASS | VERDICT: BLOCK.'

# worker <name> <owner> <dir> <since> <rounds> <verdict-json-or-summary> [review=1]
worker() {
  local w="$T/v3/$1"; mkdir -p "$w"
  jq -cn --arg o "$2" --arg d "$3" --argjson s "$4" --arg n "$1" '{owner:$o,dir:$d,since:$s,name:$n}' > "$w/worker.json"
  if [ "${7:-1}" = 1 ]; then printf '%s\n' "$REV" > "$w/brief.md"; else echo 'GOAL: implement x' > "$w/brief.md"; fi
  local r="$w/result.json"
  if [ "$5" -gt 1 ]; then mkdir -p "$w/episodes/$5"; r="$w/episodes/$5/result.json"; fi
  printf '%s\n' "$6" > "$r"
}
reset() { rm -rf "$T/v3"; mkdir -p "$T/v3"; }
assign() { jq -cn --arg s "$S" --arg d "$1" --arg b "$2" '{tool_name:"mcp__tmux-agent__assign",session_id:$s,tool_input:{profile:"sol",name:"r",dir:$d,brief:$b}}'; }
tell() { jq -cn --arg s "$S" --arg n "$1" --arg c "${2:-}" '{tool_name:"mcp__tmux-agent__tell",session_id:$s,tool_input:{name:$n,text:"round"}} + (if $c == "" then {} else {cwd:$c} end)'; }
t() {
  printf '%s' "$3" | bash "$H" >/dev/null 2>"$T/err"; got=$?
  if [ "$got" = "$2" ]; then printf 'ok   %-40s exit=%s\n' "$1" "$got"
  else printf 'FAIL %-40s want=%s got=%s\n' "$1" "$2" "$got"; sed 's/^/     /' "$T/err"; fail=1; fi
}
BLOCKV='{"status":"success","verdict":"BLOCK"}'
PASSV='{"status":"success","verdict":"PASS"}'

reset
t "other tool"                         0 '{"tool_name":"Bash","session_id":"s","tool_input":{"command":"ls"}}'
t "non-review assign"                  0 "$(assign "$T/pushed" 'GOAL: implement x')"
worker r0.zzzzz "$S" "$T/pushed" 50 1 "$BLOCKV"
t "builder relaying a BLOCK verdict"   0 "$(assign "$T/pushed" 'GOAL: fix it. The review returned VERDICT: BLOCK; report at /x.')"
reset
t "first review, no previous"          0 "$(assign "$T/pushed" "$REV")"

reset; worker r1.aaaaa "$S" "$T/pushed" 100 1 "$BLOCKV"
t "shopping: prev BLOCK, new reviewer" 2 "$(assign "$T/pushed" "$REV")"
grep -q 'tell r1.aaaaa' "$T/err" && echo "ok   denial names tell <previous reviewer>" || { echo "FAIL denial names tell <previous reviewer>"; fail=1; }
t "shopping: LAYER line"               0 "$(assign "$T/pushed" "LAYER: L3 — L2 round 3 still blocks
$REV")"
t "shopping: NEW SCOPE line"           0 "$(assign "$T/pushed" "NEW SCOPE: unrelated parser
$REV")"
t "shopping: empty LAYER line"         2 "$(assign "$T/pushed" "LAYER:
$REV")"
touch "$T/v3/r1.aaaaa/stopped"
t "shopping: stopped prev still counts" 2 "$(assign "$T/pushed" "$REV")"
t "shopping: other dir"                0 "$(assign "$T/ahead" "$REV")"
t "shopping: dir with trailing slash"  2 "$(assign "$T/pushed/" "$REV")"
reset; worker r1.aaaaa "$S" "$T/pushed" 100 1 '{"status":"exited","summary":"pane gone"}'
t "no verdict: no answer line"         2 "$(assign "$T/pushed" "$REV")"
grep -q 'REDISPATCH:' "$T/err" && echo "ok   no-verdict denial asks for REDISPATCH:" || { echo "FAIL no-verdict denial asks for REDISPATCH:"; fail=1; }
t "no verdict: REDISPATCH line"        0 "$(assign "$T/pushed" "REDISPATCH: r1 pane exited with no report
$REV")"
t "no verdict: PARALLEL line"          0 "$(assign "$T/pushed" "PARALLEL: L1 second seat
$REV")"
reset; worker r1.aaaaa other-session "$T/pushed" 100 1 "$BLOCKV"
t "shopping: other session's reviewer" 0 "$(assign "$T/pushed" "$REV")"
reset; worker r1.aaaaa "$S" "$T/pushed" 100 1 "$BLOCKV" 0
t "shopping: prev is not a reviewer"   0 "$(assign "$T/pushed" "$REV")"
reset; worker r1.aaaaa "$S" "$T/pushed" 100 1 "$BLOCKV"; worker r2.bbbbb "$S" "$T/pushed" 200 1 "$PASSV"
t "latest reviewer decides (PASS)"     0 "$(assign "$T/pushed" "$REV")"

reset; worker r1.aaaaa "$S" "$T/ahead" 100 2 "$PASSV"
t "batch: PASS + unpushed, no BATCH"   2 "$(assign "$T/ahead" "$REV")"
grep -q 'BATCH:' "$T/err" && echo "ok   batch denial asks for BATCH:" || { echo "FAIL batch denial asks for BATCH:"; fail=1; }
t "batch: BATCH line answers"          0 "$(assign "$T/ahead" "BATCH: D1-D3 plus the parser fix; push after
$REV")"
reset; worker r1.aaaaa "$S" "$T/pushed" 100 2 "$PASSV"
t "batch: PASS, nothing unpushed"      0 "$(assign "$T/pushed" "$REV")"
reset; worker r1.aaaaa "$S" "$T/ahead" 100 1 '{"status":"success","summary":"all fixed. VERDICT: PASS"}'
t "batch: PASS read from summary"      2 "$(assign "$T/ahead" "$REV")"

reset; worker r1.aaaaa "$S" "$T/pushed" 100 3 "$BLOCKV"
t "round cap: round 3 BLOCK, tell"     2 "$(tell r1.aaaaa)"
reset; worker r1.aaaaa "$S" "$T/pushed" 100 2 "$BLOCKV"
t "round cap: round 2 BLOCK, tell"     0 "$(tell r1.aaaaa)"
reset; worker r1.aaaaa "$S" "$T/pushed" 100 3 "$PASSV"
t "round cap: round 3 PASS, tell"      0 "$(tell r1.aaaaa)"
# a reviewer reused after a PASS: the cap counts rounds since that PASS (W44: ep5 PASS, ep6 BLOCK)
worker r1.aaaaa "$S" "$T/pushed" 100 6 "$BLOCKV"; mkdir -p "$T/v3/r1.aaaaa/episodes/5"; printf '%s\n' "$PASSV" > "$T/v3/r1.aaaaa/episodes/5/result.json"
t "round cap: counts since the last PASS" 0 "$(tell r1.aaaaa)"
rm -rf "$T/v3/r1.aaaaa/episodes/5"
t "round cap: 6 rounds, no PASS"         2 "$(tell r1.aaaaa)"
reset; worker r1.aaaaa "$S" "$T/pushed" 100 5 "$BLOCKV" 0
t "round cap: not a reviewer"          0 "$(tell r1.aaaaa)"
reset; worker r1.aaaaa other-session "$T/pushed" 100 4 "$BLOCKV"
t "round cap: other session's worker"  0 "$(tell r1.aaaaa)"
t "tell: unknown worker"               0 "$(tell nope.zzzzz)"

# R3: the round cap applies only to a reviewer of the event's cwd
reset; worker r1.aaaaa "$S" "$T/pushed" 100 3 "$BLOCKV"
t "round cap: same cwd"                2 "$(tell r1.aaaaa "$T/pushed/")"
t "round cap: other cwd"               0 "$(tell r1.aaaaa "$T/ahead")"

# R1: an unreadable result never denies
reset; worker r1.aaaaa "$S" "$T/pushed" 100 1 'not json'
t "malformed result: assign allows"    0 "$(assign "$T/pushed" "$REV")"
reset; worker r1.aaaaa "$S" "$T/pushed" 100 3 'not json'
t "malformed result: tell allows"      0 "$(tell r1.aaaaa)"
TRUNC='{"verdict":"BLOCK"}
{'
reset; worker r1.aaaaa "$S" "$T/pushed" 100 1 "$TRUNC"
t "valid prefix + truncated tail: assign" 0 "$(assign "$T/pushed" "$REV")"
reset; worker r1.aaaaa "$S" "$T/pushed" 100 3 "$TRUNC"
t "valid prefix + truncated tail: tell"   0 "$(tell r1.aaaaa)"
reset; worker r1.aaaaa "$S" "$T/pushed" 100 1 "$BLOCKV
$BLOCKV"
t "two JSON values: assign allows"     0 "$(assign "$T/pushed" "$REV")"
grep -q '"result":"error"' "$T/data/agent-hooks/review-dispatch-stats.jsonl" \
  && echo "ok   stats records the unreadable result" || { echo "FAIL stats records the unreadable result"; fail=1; }

# R2: a later round without a result is still running; the root (round 1) result is stale
reset; worker r1.aaaaa "$S" "$T/ahead" 100 1 "$PASSV"; mkdir -p "$T/v3/r1.aaaaa/episodes/3"
t "pending round 3, root PASS: no verdict" 2 "$(assign "$T/ahead" "$REV")"
grep -q 'reviewer without a verdict' "$T/err" && echo "ok   pending round reads as no verdict (PASS root)" || { echo "FAIL pending round reads as no verdict (PASS root)"; fail=1; }
reset; worker r1.aaaaa "$S" "$T/pushed" 100 1 "$BLOCKV"; mkdir -p "$T/v3/r1.aaaaa/episodes/3"
t "pending round 3, root BLOCK: no verdict" 2 "$(assign "$T/pushed" "$REV")"
grep -q 'reviewer without a verdict' "$T/err" && echo "ok   pending round reads as no verdict (BLOCK root)" || { echo "FAIL pending round reads as no verdict (BLOCK root)"; fail=1; }
t "pending round 3: tell hits the cap"  2 "$(tell r1.aaaaa)"

# W43-22: Agent tool reviewers, state from the session transcript
TR="$T/tr.jsonl"
agent() { jq -cn --arg s "$S" --arg t "$TR" --arg c "${2:-/w}" --arg p "$1" '{tool_name:"Agent",session_id:$s,transcript_path:$t,cwd:$c,tool_input:{description:"r",prompt:$p}}'; }
use() { jq -cn --arg id "$1" --arg c "${3:-/w}" --arg p "${2:-$REV}" '{type:"assistant",cwd:$c,message:{content:[{type:"tool_use",id:$id,name:"Agent",input:{prompt:$p}}]}}'; }
res() { jq -cn --arg id "$1" --arg x "$2" '{type:"user",message:{content:[{type:"tool_result",tool_use_id:$id,content:$x}]}}'; }
note() { jq -cn --arg x "<task-notification><tool-use-id>$1</tool-use-id><result>$2</result></task-notification>" '{type:"user",message:{content:$x}}'; }
: > "$TR"
t "agent: first review"                 0 "$(agent "$REV")"
{ use toolu_A; res toolu_A 'findings… VERDICT: BLOCK'; } > "$TR"
t "agent: BLOCK then new reviewer"      2 "$(agent "$REV")"
grep -q 'SendMessage' "$T/err" && echo "ok   agent shopping names SendMessage" || { echo "FAIL agent shopping names SendMessage"; fail=1; }
t "agent: BLOCK + LAYER line"           0 "$(agent "$REV
LAYER: L3 — sol and fable disagree")"
t "agent: BLOCK + NEW SCOPE line"       0 "$(agent "$REV
NEW SCOPE: the docs, not the hook")"
t "agent: BLOCK, other cwd"             0 "$(agent "$REV" /other)"
t "agent: BLOCK, builder brief"         0 "$(agent 'GOAL: implement the fix')"
{ use toolu_B; res toolu_B 'Async agent launched successfully.'; note toolu_B 'all good VERDICT: PASS'; } > "$TR"
t "agent: background PASS (notification)" 0 "$(agent "$REV")"
{ use toolu_C; res toolu_C 'Async agent launched successfully.'; } > "$TR"
t "agent: no verdict yet"               2 "$(agent "$REV")"
t "agent: no verdict + REDISPATCH"      0 "$(agent "$REV
REDISPATCH: it hit the turn limit")"
{ use toolu_D; res toolu_D 'VERDICT: BLOCK'; use toolu_E; res toolu_E 'VERDICT: PASS'; } > "$TR"
t "agent: latest reviewer PASS"         0 "$(agent "$REV")"

# W44-13: one previous reviewer across both sources (the newer one)
CT="$T/cc/projects/p/$S.jsonl"; mkdir -p "${CT%/*}"
reset; worker r9.xxxxx "$S" /w 1792670000000 1 "$BLOCKV"; : > "$TR"
t "cross: tmux BLOCK, then Agent reviewer" 2 "$(agent "$REV")"
grep -q 'tell r9.xxxxx' "$T/err" && echo "ok   cross denial names tell <tmux reviewer>" || { echo "FAIL cross denial names tell <tmux reviewer>"; fail=1; }
reset; { use toolu_X | jq -c '.timestamp="2026-10-22T16:00:00.123Z"'; res toolu_X 'VERDICT: BLOCK'; } > "$CT"
t "cross: Agent BLOCK, then tmux assign" 2 "$(assign /w "$REV")"
t "cross: Agent BLOCK + LAYER, tmux assign" 0 "$(assign /w "LAYER: L3 — sol and fable disagree
$REV")"
worker r9.yyyyy "$S" /w 1792684800999 1 "$PASSV"
t "cross: newer tmux PASS wins over Agent BLOCK" 0 "$(assign /w "$REV")"
reset; { use toolu_Y | jq -c '.timestamp="2026-10-22T16:00:00.900Z"'; res toolu_Y 'VERDICT: BLOCK'; } > "$CT"
worker r9.zzzzz "$S" /w 1792684800500 1 "$PASSV"
t "cross: same second, Agent BLOCK 400 ms later" 2 "$(assign /w "$REV")"
rm -f "$CT"

n="$(jq -r 'select(.result=="shopping")' "$T/data/agent-hooks/review-dispatch-stats.jsonl" | grep -c timestamp)"
[ "$n" -ge 1 ] && echo "ok   stats records shopping ($n)" || { echo "FAIL stats records shopping"; fail=1; }
jq -se '[.[] | select(.result=="allow-answered") | .answer | test("D1-D3")] | any' "$T/data/agent-hooks/review-dispatch-stats.jsonl" >/dev/null \
  && echo "ok   stats keeps the BATCH answer" || { echo "FAIL stats keeps the BATCH answer"; fail=1; }
bash -n "$H" && echo "ok   bash -n"
exit $fail
