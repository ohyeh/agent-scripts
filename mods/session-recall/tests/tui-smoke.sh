#!/usr/bin/env bash
# The real TUI in a detached tmux pane: it draws a snapshot's assets, `r` asks for row 2 by its ref and writes the
# request the mod reads; the smoke answers as the mod would, one file per request. A refusal keeps the TUI usable;
# two TUIs send without replacing each other's request; enter opens a row, c copies it. Needs node and tmux.
# Prints VERDICT: PASS or FAIL.
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
work="$(mktemp -d -t sa-tui.XXXXXX)"
sock="$work/t.sock"  # inside $work: the EXIT trap removes it with the tree
trap 'tmux -S "$sock" kill-server 2>/dev/null || true; chmod -R u+w "$work" 2>/dev/null; rm -rf "$work"' EXIT
d="$work/.local/state/session-recall"
mkdir -p "$d"
cat > "$d/sid-1.json" <<'J'
{"v":1,"version":"9.9.9","sid":"sid-1","project":"demo","assets":[{"kind":"url","ref":"http://localhost:5173/","label":"Start dev","where":"localhost:5173","at":0},{"kind":"image","ref":"/tmp/shot.png","label":"shot.png","where":"/tmp","at":0}]}
J
# open, pbcopy and qlmanage are stand-ins: the smoke never opens a browser or touches the clipboard.
mkdir -p "$work/bin"
for c in open pbcopy qlmanage; do printf '#!/bin/sh\necho %s "$@" >> "%s/ran"\ncat >/dev/null 2>&1 || true\n' "$c" "$work" > "$work/bin/$c"; chmod +x "$work/bin/$c"; done
fail() { echo "FAIL: $1"; tmux -S "$sock" capture-pane -p -t t 2>/dev/null | sed 's/^/  | /'; echo "VERDICT: FAIL"; exit 1; }
tmux -S "$sock" new-session -d -s t -x 100 -y 20 "HOME='$work' PATH='$work/bin':\$PATH node '$here/bin/tui.mjs' --sid sid-1"
wait_for() { for _ in $(seq 50); do tmux -S "$sock" capture-pane -p -t t | grep -q -- "$1" && return 0; sleep 0.1; done; fail "no '$1' on screen"; }
wait_for '2 assets'
wait_for '#a2'
# The smoke is the mod: each request is a file of its own in sid-1.ask/, answered under its name in sid-1.done/.
asks() { ls "$d/sid-1.ask" 2>/dev/null | grep -E '^[0-9]{13}-[0-9]+-[0-9]+\.json$' || true; }
field() { node -e 'console.log(JSON.stringify(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"))[process.argv[2]]))' "$d/sid-1.ask/$1" "$2"; }
answer() { mkdir -p "$d/sid-1.done"; echo "$2" > "$d/sid-1.done/$1"; }
newest() { for _ in $(seq 50); do n="$(asks | sort | tail -1)"; [ -n "$n" ] && [ "$n" != "${1:-}" ] && { echo "$n"; return; }; sleep 0.1; done; fail 'no new request'; }
tmux -S "$sock" capture-pane -p -t t | grep -qE 'answer|quote' && fail 'the TUI still shows answers to quote'
tmux -S "$sock" send-keys -t t Down r
n1="$(newest)"
[ "$(field "$n1" ref)" = '"/tmp/shot.png"' ] || fail "ref request was $(field "$n1" ref)"
answer "$n1" '{"ok":true,"text":"#a2 is in the prompt"}'
wait_for '#a2 is in the prompt'
sleep 0.4
[ -e "$d/sid-1.ask/$n1" ] || [ -e "$d/sid-1.done/$n1" ] && fail 'an answered request and its answer were not removed'
tmux -S "$sock" send-keys -t t r
n2="$(newest "$n1")"
answer "$n2" '{"ok":false,"text":"that row is gone from the list"}'
wait_for 'not done: that row is gone'
# Marked taken and never answered (the session stopped between): after 5 s the TUI says to check the prompt.
tmux -S "$sock" send-keys -t t r
n3="$(newest "$n2")"
answer "$n3" '{"taking":true}'
for _ in $(seq 80); do tmux -S "$sock" capture-pane -p -t t | grep -q 'took it but did not say' && break; sleep 0.1; done
tmux -S "$sock" capture-pane -p -t t | grep -q 'took it but did not say' || fail 'a taken, unanswered request was not reported'
# A request that cannot be removed keeps its answer: the answer is what keeps it from being done again.
answer "$n3" '{"ok":true,"text":"late ok"}'
tmux -S "$sock" send-keys -t t r
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
tmux -S "$sock" send-keys -t t r
wait_for 'not sent: EACCES'
chmod u+w "$d/sid-1.ask"
# enter opens the row, c copies its ref: no request either way.
tmux -S "$sock" send-keys -t t Enter
wait_for 'opened /tmp/shot.png'
tmux -S "$sock" send-keys -t t c
wait_for 'copied /tmp/shot.png'
grep -q 'open /tmp/shot.png' "$work/ran" || fail 'enter did not run open'
[ "$(asks | wc -l | tr -d ' ')" = 0 ] || fail 'enter or c wrote a request'
# Two TUIs on one session both send: each request is its own file, neither replaces the other.
tmux -S "$sock" new-window -d -t t -n v "HOME='$work' PATH='$work/bin':\$PATH node '$here/bin/tui.mjs' --sid sid-1"
for _ in $(seq 50); do tmux -S "$sock" capture-pane -p -t t:v | grep -q '#a1' && break; sleep 0.1; done
tmux -S "$sock" send-keys -t t:v r
tmux -S "$sock" send-keys -t t r
for _ in $(seq 50); do [ "$(asks | wc -l | tr -d ' ')" = 2 ] && break; sleep 0.1; done
[ "$(asks | wc -l | tr -d ' ')" = 2 ] || fail "two TUIs left $(asks | wc -l) requests, not 2"
tmux -S "$sock" send-keys -t t:v q
tmux -S "$sock" send-keys -t t q
sleep 0.3
tmux -S "$sock" has-session -t t 2>/dev/null && fail 'q did not quit'
node --input-type=module -e "
const ok = (c, m) => { if (!c) { console.log('FAIL: ' + m); process.exit(1) } }
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
