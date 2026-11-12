#!/usr/bin/env bash
# PostToolUse(Skill) hook: when a skill loads, name its next station from
# the decision tree (using-decision-tree/references/chain.tsv), and log the start for the weekly chain metric.
#
# Why: W46 retro (2026-11-12) — 44 station changes, the agent took 13 itself and only where
# the upstream skill's own text named the next station; 14 skills had no edge. Third-party
# skills cannot carry an exit line, so the edge lives in one table, owned by the decision tree, and arrives at load time.
#
# Contract: a nudge, never a block (exit 0 always; Stop-time gates false-blocked 80%+ in W46).
# Silent when the skill has no row. A skill the owner starts with a typed /name does not
# pass through the Skill tool, so it gets no line.
set -u
IN="$(cat)"
command -v jq >/dev/null 2>&1 || exit 0
[ "$(printf '%s' "$IN" | jq -r '.tool_name // empty')" = Skill ] || exit 0
S="$(printf '%s' "$IN" | jq -r '.tool_input.skill // empty')"; S="${S##*:}"
[ -n "$S" ] || exit 0
TABLE="${SKILL_CHAIN_TABLE:-$HOME/.agents/skills/using-decision-tree/references/chain.tsv}"
[ -r "$TABLE" ] || exit 0
row="$(awk -F'\t' -v s="$S" '$1==s {print $2 "\t" $3; exit}' "$TABLE")"

DATA_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/agent-hooks"; mkdir -p "$DATA_DIR"
jq -cn --arg ts "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" --arg s "$S" --arg next "${row%%$'\t'*}" \
  --arg sid "$(printf '%s' "$IN" | jq -r '.session_id // empty')" \
  '{timestamp:$ts, station:$s, next:$next, session_id:$sid}' >> "$DATA_DIR/skill-chain-stats.jsonl"

[ -n "$row" ] || exit 0
next="${row%%$'\t'*}"; art="${row#*$'\t'}"
case "$next" in none*) wait=1;; *) wait=0;; esac
if [ "$next" = none ]; then
  c="station $S closes its loop with $art. When it is done, report and stop."
elif [ "$wait" = 1 ]; then
  c="station $S has no next station to start: $next. Its output is $art."
else
  c="when station $S ends, the next station is: $next. It takes $art. Start it in the same turn when its condition holds. Stop instead at a kernel hard-stop, a stop condition of $S, or the edge of the authorized scope."
fi
jq -cn --arg c "[skill-chain] (using-decision-tree) $c If it does not apply, ignore this line silently." \
  '{hookSpecificOutput:{hookEventName:"PostToolUse", additionalContext:$c}}'
