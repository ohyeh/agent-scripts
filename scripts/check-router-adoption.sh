#!/usr/bin/env bash
# Measure using-workflows router adoption among sessions that actually touch
# .workflow run dirs (last N days, default 7). Baseline 2026-07-25 (mbp14):
# claude 5/113 (4%), codex 7/148 (5%). Success = the share rises after the
# v4.6.16 Continuity trigger; flat share means the trigger wording failed.
# Patterns self-validate on a known positive before zeros are trusted (rule G).
set -euo pipefail

count() {
  local value="$1" result rc
  if result=$(printf '%s\n' "$value" | grep -c .); then
    echo "$result"
  else
    rc=$?
    [ "$rc" -eq 1 ] || return "$rc"
    echo 0
  fi
}
count_matching_files() {
  local files="$1"
  shift
  local matches=0 file rc
  while IFS= read -r file; do
    [ -z "$file" ] && continue
    if grep -q "$@" "$file"; then
      matches=$((matches + 1))
    else
      rc=$?
      [ "$rc" -eq 1 ] || return "$rc"
    fi
  done <<< "$files"
  echo "$matches"
}
matching_files() {
  local files="$1"
  shift
  local file rc
  while IFS= read -r file; do
    [ -z "$file" ] && continue
    if grep -q "$@" "$file"; then
      echo "$file"
    else
      rc=$?
      [ "$rc" -eq 1 ] || return "$rc"
    fi
  done <<< "$files"
}

if [ "${1:-}" = "--self-test" ]; then
  sample="$(mktemp)"
  trap 'rm -f "$sample"' EXIT
  echo "known-positive" > "$sample"
  [ "$(count_matching_files "$sample" -e 'absent-pattern')" = 0 ]
  [ "$(count_matching_files "$sample" -e 'known-positive')" = 1 ]
  echo "PASS [router-adoption] zero=0 positive=1"
  exit 0
fi

days="${1:-7}"
since=$(date -v-"${days}"d '+%Y-%m-%d' 2>/dev/null || date -d "-${days} days" '+%Y-%m-%d')

files_c=$(find ~/.claude/projects -name '*.jsonl' -newermt "$since")
files_x=$(find ~/.codex/sessions -name '*.jsonl' -newermt "$since")
touch_c=$(matching_files "$files_c" -e '\.workflow/20')
touch_x=$(matching_files "$files_x" -e '\.workflow/20')

router_c=0; router_x=0
[ -n "$touch_c" ] && router_c=$(count_matching_files "$touch_c" \
  -e '"skill":"using-workflows"' -e '"skill": "using-workflows"' \
  -e '<command-name>/using-workflows' \
  -e '"skill":"codex-dynamic-workflows"' -e '<command-name>/codex-dynamic-workflows')
[ -n "$touch_x" ] && router_x=$(count_matching_files "$touch_x" \
  -e '\[\$using-workflows\]' -e '\[\$codex-dynamic-workflows\]')
# NOTE: do NOT match bare 'claude-workflow-runner' — skill/rule text mentioning
# it is loaded into sessions and false-positives (measured 7→35 on 2026-07-25).

# rule G self-validation: each pattern family must hit a known positive anywhere
# in history, else its zero is UNCONFIRMED, not zero.
all_c=$(find ~/.claude/projects -name '*.jsonl')
all_x=$(find ~/.codex/sessions -name '*.jsonl')
pv_c=$(matching_files "$all_c" \
  -e '"skill":"using-workflows"' -e '"skill": "using-workflows"' \
  -e '<command-name>/using-workflows')
pv_x=$(matching_files "$all_x" -e '\[\$using-workflows\]')

echo "since=$since"
echo "claude: touch=$(count "$touch_c") router=$router_c pattern-valid=$([ -n "$pv_c" ] && echo yes || echo 'NO — zeros UNCONFIRMED')"
echo "codex:  touch=$(count "$touch_x") router=$router_x pattern-valid=$([ -n "$pv_x" ] && echo yes || echo 'NO — zeros UNCONFIRMED')"
