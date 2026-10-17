#!/usr/bin/env bash
# PreCompact hook: steer the compaction summary itself.
#
# Mechanism (Claude Code 2.1.257, read from the installed binary, NOT public
# docs): PreCompact hook results are filtered by
# `succeeded && !blocked && output.trim().length > 0` and joined into
# `newCustomInstructions`; for manual /compact the hook text is APPENDED after
# the user's own instructions (`${user}\n\n${hook}`), never replacing them.
# The built-in summary template already demands verbatim user messages (§6),
# so this payload only adds what the template lacks: the four headings
# that make the summary a valid session-handoff document, which
# postcompact-handoff.sh then writes to <cwd>/.claude/handoffs/ and validates
# with skills/session-handoff/scripts/validate_handoff.py.
set -u

# Mark which thread is compacting, for compaction-recall.sh and
# postcompact-handoff.sh. Inside a subagent the compaction hooks carry no
# agent_id and name the parent's transcript and session (probe 2026-10-17,
# CLI 2.1.302: PreCompact/PostCompact/SessionStart stdin had no agent_id;
# PreToolUse had it). Auto-compaction fires right after the compacting
# thread's tool result, so the newest context-ledger.sh row (PostToolUse,
# which carries agent_id) names that thread. Manual /compact is the main thread.
IN="$(cat)"
if command -v jq >/dev/null 2>&1; then
  SID="$(printf '%s' "$IN" | jq -r '.session_id // empty')"
  RUN_DIR="${HOME}/.local/state/agent-hooks/${SID:-pid-$PPID}"
  mkdir -p "$RUN_DIR"
  thread=main
  if [ "$(printf '%s' "$IN" | jq -r '.trigger // ""')" != "manual" ]; then
    last="$(tail -n 1 "$RUN_DIR/ledger.jsonl" 2>/dev/null)"
    aid="$(printf '%s' "$last" | jq -r '.agent_id // empty' 2>/dev/null)"
    ts="$(printf '%s' "$last" | jq -r '.timestamp | fromdateiso8601' 2>/dev/null)"
    if [ -n "$aid" ] && [ -n "$ts" ] && [ $(( $(date -u +%s) - ts )) -le 30 ]; then thread="$aid"; fi
  fi
  printf '%s\n' "$thread" > "$RUN_DIR/compacting-thread"
fi

# Hook stdout limit is 10,000 characters; stay well under it and keep the
# payload plain prose so nothing downstream mistakes it for JSON.
MAX_BYTES=6000

read -r -d '' PAYLOAD <<'EOF' || true
After the numbered sections, add these four headings verbatim (level-2
markdown, exact titles) so the summary validates as a session handoff:

## Standing Authorizations
Every standing approval or scope grant the user gave (e.g. "push is OK",
"實驗機自由發揮"), quoted verbatim, each with the scope it covers. Copy every
entry from any earlier summary forward unchanged. Never restate one as "needs
approval". List revoked ones with the user's revoking words. Write "None" if
there are none.

## Current State Summary
What is done and proven (quote the evidence line), what is in progress, what
is blocked. Prefer the user's words over my own paraphrase.

## Important Context
- Every approach the user REJECTED, quoted in the words they rejected it with.
- Every correction the user made to a claim, and what the corrected claim was.
- Any file path, branch, command, identifier, or number the user supplied.
- Every approach I tried or considered and set aside, and why.
- Every claim still UNCONFIRMED (no run this session), labelled as such.

## Immediate Next Steps
Numbered, concrete, in order. First item = compare the run's latest human
corrections and authorization with this handoff; then what I was about to do.

Drop first, in this order: tool output, file contents, my own explanations.
Keep the user's words at the cost of my own.
EOF

[ "$(printf '%s' "$PAYLOAD" | wc -c)" -le "$MAX_BYTES" ] || {
  echo "[precompact-instructions] payload over ${MAX_BYTES}B; sending nothing" >&2
  exit 0
}

printf '%s\n' "$PAYLOAD"
exit 0
