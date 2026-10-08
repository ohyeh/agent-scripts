#!/usr/bin/env bash
# PostCompact hook: persist the compaction summary as a session-handoff file.
#
# Input (stdin JSON, docs https://code.claude.com/docs/en/hooks): session_id,
# cwd, trigger ("manual"|"auto"), compact_summary. PostCompact has no decision
# control and cannot inject context (prior art: anthropics/claude-code#14258),
# so this hook only writes <project>/.claude/handoffs/compact-<sid8>.md and runs the
# vendored validator; its one-line stdout shows in the transcript as status.
# Pair: precompact-instructions.sh asks the summarizer for the four REQUIRED
# handoff headings; this hook checks they arrived. Never exits non-zero.
#
# ONE file per session, overwritten on every compaction (Paul 2026-09-18, W38
# retro): the per-compaction <ts>-compact-<sid>.md files worked — post-compact
# instruction loss stopped — but a 12-compaction loop left 26 files and 11
# docs(handoff) commits in one day on us-options-terrain. The latest summary
# is the only one a successor reads; keep that one, commit it at checkpoints.
set -u

IN="$(cat)"
command -v jq >/dev/null 2>&1 || exit 0

summary="$(printf '%s' "$IN" | jq -r '.compact_summary // empty')"
[ -n "$summary" ] || exit 0

cwd="$(printf '%s' "$IN" | jq -r '.cwd // empty')"
[ -d "$cwd" ] || cwd="$PWD"
trigger="$(printf '%s' "$IN" | jq -r '.trigger // "unknown"')"
session_id="$(printf '%s' "$IN" | jq -r '.session_id // "unknown"')"

# The project root, not the cwd: a session working inside a run dir (e.g. a retro's
# evals/retro-metrics/<week>/) must not drop a handoff with home paths into the
# artifacts under review (W42-15). Outside git, the cwd is the project.
project="$(git -C "$cwd" rev-parse --show-toplevel 2>/dev/null)"
[ -n "$project" ] || project="$cwd"
dir="$project/.claude/handoffs"
mkdir -p "$dir" || exit 0
file="$dir/compact-${session_id:0:8}.md"
transcript="$(printf '%s' "$IN" | jq -r '.transcript_path // empty')"
compactions="$(grep -c '"isCompactSummary":true' "$transcript" 2>/dev/null)"
# Correlation fields (Paul 2026-09-24, W39 retro): last value of each key in
# the transcript, so a handoff joins to cost/usage rows and the claude.ai
# session. Empty when the transcript lacks the key.
last() { grep -F "$1" "$transcript" 2>/dev/null | tail -n 1 | jq -r "$2 // empty" 2>/dev/null; }
model="$(grep -F '"type":"assistant"' "$transcript" 2>/dev/null | grep -vF '"<synthetic>"' | tail -n 1 | jq -r '.message.model // empty' 2>/dev/null)"
advisor="$(last '"advisorModel"' .advisorModel)"
effort="$(last '"effort"' .effort)"
version="$(last '"version"' .version)"
entry="$(last '"entrypoint"' .entrypoint)"
cloud="$(last '"bridge-session"' .bridgeSessionId)"
branch="$(git -C "$cwd" rev-parse --abbrev-ref HEAD 2>/dev/null)"
sha="$(git -C "$cwd" rev-parse HEAD 2>/dev/null)"

{
  printf '# Session Handoff: compaction (%s)\n\n' "$trigger"
  printf '## Session Metadata\n\n'
  printf -- '- Created: %s\n' "$(date +%Y-%m-%dT%H:%M:%S%z)"
  printf -- '- Compactions so far: %s (file is overwritten each time; latest only)\n' "${compactions:-0}"
  printf -- '- Project: %s (cwd %s)\n' "${project/#$HOME/\~}" "${cwd/#$HOME/\~}"
  printf -- '- Session: %s\n' "$session_id"
  printf -- '- Cloud session: %s\n' "${cloud:-none}"
  printf -- '- CLI: claude-code %s (entrypoint %s)\n' "${version:-unknown}" "${entry:-unknown}"
  printf -- '- Model: %s · effort %s · advisor %s\n' "${model:-unknown}" "${effort:-unknown}" "${advisor:-none}"
  printf -- '- Git: %s @ %s\n' "${branch:-none}" "${sha:-none}"
  printf -- '- Transcript: %s\n' "${transcript/#$HOME/\~}"
  printf -- '- Source: PostCompact hook (compact_summary)\n\n'
  printf '%s\n' "$summary"
} > "$file"
grep -q '^## Standing Authorizations' "$file" || auth_note=" — no Standing Authorizations section"

validator="$HOME/.agents/skills/session-handoff/scripts/validate_handoff.py"
# /usr/bin/python3, not PATH: a hook must not exec a shim (pyenv) whose shell may differ (lesson 2026-10-03).
if [ -f "$validator" ] && [ -x /usr/bin/python3 ]; then
  if /usr/bin/python3 "$validator" "$file" >/dev/null 2>&1; then
    echo "[postcompact-handoff] READY ${file/#$HOME/\~}${auth_note:-}"
  else
    echo "[postcompact-handoff] BLOCKED (missing required sections) ${file/#$HOME/\~} — run: /usr/bin/python3 $validator $file"
  fi
else
  echo "[postcompact-handoff] WRITTEN (validator unavailable) ${file/#$HOME/\~}${auth_note:-}"
fi
exit 0
