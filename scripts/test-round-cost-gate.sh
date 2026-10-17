#!/usr/bin/env bash
# Regression test for .agents/hooks/round-cost-gate.sh: nudge exactly at the
# 3rd single-read round in a row, never block, and the run-breaking cases.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOOK="$ROOT/.agents/hooks/round-cost-gate.sh"
WORK="$(mktemp -d -t round-cost-gate.XXXXXX)"
trap 'rm -rf "$WORK"' EXIT
export XDG_DATA_HOME="$WORK/data"
pass=0
fail() { echo "FAIL: $1" >&2; exit 1; }
ok() { pass=$((pass + 1)); }

# fixture builders: one assistant record per tool_use, then its tool_result
asst() { # $1 msg id, $2 tool_use id, $3 tool name, $4 command
  jq -cn --arg m "$1" --arg id "$2" --arg n "$3" --arg c "$4" \
    '{type:"assistant",message:{id:$m,content:[{type:"tool_use",id:$id,name:$n,input:{command:$c}}]}}'
}
result() { jq -cn --arg id "$1" '{type:"user",message:{content:[{type:"tool_result",tool_use_id:$id,content:"x"}]}}'; }
read_round() { asst "m$1" "t$1" Bash "cat f$1.md"; result "t$1"; }
user_msg() { jq -cn '{type:"user",message:{content:"next question"}}'; }

run_hook() { # $1 transcript, $2 tool name, $3 command, $4 extra jq object (optional)
  local extra="${4:-}"; [ -n "$extra" ] || extra='{}'
  jq -cn --arg t "$1" --arg n "$2" --arg c "$3" --argjson x "$extra" \
    '{session_id:"s1",transcript_path:$t,tool_name:$n,tool_use_id:"tcur",tool_input:{command:$c}} + $x' |
    bash "$HOOK"
}
nudged() { grep -q 'round-cost-gate: this is single-read round 3' <<<"$1"; }

T="$WORK/t.jsonl"
{ read_round 1; read_round 2; } > "$T"
out="$(run_hook "$T" Bash 'cat f3.md')"; nudged "$out" && ok || fail "2 prior single reads: expected nudge"
printf '%s' "$out" | jq -e '.hookSpecificOutput.hookEventName == "PreToolUse"' >/dev/null && ok || fail "nudge is not PreToolUse JSON"

{ read_round 1; } > "$T"
out="$(run_hook "$T" Bash 'cat f2.md')"; [ -z "$out" ] && ok || fail "1 prior single read: expected silence"

{ read_round 1; read_round 2; read_round 3; } > "$T"
out="$(run_hook "$T" Bash 'cat f4.md')"; [ -z "$out" ] && ok || fail "4th read: nudge must fire once per run, at 3"

{ read_round 1; read_round 2; } > "$T"
out="$(run_hook "$T" Bash 'cat a.md && cat b.md')"; [ -z "$out" ] && ok || fail "bundled Bash read must pass silently"
out="$(run_hook "$T" Bash 'cd /repo && cat a.md')"; nudged "$out" && ok || fail "cd prefix must not hide a single read"
out="$(run_hook "$T" Bash 'npm test')"; [ -z "$out" ] && ok || fail "non-read call must pass silently"
out="$(run_hook "$T" Read '' )"; nudged "$out" && ok || fail "Read tool counts as a single read"
out="$(run_hook "$T" Bash 'cat f3.md' '{"agent_type":"explorer"}')"; [ -z "$out" ] && ok || fail "subagent call must pass"

{ read_round 1; user_msg; read_round 2; } > "$T"
out="$(run_hook "$T" Bash 'cat f3.md')"; [ -z "$out" ] && ok || fail "a user message must end the run"

# a batched round (two tool_use in one message) breaks the run
{ read_round 1; asst m2 t2a Bash 'cat a'; asst m2 t2b Bash 'cat b'; result t2a; result t2b; read_round 3; } > "$T"
out="$(run_hook "$T" Bash 'cat f4.md')"; [ -z "$out" ] && ok || fail "batched round must break the run"

# the same tool_use written twice is still one call
{ read_round 1; asst m2 t2 Bash 'cat a'; asst m2 t2 Bash 'cat a'; result t2; } > "$T"
out="$(run_hook "$T" Bash 'cat f3.md')"; nudged "$out" && ok || fail "duplicate record must count as one call"

# the current message, if already in the transcript, is not a prior round
{ read_round 1; read_round 2; asst mcur tcur Bash 'cat f3.md'; } > "$T"
out="$(run_hook "$T" Bash 'cat f3.md')"; nudged "$out" && ok || fail "current message must be excluded"

grep -q '"run":3' "$XDG_DATA_HOME/agent-hooks/round-cost-stats.jsonl" && ok || fail "stats log missing run 3"
grep -q '"nudged":false' "$XDG_DATA_HOME/agent-hooks/round-cost-stats.jsonl" && ok || fail "stats log missing a past-threshold round"

echo "round-cost-gate: $pass checks passed"
