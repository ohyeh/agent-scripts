#!/usr/bin/env bash
# PreToolUse gate (W38 retro, Paul 2026-09-18 ruling): once a session has
# compacted MAX_COMPACTIONS times, the only work left is the handoff.
#
# Why: compaction-recall.sh already INJECTS an ESCALATION line at the cap, but
# text is advice. us-options-terrain 38b15e56 (11 compactions) and 1c21ecf9
# (12) read it and wrote "豁免繼續建置" — the cap became a self-granted
# exemption. Paul's ruling: at the cap the session writes session-handoff +
# recap, renames its title ↗️, notifies, stops the loop and idles. This gate
# makes everything else a BLOCK.
#
# Allowed past the cap (all hand-off mechanics):
#   Write/Edit/NotebookEdit  → files under .claude/handoffs/ or the agent-hooks state dir
#   Bash                      → git add/commit/push, validate_handoff, the title-rename
#                               curl (code/sessions), git status/log/diff (read-only)
#   ScheduleWakeup            → only {stop:true}
# Everything not matched by the settings.json matcher (PushNotification,
# SendMessage, Read, Grep, ...) is never seen here and stays allowed.
# Same counter and cap as compaction-recall.sh (isCompactSummary lines;
# AGENT_HOOKS_MAX_COMPACTIONS overrides both), so the two never disagree.
set -u

MAX_COMPACTIONS="${AGENT_HOOKS_MAX_COMPACTIONS:-20}"

IN="$(cat)"
command -v jq >/dev/null 2>&1 || exit 0
TRANSCRIPT="$(printf '%s' "$IN" | jq -r '.transcript_path // empty')"
[ -f "$TRANSCRIPT" ] || exit 0
TOOL="$(printf '%s' "$IN" | jq -r '.tool_name // empty')"
[ -n "$TOOL" ] || exit 0

compactions="$(grep -c '"isCompactSummary":true' "$TRANSCRIPT" 2>/dev/null)"
compactions="${compactions:-0}"
[ "$compactions" -ge "$MAX_COMPACTIONS" ] || exit 0

STATE_ROOT="${XDG_STATE_HOME:-$HOME/.local/state}/agent-hooks"
allowed=0
case "$TOOL" in
  Write|Edit|NotebookEdit)
    path="$(printf '%s' "$IN" | jq -r '.tool_input.file_path // .tool_input.notebook_path // empty')"
    case "$path" in
      */.claude/handoffs/*|"$STATE_ROOT"/*) allowed=1 ;;
    esac ;;
  Bash)
    cmd="$(printf '%s' "$IN" | jq -r '.tool_input.command // empty')"
    if printf '%s' "$cmd" | grep -Eq 'git (add|commit|push|status|log|diff|rev-parse)|validate_handoff|/code/sessions/|\.claude/handoffs/'; then
      allowed=1
    fi ;;
  ScheduleWakeup)
    [ "$(printf '%s' "$IN" | jq -r '.tool_input.stop // false')" = "true" ] && allowed=1 ;;
esac

DATA_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/agent-hooks"; mkdir -p "$DATA_DIR"
SID="$(printf '%s' "$IN" | jq -r '.session_id // empty')"
jq -cn --arg ts "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" --arg sid "$SID" --arg tool "$TOOL" \
  --argjson n "$compactions" --argjson allowed "$allowed" \
  '{timestamp:$ts, session_id:$sid, tool:$tool, compactions:$n, result:(if $allowed==1 then "allowed" else "blocked" end)}' \
  >> "$DATA_DIR/compaction-cap-stats.jsonl"

[ "$allowed" = 1 ] && exit 0

echo "BLOCKED: this session has compacted $compactions times (cap $MAX_COMPACTIONS). No further building here — no exemption (W38 retro: 38b15e56/1c21ecf9 self-exempted and kept going). Do exactly this, then idle: 1) write the handoff with skill session-handoff and validate it; 2) closing recap (found / did / next); 3) rename the title to ↗️ with the next sequence number (session-titles.md §State transitions 4); 4) PushNotification the user to open the successor session; 5) ScheduleWakeup {stop:true}. Allowed now: Write/Edit under .claude/handoffs/, git add/commit/push of the handoff, validate_handoff, the title-rename curl, ScheduleWakeup stop:true." >&2
exit 2
