#!/usr/bin/env bash
# Measure using-workflows router adoption among sessions that actually touch
# .workflow run dirs (last N days, default 7). Baseline 2026-07-25 (mbp14):
# claude 5/113 (4%), codex 7/148 (5%). Success = the share rises after the
# v4.6.16 Continuity trigger; flat share means the trigger wording failed.
# Patterns self-validate on a known positive before zeros are trusted (rule G).
set -euo pipefail

days="${1:-7}"
since=$(date -v-"${days}"d '+%Y-%m-%d' 2>/dev/null || date -d "-${days} days" '+%Y-%m-%d')

count() { echo "$1" | grep -c . || true; }

touch_c=$(find ~/.claude/projects -name '*.jsonl' -newermt "$since" -exec grep -l '\.workflow/20' {} + 2>/dev/null || true)
touch_x=$(find ~/.codex/sessions -name '*.jsonl' -newermt "$since" -exec grep -l '\.workflow/20' {} + 2>/dev/null || true)

router_c=0; router_x=0
[ -n "$touch_c" ] && router_c=$(echo "$touch_c" | xargs grep -l \
  -e '"skill":"using-workflows"' -e '"skill": "using-workflows"' \
  -e '<command-name>/using-workflows' \
  -e '"skill":"codex-dynamic-workflows"' -e '<command-name>/codex-dynamic-workflows' \
  2>/dev/null | wc -l | tr -d ' ')
[ -n "$touch_x" ] && router_x=$(echo "$touch_x" | xargs grep -l \
  -e '\[\$using-workflows\]' -e '\[\$codex-dynamic-workflows\]' \
  2>/dev/null | wc -l | tr -d ' ')
# NOTE: do NOT match bare 'claude-workflow-runner' — skill/rule text mentioning
# it is loaded into sessions and false-positives (measured 7→35 on 2026-07-25).

# rule G self-validation: each pattern family must hit a known positive anywhere
# in history, else its zero is UNCONFIRMED, not zero.
pv_c=$(grep -rl '"skill":"using-workflows"\|"skill": "using-workflows"\|<command-name>/using-workflows' \
  ~/.claude/projects --include='*.jsonl' 2>/dev/null | head -1)
pv_x=$(grep -rl '\[\$using-workflows\]' ~/.codex/sessions --include='*.jsonl' 2>/dev/null | head -1)

echo "since=$since"
echo "claude: touch=$(count "$touch_c") router=$router_c pattern-valid=$([ -n "$pv_c" ] && echo yes || echo 'NO — zeros UNCONFIRMED')"
echo "codex:  touch=$(count "$touch_x") router=$router_x pattern-valid=$([ -n "$pv_x" ] && echo yes || echo 'NO — zeros UNCONFIRMED')"
