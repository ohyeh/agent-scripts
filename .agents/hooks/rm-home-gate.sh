#!/usr/bin/env bash
# PreToolUse gate: deny a recursive rm whose target is the home dir or the root
# (2026-10-09, after a test fixture ran `rm -rf ~` on the real HOME for ~30 s).
#
# Text match, not a parser: quotes are stripped, so the literal inside a test
# fixture, `bash -c "..."` or a heredoc is denied too — that literal is what ran.
# shortcut: a grep for the literal is also denied; search with `rm -rf [~]`.
# Not covered: an rm that a script or test runner starts as a child process.
#
# MODE: DENY, exit 2.
set -u

IN="$(cat)"
command -v jq >/dev/null 2>&1 || exit 0
CMD="$(printf '%s' "$IN" | jq -r '.tool_input.command // ""')"
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

[ -n "$hit" ] || exit 0
echo "BLOCKED: recursive rm on the home dir or the root (target '$hit'). This deletes user data and cannot be undone. Never put this command in a test fixture, a hook or a script either — use a harmless string such as 'echo not-on-the-list'. To search for the literal, write the pattern as 'rm -rf [~]'." >&2
exit 2
