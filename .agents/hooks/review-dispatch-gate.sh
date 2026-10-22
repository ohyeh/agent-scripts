#!/usr/bin/env bash
# PreToolUse gate for review dispatch through the tmux-agent mod (W43, owner 2026-10-16:
# 「目前的確有審查氾濫＋reviewer shopping」, 「能多檢查一個 是否可以累積多一點有效率一起審 … 讓他們反問自己」).
# Rules it enforces already exist: judgment-rubrics §4 (no reviewer shopping: a fix re-check
# goes back to the same reviewer) and model-dispatch §Review ladder (L2 cap 3 rounds; the full
# ladder runs once per push checkpoint on the accumulated diff). W42 local data (review = brief names
# both verdicts): 45 review workers, 35 ran one round; replayed in dispatch order, 16 of 45
# dispatches followed a BLOCK reviewer with a fresh one and 5 followed a reviewer with no verdict (one target went astra → sol → fable → astra → fable).
# Known limit: every tell counts as a round, a clarifying tell included.
# Known limit (W44-13): a tmux reviewer's time is its first dispatch (`since`), not its last tell, so an
# Agent reviewer sent between two tells reads as the newer one.
#
# A review brief = a brief that names both `VERDICT: PASS` and `VERDICT: BLOCK` (delegation-templates §5).
# Scope: workers this session dispatched (worker.json .owner == session_id) into the same dir.
#   assign, previous reviewer BLOCK, no `LAYER:` / `NEW SCOPE:` line     -> deny (shopping)
#   assign, previous reviewer has no verdict, no `REDISPATCH:` / `PARALLEL:` (or the two above) -> deny
#   assign, previous reviewer PASS, commits still unpushed, no `BATCH:`  -> deny (batch question)
#   tell to a review worker with >= 3 rounds and no PASS                 -> deny (round cap)
# Every deny is a question the agent answers; the answer line is what lets the call through.
#   Agent, previous Agent reviewer (same cwd, this transcript) BLOCK / no verdict -> deny, same answers (W43-22)
#   either dispatch: the previous reviewer is the newer of the two sources (W44-13)
# Not covered: reviewers across sessions, whether a review is needed.
set -u

IN="$(cat)"
command -v jq >/dev/null 2>&1 || exit 0
TOOL="$(printf '%s' "$IN" | jq -r '.tool_name // empty')"
case "$TOOL" in mcp__tmux-agent__assign|mcp__tmux-agent__tell|Agent) ;; *) exit 0;; esac
SESSION_ID="$(printf '%s' "$IN" | jq -r '.session_id // empty')"
[ -n "$SESSION_ID" ] || exit 0

V3="${TMUX_AGENT_STATE_V3:-$HOME/.local/state/tmux-agent-tools/.v3}"
CAP="${REVIEW_ROUND_CAP:-3}"
DATA_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/agent-hooks"
mkdir -p "$DATA_DIR"
STATS_FILE="$DATA_DIR/review-dispatch-stats.jsonl"

# both outcomes named: a builder brief that only relays "the review returned VERDICT: BLOCK" is not
# a review (W42 replay: two builders matched a one-word pattern)
is_review() { local b; b="$(cat)"; printf '%s' "$b" | grep -Eq 'VERDICT:[[:space:]]*`?PASS' && printf '%s' "$b" | grep -Eq 'VERDICT:[[:space:]]*`?BLOCK'; }
# rounds = highest episode number; episode 1 keeps its result at the worker root
rounds() {
  local n=1 e
  for e in "$1"/episodes/*; do
    e="${e##*/}"; case "$e" in ''|*[!0-9]*) continue;; esac
    [ "$e" -gt "$n" ] && n="$e"
  done
  echo "$n"
}
# verdict of round $2: PASS | BLOCK | NONE (round still running or no verdict) | ERR (unreadable)
vof() {
  local n="$2" r out; r="$1/episodes/$n/result.json"
  # only round 1 may fall back to the root result; a later round without a result is still running
  [ -f "$r" ] || { [ "$n" = 1 ] && r="$1/result.json"; }
  [ -f "$r" ] || { echo NONE; return; }
  # capture first: jq can print a verdict for a valid prefix and then fail on a truncated tail
  out="$(jq -r '(.verdict // "" | tostring | ascii_upcase) as $v
    | if $v == "PASS" or $v == "BLOCK" then $v
      else ((.summary // "" | tostring) | capture("VERDICT:\\s*(?<v>PASS|BLOCK)").v // "NONE") end' "$r" 2>/dev/null)" || { echo ERR; return; }
  case "$out" in PASS|BLOCK|NONE) echo "$out";; *) echo ERR;; esac   # several JSON values = not one result
}
verdict() { vof "$1" "$(rounds "$1")"; }   # the CURRENT round
# Rounds since the last earlier PASS: a reviewer reused after a PASS starts a new count
# (W44 10-22: 6 episodes with 3 PASS were capped as "6 rounds without PASS").
open_rounds() {
  local n i p=0; n="$(rounds "$1")"
  for ((i = 1; i < n; i++)); do [ "$(vof "$1" "$i")" = PASS ] && p=$i; done
  echo $((n - p))
}
log() {
  jq -cn --arg ts "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" --arg tool "$TOOL" --arg result "$1" \
    --arg dir "$2" --arg worker "$3" --argjson round "${4:-0}" --arg answer "${5:-}" \
    '{timestamp:$ts, tool:$tool, result:$result, dir:$dir, worker:$worker, round:$round, answer:$answer}' >> "$STATS_FILE"
}
line() { printf '%s' "$BRIEF" | grep -E -m1 "^[[:space:]]*$1:[[:space:]]*[^[:space:]]" | sed -E "s/^[[:space:]]*$1:[[:space:]]*//"; }

# W43-22: in-process Agent reviewers (W42: 71, 27 shopping). State is this session's transcript: the
# previous Agent review brief from the same cwd, and its verdict in the tool_result (foreground) or
# the task-notification that names its tool-use id (background). A fix re-check is `SendMessage`
# to that agent, which this gate never sees.
# prints "<epoch ms> <tool-use id> <PASS|BLOCK|NONE>" for the last one, or nothing
agent_prev() {
  local row id v
  [ -f "$1" ] || return 0
  row="$(jq -r --arg cwd "$2" 'select(.type == "assistant" and ((.cwd // "") | rtrimstr("/")) == $cwd)
    | (.timestamp // "") as $t
    | (($t | sub("\\.[0-9]+"; "") | try fromdate catch 0) * 1000
       + ($t | (capture("\\.(?<f>[0-9]+)").f // "0") | . + "00" | .[0:3] | tonumber)) as $ms
    | .message.content[]? | select(.type == "tool_use" and .name == "Agent")
    | select((.input.prompt // "") | test("VERDICT:\\s*`?PASS") and test("VERDICT:\\s*`?BLOCK")) | "\($ms) \(.id)"' "$1" 2>/dev/null | tail -1)"
  [ -n "$row" ] || return 0
  id="${row#* }"
  v="$(grep -F "$id" "$1" | grep -v '"type":"assistant"' | grep -oE 'VERDICT:[[:space:]]*`?(PASS|BLOCK)' | tail -1 | grep -oE 'PASS|BLOCK')"
  echo "$row ${v:-NONE}"
}
# prints "<since ms> <worker dir>" for the latest review worker this session sent into dir $1, or nothing
tmux_prev() {
  local wj w t best=0 prev=""
  for wj in $(grep -lF "$SESSION_ID" "$V3"/*/worker.json 2>/dev/null); do
    w="${wj%/worker.json}"
    jq -e --arg s "$SESSION_ID" --arg d "$1" '.owner == $s and ((.dir // "") | rtrimstr("/")) == $d' "$wj" >/dev/null 2>&1 || continue
    [ -f "$w/brief.md" ] && is_review < "$w/brief.md" || continue
    t="$(jq -r '.since // 0' "$wj")"
    [ "$t" -gt "$best" ] && { best="$t"; prev="$w"; }
  done
  [ -n "$prev" ] && echo "$best $prev"
}

if [ "$TOOL" = "mcp__tmux-agent__tell" ]; then
  NAME="$(printf '%s' "$IN" | jq -r '.tool_input.name // empty')"
  W="$V3/$NAME"
  [ -n "$NAME" ] && [ -f "$W/brief.md" ] && is_review < "$W/brief.md" || exit 0
  [ "$(jq -r '.owner // empty' "$W/worker.json" 2>/dev/null)" = "$SESSION_ID" ] || exit 0
  D="$(jq -r '.dir // empty' "$W/worker.json" 2>/dev/null)"; D="${D%/}"
  CWD="$(printf '%s' "$IN" | jq -r '.cwd // empty')"; CWD="${CWD%/}"
  [ -z "$CWD" ] || [ "$CWD" = "$D" ] || exit 0   # same dir only
  R="$(open_rounds "$W")"; V="$(verdict "$W")"
  [ "$V" = ERR ] && { log error "$D" "$NAME" "$R"; exit 0; }   # unreadable result: never deny on it
  if [ "$R" -ge "$CAP" ] && [ "$V" != "PASS" ]; then
    log round-cap "$D" "$NAME" "$R"
    echo "BLOCKED (review round cap): $NAME has run $R review rounds without PASS; the cap is $CAP (model-dispatch.md §Review ladder). Ask yourself: why does this not converge? Is the brief missing the owner-accepted risk or the scope contract? Call advisor, then either escalate with a new assign whose brief has \`LAYER: L3\`, or stop and report the open disagreement." >&2
    exit 2
  fi
  log allow "$D" "$NAME" "$R"
  exit 0
fi

# Dispatch of a new reviewer (assign or Agent). W44-13: the previous reviewer is the newer of the
# Agent reviewer in this session's transcript and the tmux review worker, so a BLOCK on one side
# also stops shopping on the other. The mod's gate payload has no transcript_path: find it by session id.
if [ "$TOOL" = Agent ]; then
  BRIEF="$(printf '%s' "$IN" | jq -r '.tool_input.prompt // empty')"
  DIR="$(printf '%s' "$IN" | jq -r '.cwd // empty')"
else
  BRIEF="$(printf '%s' "$IN" | jq -r '.tool_input.brief // empty')"
  DIR="$(printf '%s' "$IN" | jq -r '.tool_input.dir // empty')"
fi
DIR="${DIR%/}"
printf '%s' "$BRIEF" | is_review || exit 0
TR="$(printf '%s' "$IN" | jq -r '.transcript_path // empty')"
[ -n "$TR" ] || TR="$(ls "${CLAUDE_CONFIG_DIR:-$HOME/.claude}"/projects/*/"$SESSION_ID".jsonl 2>/dev/null | head -1)"
read -r ATS AID AV <<< "$(agent_prev "$TR" "$DIR")"
read -r PSINCE PREV <<< "$(tmux_prev "$DIR")"
if [ -n "${PREV:-}" ] && [ "$PSINCE" -ge "${ATS:-0}" ]; then
  PN="${PREV##*/}"; PV="$(verdict "$PREV")"; PR="$(rounds "$PREV")"
  RECHECK="\`tell $PN\`"; WAIT="wait for it or \`peek $PN\`"
  [ "$PV" = ERR ] && { log error "$DIR" "$PN" 0; exit 0; }   # unreadable result: never deny on it
elif [ -n "${AID:-}" ]; then
  PN="agent ${AID: -8}"; PV="$AV"; PR=1
  RECHECK="\`SendMessage\` to that agent"; WAIT="wait for its notification"
else
  log allow "$DIR" "" 0; exit 0
fi

if [ "$PV" = "NONE" ]; then
  # no verdict: still running, or exited without a report (2026-10-15: Sol r3 worker vanished)
  ANS="$(line REDISPATCH)"; [ -n "$ANS" ] || ANS="$(line PARALLEL)"
  [ -n "$ANS" ] || ANS="$(line LAYER)"; [ -n "$ANS" ] || ANS="$(line 'NEW SCOPE')"
  if [ -z "$ANS" ]; then
    log no-verdict "$DIR" "$PN" "$PR"
    echo "BLOCKED (reviewer without a verdict): $PN reviewed this dir and has no verdict yet. Ask yourself: is it still working? Then $WAIT. Did it exit without a report? Then add a line \`REDISPATCH: <why $PN did not finish>\`. Is this a planned parallel seat? Then add \`PARALLEL: <layer or role>\`. An unrelated scope takes \`NEW SCOPE: <what>\`." >&2
    exit 2
  fi
  log allow-answered "$DIR" "$PN" "$PR" "$ANS"
  exit 0
fi
if [ "$PV" != "PASS" ]; then
  ANS="$(line LAYER)"; [ -n "$ANS" ] || ANS="$(line 'NEW SCOPE')"
  if [ -z "$ANS" ]; then
    log shopping "$DIR" "$PN" "$PR"
    echo "BLOCKED (reviewer shopping): $PN reviewed this dir and has not returned PASS (last verdict: $PV). Ask yourself: why a new reviewer? A fix re-check goes back to the same reviewer: $RECHECK (judgment-rubrics §4). If you escalate a layer, add a line \`LAYER: <L2|L3> — <reason>\`; if this is a new, unrelated scope, add \`NEW SCOPE: <what>\`." >&2
    exit 2
  fi
  log allow-answered "$DIR" "$PN" "$PR" "$ANS"
  exit 0
fi
[ "$TOOL" = Agent ] && { log allow "$DIR" "$PN" 0; exit 0; }   # no batch question for in-process reviewers

# previous reviewer passed: could this wait and go with the next checkpoint?
UNPUSHED="$(git -C "$DIR" rev-list --count '@{u}..HEAD' 2>/dev/null || echo 0)"
if [ "${UNPUSHED:-0}" -gt 0 ]; then
  ANS="$(line BATCH)"
  if [ -z "$ANS" ]; then
    log batch-question "$DIR" "$PN" 0
    echo "BLOCKED (batch question): $PN already passed work in this dir and $UNPUSHED commit(s) are not pushed yet. The ladder runs once per push checkpoint on the accumulated diff (model-dispatch.md §Review ladder). Ask yourself: can this change wait and be reviewed with the next checkpoint? Which similar unreviewed changes can go in the same review? If it cannot wait, why? Answer in one brief line \`BATCH: <what this review includes | why it cannot wait>\`." >&2
    exit 2
  fi
  log allow-answered "$DIR" "$PN" 0 "$ANS"
  exit 0
fi
log allow "$DIR" "$PN" 0
exit 0
