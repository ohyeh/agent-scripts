#!/usr/bin/env bash
# Process test for skills/codex-cu/scripts/codex-cu-mcp: a fake HOME holds a fake
# plugin .mcp.json; the launcher execs a stub that prints its argv and executor id.
# Regression: before the 26.1029 wrapper strip the launcher exec'd /bin/sh, which
# re-exported BROWSER_USE_ACCESS_EXECUTOR_ID as "" (case "wrapper" printed "id=").
cd "$(dirname "$0")/.." || exit 1
L="$PWD/skills/codex-cu/scripts/codex-cu-mcp"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
D="$T/.codex/plugins/cache/openai-bundled/unified-computer-use/1.0"; mkdir -p "$D"
printf '#!/bin/sh\necho "argv=$*"\necho "id=${BROWSER_USE_ACCESS_EXECUTOR_ID-unset}"\n' > "$T/stub"; chmod +x "$T/stub"
WRAP='export BROWSER_USE_ACCESS_EXECUTOR_ID="${BROWSER_USE_ACCESS_EXECUTOR_ID-}"; exec "$@"'
fail=0
t() {  # name, command, args-json, want (substring of stdout+stderr), want-exit
  jq -n --arg c "$2" --argjson a "$3" '{mcpServers:{cua_repl:{command:$c,args:$a}}}' > "$D/.mcp.json"
  out="$(HOME="$T" BROWSER_USE_ACCESS_EXECUTOR_ID=leak python3 "$L" 2>&1)"; got=$?
  if [ "$got" = "$5" ] && [[ "$out" == *"$4"* ]]; then printf 'ok   %s\n' "$1"
  else printf 'FAIL %s want=%s exit=%s got=%s\n' "$1" "$4" "$5" "$got: $out"; fail=1; fi
}
t "wrapper stripped, id unset" /bin/sh "$(jq -cn --arg w "$WRAP" --arg s "$T/stub" '["-c",$w,"cua-repl",$s,"--x"]')" $'argv=--x\nid=unset' 0
t "plain command passes"      "$T/stub" '["--y"]' $'argv=--y\nid=unset' 0
t "unknown wrapper fails"     /bin/sh "$(jq -cn '["-c","export BROWSER_USE_ACCESS_EXECUTOR_ID=; true"]')" "unknown /bin/sh wrapper" 1
exit "$fail"
