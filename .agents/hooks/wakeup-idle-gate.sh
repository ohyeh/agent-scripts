#!/usr/bin/env bash
# PreToolUse gate on ScheduleWakeup (W38 retro, Paul 2026-09-18 ruling):
# an idle loop does not keep ticking.
#
# Why: the kernel's Loop rule ("while waiting, speak only when a result arrives") is prose. Measured
# 2026-09-09..15 on .62: us-options-terrain chain A scheduled 90 wakeups, 39 of
# them noop:true ("等 bot 下一刀", 25–30 min heartbeats) — the source of that
# project's 12 cache breaks >100k (W38 F4). After the W37 retro terrain fell to
# 1/162, but paul-photo-gallery 89bd8f2f (09-14) still did 11/25 and Paul had
# to type 「你要自己 MONITOR BOT 不是空等發呆」. The fix lived in one project's
# context, not in the rules. This gate is the rule.
#
# Rule: two consecutive noop:true wakeups are the signal. A third wakeup that
# is not {stop:true} is BLOCKED unless it schedules ≥ IDLE_MIN_DELAY (default
# 3600 s). The block message names Paul's two sanctioned exits: stop + notify,
# or switch to the self-improvement/retro work the loop brief names.
# Streak lives in the session's agent-hooks state dir; stop:true resets it.
# ponytail: streak = a counter in a file; per-Monitor awareness if this proves
# too blunt.
set -u

IDLE_STREAK_MAX="${AGENT_HOOKS_IDLE_STREAK_MAX:-2}"
IDLE_MIN_DELAY="${AGENT_HOOKS_IDLE_MIN_DELAY:-3600}"

IN="$(cat)"
command -v jq >/dev/null 2>&1 || exit 0
[ "$(printf '%s' "$IN" | jq -r '.tool_name // empty')" = "ScheduleWakeup" ] || exit 0
SID="$(printf '%s' "$IN" | jq -r '.session_id // "unknown"')"
stop="$(printf '%s' "$IN" | jq -r '.tool_input.stop // false')"
noop="$(printf '%s' "$IN" | jq -r '.tool_input.noop // false')"
delay="$(printf '%s' "$IN" | jq -r '.tool_input.delaySeconds // 0 | floor')"

STATE_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/agent-hooks/$SID"; mkdir -p "$STATE_DIR"
STREAK_FILE="$STATE_DIR/wakeup-noop-streak"
streak="$(cat "$STREAK_FILE" 2>/dev/null || echo 0)"
case "$streak" in ''|*[!0-9]*) streak=0 ;; esac

if [ "$stop" = "true" ]; then
  printf '0\n' > "$STREAK_FILE"
  exit 0
fi

if [ "$noop" = "true" ]; then next=$((streak + 1)); else next=0; fi

DATA_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/agent-hooks"; mkdir -p "$DATA_DIR"
log() { # $1 result
  jq -cn --arg ts "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" --arg sid "$SID" --arg r "$1" \
    --argjson noop "$([ "$noop" = true ] && echo true || echo false)" --argjson delay "$delay" --argjson streak "$next" \
    '{timestamp:$ts, session_id:$sid, noop:$noop, delaySeconds:$delay, streak:$streak, result:$r}' \
    >> "$DATA_DIR/wakeup-idle-stats.jsonl"
}

if [ "$next" -gt "$IDLE_STREAK_MAX" ] && [ "$delay" -lt "$IDLE_MIN_DELAY" ]; then
  log blocked
  echo "BLOCKED: $streak consecutive idle wakeups (noop:true) and this one schedules ${delay}s again. Idle loops do not tick (kernel Loop rule; W38 retro F4: 39/90 idle heartbeats in one terrain chain). Pick one, now: (a) nothing left to do → PushNotification the user with the current state and ScheduleWakeup {stop:true}; (b) the loop brief names self-improvement / retro work → do that work in this round instead of scheduling; (c) you are waiting on an external event → attach a Monitor for it and schedule ≥ ${IDLE_MIN_DELAY}s as the fallback only." >&2
  exit 2
fi

printf '%s\n' "$next" > "$STREAK_FILE"
log allowed
exit 0
