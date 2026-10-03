#!/usr/bin/env bash
# PreToolUse hook: host load gate before a new LOCAL worker (user ruling 2026-10-03).
# The per-session caps do not add up across CLIs and sessions; the machine does.
# One check, every parent CLI: Claude and Codex call it directly (Claude-shaped
# payload), Cursor via cursor-adapt.sh, agy via agy-adapt.sh. It gates only:
#   - a native subagent: tool_name Agent (Claude; Cursor preToolUse Task — the
#     cursor-agent CLI never fires subagentStart, live probe 2026-10-03),
#     collaborationspawn_agent (Codex v2; hook-visible, live probe 2026-10-03) or
#     invoke_subagent (agy; its PreToolUse deny, per agy 2026-10-03);
#   - a shell command that launches a local worker: agent-tmux <cli>
#     start|resume|assign, tmux-agent-fanout|dialogue|commander. start-ssh runs the
#     CLI remote and --dry-run launches nothing; both pass.
# A snapshot, not a count cap: parallel launches can pass together.
# Deny (exit 2): load1 or load5 > HOST_LOAD_DENY x cores (default 2; a 10-core host
# at load5 23 was unusable), memory pressure critical, or unreadable readings.
# Warn: load1 > HOST_LOAD_WARN x cores (default 1.5) or pressure warn; stdout
# additionalContext JSON (reaches the model on Claude, Codex, and Cursor via
# cursor-adapt's additional_context; agy has no such channel on PreToolUse).
# Both list the top CPU and memory processes for the user to choose from.
# HOST_LOAD_GATE=off disables it. HOST_LOAD_OFFLOAD_HOST names this host's ssh
# target for the offload hint. Non-macOS hosts pass with a notice.
set -u

IN="$(cat)"
command -v jq >/dev/null 2>&1 || { echo "host-load-gate: jq missing; not checked" >&2; exit 0; }
[ "${HOST_LOAD_GATE:-on}" = off ] && exit 0

tool="$(printf '%s' "$IN" | jq -r '.tool_name // empty')"
case "$tool" in
  Agent|collaborationspawn_agent|invoke_subagent) ;;
  Bash)
    cmd="$(printf '%s' "$IN" | jq -r '.tool_input.command // empty')"
    printf '%s' "$cmd" | grep -Eq -- '(^|[^[:alnum:]_-])(agent-tmux[[:space:]]+[^[:space:]]+[[:space:]]+(start|resume|assign)([[:space:]]|$)|tmux-agent-(fanout|dialogue|commander)([[:space:]]|$))' || exit 0
    printf '%s' "$cmd" | grep -Eq -- '--dry-run' && exit 0
    ;;
  *) exit 0 ;;
esac

if [ "$(uname)" != Darwin ]; then
  echo "host-load-gate: no load check on $(uname), macOS only; allowed" >&2; exit 0
fi
WARN=${HOST_LOAD_WARN:-1.5}; DENY=${HOST_LOAD_DENY:-2}
num='^[0-9]+(\.[0-9]+)?$'
ncpu=$(sysctl -n hw.ncpu) && avg=$(sysctl -n vm.loadavg) \
  && mp=$(sysctl -n kern.memorystatus_vm_pressure_level) || mp=
read -r _ l1 l5 _ <<<"${avg:-}"
if ! [[ ${ncpu:-} =~ $num && ${l1:-} =~ $num && ${l5:-} =~ $num && ${mp:-} =~ $num ]]; then
  echo "BLOCKED by host-load-gate: cannot read host load (ncpu='${ncpu:-}' loadavg='${avg:-}' pressure='${mp:-}'). Fix the gate, or set HOST_LOAD_GATE=off." >&2
  exit 2
fi
over() { awk -v a="$1" -v n="$ncpu" -v k="$2" 'BEGIN{exit !(a > n*k)}'; }
suspects() {  # top 5 by CPU + top 5 by memory (ps sorts numerically), deduped;
               # runtime is info only; credentials in arguments are masked
  { LC_ALL=C /bin/ps -ww -axo pid=,etime=,%cpu=,rss=,command= -r | head -5
    LC_ALL=C /bin/ps -ww -axo pid=,etime=,%cpu=,rss=,command= -m | head -5; } |
  awk '!seen[$1]++ {c=$5; for(i=6;i<=NF;i++) c=c" "$i
    printf "  pid %s  up %s  cpu %s%%  mem %dMB  %.160s\n",$1,$2,$3,$4/1024,c}' |
  perl -pe 's/((?:token|secret|password|passwd|api[_-]?key|auth)\S*?[=:\s])\S+/$1***/gi'
}
list=$(suspects 2>&1) && [ -n "$list" ] || list="  (suspect list unavailable: $list)"
state="load1 $l1, load5 $l5 on $ncpu cores, memory pressure level $mp"
offload="agent-tmux <cli> start-ssh <name> ${HOST_LOAD_OFFLOAD_HOST:-<ssh-target>} <remote-directory>"
advice="Top processes now (CPU top 5 + memory top 5; a load1 warn may reflect a short spike):
$list
Next, in this order:
1. Feed a live worker (tell / send-wait) instead of starting a new one.
2. Do it inline if the task is small.
3. Offload to a remote host: $offload
4. Show the list above to the user and ask which to stop; some are needed (simulators, a live browser). Never kill without approval; re-check PID and command first.
5. Retry once later, never in a loop."
if over "$l1" "$DENY" || over "$l5" "$DENY" || [ "$mp" -ge 4 ]; then
  printf 'BLOCKED by host-load-gate: %s (deny over %sx cores or pressure critical).\n%s\n' "$state" "$DENY" "$advice" >&2
  exit 2
fi
if over "$l1" "$WARN" || [ "$mp" -ge 2 ]; then
  jq -cn --arg m "host-load-gate: $state, over ${WARN}x cores or pressure warn. Prefer feeding a live worker.
$advice" '{hookSpecificOutput:{hookEventName:"PreToolUse",additionalContext:$m}}'
fi
exit 0
