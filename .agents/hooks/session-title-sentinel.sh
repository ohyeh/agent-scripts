#!/usr/bin/env bash
# UserPromptSubmit hook: a cadence reminder that the session title may be stale
# (session-titles.md lifecycle). Mechanical reminder, not enforcement; the
# rename gate stays the model's judgment call.
#
# It speaks to the MODEL as additionalContext on the next prompt. As a Stop hook
# its {systemMessage} reached only the owner, so the model never renamed.
#   nontrivial = >= 12 user-typed prompts in the transcript; then every 40.
set -u

IN="$(cat)"
command -v jq >/dev/null 2>&1 || exit 0

TRANSCRIPT="$(printf '%s' "$IN" | jq -r '.transcript_path // empty')"
[ -f "$TRANSCRIPT" ] || exit 0
SESSION_ID="$(printf '%s' "$IN" | jq -r '.session_id // empty')"

STATE_DIR="${HOME}/.local/state/agent-hooks/${SESSION_ID:-pid-$PPID}"
mkdir -p "$STATE_DIR"

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
# Context for the model, never a block: a turn sent back for hygiene costs a full round
# (32 Stop blocks in 7 days, 2026-11-17).
jq -n '{hookSpecificOutput: {hookEventName: "UserPromptSubmit", additionalContext: "Session title check: the title may be stale. Re-check it against session-titles.md §Rename gate and rename through its §Runtime control if status, subject or outcome changed."}}'
exit 0
