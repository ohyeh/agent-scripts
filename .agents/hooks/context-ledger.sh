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

# Evidence tokens: fixed-shape facts the tool actually printed (exit=N,
# N passed, PASS, DEPLOY OK, VERDICT: …), normalized by the shared
# evidence-tokens.sh. claim-evidence-gate.sh later requires a completion claim
# to quote one of these — binding the claim to an observation. PostToolUse
# carries no exit code for Bash (measured 2.1.246: stdout/stderr/interrupted
# only), so printed tokens are the strongest binding available. Only the
# normalized tokens are stored, never the surrounding output.
TOKENIZER="$(dirname "$0")/evidence-tokens.sh"
evidence='[]'
if [ -x "$TOKENIZER" ]; then
  evidence="$(printf '%s' "$IN" \
    | jq -r '.tool_response | if type=="string" then . elif type=="object" then ((.stdout // "") + "\n" + (.stderr // "") + "\n" + ((.content // "") | if type=="string" then . else tostring end)) else tostring end' 2>/dev/null \
    | bash "$TOKENIZER" | jq -R . | jq -s -c .)"
fi

jq -cn --arg ts "$ts" --arg tool "$TOOL_NAME" --arg file "$FILE_PATH" --arg sha "$sha" --argjson ev "${evidence:-[]}" \
  '{timestamp: $ts, tool: $tool, file: (if $file == "" then null else $file end), input_sha256: $sha, evidence: $ev}' >> "$LEDGER"
exit 0
