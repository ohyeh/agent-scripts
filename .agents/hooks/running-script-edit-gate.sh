#!/usr/bin/env bash
# PreToolUse gate on Edit/Write/MultiEdit: deny a write to a file that a live process holds
# open. bash reads a script lazily (fd 255), so editing it mid-run makes the running copy read
# half-new text (2026-11-06: fleet-deploy.sh edited during a background run ->
# "syntax error near unexpected token &"; owner 「執行中的腳本禁止修改」).
# lsof on the one target file is exact: no command-line text match.
# shortcut: interpreters that read the whole file and close it (python, node) are not seen;
# editing those mid-run does not corrupt the run.
#
# MODE: DENY, exit 2.
set -u
IN="$(cat)"
command -v jq >/dev/null 2>&1 || { echo "running-script-edit-gate: jq missing; not checked" >&2; exit 0; }
command -v lsof >/dev/null 2>&1 || { echo "running-script-edit-gate: lsof missing; not checked" >&2; exit 0; }
f="$(printf '%s' "$IN" | jq -r '.tool_input.file_path // empty')"
[ -n "$f" ] && [ -f "$f" ] || exit 0
holders="$(lsof -Fpc -- "$f" 2>/dev/null | awk '/^p/{p=substr($0,2)} /^c/{printf "pid %s (%s) ", p, substr($0,2)}')"
[ -n "$holders" ] || exit 0
printf 'BLOCKED by running-script-edit-gate: %s is open by %s- a running script reads its file lazily, so an edit now corrupts that run. Wait for it to finish, or stop it first, then edit.\n' "$f" "$holders" >&2
exit 2
