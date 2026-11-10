#!/usr/bin/env bash
# PreCompact hook: steer the compaction summary itself.
#
# Mechanism (Claude Code 2.1.257, read from the installed binary, NOT public
# docs): PreCompact hook results are filtered by
# `succeeded && !blocked && output.trim().length > 0` and joined into
# `newCustomInstructions`; for manual /compact the hook text is APPENDED after
# the user's own instructions (`${user}\n\n${hook}`), never replacing them.
# The built-in summary template already demands verbatim user messages (§6),
# so this payload only adds what the template lacks: the handoff sections
# that make the summary a session-handoff document. The summary itself lands in
# the new context, so the session resumes from it; no file copy is kept.
set -u

# Mark which thread is compacting, for compaction-recall.sh. Inside a subagent
# the compaction hooks carry no agent_id and name the parent's transcript and
# session (probe 2026-10-17, CLI 2.1.302: PreCompact/PostCompact/SessionStart stdin had no agent_id;
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

# The rules are CREATE Step 2 of the deployed session-handoff skill, read at each
# compaction: one spec for handoffs and summaries (owner 2026-11-10 「我就是希望只維護一份」).
# No copy here: a missing or oversized Step 2 sends nothing and the default template applies.
SKILL="${HOME}/.agents/skills/session-handoff/SKILL.md"
RULES="$(awk '/^### Step 2: Complete the Handoff Document/{on=1; next} /^### /{on=0}
  on && (/^[0-9]+\. / || (/^   / && item)) {item=1; print}' "$SKILL" 2>/dev/null)"
PAYLOAD="After the numbered sections, write this summary as a session handoff: one level-2
heading per item below, titled with the item's bold name, filled from this conversation.
Skip any part that needs a command, a script or a file (resume_pack.py, copying files),
and never invent a count, a time or a status line; write \"None\" under a heading with
nothing to record.
Drop first, in this order: tool output, file contents, my own explanations; keep the
user's words at the cost of my own.

$RULES"

case "$RULES" in *"Immediate Next Steps"*"Timeline"*) ;; *)
  echo "[precompact-instructions] no CREATE Step 2 in $SKILL; sending nothing" >&2
  exit 0 ;;
esac
[ "$(printf '%s' "$PAYLOAD" | wc -c)" -le "$MAX_BYTES" ] || {
  echo "[precompact-instructions] payload over ${MAX_BYTES}B; sending nothing" >&2
  exit 0
}
printf '%s\n' "$PAYLOAD"
exit 0
