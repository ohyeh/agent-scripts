#!/usr/bin/env bash
# Stop hook: one-shot nudge when a non-trivial session ends its turn with no
# session title ever set (session-titles.md lifecycle). Mechanical reminder,
# not enforcement — the rename gate stays the model's judgment call.
#
# Detection is heuristic (ponytail: grep the transcript for either a local
# customTitle record or the cloud rename endpoint having been called; upgrade
# to parsing the jsonl properly if false positives ever matter):
#   titled   = transcript mentions customTitle OR /v1/code/sessions
#   nontrivial = >= 12 user-typed prompts in the transcript
# Fires at most once per session (marker file), never when stop_hook_active.
set -u

IN="$(cat)"
command -v jq >/dev/null 2>&1 || exit 0

[ "$(printf '%s' "$IN" | jq -r '.stop_hook_active // false')" = "true" ] && exit 0
TRANSCRIPT="$(printf '%s' "$IN" | jq -r '.transcript_path // empty')"
[ -f "$TRANSCRIPT" ] || exit 0
SESSION_ID="$(printf '%s' "$IN" | jq -r '.session_id // empty')"

STATE_DIR="${HOME}/.local/state/agent-hooks/${SESSION_ID:-pid-$PPID}"
mkdir -p "$STATE_DIR"
MARKER="$STATE_DIR/title-nudge-sent"
[ -f "$MARKER" ] && exit 0

grep -q 'customTitle\|/v1/code/sessions' "$TRANSCRIPT" && exit 0

prompts="$(grep -c '"type":"user"' "$TRANSCRIPT" 2>/dev/null || echo 0)"
[ "$prompts" -lt 12 ] && exit 0

: > "$MARKER"
jq -n '{decision: "block",
  reason: "Session title check: this session looks non-trivial but no title has been set. Apply ~/.agents/rules/session-titles.md — derive status from current evidence and rename (cloud PUT recipe in §Runtime control). If the session is genuinely trivial, proceed without renaming; this reminder fires only once."}'
exit 0
