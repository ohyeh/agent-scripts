#!/usr/bin/env bash
# PreToolUse hook: host load gate before a new LOCAL worker (user ruling 2026-10-03).
# The per-session caps do not add up across CLIs and sessions; the machine does.
# One check, every parent CLI: Claude and Codex call it directly (Claude-shaped
# payload), Cursor via cursor-adapt.sh, agy via agy-adapt.sh. It gates only:
#   - a native subagent: tool_name Agent (Claude; Cursor preToolUse Task — the
#     cursor-agent CLI never fires subagentStart, live probe 2026-10-03),
#     collaborationspawn_agent (Codex v2; hook-visible, live probe 2026-10-03) or
#     invoke_subagent (agy; its PreToolUse deny, per agy 2026-10-03);
#   - a mod assign (hc first, then tmux), or a shell command: agent-tmux <cli>
#     start|resume|assign, tmux-agent-fanout|dialogue|commander, or hc run of an
#     agent CLI (a hand start). Each command of the line is judged alone by its
#     command word (past VAR=x, if/then/do, env/nohup/exec, into sh -c and eval);
#     quoted text and another command's arguments never count. start-ssh and an hc
#     --on before the program run the CLI remote, --dry-run on an agent-tmux command
#     launches nothing, and an agent with --help or --version only prints; they pass.
#     Settings hooks never fire for mod tools, so the mod reaches this gate through
#     review-dispatch-gate.sh.
# The worker cap is a snapshot: parallel launches can pass together.
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

# Prints launch or pass for a shell line, nothing when it cannot be split (an unbalanced quote, such
# as an apostrophe in a heredoc body). /usr/bin/python3, not PATH: see cursor-adapt.sh:33.
# shortcut: hc run <template> "task" is not counted (its agent is named in the template file), and a
# heredoc body counts as commands; read ~/.config/herdr-core/templates once templates are in use.
launch_verdict() { /usr/bin/python3 - "$1" 2>/dev/null <<'PY'
import os, shlex, sys
AGENTS = {'claude', 'codex', 'grok', 'agy', 'gemini', 'cursor-agent'}
HELP = {'-h', '--help', '--version'}
HC_VALUE = {'--name', '--cwd', '--on', '--label', '--parent', '--timeout'}  # hc run --help (0.1.22)
SKIP = {'if', 'then', 'else', 'elif', 'while', 'until', 'do', '{', '!', 'time', 'env', 'nohup', 'exec', 'command'}
SEP = set(';&|()\n')

def segments(line):
    lex = shlex.shlex(line.replace('\\\n', ''), posix=True, punctuation_chars=';&|()<>\n')
    lex.whitespace, lex.whitespace_split, lex.commenters = ' \t\r', True, ''
    seg, toks = [], iter(lex)
    for t in toks:
        if not t or not set(t) <= SEP | {'<', '>'}:  # '' is an empty quoted word
            seg.append(t)
        elif '<' in t or '>' in t:
            next(toks, None)  # a redirect and its target
        else:
            yield seg
            seg = []
    yield seg

def check(line, in_hc=False):
    try:
        return any(launch(s, in_hc) for s in segments(line))
    except ValueError:  # unbalanced quote: that shell line runs nothing
        return False

def launch(seg, in_hc=False):
    i = 0
    while i < len(seg) and (os.path.basename(seg[i]) in SKIP or seg[i].split('=', 1)[0].isidentifier() and '=' in seg[i]
                            or i and os.path.basename(seg[i - 1]) in SKIP and seg[i].startswith('-')):
        i += 1
    w, a = (os.path.basename(seg[i]), seg[i + 1:]) if i < len(seg) else ('', [])
    if in_hc and w in AGENTS:  # a program in hc run's argv or shell line
        return not HELP & set(a)
    c = [k for k, t in enumerate(a[:-1]) if t[:1] == '-' and t[1:2] != '-' and 'c' in t]
    if w in ('sh', 'bash', 'zsh') and c:  # -c, -lc, -ec: the next word is the shell line
        return check(a[c[0] + 1], in_hc)
    if w == 'eval':
        return check(' '.join(a), in_hc)
    if w == 'agent-tmux':
        while len(a) > 2 and a[1].split('=', 1)[0] in ('--profile', '--profile-dir'):
            del a[1:2 if '=' in a[1] else 3]
        return len(a) > 1 and a[1] in ('start', 'resume', 'assign') and '--dry-run' not in a
    if w in ('tmux-agent-fanout', 'tmux-agent-dialogue', 'tmux-agent-commander'):
        return True
    if w != 'hc' or a[:1] != ['run']:
        return False
    j = 1  # hc's own options end at the program; after it, every word goes to the program
    while j < len(a) and a[j].startswith('-'):
        opt = a[j].split('=', 1)[0]
        if opt == '--':
            j += 1
            break
        if opt in ('--on', '-h', '--help'):  # runs on another machine, or prints help
            return False
        j += 2 if opt in HC_VALUE and '=' not in a[j] else 1
    prog = a[j:]
    if len(prog) == 1:  # one string is a shell line (hc --skill)
        return check(prog[0], True)
    return bool(prog) and launch(prog, True)

try:
    segs = list(segments(sys.argv[1]))
except ValueError:
    sys.exit()
print('launch' if any(launch(s) for s in segs) else 'pass')
PY
}

tool="$(printf '%s' "$IN" | jq -r '.tool_name // empty')"
case "$tool" in
  Agent|collaborationspawn_agent|invoke_subagent) ;;
  mcp__tmux-agent__assign) worker_launch=1 ;;
  Bash)
    cmd="$(printf '%s' "$IN" | jq -r '.tool_input.command // empty')"
    case "$cmd" in *hc*run*|*agent-tmux*|*tmux-agent-*) ;; *) exit 0 ;; esac
    case "$(launch_verdict "$cmd")" in
      launch) ;;
      pass) exit 0 ;;
      *) # not split (unbalanced quote, or no /usr/bin/python3): the whole-text match
        echo "host-load-gate: command not parsed; whole-text match used" >&2
        printf '%s' "$cmd" | grep -Eq -- '(^|[^[:alnum:]_-])(agent-tmux[[:space:]]+[^[:space:]]+[[:space:]]+(start|resume|assign)([[:space:]]|$)|tmux-agent-(fanout|dialogue|commander)([[:space:]]|$)|hc[[:space:]]+run[[:space:]]([^|;&]*[[:space:]/])?(claude|codex|grok|agy|gemini|cursor-agent)([[:space:]]|$))' || exit 0
        printf '%s' "$cmd" | grep -Eq -- '--dry-run|hc[[:space:]]+run[[:space:]][^|;&]*--on([[:space:]=]|$)' && exit 0
        ;;
    esac
    worker_launch=1
    ;;
  *) exit 0 ;;
esac

# One JSONL row per gated launch (W42-7): the retro counts allow/warn/deny from it.
STATS="${XDG_DATA_HOME:-$HOME/.local/share}/agent-hooks/host-load-stats.jsonl"
log_stat() { mkdir -p "${STATS%/*}" && jq -cn --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --arg tool "$tool" \
  --arg d "$1" --arg l1 "${l1:-}" --arg l5 "${l5:-}" --arg n "${ncpu:-}" --arg mp "${mp:-}" \
  '{timestamp:$ts, tool:$tool, decision:$d, load1:$l1, load5:$l5, ncpu:$n, pressure:$mp}' >> "$STATS" 2>/dev/null; }

# Worker cap (owner 2026-11-06: 「cli agent 開太多 電腦超卡」): each worker is a whole CLI process
# tree; a native subagent runs inside the parent. Count live workers on this host, hc and tmux
# together, all sessions and CLIs. shortcut: a tmux worker is a session whose name ends in the
# dispatch suffix .<5 chars>; an hc worker is a live local child terminal (parent set) whose
# program is an agent CLI. A tmux worker without the suffix and an hc start with no parent (from a
# non-hc terminal, or --no-parent) are miscounted.
if [ "${worker_launch:-}" = 1 ]; then
  max=${TMUX_WORKER_MAX:-3}
  live=$(tmux list-sessions -F '#{session_name}' 2>/dev/null | grep -Ec '\.[a-z0-9]{5}$')
  if command -v hc >/dev/null 2>&1; then
    # Every local core counts toward the one host cap: each session dir holds <name>/<name>.sock (a
    # holder socket sits beside it), and HC_SOCKET can name one more. Probe first: an hc command starts
    # a stopped core (the mod's hcSocketLive probe). hc refuses an HC_SESSION that disagrees with HC_SOCKET.
    for d in ${HC_SOCKET:+"$HC_SOCKET"} "${XDG_STATE_HOME:-$HOME/.local/state}"/herdr-core/*/; do
      case "$d" in
        */) n="${d%/}"; n="${n##*/}"; socket="$d$n.sock"
          [ -n "${HC_SOCKET:-}" ] && [ "$socket" -ef "$HC_SOCKET" ] && continue ;;
        *) n=; socket="$d" ;;
      esac
      perl -MSocket -e 'socket(my $s, PF_UNIX, SOCK_STREAM, 0) or exit 2; connect($s, pack_sockaddr_un($ARGV[0])) ? exit 0 : exit 1' "$socket" 2>/dev/null &&
        rows="$(env ${n:+"HC_SESSION=$n"} HC_SOCKET="$socket" hc ls --json 2>/dev/null)" || continue
      # Marker: parent set. Assign passes --parent and a hand hc run defaults to it; top-level sessions
      # have none. Only agent CLIs count (hc names claude claude-code and agy antigravity; a dev server
      # such as npm or node does not), plus env: an assign worker shows env while it starts.
      hc_live="$(printf '%s' "$rows" | jq -er '[.terminals[] | select(.state == "live" and .parent != null
        and (.address | type == "string" and length > 0 and (contains("/") | not))
        and ((.agent // "") | test("^(claude-code|claude|codex|antigravity|agy|grok|gemini|cursor-agent|env)$")))] | length' 2>/dev/null)" || hc_live=0
      live=$((live + hc_live))
    done
  fi
  if [ "${live:-0}" -ge "$max" ]; then
    log_stat deny-workers
    printf 'BLOCKED by host-load-gate: %s live workers on this host (cap %s).\nNext, in this order:\n1. Stop a worker whose result is in. For hc: hc kill <t>, then hc rm <t>. For tmux: mcp__tmux-agent__stop or agent-tmux <cli> stop <name>.\n2. Send the task to a live worker (hc send, tell, or send-wait).\n3. Use a native subagent (Agent tool): it runs inside this CLI.\n4. Offload to a remote host with agent-tmux <cli> start-ssh.\n' "$live" "$max" >&2
    exit 2
  fi
fi

if [ "$(uname)" != Darwin ]; then
  log_stat skip-os
  echo "host-load-gate: no load check on $(uname), macOS only; allowed" >&2; exit 0
fi
WARN=${HOST_LOAD_WARN:-1.5}; DENY=${HOST_LOAD_DENY:-2}
num='^[0-9]+(\.[0-9]+)?$'
ncpu=$(sysctl -n hw.ncpu) && avg=$(sysctl -n vm.loadavg) \
  && mp=$(sysctl -n kern.memorystatus_vm_pressure_level) || mp=
read -r _ l1 l5 _ <<<"${avg:-}"
if ! [[ ${ncpu:-} =~ $num && ${l1:-} =~ $num && ${l5:-} =~ $num && ${mp:-} =~ $num ]]; then
  log_stat deny-unreadable
  echo "BLOCKED by host-load-gate: cannot read host load (ncpu='${ncpu:-}' loadavg='${avg:-}' pressure='${mp:-}'). Fix the gate, or set HOST_LOAD_GATE=off." >&2
  exit 2
fi
over() { awk -v a="$1" -v n="$ncpu" -v k="$2" 'BEGIN{exit !(a > n*k)}'; }
suspects() {  # top 5 by CPU + top 5 by memory (ps sorts numerically), deduped;
               # runtime is info only. Executable path only (comm), never argv:
               # arguments can carry tokens, URLs or prompts into model context.
  { LC_ALL=C /bin/ps -ww -axo pid=,etime=,%cpu=,rss=,comm= -r | head -5
    LC_ALL=C /bin/ps -ww -axo pid=,etime=,%cpu=,rss=,comm= -m | head -5; } |
  awk '!seen[$1]++ {c=$5; for(i=6;i<=NF;i++) c=c" "$i
    if (length(c) > 90) c="..." substr(c, length(c)-86)   # keep the tail: the app name
    printf "  pid %s  up %s  cpu %s%%  mem %dMB  %s\n",$1,$2,$3,$4/1024,c}'
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
4. Show the list above to the user and ask which to stop; some are needed (simulators, a live browser). Never kill without approval; re-check the PID (ps -p <pid> -o command=) first.
5. Retry once later, never in a loop."
if over "$l1" "$DENY" || over "$l5" "$DENY" || [ "$mp" -ge 4 ]; then
  log_stat deny
  printf 'BLOCKED by host-load-gate: %s (deny over %sx cores or pressure critical).\n%s\n' "$state" "$DENY" "$advice" >&2
  exit 2
fi
if over "$l1" "$WARN" || [ "$mp" -ge 2 ]; then
  log_stat warn
  jq -cn --arg m "host-load-gate: $state, over ${WARN}x cores or pressure warn. Prefer feeding a live worker.
$advice" '{hookSpecificOutput:{hookEventName:"PreToolUse",additionalContext:$m}}'
  exit 0
fi
log_stat allow
exit 0
