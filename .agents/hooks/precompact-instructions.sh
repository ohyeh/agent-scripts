#!/usr/bin/env bash
# PreCompact hook: steer the compaction summary itself.
#
# Mechanism (Claude Code 2.1.257, read from the installed binary, NOT public
# docs): PreCompact hook results are filtered by
# `succeeded && !blocked && output.trim().length > 0` and joined into
# `newCustomInstructions`; for manual /compact the hook text is APPENDED after
# the user's own instructions (`${user}\n\n${hook}`), never replacing them.
# The built-in summary template already demands verbatim user messages (§6),
# so this payload only adds what the template lacks: the three headings
# that make the summary a valid session-handoff document, which
# postcompact-handoff.sh then writes to <cwd>/.claude/handoffs/ and validates
# with skills/session-handoff/scripts/validate_handoff.py.
set -u

# Hook stdout limit is 10,000 characters; stay well under it and keep the
# payload plain prose so nothing downstream mistakes it for JSON.
MAX_BYTES=6000

read -r -d '' PAYLOAD <<'EOF' || true
After the numbered sections, add these three headings verbatim (level-2
markdown, exact titles) so the summary validates as a session handoff:

## Current State Summary
What is done and proven (quote the evidence line), what is in progress, what
is blocked. Prefer the user's words over my own paraphrase.

## Important Context
- Every approach the user REJECTED, quoted in the words they rejected it with.
- Every correction the user made to a claim, and what the corrected claim was.
- Any file path, branch, command, identifier, or number the user supplied.
- Every claim still UNCONFIRMED (no run this session), labelled as such.

## Immediate Next Steps
Numbered, concrete, in order. First item = what I was about to do when
compaction fired.

Drop first, in this order: tool output, file contents, my own explanations.
Keep the user's words at the cost of my own.
EOF

[ "$(printf '%s' "$PAYLOAD" | wc -c)" -le "$MAX_BYTES" ] || {
  echo "[precompact-instructions] payload over ${MAX_BYTES}B; sending nothing" >&2
  exit 0
}

printf '%s\n' "$PAYLOAD"
exit 0
