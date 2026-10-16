#!/usr/bin/env bash
# Self-check for .agents/hooks/workflow-agent-cap.sh (W43-1), synthetic payloads only.
cd "$(dirname "$0")/.." || exit 1
H="$PWD/.agents/hooks/workflow-agent-cap.sh"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
export XDG_STATE_HOME="$T/state" XDG_DATA_HOME="$T/data"
fail=0; ok() { echo "ok   $1"; }; bad() { echo "FAIL $1"; fail=1; }
wf() { jq -cn --arg s "$1" --arg n "$2" '{hook_event_name:"PreToolUse",tool_name:"Workflow",session_id:$s,tool_input:{name:$n}}' | bash "$H"; }
start() { jq -cn --arg s "$1" --arg a "$2" --arg t "${3:-workflow-subagent}" '{hook_event_name:"SubagentStart",session_id:$s,agent_id:$a,agent_type:$t}' | bash "$H" 2>"$T/err"; }
# run <session> <n agents> -> "<passed> <capped>"
run() { local p=0 c=0 i; for i in $(seq "$2"); do start "$1" "a$i"; case $? in 0) p=$((p+1));; 2) c=$((c+1));; esac; done; echo "$p $c"; }

wf s1 design-vs-code-audit
[ "$(run s1 46)" = "25 21" ] && ok "46-agent run (cdec4ed2 audit): 25 pass, 21 capped" || bad "46-agent run: $(run s1 0)"
grep -q 'CAPPED: W43-1 design-vs-code-audit agent 46/25' "$T/err" && ok "capped message names the run and the count" || bad "capped message: $(cat "$T/err")"
wf s1 spec-implement-dual-review-verify
[ "$(run s1 22)" = "22 0" ] && ok "next run starts a new count: 22 pass" || bad "next run did not reset"
wf s2 spec-implement-dual-review-verify
[ "$(run s2 25)" = "25 0" ] && ok "exactly 25 pass" || bad "25-agent run capped"
start s2 a1; [ $? = 0 ] && ok "restart under the same id is not a new agent" || bad "restart counted as agent 26"
start s2 a26; [ $? = 2 ] && ok "a 26th distinct agent is capped" || bad "26th agent passed"
start s3 x1; [ $? = 0 ] && ok "no run on record: never deny" || bad "no run on record denied"
wf s4 w; for i in $(seq 30); do start s4 "g$i" general-purpose; done; [ $? = 0 ] && ok "non-workflow subagents not counted" || bad "general-purpose counted"
[ ! -d "$XDG_STATE_HOME/agent-hooks/s4/workflow-runs" ] || [ "$(find "$XDG_STATE_HOME/agent-hooks/s4/workflow-runs" -type f | wc -l | tr -d ' ')" = 0 ] && ok "non-workflow subagents leave no marker" || bad "non-workflow marker written"
jq -cn '{hook_event_name:"PreToolUse",tool_name:"Bash",session_id:"s5",tool_input:{}}' | bash "$H"; [ $? = 0 ] && [ ! -e "$XDG_STATE_HOME/agent-hooks/s5/workflow-run" ] && ok "other tools start no run" || bad "Bash started a run"
printf '{"hook_event_name":"SubagentStart","agent_type":"workflow-subagent"}' | bash "$H"; [ $? = 0 ] && ok "no session_id allowed" || bad "no session_id denied"
S="$XDG_DATA_HOME/agent-hooks/workflow-agent-cap-stats.jsonl"
[ "$(jq -r 'select(.result=="capped")' "$S" | grep -c timestamp)" = 22 ] && ok "stats: 22 capped rows" || bad "stats capped rows: $(jq -r 'select(.result=="capped")' "$S" | grep -c timestamp)"
[ "$(jq -s 'map(select(.workflow=="design-vs-code-audit") | .agents) | max' "$S")" = 46 ] && ok "stats keep the run maximum (46)" || bad "stats run maximum"
bash -n "$H" && ok "bash -n"
[ "$fail" = 0 ] && echo "PASS workflow-agent-cap" || { echo "FAIL workflow-agent-cap"; exit 1; }
