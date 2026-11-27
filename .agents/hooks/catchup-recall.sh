#!/usr/bin/env bash
# catchup-recall.sh <mode>: after a compaction, name the catchup.md this session read before it.
# A catch-up child writes <run-dir>/catchup.md and returns its path; the main thread Reads it whole.
# The compaction summary drops file text, so the main thread must be told to Read the file again.
#
# Detection, the same on every CLI: the last absolute path ending in /catchup.md in the session's
# own log, and only if that file exists. Tool-output rows are skipped: a report that only mentions
# another run's catchup.md is not a read (2026-11-27, session 5971a435: row 2528, a Read result,
# named e2e/agy-flash/catchup.md; the session had Read trial/catchup.md).
#
#   line [log]          Claude Code (compaction-recall.sh) and Codex (SessionStart "compact"):
#                       print the pointer line or nothing; no log argument = stdin transcript_path.
#   grok-postcompact    grok: SessionStart never fires on compaction and PostCompact output is
#                       dropped (~/.grok/docs/user-guide/10-hooks.md:98,111), so keep the line.
#   grok-pretooluse     grok: give the kept line once as hookSpecificOutput.additionalContext.
#   agy-preinvocation   agy has no compaction hook; it writes a CHECKPOINT row ("# Resuming from
#                       a compaction") to its transcript. Inject the line once per new CHECKPOINT.
set -u
STATE="$HOME/.local/state/catchup-recall"

# shortcut: a path with a space or a non-ASCII byte is not matched; widen the class if run dirs get one.
pointer() {
  [ -n "${1:-}" ] && [ -f "$1" ] || return 0
  local p="" c
  # Tool output rows: Claude tool_result; Codex *_call_output, item_completed, exec_command_end;
  # grok tool_call_update; agy GENERIC. A \n, \t or \r escape can sit right before a JSON path.
  # The last path that exists wins: a shell snippet such as '$R'/.workflow/…/catchup.md yields a
  # bogus /.workflow/… path after the real read (2026-11-27, session 5971a435).
  while IFS= read -r c; do [ -f "$c" ] && p="$c"; done < <(
    grep -vE '"type":"(tool_result|function_call_output|custom_tool_call_output|item_completed|exec_command_end|GENERIC)"|"sessionUpdate":"tool_call_update"' "$1" \
    | grep -oE '(^|[^A-Za-z0-9._@+~-]|\\[nrt])(/[A-Za-z0-9._@+-]+)+/catchup\.md([^A-Za-z0-9._@+~/-]|$)' \
    | sed -E 's|^[^/]*||; s|^/+|/|; s|(/catchup\.md).*$|\1|')
  [ -n "$p" ] || return 0
  # Not "${p/#$HOME/\~}": inside double quotes bash 3.2 keeps the backslash.
  [ "${p#"$HOME"/}" = "$p" ] || p="~/${p#"$HOME"/}"
  printf 'Catch-up read before this compaction: %s — Read it whole before the next decision.\n' "$p"
}

case "${1:-}" in
line)
  log="${2:-}"
  [ -n "$log" ] || log="$(jq -r '.transcript_path // empty' 2>/dev/null)"
  pointer "$log"
  ;;
grok-postcompact)
  in="$(cat)"
  sid="${GROK_SESSION_ID:-$(jq -r '.sessionId // .session_id // empty' <<<"$in" 2>/dev/null)}"
  [ -n "$sid" ] || exit 0
  log="$(jq -r '.transcript_path // .transcriptPath // empty' <<<"$in" 2>/dev/null)"
  # A daemon-run session sends no transcript_path (25-status-line.md:61); its log is still on disk.
  [ -f "$log" ] || log="$(ls "$HOME"/.grok/sessions/*/"$sid"/updates.jsonl 2>/dev/null | head -n 1)"
  line="$(pointer "$log")"
  mkdir -p "$STATE"
  if [ -n "$line" ]; then printf '%s\n' "$line" > "$STATE/grok-$sid"; else rm -f "$STATE/grok-$sid"; fi
  ;;
grok-pretooluse)
  # Runs on every tool call: no jq until a kept line exists.
  in="$(cat)"
  sid="${GROK_SESSION_ID:-}"
  [ -n "$sid" ] || sid="$(jq -r '.sessionId // .session_id // empty' <<<"$in" 2>/dev/null)"
  f="$STATE/grok-$sid"
  [ -n "$sid" ] && [ -f "$f" ] || exit 0
  # mv claims the line, so two parallel tool calls cannot both print it.
  mv "$f" "$f.$$" 2>/dev/null || exit 0
  line="$(cat "$f.$$")"; rm -f "$f.$$"
  # grok drops additionalContext beside a deny; allow here only means "not blocked" (10-hooks.md:155,466).
  jq -cn --arg c "$line" '{hookSpecificOutput:{hookEventName:"PreToolUse", permissionDecision:"allow", additionalContext:$c}}'
  ;;
agy-preinvocation)
  # agy rejects a reply that is not JSON, so every path prints an object.
  in="$(cat)"
  log="$(jq -r '.transcriptPath // empty' <<<"$in" 2>/dev/null)"
  cid="$(jq -r '.conversationId // empty' <<<"$in" 2>/dev/null)"
  last="$(grep '"type":"CHECKPOINT"' "$log" 2>/dev/null | tail -n 1 | jq -r '.step_index // empty' 2>/dev/null)"
  f="$STATE/agy-$cid"
  if [ -z "$cid" ] || [ -z "$last" ] || [ "$(cat "$f" 2>/dev/null)" = "$last" ]; then echo '{}'; exit 0; fi
  mkdir -p "$STATE"; printf '%s\n' "$last" > "$f"
  line="$(pointer "$log")"
  if [ -z "$line" ]; then echo '{}'; exit 0; fi
  jq -cn --arg c "$line" '{injectSteps:[{systemMessage:{systemMessage:$c}}]}'
  ;;
*) echo "usage: catchup-recall.sh line [log] | grok-postcompact | grok-pretooluse | agy-preinvocation" >&2; exit 2 ;;
esac
exit 0
