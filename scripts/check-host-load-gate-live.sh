#!/usr/bin/env bash
# Live check of host-load-gate.sh worker cap against the REAL hc on this host (no fake hc).
# Needs: run inside an hc terminal (HC_TERMINAL_ID), hc core up.
# Usage: scripts/check-host-load-gate-live.sh [gate-path]   (default: this repo's gate)
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GATE="${1:-$ROOT/.agents/hooks/host-load-gate.sh}"
[ -n "${HC_TERMINAL_ID:-}" ] && hc ls --json >/dev/null 2>&1 || { echo "UNVERIFIED [hlg-live] no hc terminal or core" >&2; exit 3; }
# load factor high: this checks the worker cap, not host load
run() { jq -nc --arg c "$1" '{hook_event_name:"PreToolUse",tool_name:"Bash",tool_input:{command:$c},session_id:"live",cwd:"/tmp"}' \
  | TMUX_WORKER_MAX="$2" AGENT_HOOKS_LOAD_FACTOR=1000 bash "$GATE" >/dev/null 2>"$ERR"; }
ERR="$(mktemp)"; fail=0; ids=()
cleanup() { for t in "${ids[@]}"; do hc kill "$t" >/dev/null 2>&1; hc rm "$t" >/dev/null 2>&1; done; rm -f "$ERR"; }
trap cleanup EXIT
check() { # $1 want(deny|pass) $2 cap $3 command
  local rc=0; run "$3" "$2" || rc=$?
  local got=pass; [ "$rc" = 2 ] && got=deny
  if [ "$got" = "$1" ]; then echo "ok   $1 cap=$2 | $3"; else echo "FAIL want=$1 got=rc$rc cap=$2 | $3 | $(head -1 "$ERR")"; fail=1; fi
}
# 1) parsing at cap 0, real hc ls behind it (sol round 2 A-01 cases first)
while IFS='|' read -r want cmd; do check "$want" 0 "$(printf '%b' "$cmd")"; done <<'EOF'
deny|hc run -- codex -- --help
deny|env -u SOME_KEY hc run codex
deny|agent-tmux codex start worker / -- --dry-run
deny|hc run "codex"
deny|hc run codex
deny|echo hi; hc run codex
deny|x=$(hc run codex)
pass|printf '%s' 'hc run codex'
pass|hc run echo codex
pass|hc ls
pass|hc run --on otherhost codex
pass|agent-tmux codex start --dry-run worker /
pass|agent-tmux codex start-ssh host worker /
pass|cat <<'X'\nhc run codex\nX
pass|# hc run codex
EOF
# 2) real count: two real hc children of this terminal, labeled like a mod assign; an unlabeled env child does not count
for i in 1 2; do
  t="$(hc run --bg --json --name "hlg-live-$i" --label tmux-agent=assign --parent "$HC_TERMINAL_ID" -- /usr/bin/env sleep 120 | jq -r '.address // .id // empty')"
  [ -n "$t" ] && ids+=("$t")
done
t="$(hc run --bg --json --name hlg-live-plain --parent "$HC_TERMINAL_ID" -- /usr/bin/env sleep 120 | jq -r '.address // .id // empty')"
[ -n "$t" ] && ids+=("$t")
[ "${#ids[@]}" = 3 ] || { echo "FAIL could not start 3 real hc children (got ${#ids[@]})"; exit 1; }
sleep 2
check deny 2 'hc run codex'          # 2 labeled live -> at cap 2
check pass 3 'hc run codex'          # unlabeled env child not counted -> under cap 3
check deny 2 'agent-tmux codex start w /tmp'
cleanup; ids=(); trap - EXIT
sleep 1
check pass 1 'hc run codex'          # children gone -> under cap 1
[ "$fail" = 0 ] && echo "PASS [hlg-live] real hc: 15 parse cases + real count (2 labeled counted, unlabeled env not, cleared after kill)" || exit 1
