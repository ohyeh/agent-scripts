#!/usr/bin/env bash
# PreToolUse hook (M1, W33 machine-gates): makes Bash-based file reads auditable.
# Rules like "judgments need Read-tool evidence" (lessons L4) are unverifiable
# while cat/head/sed reads leave no trail. This appends one JSONL line per
# read-shaped Bash command to read-audit.jsonl in the session's run dir.
# Command text is never stored because it can contain credentials.
# Deny rg -E (an encoding flag); warn on truncated searches, partial reads and memory reads.
set -u

IN="$(cat)"
command -v jq >/dev/null 2>&1 || exit 0

TOOL_NAME="$(printf '%s' "$IN" | jq -r '.tool_name // ""')"
[ "$TOOL_NAME" = "Bash" ] || exit 0

CMD="$(printf '%s' "$IN" | jq -r '.tool_input.command // ""')"
# shortcut: checks literal Bash text, use a shell parser if wrappers must be covered.
deny_search() { echo "search evidence: $1" >&2; exit 2; }
printf '%s' "$CMD" | grep -qE '(^|[|;&])[[:space:]]*rg[[:space:]]+([^|;&]*[[:space:]])?-E([[:space:]]|$)' \
  && deny_search 'rg -E selects encoding; use rg -e for a pattern or --encoding explicitly'
# Truncation and memory reads are allowed but carry a warning; scripts/test-bash-readonly-gate allows `| head`.
warn=""
printf '%s' "$CMD" | grep -qE '(rg|grep)[[:space:]][^;]*\|[[:space:]]*(head|tail)([[:space:]]|$)' \
  && warn="${warn}WARNING [truncated-search]: a search piped to head or tail cannot prove absence or coverage; re-run it untruncated before an absence claim. "
printf '%s' "$CMD" | grep -qE '(^|[|;&])[[:space:]]*(head|tail)[[:space:]][^;|]*\.(py|sh|md)([[:space:]]|$)' \
  && warn="${warn}WARNING [partial-read]: a head or tail excerpt cannot establish whole-file content. "
printf '%s' "$CMD" | grep -qE '(\.agents/shared-memory-inbox|\.codex/memories|read_memory\.py)' \
  && warn="${warn}WARNING [memory-is-a-lead]: shared-memory entries are leads, not live truth; verify a dynamic claim against the live source this session or label it UNCONFIRMED. "
[ -n "$warn" ] && jq -cn --arg m "$warn" '{hookSpecificOutput:{hookEventName:"PreToolUse",additionalContext:$m}}'
# Read-shaped: a read utility appears in command position (start or after |;&&).
printf '%s' "$CMD" | grep -qE '(^|\||;|&&)[[:space:]]*(cat|head|tail|less|more|awk|sed -n)[[:space:]]' || exit 0

SESSION_ID="$(printf '%s' "$IN" | jq -r '.session_id // empty')"
RUN_DIR="${HOME}/.local/state/agent-hooks/${SESSION_ID:-pid-$PPID}"
mkdir -p "$RUN_DIR"
ts="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
read_tool="$(printf '%s' "$CMD" | grep -oE '(^|\||;|&&)[[:space:]]*(cat|head|tail|less|more|awk|sed -n)' | head -1 | grep -oE '(cat|head|tail|less|more|awk|sed -n)$')"
command_sha256="$(printf '%s' "$CMD" | { sha256sum 2>/dev/null || openssl dgst -sha256 -r; } | cut -d' ' -f1)"

jq -cn --arg ts "$ts" --arg read_tool "$read_tool" --arg command_sha256 "$command_sha256" \
  '{timestamp: $ts, kind: "bash-read", read_tool: $read_tool, command_sha256: $command_sha256}' \
  >> "$RUN_DIR/read-audit.jsonl"
exit 0
