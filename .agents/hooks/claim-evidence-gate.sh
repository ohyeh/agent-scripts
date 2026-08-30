#!/usr/bin/env bash
# Stop hook: a claim about the state of the work is bound to the ledger.
#
# First principle: the model may only ASSERT what it OBSERVED this session.
# judgment-rubrics §2 (completion) and its absence rule (negative claims) say
# so in prose; this gate checks it at the moment of the claim.
#
#   positive claim  — done/fixed/verified/完成/修好/測好/… or a ✅ title.
#       Bound by TOKEN EQUALITY: the reply must quote at least one evidence
#       token (exit=N, N passed, N/M passed, PASS, DEPLOY OK, VERDICT: …)
#       that a tool actually printed AFTER the last human prompt, as recorded
#       by context-ledger.sh. A typed-from-memory "exit 0" matches nothing.
#   negative claim  — stuck/failed/missing/no reply/卡住/失敗/缺少/沒有回覆/…
#       Bound by corroboration: ≥2 tool calls after the last human prompt.
#       One zero-hit search is the failure the absence rule exists to stop
#       (lesson 2026-08-25). ponytail: counts calls, cannot prove the two
#       channels differed; raise to channel-diversity if this gets gamed.
#   not a claim     — reply labels itself unverified / UNCONFIRMED / attempted /
#       not observed, or negates (not done yet / 尚未 / 還沒).
#
# Self-reference is stripped before matching (inline code, fenced blocks, 「」
# quotes, and this gate's own reason text), so discussing the gate is not a
# claim (false block measured 2026-08-27 on 「完成宣告 gate」).
# Fires once per distinct (title, reply); marker prefix claim-checked- (the
# retired done-claim-checked- markers from session-title-sentinel are inert).
# Claude Code only: reads the Claude jsonl and emits {decision: block};
# cursor-adapt.sh skips it like session-title-sentinel.
set -u

IN="$(cat)"
command -v jq >/dev/null 2>&1 || exit 0
[ "$(printf '%s' "$IN" | jq -r '.stop_hook_active // false')" = "true" ] && exit 0
TRANSCRIPT="$(printf '%s' "$IN" | jq -r '.transcript_path // empty')"
[ -f "$TRANSCRIPT" ] || exit 0
SESSION_ID="$(printf '%s' "$IN" | jq -r '.session_id // empty')"
STATE_DIR="${HOME}/.local/state/agent-hooks/${SESSION_ID:-pid-$PPID}"
mkdir -p "$STATE_DIR"
LEDGER="$STATE_DIR/ledger.jsonl"
TOKENIZER="$(dirname "$0")/evidence-tokens.sh"

last="$(printf '%s' "$IN" | jq -r '.last_assistant_message // empty')"
[ -n "$last" ] || exit 0
title="$(grep -o '"customTitle":"[^"]*"' "$TRANSCRIPT" 2>/dev/null | tail -1 | cut -d'"' -f4)"

# Text used for CLAIM detection: strip self-reference. Evidence tokens are
# extracted from the full reply, since evidence is normally quoted in code.
speech="$(printf '%s' "$last" \
  | sed -E '/^```/,/^```/d' \
  | sed -E 's/`[^`]*`//g; s/「[^」]*」//g' \
  | grep -viE 'judgment-rubrics|claim-evidence-gate|Completion claim|Negative claim|done-claim|宣告' )"

claim=""
case "$title" in ✅*) claim="positive";; esac
if [ -z "$claim" ] && printf '%s' "$speech" | grep -Eqi '(^|[^a-z])(done|fixed|verified|shipped|completed?|resolved|all green|tests? pass(ed|ing)?)([^a-z]|$)|已?(完成|修好|修復|測好|驗證(完|過)|通過|搞定)|✅|VERDICT: *PASS'; then
  claim="positive"
fi
if [ -z "$claim" ] && printf '%s' "$speech" | grep -Eqi '(^|[^a-z])(stuck|failed|missing|not implemented|no (reply|response)|never (reported|responded)|hung|dead)([^a-z]|$)|卡住|受阻|失敗|缺少|不存在|尚未實作|沒有?回(覆|應)|掛了'; then
  claim="negative"
fi
[ -n "$claim" ] || exit 0
printf '%s' "$speech" | grep -Eqi 'unverified|UNCONFIRMED|attempted|not observed|not (yet )?(done|fixed|verified)|未驗證|未觀測|尚未|還沒|未完成' && exit 0

csha="$(printf '%s%s' "$title" "$last" | shasum -a 256 2>/dev/null | cut -c1-16)"
MARKER="$STATE_DIR/claim-checked-$csha"
[ -f "$MARKER" ] && exit 0
: > "$MARKER"

# Window: everything after the last human prompt (transcript ISO ms → seconds; ledger ISO s; both UTC).
since="$(grep '"type":"user"' "$TRANSCRIPT" 2>/dev/null | grep -v 'tool_result' | grep -o '"timestamp":"[^"]*"' | tail -1 | cut -d'"' -f4 | cut -c1-19)"
[ -n "$since" ] || exit 0
window="$(jq -c --arg s "$since" 'select(.timestamp[0:19] >= $s)' "$LEDGER" 2>/dev/null)"
calls="$(printf '%s\n' "$window" | grep -c '"tool"')"

reason=""
if [ "$claim" = "positive" ]; then
  observed="$(printf '%s\n' "$window" | jq -r '.evidence[]? // empty' 2>/dev/null | sort -u)"
  quoted="$([ -x "$TOKENIZER" ] && printf '%s' "$last" | bash "$TOKENIZER")"
  if [ -z "$observed" ]; then
    reason="no tool printed any evidence token (exit code, test count, PASS, verdict) since the last user prompt at ${since}Z — nothing verifiable was run"
  elif [ -z "$quoted" ]; then
    reason="the reply quotes no evidence token; tools printed: $(printf '%s' "$observed" | paste -sd, -)"
  elif [ -z "$(comm -12 <(printf '%s\n' "$observed") <(printf '%s\n' "$quoted"))" ]; then
    reason="quoted evidence ($(printf '%s' "$quoted" | paste -sd, -)) matches nothing a tool printed this turn ($(printf '%s' "$observed" | paste -sd, -)) — evidence must be copied from tool output, not typed"
  fi
  [ -n "$reason" ] && reason="Completion claim fails judgment-rubrics §2: $reason. Run the verification and quote its output verbatim, or downgrade to \"attempted, unverified\" (title ⏳)."
else
  if [ "${calls:-0}" -lt 2 ]; then
    reason="Negative claim (stuck/failed/missing/no reply) rests on ${calls:-0} tool call(s) since the last user prompt at ${since}Z; the absence rule (judgment-rubrics §2) needs corroboration from a second channel before asserting absence — one miss is not absence. Check another channel (git diff --stat, mtimes, pane capture, varied pattern+tool) or say \"not observed\" and name the unchecked channel."
  fi
fi

# W35 retro F8: the gate had no stats file, so its hit rate was unmeasurable.
STATS_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/agent-hooks"; mkdir -p "$STATS_DIR"
jq -cn --arg ts "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" --arg claim "$claim" --arg sid "${SESSION_ID:-}" --argjson blocked "$([ -n "$reason" ] && echo true || echo false)" \
  '{timestamp:$ts, claim:$claim, session:$sid, blocked:$blocked}' >> "$STATS_DIR/claim-evidence-stats.jsonl"
[ -n "$reason" ] || exit 0
jq -n --arg r "$reason" '{decision: "block", reason: $r}'
exit 0
