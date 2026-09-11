#!/usr/bin/env bash
# UserPromptSubmit hook: route the prompt to its owning skill or workflow
# recipe mechanically, and log the hit for the weekly trigger-vs-read metric.
#
# Why: W37 retro (2026-09-11) — 55 typed sessions, 4 read `using-skills`, 0 of
# the router-owned tasks (8 conflict/rebase, 4 deps, 3 architecture) reached
# it; recipes ran 2× while inline Workflow scripts ran 30×. Three kernel
# revisions of "task type not named above → using-skills" changed nothing:
# the model does not route itself. The table (skill-router-table.tsv, next to
# this file) does the match; the model only has to read the named file.
#
# Contract: silent on no match, silent on a false hit (the injected line says
# to ignore, never to explain — kernel 4.29.0 forbids process narration).
# Skips pasted content (>400 chars, teammate messages, tool echoes) and never
# names a file that is absent on this host.
set -u
IN="$(cat)"
command -v jq >/dev/null 2>&1 || exit 0
P="$(printf '%s' "$IN" | jq -r '.prompt // empty')"
[ -n "$P" ] || exit 0
case "$P" in /*|\<*) exit 0;; esac
[ "${#P}" -le 400 ] || exit 0
printf '%s' "$P" | grep -Eq 'teammate-message|^Another Claude session|Ran [0-9]+ shell|^\[skill-router\]' && exit 0

TABLE="${SKILL_ROUTER_TABLE:-$(dirname "$0")/skill-router-table.tsv}"
[ -r "$TABLE" ] || exit 0
kind=""; owner=""
while IFS=$'\t' read -r re k o; do
  case "$re" in ''|'#'*) continue;; esac
  if printf '%s' "$P" | grep -Eiq -- "$re" 2>/dev/null; then kind="$k"; owner="$o"; break; fi
done < "$TABLE"
[ -n "$owner" ] || exit 0

case "$kind" in
  skill)  path="$HOME/.agents/skills/$owner/SKILL.md"
          ctx="this prompt is owned by skill $owner — read $path before doing the task by hand (Skill() or Read).";;
  recipe) path="$HOME/.claude/workflows/$owner.workflow.js"
          ctx="this prompt matches workflow recipe $owner — run it with the Workflow tool, scriptPath $path, when workflows are enabled for this session; otherwise state in one line that the recipe exists and proceed."
          [ "$owner" = consensus-gate ] && ctx="$ctx It requires a \`cli\` arg (any agent-tmux profile).";;
  *) exit 0;;
esac
[ -e "$path" ] || exit 0

DATA_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/agent-hooks"; mkdir -p "$DATA_DIR"
jq -cn --arg ts "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" --arg kind "$kind" --arg owner "$owner" \
  --arg sid "$(printf '%s' "$IN" | jq -r '.session_id // empty')" \
  '{timestamp:$ts, kind:$kind, owner:$owner, session_id:$sid}' >> "$DATA_DIR/skill-router-stats.jsonl"

jq -cn --arg c "[skill-router] $ctx If it does not apply, ignore this line silently." \
  '{hookSpecificOutput:{hookEventName:"UserPromptSubmit", additionalContext:$c}}'
