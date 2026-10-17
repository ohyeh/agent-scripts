#!/usr/bin/env bash
# SessionStart hook, matcher "compact": re-inject the user's own recent prompts
# after a compaction, and escalate to handoff when a session has compacted too
# often. stdout of a SessionStart hook is injected as context for the model.
#
# Why (measured 2026-08-26 on a peer host, session 510a1448): the compaction
# summary is a lossy paraphrase and the user's instruction "uat = staging" was
# gone the same minute the summary landed. context-mode's ctx_search indexes
# only turn-end assistant text, not user prompts, so recall must read the
# transcript jsonl on disk — it survives compaction verbatim.
#
# Threshold data: the three sessions the user called 失智 compacted 3, 4 and 1
# times (the 1 lost an instruction at that single compaction); healthy sessions
# that day compacted 0–1. Escalated at 3 until 2026-09-02; raised to 6 to measure
# whether the PostCompact handoff file (postcompact-handoff.sh) removes the loss.
# W37 (2026-09-11): two 7-compact sessions had zero post-compact corrections;
# loss no longer observed. Raised to 10 as a guard for runaway sessions only.
# W39 (2026-09-24): long tasks hit 10 this week; raised to 20 (Paul).
set -u

# Shared with compaction-cap-gate.sh (the PreToolUse gate that enforces this cap).
MAX_COMPACTIONS="${AGENT_HOOKS_MAX_COMPACTIONS:-20}"
MAX_PROMPTS=20
MAX_PROMPT_CHARS=200
# A worker's first record is its brief; at 200 chars the replay of a70f788e
# kept the GOAL and lost ACCEPTANCE. 1500 chars keeps a CJK brief (3 bytes per
# char) inside MAX_TOTAL_BYTES.
MAX_BRIEF_CHARS=1500
MAX_TOTAL_BYTES=6000
HEADER="[compaction-recall] verbatim user prompts before this compaction, newest last:"

IN="$(cat)"
command -v jq >/dev/null 2>&1 || exit 0
TRANSCRIPT="$(printf '%s' "$IN" | jq -r '.transcript_path // empty')"
# Inside a subagent transcript_path names the PARENT's file: 2026-10-16
# session 86a74915, worker a70f788e got the owner's prompts and tmux notices
# as its own after each of 6 compactions. This hook's stdin carries no
# agent_id there, so the compacting thread comes from the mark that
# precompact-instructions.sh wrote. Recall the worker's own brief and
# coordinator messages from <parent>/subagents/agent-<id>.jsonl; with no such
# file, inject nothing rather than the parent's prompts.
AGENT_ID="$(printf '%s' "$IN" | jq -r '.agent_id // empty')"
if [ -z "$AGENT_ID" ]; then
  mark="${HOME}/.local/state/agent-hooks/$(printf '%s' "$IN" | jq -r '.session_id // empty')/compacting-thread"
  thread="$(cat "$mark" 2>/dev/null)"
  [ -z "$thread" ] || [ "$thread" = main ] || AGENT_ID="$thread"
fi
if [ -n "$AGENT_ID" ]; then
  TRANSCRIPT="${TRANSCRIPT%.jsonl}/subagents/agent-${AGENT_ID}.jsonl"
  DATA_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/agent-hooks"; mkdir -p "$DATA_DIR"
  jq -cn --arg ts "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" --arg aid "$AGENT_ID" --argjson found "$([ -f "$TRANSCRIPT" ] && echo true || echo false)" \
    '{timestamp: $ts, agent_id: $aid, own_transcript_found: $found}' >> "$DATA_DIR/compaction-recall-subagent.jsonl"
fi
[ -f "$TRANSCRIPT" ] || exit 0

# grep -c prints "0" AND exits 1 on no match, so `|| echo 0` would yield "0\n0".
compactions="$(grep -c '"isCompactSummary":true' "$TRANSCRIPT" 2>/dev/null)"
compactions="${compactions:-0}"

# Human prompts only: type==user whose content is a plain string or a text
# block, skipping tool_result records, harness <tags>, and this hook's own
# earlier output (the HEADER line) so a re-injection never re-injects itself.
prompts="$(jq -r --arg max "$MAX_PROMPT_CHARS" --arg hdr "$HEADER" '
  select(.type=="user" and .isCompactSummary!=true)
  | .message.content
  | if type=="string" then . else ([.[]? | select(.type=="text") | .text] | join(" ")) end
  | select(length > 0 and (startswith("<") | not) and (contains($hdr) | not))
  | gsub("\n"; " ") | .[0:($max|tonumber)]' "$TRANSCRIPT" 2>/dev/null | tail -n "$MAX_PROMPTS")"

# Worker: its brief goes on its own line, longer, and the byte cap below never
# drops it (that loop removes "- " lines only); the "- " list skips it.
brief=""
if [ -n "$AGENT_ID" ]; then
  brief="$(jq -r --arg hdr "$HEADER" '
    select(.type=="user" and .isCompactSummary!=true)
    | .message.content
    | if type=="string" then . else ([.[]? | select(.type=="text") | .text] | join(" ")) end
    | select(length > 0 and (startswith("<") | not) and (contains($hdr) | not))
    | gsub("\n"; " ")' "$TRANSCRIPT" 2>/dev/null | head -n 1)"
  # cut by characters in jq, not bash ${:0:N} (bytes under a C locale)
  short="$(jq -rn --arg b "$brief" --argjson n "$MAX_PROMPT_CHARS" '$b[0:$n]')"
  [ -z "$short" ] || prompts="$(printf '%s\n' "$prompts" | grep -vxF -- "$short")"
  brief="$(jq -rn --arg b "$brief" --argjson n "$MAX_BRIEF_CHARS" '$b[0:$n]')"
fi

[ -n "$prompts$brief" ] || exit 0

out="$HEADER
${brief:+Your brief (first message): $brief
}$(printf '%s\n' "$prompts" | grep -v '^$' | sed 's/^/- /')
Compactions in this session: $compactions. Re-derive current goal and title status from these, not from the summary alone."

# Point at the file postcompact-handoff.sh just wrote so the model can read the
# full summary back if the re-injected context above looks incomplete.
CWD="$(printf '%s' "$IN" | jq -r '.cwd // empty')"
SID="$(printf '%s' "$IN" | jq -r '.session_id // empty')"
# This session's file only, at the git root where postcompact-handoff.sh writes it.
# No newest-file fallback: it can name another session's handoff.
project="$(git -C "${CWD:-.}" rev-parse --show-toplevel 2>/dev/null)"
[ -n "$project" ] || project="${CWD:-.}"
latest_handoff="$project/.claude/handoffs/compact-${SID:0:8}.md"
# a worker's summary is already in its context; compact-<sid8>.md is the parent's
[ -f "$latest_handoff" ] && [ -z "$AGENT_ID" ] || latest_handoff=""
if [ -n "$latest_handoff" ]; then
  out="$out
Latest compact handoff: ${latest_handoff/#$HOME/\~}. Read it before acting if the summary above seems incomplete."
fi

if [ "$compactions" -ge "$MAX_COMPACTIONS" ]; then
  out="$out
ESCALATION: this session has compacted $compactions times (limit $MAX_COMPACTIONS). Building is now BLOCKED by compaction-cap-gate.sh (no exemption). Do exactly: write the handoff (skill session-handoff), closing recap, rename this title to ↗️ with the next sequence number (session-titles.md §State transitions 4), PushNotification the user to open the successor, ScheduleWakeup {stop:true}, then idle."
fi

# ponytail: hard byte cap so the recall can never recreate the bloat that
# caused the compaction; drop oldest prompts first if over.
while [ "$(printf '%s' "$out" | wc -c)" -gt "$MAX_TOTAL_BYTES" ]; do
  out="$(printf '%s\n' "$out" | awk 'NR==1 || !/^- / || seen++ {print}' )"
  # awk above drops the FIRST "- " line (oldest prompt) each pass
  [ "$(printf '%s\n' "$out" | grep -c '^- ')" -eq 0 ] && break
done

printf '%s\n' "$out"
exit 0
