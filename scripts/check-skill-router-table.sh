#!/usr/bin/env bash
# Validate .agents/hooks/skill-router-table.tsv: 3 tab-separated columns, every
# regex compiles under grep -E, every skill owner exists in skills-lock.json,
# every recipe owner exists under skills/using-workflows/workflows/.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
T="$ROOT/.agents/hooks/skill-router-table.tsv"
fail=0; n=0
while IFS=$'\t' read -r re kind owner extra; do
  case "$re" in ''|'#'*) continue;; esac
  n=$((n+1))
  [ -z "${extra:-}" ] || { echo "row $n: more than 3 columns"; fail=1; }
  printf 'x' | grep -Eiq -- "$re" 2>/dev/null; rc=$?
  [ $rc -le 1 ] || { echo "row $n: regex does not compile: $re"; fail=1; }
  case "$kind" in
    skill)  jq -e --arg s "$owner" '.skills[$s]' "$ROOT/skills-lock.json" >/dev/null 2>&1 || { echo "row $n: skill not in skills-lock.json: $owner"; fail=1; };;
    recipe) [ -f "$ROOT/skills/using-workflows/workflows/$owner.workflow.js" ] || { echo "row $n: recipe missing: $owner"; fail=1; };;
    *) echo "row $n: kind must be skill|recipe: $kind"; fail=1;;
  esac
done < "$T"
[ $fail -eq 0 ] && echo "skill-router-table OK ($n rows)"
exit $fail
