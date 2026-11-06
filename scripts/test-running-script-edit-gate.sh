#!/usr/bin/env bash
# Offline check for running-script-edit-gate.sh: deny an edit to a script a live bash holds open.
set -u
G="$(cd "$(dirname "$0")/.." && pwd)/.agents/hooks/running-script-edit-gate.sh"
T="$(mktemp -d)"; trap 'kill "$P" 2>/dev/null; rm -rf "$T"' EXIT
printf '#!/bin/bash\nsleep 30\n' > "$T/run.sh"; printf 'x\n' > "$T/idle.txt"
bash "$T/run.sh" & P=$!
for _ in 1 2 3 4 5 6 7 8 9 10; do lsof -- "$T/run.sh" >/dev/null 2>&1 && break; sleep 0.2; done
fail=0
payload() { jq -cn --arg f "$1" '{tool_name:"Edit",tool_input:{file_path:$f}}'; }
payload "$T/run.sh" | bash "$G" 2>"$T/err" && { echo "FAIL: edit of a running script was allowed" >&2; fail=1; }
grep -q "pid $P" "$T/err" || { echo "FAIL: deny lacks the holder pid" >&2; fail=1; }
payload "$T/idle.txt" | bash "$G" || { echo "FAIL: edit of an idle file was denied" >&2; fail=1; }
payload "$T/new.txt" | bash "$G" || { echo "FAIL: write of a new file was denied" >&2; fail=1; }
kill "$P"; wait "$P" 2>/dev/null
payload "$T/run.sh" | bash "$G" || { echo "FAIL: edit after the run ended was denied" >&2; fail=1; }
[ "$fail" = 0 ] && echo "PASS running-script-edit-gate: running script denied with pid; idle, new and finished files pass"
exit "$fail"
