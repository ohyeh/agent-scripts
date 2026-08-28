#!/usr/bin/env bash
# PreToolUse hook (W35 retro F3 / backlog N2): a tool call that a gate already
# BLOCKED in this session may not be replayed byte-for-byte.
#
# Evidence (2026-08-28 Layer 2): the same gate fired twice on the same agent
# (tmux-assign-host-gate ×2 in c42d1927), the Stop gate 4× in fc159339, the
# same SendMessage error twice in 9e024f84 — the first BLOCKED never became
# "this road is closed". judgment-rubrics says so in prose; this checks it.
#
# Fingerprint = (tool_name, sha256 of the key-sorted tool_input). Source of
# prior denies = the transcript itself: a tool_result whose content starts
# with "BLOCKED:" (every repo gate says exactly that) or names a PreToolUse
# hook. Only hook denies count — a plain tool ERROR on the same input is NOT
# short-circuited, because re-running a failing test after a fix is the
# normal loop. ponytail: scans the LAST 400 transcript lines only; raise if a
# replay slips through a longer gap.
set -u
IN="$(cat)"
command -v jq >/dev/null 2>&1 || exit 0
command -v shasum >/dev/null 2>&1 && SHASUM="shasum -a 256" || SHASUM="sha256sum"
TRANSCRIPT="$(printf '%s' "$IN" | jq -r '.transcript_path // empty')"
[ -f "$TRANSCRIPT" ] || exit 0
TOOL="$(printf '%s' "$IN" | jq -r '.tool_name // empty')"
[ -n "$TOOL" ] || exit 0
SHA="$(printf '%s' "$IN" | jq -cS '.tool_input // {}' | $SHASUM | cut -d' ' -f1)"

DATA_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/agent-hooks"
mkdir -p "$DATA_DIR"
STATS="$DATA_DIR/deny-replay-stats.jsonl"

# Prior denied fingerprints: join assistant tool_use blocks to the user
# tool_result that answered them; keep those whose result is a hook deny.
prior="$(tail -n 400 "$TRANSCRIPT" | jq -rs --arg tool "$TOOL" '
  [ .[] | select(.type=="assistant") | .message.content[]? | select(.type=="tool_use" and .name==$tool)
    | {id, input: (.input|tojson)} ] as $uses
  | [ .[] | select(.type=="user") | .message.content[]? | select(.type=="tool_result")
      | select((.content | if type=="string" then . else (map(.text? // "") | join(" ")) end)
               | test("^\\s*BLOCKED:|PreToolUse hook|hook blocked"; "i"))
      | .tool_use_id ] as $denied
  | $uses[] | select(.id as $i | $denied | index($i)) | .input' 2>/dev/null \
  | while IFS= read -r inp; do printf '%s' "$inp" | jq -cS . | $SHASUM | cut -d' ' -f1; done | sort -u)"

hit=false
if printf '%s\n' "$prior" | grep -Fqx "$SHA"; then hit=true; fi
jq -cn --arg ts "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" --arg tool "$TOOL" --arg sha "$SHA" --argjson hit "$hit" \
  '{timestamp:$ts, tool:$tool, input_sha256:$sha, replay_blocked:$hit}' >> "$STATS"
[ "$hit" = true ] || exit 0

echo "BLOCKED: this exact $TOOL call (same input, sha ${SHA:0:12}) was already BLOCKED by a gate earlier in this session. Replaying a denied call is the retry-without-a-new-hypothesis the kernel forbids (judgment-rubrics §4; W35 retro N2). Read the original BLOCKED reason, change the approach (different tool, host, scope, or ask the user), and do not resend the same call." >&2
exit 2
