#!/usr/bin/env bash
# Offline check for skill-chain-nudge.sh and its table: a station with a row gets its next
# station, a closing station is told to stop, other skills and other tools stay silent, and
# every station in the table is a locked skill.
set -u
R="$(cd "$(dirname "$0")/.." && pwd)"
G="$R/.agents/hooks/skill-chain-nudge.sh"; T="$R/skills/using-decision-tree/references/chain.tsv"
export SKILL_CHAIN_TABLE="$T"
export XDG_DATA_HOME="$(mktemp -d)"   # the hook logs each start; keep fixture rows out of the real stats file
fail=0
run() { jq -cn --arg t "$1" --arg s "$2" '{tool_name:$t,tool_input:{skill:$s},session_id:"t"}' | bash "$G"; }
ctx() { run "$@" | jq -r '.hookSpecificOutput.additionalContext // empty'; }
ctx Skill unknowns-discovery | grep -q 'next station is: prototype' || { echo "FAIL: unknowns-discovery did not name prototype" >&2; fail=1; }
ctx Skill plugin:session-handoff | grep -q 'shared-memory-intake' || { echo "FAIL: a plugin-prefixed name did not match" >&2; fail=1; }
ctx Skill shared-memory-intake | grep -q 'report and stop' || { echo "FAIL: a closing station was not told to stop" >&2; fail=1; }
ctx Skill security-audit | grep -q 'no next station to start' || { echo "FAIL: a station that waits was told to start a next station" >&2; fail=1; }
ctx Skill security-audit | grep -q 'Start it in the same turn' && { echo "FAIL: a waiting station got the start line" >&2; fail=1; }
[ -z "$(run Skill pdf)" ] || { echo "FAIL: a skill with no row printed a line" >&2; fail=1; }
[ -z "$(run Bash unknowns-discovery)" ] || { echo "FAIL: a non-Skill tool printed a line" >&2; fail=1; }
run Skill pdf; [ $? = 0 ] || { echo "FAIL: the hook must always exit 0" >&2; fail=1; }
n=0
while IFS=$'\t' read -r station next art extra; do
  case "$station" in ''|'#'*) continue;; esac
  n=$((n+1))
  [ -n "$next" ] && [ -n "$art" ] && [ -z "${extra:-}" ] || { echo "FAIL: row $n needs exactly 3 columns" >&2; fail=1; }
  jq -e --arg s "$station" '.skills[$s]' "$R/skills-lock.json" >/dev/null 2>&1 || { echo "FAIL: row $n station not in skills-lock.json: $station" >&2; fail=1; }
done < "$T"
[ "$fail" = 0 ] && echo "PASS skill-chain-nudge: next station named, closing station stops, silent otherwise; $n table rows locked"
exit "$fail"
