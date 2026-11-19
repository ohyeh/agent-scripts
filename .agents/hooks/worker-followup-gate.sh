#!/usr/bin/env bash
# PreToolUse nudge (2026-10-17 usage-spike analysis; model-dispatch §3 Worker
# lifespan). Workers were 37% of weighted usage over 10/15–10/16 and 70% of
# that was spent in turns above 200K context: session 86a74915 fed one sonnet
# implementer 26 SendMessage follow-ups, its context grew to about 450K and
# every turn re-read it. Nudge-only, like round-cost-gate (user ruling
# 2026-10-17: deny only after the log shows its false-positive rate).
#
# Counts earlier SendMessage calls in the main transcript with the same
# `to`, deduped by tool_use id. Follow-ups spread over hours, so the whole
# transcript is scanned, but only lines that name SendMessage reach jq. At
# the NUDGE_AT-th follow-up to one agent it injects one additionalContext
# line; every follow-up at or past NUDGE_AT is logged to
# worker-followup-stats.jsonl. Subagent calls (stdin agent_id present) and
# peer-session messages (`to` = bridge:…) pass.
# FP: a fix re-check to the same reviewer (review-dispatch-gate asks for
# exactly that) — the nudge names that exception.
set -u
NUDGE_AT=3

IN="$(cat)"
command -v jq >/dev/null 2>&1 || exit 0
[ "$(printf '%s' "$IN" | jq -r 'has("agent_id")')" = "false" ] || exit 0
TRANSCRIPT="$(printf '%s' "$IN" | jq -r '.transcript_path // empty')"
[ -f "$TRANSCRIPT" ] || exit 0
TO="$(printf '%s' "$IN" | jq -r '.tool_input.to // empty')"
case "$TO" in ""|bridge:*) exit 0 ;; esac
TUID="$(printf '%s' "$IN" | jq -r '.tool_use_id // ""')"

prior="$(grep -F '"SendMessage"' "$TRANSCRIPT" | jq -R -s --arg to "$TO" --arg tuid "$TUID" '
  [ split("\n")[] | fromjson? | select(.type == "assistant") | .message.content[]?
    | select(.type == "tool_use" and .name == "SendMessage" and .input.to == $to and .id != $tuid)
    | .id ] | unique | length')"
n=$(( ${prior:-0} + 1 ))
[ "$n" -ge "$NUDGE_AT" ] || exit 0

DATA_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/agent-hooks"; mkdir -p "$DATA_DIR"
jq -cn --arg ts "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" --arg sid "$(printf '%s' "$IN" | jq -r '.session_id // ""')" \
  --arg to "$TO" --argjson n "$n" \
  '{timestamp: $ts, session_id: $sid, to: $to, followup: $n, nudged: ($n == '"$NUDGE_AT"')}' \
  >> "$DATA_DIR/worker-followup-stats.jsonl"

[ "$n" -eq "$NUDGE_AT" ] || exit 0
jq -cn --arg ctx "worker-followup-gate: this is follow-up $n to agent $TO. Each follow-up re-reads that worker's whole context, which only grows (model-dispatch §3 Worker lifespan). If the current round is done: commit, then start a NEW Agent whose brief carries only the previous REPORT and the commit sha. Continue this worker only for a correction inside the same round, or for a fix re-check to the same reviewer." \
  '{hookSpecificOutput: {hookEventName: "PreToolUse", additionalContext: $ctx}}'
exit 0
