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

reason=""
finish() {
  [ -z "$reason" ] || jq -n --arg r "$reason" '{decision: "block", reason: $r}'
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
  | grep -viE 'judgment-rubrics|claim-evidence-gate|Completion claim|Negative claim|done-claim|宣告|宣稱' )"
# W45-16 (retro L42): a conditional, future or wait clause names a claim word without asserting it
# (「等測試完成再上傳」, "after the tests pass, I will publish", "waiting for X to complete").
# One clause per line, then delete only the span from the marker to the claim word, so
# "Fixed after the retry" and 「…再上傳，W45-16 已完成」 still claim. English past tense after a
# marker ("After I fixed it, I pushed"), 「修好之後就…」, 「通過後，部署了」 and 「等了…完成」 (Chinese has no tense) stay claims: a missed
# false claim costs more than a false block. No CJK inside [...] (byte sets under LC_ALL=C).
COND_EN='(^|[^a-z])(if|once|when|after|before|until|unless|wait(ing)? (for|on))( [^ ]+){0,6} (pass(es|ing)?|done|complete|finish(es)?|green)([^a-z]|$)|(^|[^a-z])(will|going to|to)( be)? (done|fixed|verified|completed?|finish(ed)?|resolved|shipped|pass)([^a-z]|$)'
COND_ZH='^ *(等|待).{0,60}(完成|修好|修復|測好|驗證(完|過)|通過|搞定)|(若|如果|假如|要是|一旦).{0,60}(完成|修好|修復|測好|驗證(完|過)|通過|搞定)|(完成|修好|修復|測好|驗證(完|過)|通過|搞定) *((之後|以後|後)(才|再)|才(會|能))'
# A clause with a past or perfect marker is never a forecast (「等到測試完成了」, 「若干任務已完成」,
# "before lunch the patch was done", "after I fixed it tests went green"): it keeps its claim words.
PAST='(^|[^a-z])(was|were|went|got|had|did|already)([^a-z]|$)|已|了'
# Known limit (Sol R7-01/R8-01): a forward word does not cancel a past marker, since
# "the patch was done and I will deploy" is a real claim. So conditionals with a past marker
# still block: 「如果測試已通過就上傳」, 「等測試完成了再上傳」, "If the task were done, I would deploy".
# W46-16: a requirement, plan or forecast names a claim word without asserting it (「修正後要通過」,
# 「順序是：修好、部署」, 「就會失敗」, "acceptance: tests pass"). Delete the span from the marker to the word.
# 要/會 also sit inside 主要/重要/會議: mask those words first, so 「重要的測試都通過」 still claims (L2).
# 需要/必要/只要 stay unmasked when they open a requirement or a condition (「修正後需要通過 CI」, 「只要測試通過就上傳」);
# 需要/必要 before a 的 phrase is a modifier (「需要改的三個檔案都完成」 claims), so that form is masked.
COMPOUND='主要|重要|會議'
PLAN='(要|會|將|下一步|驗收|順序是|acceptance:?|next step:?).{0,60}(完成|修好|修復|測好|驗證(完|過)|通過|搞定|失敗|done|fixed|verified|completed?|pass(es|ed)?|failed)'
# Both outcomes named together claim neither: 「通過與否」, 「通過／失敗的結果」, "pass/fail".
PAIR='(通過|pass(ed)?) *(與否|(／|/) *(失敗|fail(ed)?))'
# 「上一輪還沒跑完，下一輪就直接跳過」 states a rule, not a state: 還沒 in a clause whose next clause says 就會/就直接.
RULE='(還沒|尚未)(.{0,30}，.{0,15}就(會|直接))'
unasserted() { # text on stdin → one clause per line, with the spans that assert nothing removed
  tr 'A-Z' 'a-z' | sed -E "s#$PAIR##g; s/$RULE/\\2/g" | sed -E 's/(，|。|；|！|？|→|[,;!?]|\.( |$))/\
/g' | while IFS= read -r c || [ -n "$c" ]; do
    if printf '%s' "$c" | grep -Eq "$PAST"; then printf '%s\n' "$c"
    else printf '%s\n' "$c" | sed -E "s/($COMPOUND)/_/g; s/(需要|必要)(.{0,18}的)/_\\2/g; s/$COND_EN//g; s/$COND_ZH//g; s/$PLAN//g"; fi
  done
}
# W46-16: a label exempts its own line only, as the negative rule does (W43-18). A whole-reply
# exemption let 「兩邊都完成了」 pass because another line said 「還沒處理的事」.
EXEMPT_RE='unverified|UNCONFIRMED|attempted|not observed|not (yet )?(done|fixed|verified)|未驗證|未觀測|尚未|還沒|未完成'
claim_text="$(printf '%s\n' "$speech" | grep -Eiv "$EXEMPT_RE" | unasserted)"

claim=""
# Under LC_ALL=C grep is byte-wise: never put ?/*/+ right after a CJK char (it binds to its last byte); group it.
case "$title" in ✅*) claim="positive";; esac
if [ -z "$claim" ] && printf '%s' "$claim_text" | grep -Eqi '(^|[^a-z])(done|fixed|verified|shipped|completed?|resolved|all green|tests? pass(ed|ing)?)([^a-z]|$)|(完成|修好|修復|測好|驗證(完|過)|通過|搞定)|✅|VERDICT: *PASS'; then
  claim="positive"
fi
# Negative lines: a label exempts its own line only (W43-18: one 「還沒」 let a reply list "not done"
# items it never checked). 「我還沒看過截圖」 states what was not observed (W46-16), so it is a label.
LABEL_RE='unverified|UNCONFIRMED|attempted|not observed|not checked|未驗證|未觀測|未查|沒(有)?查|不確定|還沒看|沒(有)?看過'
# A "not done" state is a negative claim too (W43-18): 還沒/尚未/未完成 assert what is not there.
# Absence claims (no X clause, no X anywhere, 找不到, 沒有…條款) are negative claims too; bare found/match stay out (review summaries).
NEG_RE='(^|[^a-z])(stuck|failed|missing|not implemented|not (yet )?(done|fixed|started)|no (reply|response)|never (reported|responded)|hung|dead|no ([a-z0-9_-]+ ){1,4}(clause|mention)|no [^,.!?;]{1,40} anywhere)([^a-z]|$)|卡住|受阻|失敗|缺少|不存在|尚未|還沒|未完成|未開始|沒(有)?回(覆|應)|掛了|找不到|沒有.{0,12}(條款|規定|紀錄)'
# Kept raw (code spans intact): a line's `code`, file, W-id or sha is the subject it must be bound to.
negative_lines="$(printf '%s' "$last" | sed -E '/^```/,/^```/d' \
  | grep -viE 'judgment-rubrics|claim-evidence-gate|Completion claim|Negative claim|done-claim|宣告|宣稱' | grep -Eiv "$LABEL_RE" \
  | while IFS= read -r l; do printf '%s\n' "$l" | sed -E 's/`[^`]*`//g; s/「[^」]*」//g' | unasserted | grep -Eqi "$NEG_RE" && printf '%s\n' "$l"; done)"
[ -n "$claim" ] || [ -z "$negative_lines" ] || claim="negative"
# W44-7: hand-backs checked against this turn's tool calls — a reload the agent can run itself,
# and a page called live with no render check (artifacts-rules §Quality, screenshot evidence).
# Bind a request to the owner, not a quoted instruction or a historical command.
reload_ask="$(printf '%s' "$last" | sed -E '/^```/,/^```/d; /^>/d; s/「[^」]*」//g' | grep -viE 'judgment-rubrics|claim-evidence-gate' \
  | grep -Ei '/reload-plugins|重新載入 *plugin' | grep -Eqi '請|(^|[ ，。])要[ /]|(^|[.!?] *)(run|execute|you (must|need to)) |(^|[^a-z])please([^a-z]|$)' && echo 1)"
# A page claim: live/published after a page noun, "it is/went live", "published it", live before an artifact URL, 已上線/已發布.
live_say="$(printf '%s' "$speech" | grep -Eqi '(^|[^a-z])(page|artifact|dashboard)( is| went| has gone| has been| is now|:) (now )?(live|published)|(^|[^a-z])it(.s| is| went| has gone| has been| is now) (now )?(live|published)|(^|[^a-z])(published|deployed)( it| the page| the artifact| and live)|(live|published)[^a-z]{0,4}(at |:)? *https://claude\.ai/artifact|已上線|上線了|已發布|(頁面|網頁|儀表板|頁).{0,15}(上線|發布)' && echo 1)"
# W46-15: a reply that ends by handing a decision to the owner needs a consensus-ladder call this turn
# (judgment-rubrics §3). Read the last 3 non-empty lines, outside code and 「」 quotes, without the ✈ line.
# An ask is allowed when the last 3 lines name a hard-stop item or a kernel 4.47.0 final-round item
# (maintenance §1 approval: kernel, skills, settings; another host; a never-recorded preference).
ASK_RE='要不要|要我.{0,40}嗎|你選|你決定|請決定|還是.{0,40}(？|\?)|(^|[^a-z])(shall i|should i|do you want me to|which (one|option) do you prefer)([^a-z]|$)'
HARDSTOP_RE='delete|刪除|payment|付款|credential|憑證|密碼|(api|access|auth) token|secret|production|正式環境|protected branch|force push|irreversible|不可逆|your (device|hands)|你的裝置|你親自|maintenance §1|kernel|CLAUDE\.md|AGENTS\.md|SKILL\.md|skills/|settings\.json|fleet|other hosts?|其他主機|偏好|預算|budget|最終確認|final confirmation'
tail3="$(printf '%s\n' "$last" | sed -E '/^```/,/^```/d; s/「[^」]*」//g' | grep -viE 'judgment-rubrics|claim-evidence-gate' \
  | grep -vE '^[[:space:]]*(✈[[:space:]]*)?$' | tail -n 3)"
ask_back=""
printf '%s' "$tail3" | grep -Eqi "$HARDSTOP_RE" \
  || ask_back="$(printf '%s\n' "$tail3" | sed -E 's/`[^`]*`//g; s/(沒有?要|不用|不需要|無須|無需)你(來)?(決定|選)//g' | grep -Ei "$ASK_RE" | head -1 | cut -c1-100)"
# W46-18: a resume recap marks a session read with one line shape (session-handoff RESUME):
#   - <sid8> full · COUNT <n> · TOOLS <n> · pack <dir>
recap_full="$(printf '%s\n' "$last" | grep -E '^- [0-9a-f]{8} full · COUNT [0-9]+ · TOOLS [0-9]+ · pack [^ ]+$')"
[ -n "$claim" ] || [ -n "$reload_ask$live_say$ask_back$recap_full" ] || exit 0

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
if [ -n "$reload_ask$live_say$ask_back" ] && grep -q '"type":"assistant"' "$TRANSCRIPT"; then
  # advisor is a server_tool_use row, not a tool_use row
  uses="$(jq -r --arg s "$since" 'select((.timestamp // "")[0:19] >= $s) | .message.content? | arrays | .[]
    | select(.type == "tool_use" or .type == "server_tool_use") | "\(.name) \(.input | tostring)"' "$TRANSCRIPT" 2>/dev/null)"
  [ -n "$ask_back" ] && ! grep -qE '^(advisor|Agent|AskUserQuestion|mcp__tmux-agent__(assign|tell)) ' <<<"$uses" \
    && handback_reason="${handback_reason:+$handback_reason }Decision handed to the owner without a consensus call: the reply ends with an ask (${ask_back}), but this turn made no advisor, Agent, tmux-agent assign/tell or AskUserQuestion call (judgment-rubrics §3; maintenance §1 for gates). Run advisor or a reviewer and act on its answer, or say which hard-stop item needs the owner."
  [ -n "$reload_ask" ] && ! grep -q '^mcp__tmux-agent__reload ' <<<"$uses" \
    && handback_reason="${handback_reason:+$handback_reason }Hand-back without own try: the reply asks the user to reload plugins, but this turn made no mcp__tmux-agent__reload call. Call mcp__tmux-agent__reload first; hand back only if it reports the old version."
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
  [ -n "$reason" ] && reason="Completion claim fails judgment-rubrics §2: $reason. Run the verification and quote its output verbatim, or put \"attempted, unverified\" on the claim line itself (a label exempts only its own line; title ⏳)."
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
    sloppy=""
    uses_in="$(jq -r --arg s "$since" 'select((.timestamp // "")[0:19] >= $s) | .message.content? | arrays | .[]
      | select(.type == "tool_use" and .name == "Bash") | .input.command // empty' "$TRANSCRIPT" 2>/dev/null)"
    observed="$(printf '%s\n' "$window" | jq -r '.evidence[]? // empty' 2>/dev/null | sort -u)"
    while IFS= read -r line; do
      [ -n "$line" ] || continue
      keys="$(printf '%s' "$line" | grep -oE '`[^`]+`|[A-Za-z0-9_-]{2,}\.[A-Za-z]{1,5}|W[0-9]{2}-[0-9]+[a-z]?|Q-[0-9]+|#[0-9]+|[0-9a-f]{7,40}' | tr -d '`')"
      hit=""
      partial_only=""
      while IFS= read -r k; do
        [ -n "$k" ] || continue
        if grep -qF -- "$k" <<<"$traffic"; then
          if [ -n "$uses_in" ] && grep -F -- "$k" <<<"$uses_in" | grep -qE '(^|[|;&"'"'"'[:space:]])(head|tail|sed -n)[[:space:]]|rg[[:space:]]+[^;|&]*-E[[:space:]]' \
             && ! grep -F -- "$k" <<<"$uses_in" | grep -qvE '(^|[|;&"'"'"'[:space:]])(head|tail|sed -n)[[:space:]]|rg[[:space:]]+[^;|&]*-E[[:space:]]'; then
            partial_only="$k"
          else
            hit=1; break
          fi
        fi
      done <<<"$keys"
      if [ -n "$partial_only" ] && [ -z "$hit" ]; then
        sloppy="$sloppy | $(printf '%s' "$line" | cut -c1-100) (only touched via partial read or rg -E on $partial_only)"
        continue
      fi
      if printf '%s' "$line" | grep -Eqi '(^|[^a-z])anywhere([^a-z]|$)|任何地方|整個 *repo|全域' && [ "${calls:-0}" -lt 2 ]; then
        sloppy="$sloppy | $(printf '%s' "$line" | cut -c1-100) ('anywhere' absence claim rests on ${calls:-0} tool call)"
        continue
      fi
      # an evidence token a tool printed this turn (exit=1, N failed) binds the line too
      [ -n "$hit" ] || { [ -x "$TOKENIZER" ] && [ -n "$observed" ] \
        && [ -n "$(comm -12 <(printf '%s\n' "$observed") <(printf '%s' "$line" | bash "$TOKENIZER" | sort -u))" ] && hit=1; }
      # a line that names no subject keeps the old bar: corroborated by >= 2 tool calls
      [ -n "$hit" ] || { [ -z "$keys" ] && [ "${calls:-0}" -ge 2 ] && hit=1; }
      [ -n "$hit" ] || unbound="$unbound | $(printf '%s' "$line" | cut -c1-100)"
    done <<<"$negative_lines"
    [ -z "$unbound" ] || neg_reason="these lines name no subject a tool touched this turn:$unbound"
    [ -z "$sloppy" ] || neg_reason="${neg_reason:+$neg_reason; }sloppy or partial search cannot prove absence:$sloppy"
  fi
  [ -n "$neg_reason" ] && reason="${reason:+$reason }Negative claim (not done/stuck/failed/missing) fails the absence rule (judgment-rubrics §2): $neg_reason. Check that item now and name it (\`file\`, W-id, sha) in the line, or mark the line UNCONFIRMED and name the unchecked channel."
fi

recap_reason=""
# W46-18: a `full` recap line is bound to what tools PRINTED, never to what a tool input names.
# `resume_pack.py` prints a summary line per pack, and `resume_pack.py --read FILE --page N` prints
# a page followed by `READ <abs path> page N/T lines A-B body=<page sha> sha256=<file sha>`. Three checks, no more:
# (a) the summary line for <pack>/<sid8> with the same COUNT/TOOLS; (b) every page of user.txt;
# (c) every page of footprints.txt; timeline.md with a light on every node, every failed call named in a lit or dark node, and
# each `lit` node bound to an observation: a T<n> whose call block `resume_pack.py --call` printed (a receipt of a past
# event, its body equal to those slice lines on disk), or a backticked string of 8+ characters that a live check printed
# after the resume prompt and that no tool input after it contains (echo, heredoc, a written file read back). Outputs of
# pack reads and of commands naming pack files or timeline.md are not live checks: the old account proves nothing.
# Tripwire, not a security boundary: an agent that splits a string across a computed print still gets past it.
# A stamp counts only with its page's lines above it (`| tail -1` keeps the stamp, not the body) and
# a sha equal to the file on disk. The window is the transcript rows after the last human
# `/session-handoff resume` prompt (the flow spans turns); rows, not timestamps. Claude and Codex.
if [ -n "$recap_full" ]; then
  rrow="$(jq -rR 'input_line_number as $n | (fromjson? // {}) as $r
    | (if $r.type == "user" and $r.isMeta != true and (($r.origin.kind // "human") == "human")
         then ($r.message.content | if type == "string" then . else (map(.text? // empty) | join(" ")) end)
       elif $r.type == "response_item" and $r.payload.type == "message" and $r.payload.role == "user"
         then ([$r.payload.content[]? | .text? // empty] | join(" "))
       else empty end)
    | select(test("^\\s*/session-handoff resume|<command-name>/?session-handoff</command-name>\\s*<command-args>\\s*resume")) | $n' "$TRANSCRIPT" 2>/dev/null | tail -1)"
  # Tool output only (Claude tool_result, Codex *_output), one JSON string per result.
  outs="$(tail -n "+${rrow:-1}" "$TRANSCRIPT" | jq -cR 'fromjson? // {} | (.message.content? | arrays | .[] | select(.type == "tool_result") | .content
      | if type == "string" then . else (map(.text? // empty) | join("\n")) end),
    (select(.type == "response_item" and ((.payload.type // "") | endswith("_output"))) | .payload.output
      | if type == "string" then ((fromjson? | .output? // empty | strings) // .)
        elif type == "array" then (map(.text? // empty) | join("\n")) else tostring end)' 2>/dev/null)"
  # Each stamp with the exact lines printed above it: its page length, base64 of that body.
  cand="$(printf '%s\n' "$outs" | jq -r 'strings | split("\n") as $l
    | reduce range(0; $l | length) as $i ({prev: -1, out: []};
        if ($l[$i] | test("^READ /")) then .out += [{s: $l[$i], from: (.prev + 1), to: $i}] | .prev = $i else . end)
    | .out[] | . as $o | (.s | capture("^READ (?<p>/\\S+) page (?<n>[0-9]+)/(?<t>[0-9]+) lines (?<a>[0-9]+)-(?<b>[0-9]+) body=(?<d>[0-9a-f]{64}) sha256=(?<h>[0-9a-f]{64})$")?) as $m
    | select($m != null) | (($m.b | tonumber) - ($m.a | tonumber) + 1) as $k | select($o.to - $o.from >= $k)
    | [$m.p, $m.n, $m.t, $m.h, $m.d, ($l[($o.to - $k):$o.to] | join("\n") | @base64)] | @tsv' 2>/dev/null)"
  # path TAB page TAB total TAB sha TAB body sha, for stamps whose body= matches the lines above them
  stamps="$(while IFS=$'\t' read -r p n t h d b; do
      [ -n "$p" ] || continue
      [ "$(printf '%s' "$b" | base64 -d 2>/dev/null | { sha256sum 2>/dev/null || openssl dgst -sha256 -r 2>/dev/null; } | cut -d' ' -f1)" = "$d" ] \
        && printf '%s\t%s\t%s\t%s\t%s\n' "$p" "$n" "$t" "$h" "$d"
    done <<<"$cand" | sort -u)"
  # Live checks: {c: command, o: output} after the resume prompt, minus pack reads and commands on pack files.
  # ins: {n: row, s: input} for every tool input after the prompt except timeline.md writes. A quote counts only when
  # some live output shows it before any input contains it: typed first, then printed, is not an observation.
  pk_re='timeline\.md|footprints\.txt|user\.txt|tools\.txt|manifest\.json|slices/|resume_pack'
  live="$(tail -n "+${rrow:-1}" "$TRANSCRIPT" | jq -sc --arg re "$pk_re" '
      def cmd: (.input // (.arguments? | strings | (fromjson? // .)) // "") | tostring;
      ([ .[] | (.message.content? | arrays | .[] | select(.type == "tool_use") | {key: .id, value: cmd}),
              (select(.type == "response_item" and .payload.type == "function_call") | .payload | {key: .call_id, value: cmd}) ]
       | map(select(.key != null)) | from_entries) as $cmds
      | range(length) as $n | .[$n] | ((.message.content? | arrays | .[] | select(.type == "tool_result") | {id: .tool_use_id, o: (.content
                | if type == "string" then . else (map(.text? // empty) | join("\n")) end)}),
               (select(.type == "response_item" and ((.payload.type // "") | endswith("_output"))) | {id: .payload.call_id, o: (.payload.output
                | if type == "string" then ((fromjson? | .output? // empty | strings) // .) elif type == "array" then (map(.text? // empty) | join("\n")) else tostring end)}))
      | {n: $n, c: ($cmds[.id // ""] // ""), o} | select(.o | strings | test("(^|\\n)(READ|CALL-READ) /") | not)
      | select(.c | test($re) | not)' 2>/dev/null)"
  ins="$(tail -n "+${rrow:-1}" "$TRANSCRIPT" | jq -sc 'range(length) as $n | .[$n]
      | ((.message.content? | arrays | .[] | select(.type == "tool_use") | .input | tostring),
         (select(.type == "response_item" and ((.payload.type // "") | test("call$"))) | .payload | (.arguments // .input // "") | tostring))
      | select(test("timeline\\.md") | not) | {n: $n, s: .}' 2>/dev/null)"
  # CALL-READ stamps whose body= matches the lines printed above them: session dir TAB T<n>
  callstamps="$(printf '%s\n' "$outs" | jq -r 'strings | split("\n") as $l
    | reduce range(0; $l | length) as $i ({prev: -1, out: []};
        if ($l[$i] | test("^CALL-READ /")) then .out += [{s: $l[$i], from: (.prev + 1), to: $i}] | .prev = $i else . end)
    | .out[] | . as $o | (.s | capture("^CALL-READ (?<p>/\\S+) (?<t>T[0-9]+) (?<f>S[0-9]+):(?<a>[0-9]+)-(?<b>[0-9]+) body=(?<d>[0-9a-f]{64}) sha256=[0-9a-f]{64}$")?) as $m
    | select($m != null) | (($m.b | tonumber) - ($m.a | tonumber) + 1) as $k | select($o.to - $o.from >= $k)
    | [$m.p, $m.t, $m.f, $m.a, $m.b, ($l[($o.to - $k):$o.to] | join("\n") | @base64)] | @tsv' 2>/dev/null \
    | while IFS=$'\t' read -r p t f a z b; do
        # The printed body must equal lines a..z of the slice on disk, and the manifest must put T<n> at line a.
        [ "$(jq -r --argjson n "$((10#${t#T}))" '.calls[$n - 1] // empty' "$p/manifest.json" 2>/dev/null)" = "$f:$a" ] || continue
        [ "$(printf '%s' "$b" | base64 -d 2>/dev/null)" = "$(sed -n "${a},${z}p" "$p/slices/$f.txt" 2>/dev/null)" ] \
          && printf '%s\t%s\n' "$p" "$t"
      done | sort -u)"
  read_whole() { # $1 file: every page 1..T of the file on disk, each stamped with its real page sha
    local want
    # shortcut: repeats resume_pack.py pages_of (4000-char pieces, 16 KiB pages); a change there must change this too.
    want="$(/usr/bin/python3 - "$1" 2>/dev/null <<'EOF'
import hashlib, sys
raw = open(sys.argv[1], "rb").read()
pages, page, size = [], [], 0
for whole in raw.decode("utf-8").splitlines():
    for i in range(0, max(len(whole), 1), 4000):
        piece = whole[i:i + 4000]
        n = len(piece.encode("utf-8")) + 1
        if page and size + n > 16 * 1024:
            pages.append(page)
            page, size = [], 0
        page.append(piece)
        size += n
pages = pages + [page] if page else pages or [[]]
file_sha = hashlib.sha256(raw).hexdigest()
for k, p in enumerate(pages, 1):
    print(k, len(pages), file_sha, hashlib.sha256("\n".join(p).encode("utf-8")).hexdigest(), sep="\t")
EOF
)" || return 1
    [ -n "$want" ] && [ -z "$(comm -23 <(printf '%s\n' "$want" | sort) \
      <(awk -F'\t' -v p="$1" '$1 == p { print $2 "\t" $3 "\t" $4 "\t" $5 }' <<<"$stamps" | sort -u))" ]
  }
  while IFS= read -r line; do
    sid="$(printf '%s' "$line" | cut -d' ' -f2)"
    count="$(printf '%s' "$line" | sed -E 's/.*COUNT ([0-9]+).*/\1/')"
    tools="$(printf '%s' "$line" | sed -E 's/.*TOOLS ([0-9]+).*/\1/')"
    pack="$(printf '%s' "$line" | sed -E 's/.* pack ([^ ]+)$/\1/')"; pack="${pack/#\~/$HOME}"
    pack="$(cd "$pack" 2>/dev/null && pwd -P)"
    miss=""
    if [ -z "$pack" ] || [ ! -f "$pack/$sid/manifest.json" ]; then
      miss=" no manifest.json for $sid under the named pack;"
    else
      printf '%s\n' "$outs" | jq -r 'strings' 2>/dev/null \
        | grep -xF "$sid COUNT $count TOOLS $tools slices $(jq -r '.slices | length' "$pack/$sid/manifest.json") groups $(jq -r '.scout_groups | length' "$pack/$sid/manifest.json") -> $pack/$sid" >/dev/null \
        || miss="$miss no resume_pack.py summary for $pack/$sid with COUNT $count TOOLS $tools;"
      read_whole "$pack/$sid/user.txt" || miss="$miss $sid/user.txt not read in full with resume_pack.py --read;"
      read_whole "$pack/$sid/footprints.txt" || miss="$miss $sid/footprints.txt not read in full with resume_pack.py --read;"
      # timeline.md: one `- ` line per node, each with a light (lit/dim/dark); a lit node is bound to an
      # observation (see the header above); every failed call footprints.txt lists is named (T<n>) in some node.
      tl="$pack/$sid/timeline.md"
      if [ ! -f "$tl" ]; then
        miss="$miss $sid/timeline.md missing (account, evidence and light per node);"
      else
        nodes="$(grep -E '^[[:space:]]*[-*] ' "$tl")"
        [ -n "$nodes" ] || miss="$miss $sid/timeline.md has no node lines;"
        # The light is its own last field (` · lit`), never a word inside asked/said/evidence.
        light_re='·[[:space:]]*(lit|dim|dark)[[:space:]]*$'
        bare="$(printf '%s\n' "$nodes" | grep -viE "$light_re" | grep -v '^$' | head -1)"
        [ -z "$bare" ] || miss="$miss timeline node not ending in \` · lit|dim|dark\`: ${bare:0:60};"
        while IFS= read -r node; do
          [ -n "$node" ] || continue
          bound=""
          for t in $(printf '%s' "$node" | grep -oE '\bT[0-9]{1,}\b' | sort -u); do
            n=$((10#${t#T})); printf '%s\n' "$callstamps" | grep -qxF "$pack/$sid"$'\t'"$(printf 'T%04d' "$n")" && { bound=1; break; }
          done
          if [ -z "$bound" ]; then
            while IFS= read -r q; do
              [ "${#q}" -ge 8 ] || continue
              mo="$(printf '%s\n' "$live" | jq -sr --arg q "$q" --arg pk "$pack" '[.[] | select((.o | index($q)) and (.c | index($pk) | not)) | .n] | min // empty' 2>/dev/null)"
              mi="$(printf '%s\n' "$ins" | jq -sr --arg q "$q" '[.[] | select(.s | index($q)) | .n] | min // empty' 2>/dev/null)"
              [ -n "$mo" ] && { [ -z "$mi" ] || [ "$mo" -lt "$mi" ]; } && { bound=1; break; }
            done < <(printf '%s' "$node" | grep -oE '`[^`]+`' | sed -E 's/^`|`$//g')
          fi
          [ -n "$bound" ] || miss="$miss lit node has no observation: no printed --call T<n> and no backticked output (8+ chars) of a live check after the resume prompt that no tool input typed: ${node:0:60};"
        done < <(printf '%s\n' "$nodes" | grep -iE '·[[:space:]]*lit[[:space:]]*$')
        for t in $(grep -E '^  T[0-9]{4,} S[0-9]{2,}:[0-9]+ L[0-9]+ fail ' "$pack/$sid/footprints.txt" 2>/dev/null | awk '{ print $1 }'); do
          # A failure is opened, not skimmed: its node is lit (evidence read) or dark (read, unresolved), never dim.
          printf '%s\n' "$nodes" | grep -viE '·[[:space:]]*dim[[:space:]]*$' | grep -qw "$t" || miss="$miss failed call $t (footprints.txt) is in no lit or dark timeline node;"
        done
      fi
    fi
    [ -z "$miss" ] || recap_reason="$recap_reason $sid:$miss"
  done <<<"$recap_full"
  [ -z "$recap_reason" ] || recap_reason="Resume recap marks a session full without the reads behind it (session-handoff RESUME, W46-18):$recap_reason Read what is missing, or mark the line \`- <sid8> partial (<what is missing>)\`."
fi

reason="${reason:+$reason }$handback_reason${recap_reason:+ $recap_reason}"

# W35 retro F8: the gate had no stats file, so its hit rate was unmeasurable.
STATS_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/agent-hooks"; mkdir -p "$STATS_DIR"
jq -cn --arg ts "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" --arg claim "${claim:-handback}" --arg sid "${SESSION_ID:-}" --argjson blocked "$([ -n "$reason" ] && echo true || echo false)" \
  '{timestamp:$ts, claim:$claim, session:$sid, blocked:$blocked}' >> "$STATS_DIR/claim-evidence-stats.jsonl"
exit 0
