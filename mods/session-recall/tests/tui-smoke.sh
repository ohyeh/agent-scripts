#!/usr/bin/env bash
# The real TUI in a detached tmux pane: it draws a snapshot, marks two lines and writes the request the mod reads;
# the smoke answers as the mod would, one file per request. On the assets tab `r` asks for row 2 by its ref; a
# refusal keeps the TUI usable; two TUIs send without replacing each other's request. Then `follow` keeps a
# selection on its answer when a new one comes in. Needs node and tmux. Prints VERDICT: PASS or FAIL.
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
work="$(mktemp -d -t sa-tui.XXXXXX)"
sock="sa-tui-$$"
trap 'tmux -L "$sock" kill-server 2>/dev/null || true; chmod -R u+w "$work" 2>/dev/null; rm -rf "$work"' EXIT
d="$work/.local/state/session-recall"
mkdir -p "$d"
cat > "$d/sid-1.json" <<'J'
{"v":1,"version":"9.9.9","sid":"sid-1","project":"demo","assets":[{"kind":"url","ref":"http://localhost:5173/","label":"Start dev","where":"localhost:5173","at":0},{"kind":"image","ref":"/tmp/shot.png","label":"shot.png","where":"/tmp","at":0}],"answers":[{"id":"x1","at":0,"items":["first line","第二行 寫死","third"]}]}
J
# open, pbcopy and qlmanage are stand-ins: the smoke never opens a browser or touches the clipboard.
mkdir -p "$work/bin"
for c in open pbcopy qlmanage; do printf '#!/bin/sh\necho %s "$@" >> "%s/ran"\ncat >/dev/null 2>&1 || true\n' "$c" "$work" > "$work/bin/$c"; chmod +x "$work/bin/$c"; done
fail() { echo "FAIL: $1"; tmux -L "$sock" capture-pane -p -t t 2>/dev/null | sed 's/^/  | /'; echo "VERDICT: FAIL"; exit 1; }
tmux -L "$sock" new-session -d -s t -x 100 -y 20 "HOME='$work' PATH='$work/bin':\$PATH node '$here/bin/tui.mjs' --sid sid-1"
wait_for() { for _ in $(seq 50); do tmux -L "$sock" capture-pane -p -t t | grep -q -- "$1" && return 0; sleep 0.1; done; fail "no '$1' on screen"; }
wait_for 'answer 1/1 · 3 lines'
wait_for '第二行 寫死'
# The smoke is the mod: each request is a file of its own in sid-1.ask/, answered under its name in sid-1.done/.
asks() { ls "$d/sid-1.ask" 2>/dev/null | grep -E '^[0-9]{13}-[0-9]+-[0-9]+\.json$' || true; }
field() { node -e 'console.log(JSON.stringify(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"))[process.argv[2]]))' "$d/sid-1.ask/$1" "$2"; }
answer() { mkdir -p "$d/sid-1.done"; echo "$2" > "$d/sid-1.done/$1"; }
newest() { for _ in $(seq 50); do n="$(asks | sort | tail -1)"; [ -n "$n" ] && [ "$n" != "${1:-}" ] && { echo "$n"; return; }; sleep 0.1; done; fail 'no new request'; }
tmux -L "$sock" send-keys -t t Space Down Space Enter
n1="$(newest)"
[ "$(field "$n1" quote)" = '["first line","第二行 寫死"]' ] || fail "quote request was $(field "$n1" quote)"
wait_for 'sending'
tmux -L "$sock" capture-pane -p -t t | grep -q '\[x\]' || fail 'marks went before the mod answered'
tmux -L "$sock" send-keys -t t Down Space
sleep 0.3
answer "$n1" '{"ok":true,"text":"2 quote(s) in the prompt"}'
wait_for '2 quote(s) in the prompt'
[ "$(tmux -L "$sock" capture-pane -p -t t | grep -c '\[x\]')" = 1 ] || fail 'ok cleared more or less than the lines it sent'
tmux -L "$sock" capture-pane -p -t t | grep -q '\[x\] third' || fail 'the line marked while waiting was cleared'
sleep 0.4
[ -e "$d/sid-1.ask/$n1" ] || [ -e "$d/sid-1.done/$n1" ] && fail 'an answered request and its answer were not removed'
tmux -L "$sock" send-keys -t t Escape Tab
wait_for '#a1'
tmux -L "$sock" send-keys -t t Down r
n2="$(newest "$n1")"
[ "$(field "$n2" ref)" = '"/tmp/shot.png"' ] || fail "ref request was $(field "$n2" ref)"
answer "$n2" '{"ok":false,"text":"that row is gone from the list"}'
wait_for 'not done: that row is gone'
# Marked taken and never answered (the session stopped between): after 5 s the TUI says to check the prompt.
tmux -L "$sock" send-keys -t t Tab
sleep 0.2
tmux -L "$sock" send-keys -t t Enter
n3="$(newest "$n2")"
answer "$n3" '{"taking":true}'
for _ in $(seq 80); do tmux -L "$sock" capture-pane -p -t t | grep -q 'took it but did not say' && break; sleep 0.1; done
tmux -L "$sock" capture-pane -p -t t | grep -q 'took it but did not say' || fail 'a taken, unanswered request was not reported'
# A request that cannot be removed keeps its answer: the answer is what keeps it from being done again.
answer "$n3" '{"ok":true,"text":"late ok"}'
tmux -L "$sock" send-keys -t t Enter
n4="$(newest "$n3")"
chmod a-w "$d/sid-1.ask"
answer "$n4" '{"ok":true,"text":"kept answer"}'
wait_for 'kept answer'
sleep 0.4
chmod u+w "$d/sid-1.ask"
[ -e "$d/sid-1.done/$n4" ] || fail 'the answer went while its request stayed'
rm -f "$d/sid-1.ask/"* "$d/sid-1.done/"*
# A request the TUI cannot write is said, and the TUI goes on.
chmod a-w "$d/sid-1.ask"
tmux -L "$sock" send-keys -t t Enter
wait_for 'not sent: EACCES'
chmod u+w "$d/sid-1.ask"
# Two TUIs on one session both send: each request is its own file, neither replaces the other.
tmux -L "$sock" new-window -d -t t -n v "HOME='$work' PATH='$work/bin':\$PATH node '$here/bin/tui.mjs' --sid sid-1"
for _ in $(seq 50); do tmux -L "$sock" capture-pane -p -t t:v | grep -q 'first line' && break; sleep 0.1; done
tmux -L "$sock" send-keys -t t:v Enter
tmux -L "$sock" send-keys -t t Enter
for _ in $(seq 50); do [ "$(asks | wc -l | tr -d ' ')" = 2 ] && break; sleep 0.1; done
[ "$(asks | wc -l | tr -d ' ')" = 2 ] || fail "two TUIs left $(asks | wc -l) requests, not 2"
tmux -L "$sock" send-keys -t t:v q
tmux -L "$sock" send-keys -t t q
sleep 0.3
tmux -L "$sock" has-session -t t 2>/dev/null && fail 'q did not quit'
node --input-type=module -e "
import { follow } from '$here/bin/tui.mjs'
const A = id => ({ id, items: ['l'] })
const ok = (c, m) => { if (!c) { console.log('FAIL: ' + m); process.exit(1) } }
const prev = { answers: [A('n'), A('o'), A('t')] }, next = { answers: [A('m'), A('n'), A('o'), A('t')] }
ok(follow(prev, next, { answerId: 't', answer: 2, marks: new Set([0]) }).answer === 3, 'marks on an older answer follow it, not its old place')
ok(follow(prev, next, { answerId: 'n', answer: 0, marks: new Set() }).answerId === 'm', 'unmarked on the newest follows the newest')
ok(follow(prev, next, { answerId: 'n', answer: 0, marks: new Set([1]) }).answer === 1, 'marked on the newest stays on it')
ok(follow(prev, { answers: [A('m')] }, { answerId: 't', answer: 2, marks: new Set([0]) }).marks.size === 0, 'a dropped answer clears its marks')
ok(!('cur' in follow(prev, next, { tab: 'assets', answerId: 'n', answer: 0, cur: 3, marks: new Set() })), 'a new answer leaves the assets cursor')
import { pick } from '$here/bin/tui.mjs'
import { mkdirSync, writeFileSync, utimesSync } from 'node:fs'
const dd = '$work/pick'; mkdirSync(dd)
writeFileSync(dd + '/s.json', '{}'); utimesSync(dd + '/s.json', 1, 1)
for (const f of ['.s.json.tmp', 's.json.bak']) writeFileSync(dd + '/' + f, '1')
mkdirSync(dd + '/s.ask'); mkdirSync(dd + '/s.done')
ok(pick(dd).endsWith('/s.json'), 'no --sid picks the snapshot, not a request folder or another file')

" || { echo "VERDICT: FAIL"; exit 1; }
# bin/transcript.mjs: the whole file, main loop only, cut to the lines the replay reads; a prompt's link lines (not a meta line).
mkdir -p "$work/cfg/projects/-w"
cat > "$work/cfg/projects/-w/sid-9.jsonl" <<'J'
{"type":"user","message":{"content":"deploy it\nthe form: https://pasted.dev/f"}}
{"type":"user","isMeta":true,"message":{"content":"<caveat> https://meta.dev"}}
{"type":"assistant","message":{"content":[{"type":"text","text":"Plan below.\nReport: https://x.dev/r1"},{"type":"tool_use","id":"t1","name":"Write","input":{"file_path":"/w/a.md","content":"BIG BODY"}}]}}
{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"t1","content":"File created\nsee https://x.dev/w"}]}}
{"type":"assistant","message":{"content":[{"type":"text","text":"Done."}]}}
{"type":"assistant","isSidechain":true,"message":{"content":[{"type":"text","text":"sub https://sub.dev"}]}}
not json
J
got="$(CLAUDE_CONFIG_DIR="$work/cfg" node "$here/bin/transcript.mjs" sid-9)"
want='[{"role":"user","text":"the form: https://pasted.dev/f","toolUses":[]},{"role":"assistant","text":"Report: https://x.dev/r1","toolUses":[{"tool":"Write","input":{"file_path":"/w/a.md"},"text":"see https://x.dev/w"}]},{"role":"assistant","text":"","toolUses":[]}]'
[ "$got" = "$want" ] || { echo "FAIL: transcript.mjs printed $got"; echo "VERDICT: FAIL"; exit 1; }
CLAUDE_CONFIG_DIR="$work/cfg" node "$here/bin/transcript.mjs" sid-0 >/dev/null 2>&1 && { echo "FAIL: a missing transcript exited 0"; echo "VERDICT: FAIL"; exit 1; }
echo "VERDICT: PASS"
