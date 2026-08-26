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
# that day compacted 0–1. Escalate at 3.
set -u

MAX_COMPACTIONS=3
MAX_PROMPTS=20
MAX_PROMPT_CHARS=200
MAX_TOTAL_BYTES=6000
HEADER="[compaction-recall] verbatim user prompts before this compaction, newest last:"

IN="$(cat)"
command -v jq >/dev/null 2>&1 || exit 0
TRANSCRIPT="$(printf '%s' "$IN" | jq -r '.transcript_path // empty')"
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

[ -n "$prompts" ] || exit 0

out="$HEADER
$(printf '%s\n' "$prompts" | sed 's/^/- /')
Compactions in this session: $compactions. Re-derive current goal and title status from these, not from the summary alone."

if [ "$compactions" -ge "$MAX_COMPACTIONS" ]; then
  out="$out
ESCALATION: this session has compacted $compactions times (limit $MAX_COMPACTIONS). Do not continue building here. Write a handoff (skill session-handoff), rename this title to ↗️ with the next sequence number (session-titles.md §State transitions 4), and tell the user to start the successor session."
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
