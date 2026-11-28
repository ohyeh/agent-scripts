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
#     command word after quote removal (past VAR=x, if/then/do, wrappers and their
#     option values; into sh -c, eval, $(...) and backticks); quoted text, comments,
#     heredoc bodies and another command's arguments never count. start-ssh and an
#     hc --on before the program run the CLI remote, --dry-run among agent-tmux
#     start's leading flags launches nothing, and an agent whose whole argv is
#     --help or --version only prints; they pass. Settings hooks never fire for mod
#     tools, so the mod reaches this gate through review-dispatch-gate.sh.
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

# Prints launch or pass for a shell line, nothing when it cannot be split (an unbalanced quote).
# A small bash tokenizer, not shlex: shlex loses which words were quoted (a quoted ';' is a word),
# treats a '#' inside a word as a comment, and skips $(...). /usr/bin/python3: see cursor-adapt.sh:33.
# shortcut: hc run <template> "task" is not counted (its agent is named in the template file), nor
# is $'...' quoting decoded; read ~/.config/herdr-core/templates once templates are in use.
launch_verdict() { /usr/bin/python3 - "$1" 2>/dev/null <<'PY'
import os, sys
AGENTS = {'claude', 'codex', 'grok', 'agy', 'gemini', 'cursor-agent'}
HELP = {'-h', '--help', '--version'}
HC_VALUE = {'--name', '--cwd', '--on', '--label', '--parent', '--timeout'}  # hc run --help (0.1.22)
KEYWORDS = {'if', 'then', 'else', 'elif', 'while', 'until', 'do', '{', '!'}
WRAPPERS = {'env': {'-u', '-C', '-S', '-P', '--unset', '--chdir', '--split-string'}, 'exec': {'-a'},
            'nohup': set(), 'command': set(), 'time': set(), 'nice': {'-n'}}  # options that take a value
START_FLAGS = {'--attach', '--exact', '--dry-run', '--allow-project-config', '--headless'}  # agent-tmux:4921
OPS = set(';&|()<>')

def subst(s, i):
    """End index and inner text of the command substitution that opens at s[i] ($( or a backtick)."""
    if s[i] == '`':
        j = i + 1
        while j < len(s) and s[j] != '`':
            j += 2 if s[j] == '\\' else 1
        if j >= len(s):
            raise ValueError('backtick')
        return j + 1, s[i + 1:j]
    depth, j = 1, i + 2
    while j < len(s):
        if s[j] in '\'"':
            j = s.find(s[j], j + 1)
            if j < 0:
                raise ValueError('quote')
        elif s[j] == '\\':
            j += 1
        elif s[j] == '(':
            depth += 1
        elif s[j] == ')':
            depth -= 1
            if not depth:
                return j + 1, s[i + 2:j]
        j += 1
    raise ValueError('paren')

def bodies(s, i, docs, subs):
    """Skip the heredoc bodies that start at s[i]; an unquoted body still runs its substitutions."""
    for delim, quoted, strip in docs:
        while i < len(s):
            j = s.find('\n', i)
            j = len(s) if j < 0 else j
            line, i = s[i:j], j + 1
            if (line.lstrip('\t') if strip else line) == delim:
                break
            k = 0
            while not quoted and k < len(line):
                if line[k] == '\\':
                    k += 2
                elif line[k] == '`' or line.startswith('$(', k):
                    k, inner = subst(line, k)
                    subs.append(inner)
                else:
                    k += 1
    return i

def lex(s, subs):
    """(text, is_op) tokens: words after quote removal, and operator runs (; & | ( ) < >, newline)."""
    out, docs, w, inword, quoted, doc, i = [], [], '', False, False, None, 0

    def end():
        nonlocal w, inword, quoted, doc
        if inword:
            if doc is not None:
                docs.append((w, quoted, doc))
                doc = None
            out.append((w, False))
        w, inword, quoted = '', False, False

    while i < len(s):
        c = s[i]
        if c == '\\':
            if s[i + 1:i + 2] not in ('', '\n'):  # a backslash-newline joins lines
                w, inword, quoted = w + s[i + 1], True, True
            i += 2
        elif c == "'":
            j = s.find("'", i + 1)
            if j < 0:
                raise ValueError('quote')
            w, inword, quoted, i = w + s[i + 1:j], True, True, j + 1
        elif c == '"':
            inword, quoted, i = True, True, i + 1
            while i < len(s) and s[i] != '"':
                if s[i] == '\\' and s[i + 1:i + 2] in ('"', '\\', '$', '`', '\n'):
                    w, i = w + s[i + 1].replace('\n', ''), i + 2
                elif s[i] == '`' or s.startswith('$(', i):
                    i, inner = subst(s, i)
                    subs.append(inner)
                    w += '$'
                else:
                    w, i = w + s[i], i + 1
            if i >= len(s):
                raise ValueError('quote')
            i += 1
        elif c == '`' or s.startswith('$(', i):
            i, inner = subst(s, i)
            subs.append(inner)
            w, inword = w + '$', True
        elif c in ' \t\r':
            end()
            i += 1
        elif c == '#' and not inword:  # a comment runs to the end of the line
            j = s.find('\n', i)
            i = len(s) if j < 0 else j
        elif c == '\n':
            end()
            out.append(('\n', True))
            i, doc = bodies(s, i + 1, docs, subs), None
            docs.clear()
        elif c in OPS:
            if inword and not quoted and w.isdigit() and c in '<>':
                w, inword = '', False  # the fd number of 2>&1
            end()
            j = i
            while j < len(s) and s[j] in OPS:
                j += 1
            op, i = s[i:j], j
            out.append((op, True))
            if op == '<<':  # the next word ends a heredoc; <<- strips leading tabs
                doc = s[i:i + 1] == '-'
                i += doc
        else:
            w, inword, i = w + c, True, i + 1
    end()
    return out

def segments(tokens):
    seg, target = [], False
    for t, op in tokens:
        if not op:
            if target:
                target = False  # a redirect target, not an argument
            else:
                seg.append(t)
        elif set(t) <= set('<>&') and ('<' in t or '>' in t):
            target = True
        else:  # ; && || | & ( ) newline, and <( >( process substitution
            yield seg
            seg, target = [], False
    yield seg

def check(line, in_hc=False):
    subs = []
    try:
        segs = list(segments(lex(line, subs)))
    except ValueError:  # an inner line with an unbalanced quote runs nothing
        return False
    return any(launch(s, in_hc) for s in segs) or any(check(x, in_hc) for x in subs)

def launch(seg, in_hc=False):
    i = 0
    while i < len(seg):
        t = os.path.basename(seg[i])
        if seg[i] in KEYWORDS or '=' in seg[i] and seg[i].split('=', 1)[0].isidentifier():
            i += 1
        elif t in WRAPPERS:
            i += 1
            while i < len(seg) and seg[i].startswith('-'):
                i += 1
                if seg[i - 1] == '--':
                    break
                i += seg[i - 1] in WRAPPERS[t]
        else:
            break
    w, a = (os.path.basename(seg[i]), seg[i + 1:]) if i < len(seg) else ('', [])
    if in_hc and w in AGENTS:  # a program in hc run's argv or shell line; help only if that is all
        return not (a and set(a) <= HELP)
    c = [k for k, t in enumerate(a[:-1]) if t[:1] == '-' and t[1:2] != '-' and 'c' in t]
    if w in ('sh', 'bash', 'zsh') and c:  # -c, -lc, -ec: the next word is the shell line
        return check(a[c[0] + 1], in_hc)
    if w == 'eval':
        return check(' '.join(a), in_hc)
    if w == 'agent-tmux':
        while len(a) > 2 and a[1].split('=', 1)[0] in ('--profile', '--profile-dir'):
            del a[1:2 if '=' in a[1] else 3]
        k = 2
        while k < len(a) and a[k] in START_FLAGS:
            k += 1
        return len(a) > 1 and a[1] in ('start', 'resume', 'assign') and not (a[1] == 'start' and '--dry-run' in a[2:k])
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

subs = []
try:
    segs = list(segments(lex(sys.argv[1], subs)))
except ValueError:
    sys.exit()
print('launch' if any(launch(s) for s in segs) or any(check(x) for x in subs) else 'pass')
PY
}

tool="$(printf '%s' "$IN" | jq -r '.tool_name // empty')"
case "$tool" in
  Agent|collaborationspawn_agent|invoke_subagent) ;;
  mcp__tmux-agent__assign) worker_launch=1 ;;
  Bash)
    cmd="$(printf '%s' "$IN" | jq -r '.tool_input.command // empty')"
    # Prefilter on the text without quotes, backslashes and line joins, so h"c" r\un still reaches the parser.
    bare=${cmd//$'\\\n'/}; bare=${bare//[\"\'\\]/}
    case "$bare" in *hc*run*|*agent-tmux*|*tmux-agent-*) ;; *) exit 0 ;; esac
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
# non-hc terminal, or --no-parent) are miscounted. shortcut: the hc cores counted are those under
# this user's XDG_STATE_HOME plus HC_SOCKET; a core started with another XDG_STATE_HOME (a test
# core) is not, and the machine is not scanned for one.
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
        rows="$(env ${n:+"HC_SESSION=$n"} HC_SOCKET="$socket" hc ls --json 2>/dev/null)" &&
        assigned="$(env ${n:+"HC_SESSION=$n"} HC_SOCKET="$socket" hc ls --json --label tmux-agent=assign 2>/dev/null)" || continue
      # Marker: parent set. Assign passes --parent and a hand hc run defaults to it; top-level sessions
      # have none. Only agent CLIs count (hc names claude claude-code and agy antigravity; a dev server
      # such as npm or node does not). An env child counts only with the mod's tmux-agent=assign label
      # (workers.ts:833): a mod worker shows env while it starts. hc ls rows carry no labels, so the
      # labeled set is its own listing.
      hc_live="$(jq -enr --argjson all "$rows" --argjson mod "$assigned" 'def child: select(.state == "live" and .parent != null
        and (.address | type == "string" and length > 0 and (contains("/") | not)));
        ([$all.terminals[] | child | select((.agent // "") | test("^(claude-code|claude|codex|antigravity|agy|grok|gemini|cursor-agent)$"))] | length)
        + ([$mod.terminals[] | child | select(.agent == "env")] | length)' 2>/dev/null)" || hc_live=0
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
