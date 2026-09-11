#!/usr/bin/env bash
# UserPromptSubmit hook: route the prompt to its owning skill mechanically.
#
# W37 retro (2026-09-11): 55 typed sessions, 4 read `using-skills`, none of
# them for a router-owned task; 8 conflict/rebase, 4 renovate/deps and 3
# architecture sessions read nothing. Three kernel versions of "task type not
# named above → skill using-skills" changed nothing — the model does not route
# itself. This hook does the match and injects the owner as context; the
# table below mirrors skills/using-skills/SKILL.md rows (keep them in step).
# Stats: one JSONL line per hit for the weekly retro (trigger vs read ratio).
set -u
IN="$(cat)"
command -v jq >/dev/null 2>&1 || exit 0
P="$(printf '%s' "$IN" | jq -r '.prompt // empty')"
[ -n "$P" ] || exit 0
case "$P" in /*|\<*) exit 0;; esac   # slash commands and injected XML

# ponytail: flat regex→skill table; grep -Eiq per row, first match wins.
TABLE='
conflict|衝突|rebase.*(fail|stuck|卡)|merge.*(fail|卡)	resolving-merge-conflicts
renovate|dependabot|update[- ]?deps|升級套件|依賴.*(升|更新)	review-renovate / update-deps
release ?notes?|changelog|發版|版本號|bump	release-plannotator
\.pdf\b|填 ?pdf|讀 ?pdf	pdf
test ?plan|測試計畫|測試案例	qa-test-planner
architecture|架構(設計|審|評)|domain model|領域模型	codebase-design / domain-modeling
triage|分流|issue.*(整理|分類)	triage
生圖|產生圖片|image ?gen|imagegen	imagegen-frontend-web / imagegen-frontend-mobile
寫一篇|文章|blog|writing	writing-fragments / documentation-writing
diagram|流程圖|架構圖|mermaid	diagram-design / html-diagram
wizard|一步步引導|互動式腳本	wizard
(建|寫|改).*skill|skill.*(建|寫|改|eval)	skill-creator
'
hit=""; owner=""
while IFS=$'\t' read -r re sk; do
  [ -n "$re" ] || continue
  if printf '%s' "$P" | grep -Eiq -- "$re"; then hit="$re"; owner="$sk"; break; fi
done <<< "$TABLE"
[ -n "$owner" ] || exit 0

DATA_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/agent-hooks"; mkdir -p "$DATA_DIR"
jq -cn --arg ts "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" --arg owner "$owner" \
  --arg sid "$(printf '%s' "$IN" | jq -r '.session_id // empty')" \
  '{timestamp:$ts, owner:$owner, session_id:$sid}' >> "$DATA_DIR/skill-router-stats.jsonl"

jq -cn --arg o "$owner" '{hookSpecificOutput:{hookEventName:"UserPromptSubmit",
  additionalContext:("[skill-router] this prompt is owned by skill " + $o + ". Read its SKILL.md (Skill() or ~/.agents/skills/<name>/SKILL.md) before doing the task by hand; if it does not apply, say so in one line. Meta-router: skill using-skills.")}}'
