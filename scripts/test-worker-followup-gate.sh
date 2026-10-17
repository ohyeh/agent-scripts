#!/usr/bin/env bash
# Regression test for .agents/hooks/worker-followup-gate.sh: nudge exactly at
# the 3rd SendMessage to one agent, never block, and the pass-through cases.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOOK="$ROOT/.agents/hooks/worker-followup-gate.sh"
WORK="$(mktemp -d -t worker-followup-gate.XXXXXX)"
trap 'rm -rf "$WORK"' EXIT
export XDG_DATA_HOME="$WORK/data"
pass=0
fail() { echo "FAIL: $1" >&2; exit 1; }
ok() { pass=$((pass + 1)); }

send() { # $1 tool_use id, $2 to
  jq -cn --arg id "$1" --arg to "$2" \
    '{type:"assistant",message:{id:("m"+$id),content:[{type:"tool_use",id:$id,name:"SendMessage",input:{to:$to,message:"go on"}}]}}'
}
run_hook() { # $1 transcript, $2 to, $3 extra jq object (optional)
  local extra="${3:-}"; [ -n "$extra" ] || extra='{}'
  jq -cn --arg t "$1" --arg to "$2" --argjson x "$extra" \
    '{session_id:"s1",transcript_path:$t,tool_name:"SendMessage",tool_use_id:"tcur",tool_input:{to:$to,message:"next"}} + $x' |
    bash "$HOOK"
}
nudged() { grep -q 'worker-followup-gate: this is follow-up 3 to agent' <<<"$1"; }

T="$WORK/t.jsonl"
{ send s1 aA; send s2 aA; } > "$T"
out="$(run_hook "$T" aA)"; nudged "$out" && ok || fail "2 prior to aA: expected nudge"
printf '%s' "$out" | jq -e '.hookSpecificOutput.hookEventName == "PreToolUse"' >/dev/null && ok || fail "nudge is not PreToolUse JSON"

{ send s1 aA; send s2 aB; } > "$T"
out="$(run_hook "$T" aA)"; [ -z "$out" ] && ok || fail "follow-ups to another agent must not count"

{ send s1 aA; send s1 aA; } > "$T"
out="$(run_hook "$T" aA)"; [ -z "$out" ] && ok || fail "a duplicated record must count once"

{ send s1 aA; send s2 aA; send s3 aA; } > "$T"
out="$(run_hook "$T" aA)"; [ -z "$out" ] && ok || fail "nudge fires once per agent, at 3"

{ send s1 aA; send s2 aA; } > "$T"
out="$(run_hook "$T" aA '{"agent_id":"sub1","agent_type":"general-purpose"}')"; [ -z "$out" ] && ok || fail "subagent call must pass"
out="$(run_hook "$T" aA '{"agent_type":"main-agent"}')"; nudged "$out" && ok || fail "--agent main thread (agent_type, no agent_id) must still be checked"

{ send s1 bridge:x; send s2 bridge:x; } > "$T"
out="$(run_hook "$T" bridge:x)"; [ -z "$out" ] && ok || fail "peer-session messages must pass"

{ send s1 aA; send s2 aA; send tcur aA; } > "$T"
out="$(run_hook "$T" aA)"; nudged "$out" && ok || fail "the current call must not count as a prior follow-up"

grep -q '"followup":3' "$XDG_DATA_HOME/agent-hooks/worker-followup-stats.jsonl" && ok || fail "stats log missing follow-up 3"
grep -q '"followup":4' "$XDG_DATA_HOME/agent-hooks/worker-followup-stats.jsonl" && ok || fail "stats log missing follow-up 4"

echo "worker-followup-gate: $pass checks passed"
