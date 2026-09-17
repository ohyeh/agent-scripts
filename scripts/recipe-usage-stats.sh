#!/usr/bin/env bash
# Minimal per-recipe usage tracker (A3): counts a recipe's mentions under a
# .workflow run-dir tree for the current ISO week and maintains a
# consecutive_zero_weeks counter in a JSON stats file — the signal
# design-consensus's MOVED.md attic-tag cites (0 direct uses). Idempotent
# within a week: re-running the same week is a no-op.
#
# Usage: scripts/recipe-usage-stats.sh <recipe-name> [workflow-dir] [stats-file]
#   workflow-dir default: .workflow
#   stats-file   default: evals/recipe-usage-stats.json
set -euo pipefail

recipe="${1:?usage: recipe-usage-stats.sh <recipe-name> [workflow-dir] [stats-file]}"
workflow_dir="${2:-.workflow}"
stats_file="${3:-evals/recipe-usage-stats.json}"

command -v jq >/dev/null 2>&1 || { echo "FAIL [recipe-usage-stats] jq required" >&2; exit 1; }

week="$(date -u '+%G-W%V')"
uses=0
if [ -d "$workflow_dir" ]; then
  uses="$( (grep -rl -F -- "$recipe" "$workflow_dir" 2>/dev/null || true) | wc -l | tr -d ' ')"
fi

[ -f "$stats_file" ] || echo '{}' > "$stats_file"

prior_week="$(jq -r --arg r "$recipe" '.[$r].last_week // empty' "$stats_file")"
if [ "$prior_week" = "$week" ]; then
  jq --arg r "$recipe" '.[$r]' "$stats_file"
  exit 0
fi

prior_zero="$(jq -r --arg r "$recipe" '.[$r].consecutive_zero_weeks // 0' "$stats_file")"
if [ "$uses" -eq 0 ]; then
  zero_weeks=$((prior_zero + 1))
else
  zero_weeks=0
fi

tmp="$(mktemp)"
jq --arg r "$recipe" --arg week "$week" --argjson uses "$uses" --argjson zero "$zero_weeks" \
  '.[$r] = {last_week: $week, uses: $uses, consecutive_zero_weeks: $zero}' \
  "$stats_file" > "$tmp" && mv "$tmp" "$stats_file"

jq --arg r "$recipe" '.[$r]' "$stats_file"
