#!/usr/bin/env bash
# PreToolUse hook (M1, W33 machine-gates): makes Bash-based file reads auditable.
# Rules like "judgments need Read-tool evidence" (lessons L4) are unverifiable
# while cat/head/sed reads leave no trail. This appends one JSONL line per
# read-shaped Bash command to read-audit.jsonl in the session's run dir.
# Log-only, never blocks; gating comes later once the data says it should.
set -u

IN="$(cat)"
command -v jq >/dev/null 2>&1 || exit 0

TOOL_NAME="$(printf '%s' "$IN" | jq -r '.tool_name // ""')"
[ "$TOOL_NAME" = "Bash" ] || exit 0

CMD="$(printf '%s' "$IN" | jq -r '.tool_input.command // ""')"
# Read-shaped: a read utility appears in command position (start or after |;&&).
printf '%s' "$CMD" | grep -qE '(^|\||;|&&)[[:space:]]*(cat|head|tail|less|more|awk|sed -n)[[:space:]]' || exit 0

SESSION_ID="$(printf '%s' "$IN" | jq -r '.session_id // empty')"
RUN_DIR="${HOME}/.local/state/agent-hooks/${SESSION_ID:-pid-$PPID}"
mkdir -p "$RUN_DIR"
ts="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"

jq -cn --arg ts "$ts" --arg cmd "$CMD" \
  '{timestamp: $ts, kind: "bash-read", command: ($cmd | .[0:400])}' \
  >> "$RUN_DIR/read-audit.jsonl"
exit 0
