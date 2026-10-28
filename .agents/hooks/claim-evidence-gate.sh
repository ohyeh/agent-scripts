#!/usr/bin/env bash
# Stop hook: a claim about the state of the work is bound to the ledger.
#
# First principle: the model may only ASSERT what it OBSERVED this session.
# judgment-rubrics §2 (completion) and its absence rule (negative claims) say
# so in prose; this gate checks it at the moment of the claim.
#
#   positive claim  — done/fixed/verified/完成/修好/測好/… or a ✅ title.
#       Checked only when a mutating tool (Bash/Edit/Write/…) ran after the
#       last human prompt (kernel 4.26.0 Done scope); a plain answer exits 0.
#       Bound by TOKEN EQUALITY: the reply must quote at least one evidence
#       token (exit=N, N passed, N/M passed, PASS, DEPLOY OK, VERDICT: …)
#       that a tool actually printed AFTER the last human prompt, as recorded
#       by context-ledger.sh. A typed-from-memory "exit 0" matches nothing.
#   negative claim  — stuck/failed/missing/no reply/not done/卡住/失敗/缺少/還沒/尚未/未完成/…
#       Checked line by line, next to a positive claim too (W43-18). Each such
#       line must name a subject (`code`, file name, W/Q id, #n, commit sha) that
#       appears in a tool call or result after the last human prompt — two
#       unrelated calls no longer carry a "not done" list. A transcript whose
#       tool traffic is unreadable here (Codex, adapters) keeps the old bar:
#       ≥2 tool calls (lesson 2026-08-25: one zero-hit search is not absence).
#   not a claim     — a LINE labelled unverified / UNCONFIRMED / attempted /
#       not observed; the label covers that line only, never the whole reply.
#
# Self-reference is stripped before matching (inline code, fenced blocks, 「」
# quotes, and this gate's own reason text), so discussing the gate is not a
# claim (false block measured 2026-08-27 on 「完成宣告 gate」).
# Fires once per distinct (title, reply); marker prefix claim-checked- (the
# retired done-claim-checked- markers from session-title-sentinel are inert).
# Reads a Claude or Codex jsonl and emits {decision: block}; agy-adapt.sh feeds it a
# synthesized transcript + ledger. cursor-adapt.sh feeds it a prompt stamp + last reply.
set -u

IN="$(cat)"
command -v jq >/dev/null 2>&1 || exit 0
HOOK_ACTIVE="$(printf '%s' "$IN" | jq -r '.stop_hook_active // false')"
TRANSCRIPT="$(printf '%s' "$IN" | jq -r '.transcript_path // empty')"
SESSION_ID="$(printf '%s' "$IN" | jq -r '.session_id // empty')"
STATE_DIR="${HOME}/.local/state/agent-hooks/${SESSION_ID:-pid-$PPID}"
mkdir -p "$STATE_DIR"
LEDGER="$STATE_DIR/ledger.jsonl"
TOKENIZER="$(dirname "$0")/evidence-tokens.sh"

last="$(printf '%s' "$IN" | jq -r '.last_assistant_message // empty')"

# agent-should-know 0.2.0 audits each final reply in `turn.step` (a mod's classic.Stop hook is skipped on
# hosts where sec-default@builtin runs first) and leaves its verdict here, keyed by the reply's hash and
# stamped with the generation in audit/current (bumped at each turn start and ledger change), so an old
# PASS for the same text never counts. This hook enforces it, on re-entry too. When the turn has to end
# without a pass (chain cap, no verdict after one re-check, UNAUDITED), it writes audit/held: the mod then
# holds every non-read tool call until the owner's next message, and the owner sees why.
reason=""
audit_reason=""
audit_file=""
audit_state=""
audit_hold=""
hold_error_message=""
AUDIT_DIR="$STATE_DIR/audit"
AUDIT_CHAIN_CAP=4
if [ -f "$AUDIT_DIR/active" ]; then
  chain="$AUDIT_DIR/chain"
  # One stop chain = one turn's Stop and its re-entries; a missing verdict gets one block per chain
  # (the fix adds a line, so a per-reply marker would block every re-entry).
  [ "$HOOK_ACTIVE" = "true" ] || { echo 0 > "$chain"; rm -f "$AUDIT_DIR/missing-chain" "$STATE_DIR/held-write-failed"; }
  ash="$(printf '%s' "$last" | perl -0pe 's/[\t\n\x0B\f\r ]+\z//' | { sha256sum 2>/dev/null || openssl dgst -sha256 -r 2>/dev/null; } | cut -c1-16)"
  gen="$(jq -r '.generation // empty' "$AUDIT_DIR/current" 2>/dev/null)"
  vf="$AUDIT_DIR/$ash.json"
  if [ -n "$gen" ] && [ -f "$vf" ] && [ "$(jq -r '.generation // empty' "$vf" 2>/dev/null)" = "$gen" ]; then
    case "$(jq -r '.verdict // empty' "$vf" 2>/dev/null)" in
      FAIL|UNKNOWN) audit_reason="$(jq -r '.reason // empty' "$vf")"
        [ -n "$audit_reason" ] || audit_reason="Self-audit (agent-should-know) verdict carries no reason: name the tool call behind each claim you keep." ;;
      PASS) ;;
      # Cap reached with asks still open: the mod holds the episode itself and wrote REPORTED only after
      # it matched each open finding to an `[audit] <id> <problem>` line of this reply.
      REPORTED) audit_file="$vf"
        unrelayed="$(printf '%s\n' "$last" | jq -rRn --slurpfile v "$vf" '
          [inputs | sub("^\\s*(- )?"; "") | sub("\\s+$"; "")] as $t
          | [$v[0].findings[]? | select(("[audit] \(.id) \(.problem // "")") as $w | $t | index($w) | not) | .id] | join(", ")' 2>/dev/null)"
        [ -z "$unrelayed" ] || audit_reason="Self-audit REPORTED open findings this reply does not relay: $unrelayed. Add each as its own line \`[audit] <id> <problem>\`, copied from the audit." ;;
      UNAUDITED) audit_state=UNAUDITED
        audit_hold="Self-audit could not run for this reply ($(jq -r '.reason // "no reason"' "$vf")). Its claims are unchecked." ;;
      *) audit_reason="Self-audit (agent-should-know) verdict file is unreadable for this reply: name the tool call behind each claim you keep." ;;
    esac
  else
    # No verdict for this reply in the current generation: never written, or left from an earlier turn.
    audit_state=missing
    if [ ! -f "$AUDIT_DIR/missing-chain" ]; then
      : > "$AUDIT_DIR/missing-chain"
      audit_reason="Self-audit (agent-should-know $(head -c 40 "$AUDIT_DIR/active" 2>/dev/null)) wrote no verdict for this reply in generation ${gen:-none} (unknown is not a pass; marker ${AUDIT_DIR/#$HOME/\~}/active). Re-check each claim yourself and name the tool call behind it, then close the reply with a line 自我稽核未執行：no verdict."
    else
      audit_hold="Self-audit wrote no verdict, also after one re-check in this stop. The reply's claims are unchecked."
    fi
  fi
  if [ -n "$audit_reason" ]; then
    n="$(cat "$chain" 2>/dev/null || echo 0)"
    if [ "$n" -ge "$AUDIT_CHAIN_CAP" ]; then
      audit_hold="Self-audit still does not pass after $n blocks: $audit_reason"
      audit_reason=""
    else
      echo $((n + 1)) > "$chain"
    fi
  fi
  if [ -n "$audit_hold" ]; then
    mkdir -p "${XDG_DATA_HOME:-$HOME/.local/share}/agent-hooks"
    if held_error="$( { jq -cn --arg r "$audit_hold" --arg sha "$ash" --arg ts "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" '{at:$ts, sha:$sha, reason:$r}' > "$AUDIT_DIR/held"; } 2>&1)"; then
      rm -f "$STATE_DIR/held-write-failed"
      jq -cn --arg ts "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" --arg sid "${SESSION_ID:-}" --arg r "$audit_hold" '{timestamp:$ts, claim:"audit", session:$sid, blocked:false, held:$r}' >> "${XDG_DATA_HOME:-$HOME/.local/share}/agent-hooks/claim-evidence-stats.jsonl" 2>/dev/null
    else
      n="$(cat "$chain" 2>/dev/null || echo 0)"
      failures="$(cat "$STATE_DIR/held-write-failed" 2>/dev/null || echo 0)"
      if [ "$failures" -gt 0 ] && { [ "$n" -ge "$AUDIT_CHAIN_CAP" ] || [ "$failures" -ge "$AUDIT_CHAIN_CAP" ]; }; then
        hold_error_message="暫停失敗：無法寫入 held（$held_error），agent 未被擋住，請檢查"
        audit_reason=""
      else
        audit_reason="cannot write held ($held_error)"
        echo $((failures + 1)) > "$STATE_DIR/held-write-failed"
        echo $((n + 1)) > "$chain"
      fi
      audit_hold=""
      jq -cn --arg ts "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" --arg error "$held_error" --arg message "$hold_error_message" '{timestamp:$ts, claim:"audit", error:$error, systemMessage:$message}' >> "${XDG_DATA_HOME:-$HOME/.local/share}/agent-hooks/claim-evidence-stats.jsonl" 2>/dev/null
    fi
  fi
fi
# Every exit from here on carries the audit result too: the token checks below often exit early.
finish() {
  local r="${audit_reason:+$audit_reason }${reason:-}" m=""
  [ -n "$audit_hold" ] && m="未通過自我稽核，工作已暫停，等你下一則訊息：$audit_hold"
  [ -z "$hold_error_message" ] || m="$hold_error_message"
  [ -n "$r$m" ] && jq -n --arg r "$r" --arg m "$m" '(if $r != "" then {decision: "block", reason: $r} else {} end) + (if $m != "" then {systemMessage: $m} else {} end)'
}
trap finish EXIT
[ -f "$TRANSCRIPT" ] || exit 0
[ "$HOOK_ACTIVE" = "true" ] && exit 0
[ -n "$last" ] || exit 0
title="$(grep -o '"customTitle":"[^"]*"' "$TRANSCRIPT" 2>/dev/null | tail -1 | cut -d'"' -f4)"

# Text used for CLAIM detection: strip self-reference. Evidence tokens are
# extracted from the full reply, since evidence is normally quoted in code.
speech="$(printf '%s' "$last" \
  | sed -E '/^```/,/^```/d' \
  | sed -E 's/`[^`]*`//g; s/「[^」]*」//g' \
  | grep -viE 'judgment-rubrics|claim-evidence-gate|Completion claim|Negative claim|done-claim|宣告' )"

claim=""
# Under LC_ALL=C grep is byte-wise: never put ?/*/+ right after a CJK char (it binds to its last byte); group it.
case "$title" in ✅*) claim="positive";; esac
if [ -z "$claim" ] && printf '%s' "$speech" | grep -Eqi '(^|[^a-z])(done|fixed|verified|shipped|completed?|resolved|all green|tests? pass(ed|ing)?)([^a-z]|$)|(完成|修好|修復|測好|驗證(完|過)|通過|搞定)|✅|VERDICT: *PASS'; then
  claim="positive"
fi
# Completion claims keep the whole-reply exemption (unchanged). Negative lines do not: a label
# exempts its own line only (W43-18: one 「還沒」 let a reply list "not done" items it never checked).
printf '%s' "$speech" | grep -Eqi 'unverified|UNCONFIRMED|attempted|not observed|not (yet )?(done|fixed|verified)|未驗證|未觀測|尚未|還沒|未完成' && claim=""
LABEL_RE='unverified|UNCONFIRMED|attempted|not observed|not checked|未驗證|未觀測|未查|沒(有)?查|不確定'
# The audit's own label is a label only when this reply really went unaudited.
case "$audit_state" in UNAUDITED|missing) LABEL_RE="$LABEL_RE|自我稽核未執行" ;; esac
# A "not done" state is a negative claim too (W43-18): 還沒/尚未/未完成 assert what is not there.
NEG_RE='(^|[^a-z])(stuck|failed|missing|not implemented|not (yet )?(done|fixed|started)|no (reply|response)|never (reported|responded)|hung|dead)([^a-z]|$)|卡住|受阻|失敗|缺少|不存在|尚未|還沒|未完成|未開始|沒(有)?回(覆|應)|掛了'
# Kept raw (code spans intact): a line's `code`, file, W-id or sha is the subject it must be bound to.
# A REPORTED reply relays the audit's open findings as `[audit] <id> <problem>` lines. Only a line equal
# to that (an optional "- " aside) is exempt: anything the agent adds on the line stays checked.
audit_lines=""
[ -n "$audit_file" ] && audit_lines="$(printf '%s\n' "$last" | jq -rR --slurpfile v "$audit_file" '
  . as $l | ($l | sub("^\\s*(- )?"; "") | sub("\\s+$"; "")) as $t
  | select(any($v[0].findings[]?; (.problem // "") != "" and $t == "[audit] \(.id) \(.problem)")) | $l' 2>/dev/null)"
negative_lines="$(printf '%s' "$last" | sed -E '/^```/,/^```/d' | { [ -n "$audit_lines" ] && grep -vxF -- "$audit_lines" || cat; } \
  | grep -viE 'judgment-rubrics|claim-evidence-gate|Completion claim|Negative claim|done-claim|宣告' | grep -Eiv "$LABEL_RE" \
  | while IFS= read -r l; do printf '%s' "$l" | sed -E 's/`[^`]*`//g; s/「[^」]*」//g' | grep -Eqi "$NEG_RE" && printf '%s\n' "$l"; done)"
[ -n "$claim" ] || [ -z "$negative_lines" ] || claim="negative"
# W44-7: hand-backs checked against this turn's tool calls — a reload the agent can run itself,
# and a page called live with no render check (artifacts-rules §Quality, screenshot evidence).
# Any /reload-plugins outside a fence needs a reload call this turn: the remedy is one call, so a
# mention that is not an ask costs a turn, while a missed ask costs the user a hand-back.
reload_ask="$(printf '%s' "$last" | sed -E '/^```/,/^```/d' | grep -viE 'judgment-rubrics|claim-evidence-gate' | grep -Eqi '/reload-plugins|重新載入 *plugin' && echo 1)"
# A page claim: live/published after a page noun, "it is/went live", "published it", live before an artifact URL, 已上線/已發布.
live_say="$(printf '%s' "$speech" | grep -Eqi '(^|[^a-z])(page|artifact|dashboard)( is| went| has gone| has been| is now|:) (now )?(live|published)|(^|[^a-z])it(.s| is| went| has gone| has been| is now) (now )?(live|published)|(^|[^a-z])(published|deployed)( it| the page| the artifact| and live)|(live|published)[^a-z]{0,4}(at |:)? *https://claude\.ai/artifact|已上線|上線了|已發布|(頁面|網頁|儀表板|頁).{0,15}(上線|發布)' && echo 1)"
[ -n "$claim" ] || [ -n "$reload_ask$live_say" ] || exit 0

csha="$(printf '%s%s' "$title" "$last" | { sha256sum 2>/dev/null || openssl dgst -sha256 -r 2>/dev/null; } | cut -c1-16)"
MARKER="$STATE_DIR/claim-checked-$csha"
[ -f "$MARKER" ] && exit 0
: > "$MARKER"

# Window: everything after the last human prompt (transcript ISO ms → seconds; ledger ISO s; both UTC).
# Background completions, plugin and peer messages and skill bodies are user rows too, but no
# human turn starts there: Claude tags them origin.kind / isMeta; older rows only by their text.
since="$(jq -rR 'fromjson? | select(.type == "user" or (tostring | contains("\"type\":\"UserMessage\""))) | select(.isMeta != true)
  | select((.origin.kind // "human") == "human") | select(tostring | (contains("tool_result") or contains("<task-notification>")) | not)
  | .timestamp // empty' "$TRANSCRIPT" 2>/dev/null | tail -1 | cut -c1-19)"
[ -n "$since" ] || exit 0
window="$(jq -c --arg s "$since" 'select(.timestamp[0:19] >= $s)' "$LEDGER" 2>/dev/null)"
calls="$(printf '%s\n' "$window" | grep -c '"tool"')"

handback_reason=""
# Claude transcripts only: other formats (Codex, adapters) carry no readable tool_use rows here.
if [ -n "$reload_ask$live_say" ] && grep -q '"type":"assistant"' "$TRANSCRIPT"; then
  uses="$(jq -r --arg s "$since" 'select((.timestamp // "")[0:19] >= $s) | .message.content? | arrays | .[]
    | select(.type == "tool_use") | "\(.name) \(.input | tostring)"' "$TRANSCRIPT" 2>/dev/null)"
  [ -n "$reload_ask" ] && ! grep -q '^mcp__tmux-agent__reload ' <<<"$uses" \
    && handback_reason="Hand-back without own try: the reply asks the user to reload plugins, but this turn made no mcp__tmux-agent__reload call. Call mcp__tmux-agent__reload first; hand back only if it reports the old version."
  pub="$(grep -n '^Artifact ' <<<"$uses" | grep -vE '"action":"(read|list|open|delete|pin|unpin|quickstart)"|"asset":true' | tail -1 | cut -d: -f1)"
  [ -n "$live_say" ] && [ -n "$pub" ] && ! tail -n "+$((pub + 1))" <<<"$uses" | grep -qE '^[^ ]*([Ss]creenshot|ArtifactCheck)[^ ]* |"action":"screenshot"|^mcp__codex-cu__js .*\.screenshot\(|^Bash .*(agent-browser|screencapture)[^"]* screenshot|^Bash .*screencapture ' \
    && handback_reason="${handback_reason:+$handback_reason }Page called live after an Artifact publish with no render check: take a screenshot of the published page (artifacts-rules §Quality, screenshot evidence) before you say it is live."
fi

if [ "$claim" = "positive" ]; then
  # Kernel 4.26.0 "Done" scope: the tool-run evidence rule binds only when the
  # deliverable changed a file, system, or external state. A plain answer
  # (no mutating tool in the window) cites its source instead — the ledger
  # has tool names but not Bash commands, so Bash counts as mutating.
  mutating="$(printf '%s\n' "$window" | jq -r '.tool // empty' 2>/dev/null | grep -cE '^(Bash|Edit|Write|MultiEdit|NotebookEdit|apply_patch)$')"
  if [ "${mutating:-0}" -eq 0 ]; then
    jq -cn --arg ts "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" --arg sid "${SESSION_ID:-}" '{timestamp:$ts, claim:"positive", session:$sid, blocked:false, skipped:"no-mutating-tool"}' >> "${XDG_DATA_HOME:-$HOME/.local/share}/agent-hooks/claim-evidence-stats.jsonl" 2>/dev/null
    [ -n "$negative_lines" ] || [ -n "$handback_reason" ] || exit 0
  else
  observed="$(printf '%s\n' "$window" | jq -r '.evidence[]? // empty' 2>/dev/null | sort -u)"
  quoted="$([ -x "$TOKENIZER" ] && printf '%s' "$last" | bash "$TOKENIZER")"
  if [ -z "$observed" ]; then
    reason="no tool printed any evidence token (exit code, test count, PASS, verdict) since the last user prompt at ${since}Z — nothing verifiable was run"
  elif [ -z "$quoted" ]; then
    reason="the reply quotes no evidence token; tools printed: $(printf '%s' "$observed" | paste -sd, -)"
  elif [ -z "$(comm -12 <(printf '%s\n' "$observed") <(printf '%s\n' "$quoted"))" ]; then
    reason="quoted evidence ($(printf '%s' "$quoted" | paste -sd, -)) matches nothing a tool printed this turn ($(printf '%s' "$observed" | paste -sd, -)) — evidence must be copied from tool output, not typed"
  else
    # W42-21: evidence goes stale when a file the reply cites is edited after the last run that
    # printed a quoted token. Ledger line order is exact; timestamps are whole seconds.
    stale="$(printf '%s\n' "$window" | jq -rs --argjson q "$(printf '%s\n' "$quoted" | jq -R . | jq -sc 'map(select(. != ""))')" '
      ([to_entries[] | select(any((.value.evidence // [])[]; . as $t | $q | index($t))) | .key] | max) as $ev
      | .[($ev + 1):][] | select((.tool // "") | test("^(Edit|Write|MultiEdit|NotebookEdit|apply_patch)$")) | .file // empty' 2>/dev/null | sort -u)"
    while IFS= read -r f; do
      [ -n "$f" ] || continue
      case "$last" in *"$(basename "$f")"*) reason="$(basename "$f") was edited after the run that printed the quoted evidence — that evidence no longer covers it; re-run the check";; esac
    done <<< "$stale"
  fi
  [ -n "$reason" ] && reason="Completion claim fails judgment-rubrics §2: $reason. Run the verification and quote its output verbatim, or downgrade to \"attempted, unverified\" (title ⏳)."
  fi
fi

if [ -n "$negative_lines" ]; then
  # W43-18: each negative line is bound to its subject — a `code` span, file name, W/Q id, #n or
  # commit sha in that line must appear in a tool call or result after the last human prompt.
  # Counting calls let two unrelated calls carry any "not done" list. A transcript whose tool
  # traffic this cannot read (Codex rollouts, adapter transcripts) keeps the call count.
  traffic="$(jq -r --arg s "$since" 'select((.timestamp // "")[0:19] >= $s) | .message.content? | arrays | .[]
    | select(.type == "tool_use" or .type == "tool_result")
    | if .type == "tool_use" then (.input | tostring) else (.content | if type == "string" then . else tostring end) end' "$TRANSCRIPT" 2>/dev/null)"
  neg_reason=""
  if [ -z "$traffic" ]; then
    [ "$claim" = negative ] && [ "${calls:-0}" -lt 2 ] && neg_reason="it rests on ${calls:-0} tool call(s) since the last user prompt at ${since}Z; one miss is not absence"
  else
    unbound=""
    observed="$(printf '%s\n' "$window" | jq -r '.evidence[]? // empty' 2>/dev/null | sort -u)"
    while IFS= read -r line; do
      [ -n "$line" ] || continue
      keys="$(printf '%s' "$line" | grep -oE '`[^`]+`|[A-Za-z0-9_-]{2,}\.[A-Za-z]{1,5}|W[0-9]{2}-[0-9]+[a-z]?|Q-[0-9]+|#[0-9]+|[0-9a-f]{7,40}' | tr -d '`')"
      hit=""
      while IFS= read -r k; do
        [ -n "$k" ] && grep -qF -- "$k" <<<"$traffic" && { hit=1; break; }
      done <<<"$keys"
      # an evidence token a tool printed this turn (exit=1, N failed) binds the line too
      [ -n "$hit" ] || { [ -x "$TOKENIZER" ] && [ -n "$observed" ] \
        && [ -n "$(comm -12 <(printf '%s\n' "$observed") <(printf '%s' "$line" | bash "$TOKENIZER" | sort -u))" ] && hit=1; }
      # a line that names no subject keeps the old bar: corroborated by >= 2 tool calls
      [ -n "$hit" ] || { [ -z "$keys" ] && [ "${calls:-0}" -ge 2 ] && hit=1; }
      [ -n "$hit" ] || unbound="$unbound | $(printf '%s' "$line" | cut -c1-100)"
    done <<<"$negative_lines"
    [ -z "$unbound" ] || neg_reason="these lines name no subject a tool touched this turn:$unbound"
  fi
  [ -n "$neg_reason" ] && reason="${reason:+$reason }Negative claim (not done/stuck/failed/missing) fails the absence rule (judgment-rubrics §2): $neg_reason. Check that item now and name it (\`file\`, W-id, sha) in the line, or mark the line UNCONFIRMED and name the unchecked channel."
fi

reason="${reason:+$reason }$handback_reason"

# W35 retro F8: the gate had no stats file, so its hit rate was unmeasurable.
STATS_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/agent-hooks"; mkdir -p "$STATS_DIR"
jq -cn --arg ts "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" --arg claim "${claim:-handback}" --arg sid "${SESSION_ID:-}" --argjson blocked "$([ -n "$reason" ] && echo true || echo false)" \
  '{timestamp:$ts, claim:$claim, session:$sid, blocked:$blocked}' >> "$STATS_DIR/claim-evidence-stats.jsonl"
exit 0
