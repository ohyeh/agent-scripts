#!/usr/bin/env bash
# Stop hook: one-shot nudge when a non-trivial session ends its turn with no
# session title ever set (session-titles.md lifecycle). Mechanical reminder,
# not enforcement — the rename gate stays the model's judgment call.
#
# Detection is heuristic (ponytail: grep the transcript for either a local
# customTitle record or the cloud rename endpoint having been called; upgrade
# to parsing the jsonl properly if false positives ever matter):
#   titled   = transcript mentions customTitle OR /v1/code/sessions
#   nontrivial = >= 12 user-typed prompts in the transcript
# Fires at most once per session (marker file), never when stop_hook_active.
set -u

IN="$(cat)"
command -v jq >/dev/null 2>&1 || exit 0

[ "$(printf '%s' "$IN" | jq -r '.stop_hook_active // false')" = "true" ] && exit 0
TRANSCRIPT="$(printf '%s' "$IN" | jq -r '.transcript_path // empty')"
[ -f "$TRANSCRIPT" ] || exit 0
SESSION_ID="$(printf '%s' "$IN" | jq -r '.session_id // empty')"

STATE_DIR="${HOME}/.local/state/agent-hooks/${SESSION_ID:-pid-$PPID}"
mkdir -p "$STATE_DIR"

# ✅ without evidence (measured 2026-08-26, session 510a1448: title went ✅,
# user: 「你又沒證據你測好了」). A ✅ title is a completion claim, so it is held
# to judgment-rubrics §2: the SAME turn's reply must carry raw evidence —
# a command with its exit code, a test count, or a verdict line. Fires once
# per distinct ✅ title value, before the cadence check below.
# ponytail: only sees renames that wrote a custom-title record (the local
# rename path); a cloud-only rename leaves no trace here.
title="$(grep -o '"customTitle":"[^"]*"' "$TRANSCRIPT" 2>/dev/null | tail -1 | cut -d'"' -f4)"
case "$title" in
  ✅*)
    tsha="$(printf '%s' "$title" | shasum -a 256 2>/dev/null | cut -c1-16)"
    DONE_MARKER="$STATE_DIR/done-claim-checked-$tsha"
    if [ ! -f "$DONE_MARKER" ]; then
      : > "$DONE_MARKER"
      last="$(printf '%s' "$IN" | jq -r '.last_assistant_message // empty')"
      if ! printf '%s' "$last" | grep -Eqi 'exit[ =:]*(code[ =:]*)?[0-9]+|[0-9]+ (tests? )?passed|VERDICT: *(PASS|BLOCK)|status: *"?(pass|ok|success)'; then
        jq -n --arg t "$title" '{decision: "block",
          reason: ("Title is ✅ (" + $t + ") but this reply carries no raw evidence per judgment-rubrics §2 — no command + exit code, test count, or verdict line. Either quote the this-session evidence now, or rename the title to ⏳ and report \"attempted, unverified\".")}'
        exit 0
      fi
    fi
    ;;
esac
# Count HUMAN turns only. A `"type":"user"` record is also written for every
# tool result, which in one measured session was 731 of 981 such records, so
# the raw count runs ~4x ahead of real prompts and a threshold of 12 was
# reached by roughly the third human turn (measured 2026-08-20).
# grep -c prints "0" AND exits 1 on no match, so `|| echo 0` would yield "0\n0".
prompts="$(grep '"type":"user"' "$TRANSCRIPT" 2>/dev/null | grep -vc 'tool_result')"
prompts="${prompts:-0}"
[ "$prompts" -lt 12 ] && exit 0

# Re-nudge every 40 human turns rather than once per session. Whether a title
# is STALE cannot be decided here: staleness means the title's status differs
# from the real one, and the real one is the model's judgment from current
# evidence, not a value a hook can read. So this is a cadence, not a detector.
# The old one-shot marker, plus a grep for whether a rename had EVER happened,
# made this hook structurally unable to support the rule's "re-check at every
# turn end where work started, stalled, blocked, handed off, or completed".
# 40 is derived, not picked: the same session held ~3 material title changes
# across 250 human turns, so nudging every 40 offers roughly one useful
# reminder per two fired, where every 12 would have been ~85% noise.
MARKER="$STATE_DIR/title-nudge-at"
if [ -f "$MARKER" ]; then
  last="$(cat "$MARKER" 2>/dev/null || echo 0)"
  [ "$prompts" -lt "$(( last + 40 ))" ] && exit 0
fi

printf '%s' "$prompts" > "$MARKER"
jq -n '{decision: "block",
  reason: "Session title check: re-read ~/.agents/rules/session-titles.md §Rename gate and confirm the title still describes the CURRENT state — status, outcome, handoff sequence. A title describing a previous state is a defect. If nothing material changed, proceed unchanged; this fires again after further activity."}'
exit 0
