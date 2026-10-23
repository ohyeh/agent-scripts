#!/usr/bin/env bash
# PreToolUse gate for command shapes the owner forbade (one gate on all four CLIs):
# - deny: a recursive rm whose target is the home dir or the root (2026-10-09, after a
#   test fixture ran `rm -rf ~` on the real HOME for ~30 s);
# - deny: launching a Chromium browser other than Google Chrome (Arc, Dia, Playwright's
#   chromium, ...) from Bash (2026-10-23: agents opened other Chromium browsers);
# - ask: Google Chrome with --headless, and creating a git worktree (Bash, EnterWorktree,
#   Agent isolation) — the owner never approved either (2026-10-16, 2026-10-23);
# - warn: a command that starts with cd to a dir other than the repo root (session cwd drift).
#
# Ask only where the CLI shows a prompt: AGENT_HOOK_ASK_OK=1 (set by claude-only.sh and
# agy-adapt.sh). Elsewhere ask is a deny: Codex runs an ask reply as a hook failure and
# continues the tool call, Cursor does not enforce ask on preToolUse (vendor docs 2026-10-23).
#
# Text match, not a parser: quotes are stripped, so the literal inside a test
# fixture, `bash -c "..."` or a heredoc is denied too — that literal is what ran.
# shortcut: a grep for the literal is also denied; search with `rm -rf [~]`,
# `worktree [a]dd`, `Arc\.app/Contents/[M]acOS`.
# Not covered: a command that a script or test runner starts as a child process.
#
# MODE: DENY exit 2 / ASK / WARN (additionalContext).
set -u

IN="$(cat)"
command -v jq >/dev/null 2>&1 || exit 0
TOOL="$(printf '%s' "$IN" | jq -r '.tool_name // ""')"
CMD="$(printf '%s' "$IN" | jq -r '.tool_input.command // ""')"

ask() {
  if [ "${AGENT_HOOK_ASK_OK:-}" = 1 ]; then
    jq -cn --arg r "$1" '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"ask",permissionDecisionReason:$r}}'
    exit 0
  fi
  echo "BLOCKED: $1 This CLI cannot show the owner a confirm prompt, so the call is denied. Ask the owner in your reply, or hand the step to the commander." >&2
  exit 2
}
WT="Opening a git worktree needs the owner's OK first (owner: 「誰准你亂用 worktree」). Without one, stay in this tree: commit only your own paths, or wait for the other writer."
case "$TOOL" in
  EnterWorktree) ask "$WT" ;;
  Agent) [ "$(printf '%s' "$IN" | jq -r '.tool_input.isolation // ""')" = worktree ] && ask "$WT"; exit 0 ;;
esac
[ -n "$CMD" ] || exit 0

hit=""
while IFS= read -r seg; do
  read -ra w <<<"$seg"
  rm_at=-1 rec=0
  for i in "${!w[@]}"; do
    t="${w[$i]//[\"\']/}"
    if [ "$rm_at" -lt 0 ]; then
      [ "${t##*/}" = "rm" ] && rm_at=$i
      continue
    fi
    case "$t" in
      --recursive) rec=1; continue ;;
      --*) continue ;;
      -*[rR]*) rec=1; continue ;;
      -*) continue ;;
    esac
    # ~/  ~/*  ~/.  $HOME/  /*  → their base
    while :; do
      case "$t" in
        */\*|*/.) t="${t%/*}" ;;
        ?*/) t="${t%/}" ;;
        *) break ;;
      esac
    done
    case "$t" in
      "") hit=/ ;;
      /|"~"|'$HOME'|'${HOME}'|"$HOME"|/Users|/home) hit="$t" ;;
    esac
  done
  [ "$rec" = 1 ] && [ -n "$hit" ] && break
  hit=""
done < <(printf '%s\n' "$CMD" | tr ';&|()`' '\n\n\n\n\n\n')

if [ -n "$hit" ]; then
  echo "BLOCKED: recursive rm on the home dir or the root (target '$hit'). This deletes user data and cannot be undone. Never put this command in a test fixture, a hook or a script either — use a harmless string such as 'echo not-on-the-list'. To search for the literal, write the pattern as 'rm -rf [~]'." >&2
  exit 2
fi

flat="$(printf '%s' "$CMD" | tr -d "\"'\\\\")"
S='[[:space:]]'
OPENA="open($S+-[[:alpha:]]+)*$S+-a$S+"
OTHER='(Arc|Dia|Chromium|Brave Browser|Microsoft Edge|Vivaldi|Opera)'
if [[ "$flat" =~ $OTHER\.app/Contents/MacOS/|$OPENA$OTHER($S|$)|ms-playwright/chromium|company\.thebrowser ]]; then
  echo "BLOCKED: this launches a Chromium browser that is not Google Chrome (${BASH_REMATCH[0]}). The owner uses Google Chrome only: drive it through codex-cu (background tab) or the repo's scripts/probes/." >&2
  exit 2
fi
if [[ "$flat" =~ Google\ Chrome\.app/Contents/MacOS/Google\ Chrome|${OPENA}Google\ Chrome ]] &&
   [[ "$flat" =~ (^|$S)--headless(=[^[:space:]]*)?($S|$) ]]; then
  ask "Headless Google Chrome needs the owner's OK first (owner: 「又是你們開一堆無頭 CHROME」). The default route is codex-cu (background tab) or the repo's scripts/probes/."
fi
while IFS= read -r seg; do
  [[ "$seg" =~ (^|[^[:alnum:]_-])git($S.*)?$S+worktree$S+add($S|$) ]] && ask "$WT"
done < <(printf '%s\n' "$flat" | tr ';&|()`' '\n\n\n\n\n\n')

# cd warn: only a command whose first word is cd; `(cd x && make)` keeps the session cwd.
c="${CMD#"${CMD%%[![:space:]]*}"}"
[[ "$c" =~ ^cd($S+--)?($S+(\"([^\"]*)\"|\'([^\']*)\'|([^[:space:];\&|]*)))?($S|$|[;\&|]) ]] || exit 0
arg="${BASH_REMATCH[4]}${BASH_REMATCH[5]}${BASH_REMATCH[6]}"
cwd="$(printf '%s' "$IN" | jq -r '.cwd // .tool_input.working_directory // .tool_input.Cwd // empty')"
[ -d "$cwd" ] || exit 0
root="$(git -C "$cwd" rev-parse --show-toplevel 2>/dev/null)" || exit 0
case "$arg" in
  "") arg="$HOME" ;;
  "~"|"~/"*) arg="$HOME${arg#\~}" ;;
esac
# shortcut: no CDPATH, no $var expansion; symlinks resolve physically (pwd -P).
dest=""
case "$arg" in *'$'*|*'`'*|-) ;; *) dest="$(cd "$cwd" 2>/dev/null && cd -- "$arg" 2>/dev/null && pwd -P)" ;; esac
[ -n "$dest" ] && [ "$dest" = "$(cd "$root" && pwd -P)" ] && exit 0
jq -cn --arg m "WARNING: this command starts with cd ${arg} (resolves to '${dest:-unknown}'), which moves this session's working directory away from the repo root $root. Use absolute paths or git -C instead, and cd back to $root if you meant to move." \
  '{hookSpecificOutput:{hookEventName:"PreToolUse",additionalContext:$m}}'
exit 0
