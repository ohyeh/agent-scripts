#!/usr/bin/env bash
# PreToolUse nudge (2026-10-17 usage-spike analysis, user ruling: nudge first,
# deny only after the log shows its false-positive rate). Every tool round
# re-reads the whole context, so a run of rounds that each carry ONE
# read/search pays a full re-read per file. Measured over 8 opus main
# sessions, 10/15–10/16: 57% of weighted usage followed a Bash result, 85–93%
# of tool rounds held a single call, 212 runs of >=3 single-read rounds.
# The kernel batching rule already existed; the user asked for enforcement
# (maintenance §1 (c)).
#
# Counts the run of completed single-read rounds before this call in the main
# transcript (tail only; tool results there reach 100 KB per line). At the
# NUDGE_AT-th single read in a row it injects one additionalContext line;
# never blocks. Every round at or past NUDGE_AT is logged to
# round-cost-stats.jsonl — that log is the evidence for any later deny tier.
# Not counted as a single read: a Bash that bundles several reads,
# ctx_batch_execute, any Agent. Subagents (stdin agent_type present, see
# harness-diagnosis §Probed) pass: reading is their job.
# FP: a true dependency chain (read a, then know to read b) — costs one line.
# FN: reads through python/node scripts are not read-shaped.
set -u
NUDGE_AT=3

IN="$(cat)"
command -v jq >/dev/null 2>&1 || exit 0
[ "$(printf '%s' "$IN" | jq -r 'has("agent_type")')" = "false" ] || exit 0
TRANSCRIPT="$(printf '%s' "$IN" | jq -r '.transcript_path // empty')"
[ -f "$TRANSCRIPT" ] || exit 0

LIB='
def segs: split("\n") | map(split("&&") | map(split(";"))) | flatten
  | map(gsub("^\\s+|\\s+$"; "")) | map(select(length > 0 and (test("^cd(\\s|$)") | not)));
def single_read:
  if .name == "Read" or .name == "Grep" or .name == "Glob" or (.name | test("ctx_execute(_file)?$")) then true
  elif .name == "Bash" then ((.cmd | segs) as $s | ($s | length) == 1
    and ($s[0] | test("^(cat|head|tail|less|more|sed -n|awk|rg|grep|fd|find|ls|wc|jq|stat)(\\s|$)")))
  else false end;
'

current_single="$(printf '%s' "$IN" | jq -r "$LIB"' {name: (.tool_name // ""), cmd: (.tool_input.command // "")} | single_read')"
[ "$current_single" = "true" ] || exit 0

TUID="$(printf '%s' "$IN" | jq -r '.tool_use_id // ""')"
# Events in order: assistant tool rounds (merged by message id, deduped by
# tool_use id) and real user messages, which end a run.
prior="$(tail -n 400 "$TRANSCRIPT" | jq -R -s --arg tuid "$TUID" "$LIB"'
  [ split("\n")[] | fromjson? |
    if .type == "assistant" then
      {m: .message.id, tu: [.message.content[]? | select(.type == "tool_use")
        | {id, name, cmd: (.input.command // "")}]} | select(.tu | length > 0)
    elif .type == "user" and (.isMeta | not) and (.message.content | type == "string"
      or (type == "array" and all(.[]; .type != "tool_result"))) then {reset: true}
    else empty end ]
  | reduce .[] as $e ([];
      if (($e.reset // false) | not) and length > 0 and .[-1].m == $e.m
      then .[-1].tu = (.[-1].tu + $e.tu | unique_by(.id)) else . + [$e] end)
  | (to_entries | map(select(.value.tu // [] | any(.id == $tuid))) | .[0].key) as $k
  | (if $k == null then . else .[:$k] end)
  | reverse
  | reduce .[] as $e ({n: 0, stop: false};
      if .stop then .
      elif ($e.reset // false) then .stop = true
      elif ($e.tu | length) == 1 and ($e.tu[0] | single_read) then .n += 1
      else .stop = true end)
  | .n')"
run=$(( ${prior:-0} + 1 ))
[ "$run" -ge "$NUDGE_AT" ] || exit 0

DATA_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/agent-hooks"; mkdir -p "$DATA_DIR"
jq -cn --arg ts "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" --arg sid "$(printf '%s' "$IN" | jq -r '.session_id // ""')" \
  --arg tool "$(printf '%s' "$IN" | jq -r '.tool_name // ""')" --argjson run "$run" \
  '{timestamp: $ts, session_id: $sid, tool: $tool, run: $run, nudged: ($run == '"$NUDGE_AT"')}' \
  >> "$DATA_DIR/round-cost-stats.jsonl"

[ "$run" -eq "$NUDGE_AT" ] || exit 0
jq -cn --arg ctx "round-cost-gate: this is single-read round $run in a row. Each round re-reads the whole context (cost = rounds × context size). Put every remaining read you can name into ONE call (several commands joined with &&, or ctx_batch_execute), or hand the exploration to an explore-bounded subagent and take back only its conclusions." \
  '{hookSpecificOutput: {hookEventName: "PreToolUse", additionalContext: $ctx}}'
exit 0
