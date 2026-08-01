#!/usr/bin/env bash
# PostToolUse hook (A5): minimal context-exhaustion ledger. Appends one JSONL
# line per tool call (tool name, file path if the input carries one, sha256
# of the tool_input) to ledger.jsonl in the session's run dir. No analysis
# layer — this is the smallest thing that produces a greppable audit trail.
set -u

IN="$(cat)"
command -v jq >/dev/null 2>&1 || exit 0
command -v shasum >/dev/null 2>&1 && SHASUM="shasum -a 256" || SHASUM="sha256sum"

TOOL_NAME="$(printf '%s' "$IN" | jq -r '.tool_name // "unknown"')"
TOOL_INPUT="$(printf '%s' "$IN" | jq -c '.tool_input // {}')"
FILE_PATH="$(printf '%s' "$IN" | jq -r '.tool_input.file_path // .tool_input.path // .tool_input.notebook_path // empty')"
SESSION_ID="$(printf '%s' "$IN" | jq -r '.session_id // empty')"

RUN_DIR="${HOME}/.local/state/agent-hooks/${SESSION_ID:-pid-$PPID}"
mkdir -p "$RUN_DIR"
LEDGER="$RUN_DIR/ledger.jsonl"

sha="$(printf '%s' "$TOOL_INPUT" | $SHASUM | cut -d' ' -f1)"
ts="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"

jq -n --arg ts "$ts" --arg tool "$TOOL_NAME" --arg file "$FILE_PATH" --arg sha "$sha" \
  '{timestamp: $ts, tool: $tool, file: (if $file == "" then null else $file end), input_sha256: $sha}' >> "$LEDGER"
exit 0
