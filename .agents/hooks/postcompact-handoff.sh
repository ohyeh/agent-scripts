#!/usr/bin/env bash
# PostCompact hook: persist the compaction summary as a session-handoff file.
#
# Input (stdin JSON, docs https://code.claude.com/docs/en/hooks): session_id,
# cwd, trigger ("manual"|"auto"), compact_summary. PostCompact has no decision
# control and cannot inject context (prior art: anthropics/claude-code#14258),
# so this hook only writes <cwd>/.claude/handoffs/<ts>-compact.md and runs the
# vendored validator; its one-line stdout shows in the transcript as status.
# Pair: precompact-instructions.sh asks the summarizer for the three REQUIRED
# handoff headings; this hook checks they arrived. Never exits non-zero.
set -u

IN="$(cat)"
command -v jq >/dev/null 2>&1 || exit 0

summary="$(printf '%s' "$IN" | jq -r '.compact_summary // empty')"
[ -n "$summary" ] || exit 0

cwd="$(printf '%s' "$IN" | jq -r '.cwd // empty')"
[ -d "$cwd" ] || cwd="$PWD"
trigger="$(printf '%s' "$IN" | jq -r '.trigger // "unknown"')"
session_id="$(printf '%s' "$IN" | jq -r '.session_id // "unknown"')"

dir="$cwd/.claude/handoffs"
mkdir -p "$dir" || exit 0
ts="$(date +%Y-%m-%d-%H%M%S)"
file="$dir/$ts-compact-${session_id:0:8}.md"

{
  printf '# Session Handoff: compaction (%s)\n\n' "$trigger"
  printf '## Session Metadata\n\n'
  printf -- '- Created: %s\n' "$(date +%Y-%m-%dT%H:%M:%S%z)"
  printf -- '- Project: %s\n' "${cwd/#$HOME/\~}"
  printf -- '- Session: %s\n' "$session_id"
  printf -- '- Source: PostCompact hook (compact_summary)\n\n'
  printf '%s\n' "$summary"
} > "$file"

validator="$HOME/.agents/skills/session-handoff/scripts/validate_handoff.py"
if [ -f "$validator" ] && command -v python3 >/dev/null 2>&1; then
  if python3 "$validator" "$file" >/dev/null 2>&1; then
    echo "[postcompact-handoff] READY ${file/#$HOME/\~}"
  else
    echo "[postcompact-handoff] BLOCKED (missing required sections) ${file/#$HOME/\~} — run: python3 $validator $file"
  fi
else
  echo "[postcompact-handoff] WRITTEN (validator unavailable) ${file/#$HOME/\~}"
fi
exit 0
