#!/usr/bin/env bash
# PreCompact hook: steer the compaction summary itself.
#
# Mechanism (Claude Code 2.1.252, read from the installed binary, NOT public
# docs): the summarizer takes a `customInstructions` parameter that is
# hardcoded null for trigger "auto". PreCompact hook results are filtered by
# `succeeded && !blocked && output.trim().length > 0` and joined into
# `newCustomInstructions`, so an exit-0 hook's stdout IS the auto-compaction's
# summary instruction. UNCONFIRMED-by-docs: docs record the null default but
# not this stdout transformation. Verify by readback in a real compaction.
#
# Why: the summary is what survives; compaction-recall.sh (SessionStart,
# matcher "compact") is mitigation AFTER the loss. This is the prevention half
# — the two are complementary, not alternatives.
set -u

# Hook stdout limit is 10,000 characters; stay well under it and keep the
# payload plain prose so nothing downstream mistakes it for JSON.
MAX_BYTES=6000

read -r -d '' PAYLOAD <<'EOF' || true
Write this summary as a session handoff, not a narrative recap.

Preserve VERBATIM, never paraphrase or compress:
- Every user instruction that constrains the solution.
- Every approach the user REJECTED, quoted in the words they rejected it with.
- Every correction the user made to a claim, and what the corrected claim was.
- Any file path, branch, command, identifier, or number the user supplied.

Drop first, in this order: tool output, file contents, my own explanations and
restatements. Keep the user's words at the cost of my own.

End with four labelled lines: current goal; last state verified by fresh
evidence; next step; what is still unproven or UNCONFIRMED.
EOF

[ "$(printf '%s' "$PAYLOAD" | wc -c)" -le "$MAX_BYTES" ] || {
  echo "[precompact-instructions] payload over ${MAX_BYTES}B; sending nothing" >&2
  exit 0
}

printf '%s\n' "$PAYLOAD"
exit 0
