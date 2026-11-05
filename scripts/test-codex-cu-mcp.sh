#!/usr/bin/env bash
# Process test for skills/codex-cu/scripts/codex-cu-mcp: a fake HOME holds a fake
# plugin .mcp.json; the launcher runs a stub that prints its argv, executor id and parent.
# Regressions: before the 26.1029 wrapper strip the launcher exec'd /bin/sh, which
# re-exported BROWSER_USE_ACCESS_EXECUTOR_ID as "" (printed "id="); before the signed-parent
# shim the server's parent was the launcher's caller, which the Chrome native host rejects (printed "parent=bash").
cd "$(dirname "$0")/.." || exit 1
L="$PWD/skills/codex-cu/scripts/codex-cu-mcp"
NODE="$(command -v node)" || { echo "FAIL node not on PATH"; exit 1; }
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
D="$T/.codex/plugins/cache/openai-bundled/unified-computer-use/1.0"; mkdir -p "$D"
printf '#!/bin/sh\necho "argv=$*"\necho "id=${BROWSER_USE_ACCESS_EXECUTOR_ID-unset}"\necho "parent=$(basename "$(ps -o comm= -p $PPID)")"\n[ "$1" = --exit3 ] && exit 3\nexit 0\n' > "$T/stub"; chmod +x "$T/stub"
WRAP='export BROWSER_USE_ACCESS_EXECUTOR_ID="${BROWSER_USE_ACCESS_EXECUTOR_ID-}"; exec "$@"'
fail=0
t() {  # name, command, args-json, env-json, want (substring of stdout+stderr), want-exit
  jq -n --arg c "$2" --argjson a "$3" --argjson e "$4" '{mcpServers:{cua_repl:{command:$c,args:$a,env:$e}}}' > "$D/.mcp.json"
  out="$(HOME="$T" BROWSER_USE_ACCESS_EXECUTOR_ID=leak python3 "$L" 2>&1)"; got=$?
  if [ "$got" = "$6" ] && [[ "$out" == *"$5"* ]]; then printf 'ok   %s\n' "$1"
  else printf 'FAIL %s want=%s exit=%s got=%s\n' "$1" "$5" "$6" "$got: $out"; fail=1; fi
}
E="$(jq -cn --arg n "$NODE" '{NODE_REPL_NODE_PATH:$n}')"
t "wrapper stripped, id unset, node parent" /bin/sh "$(jq -cn --arg w "$WRAP" --arg s "$T/stub" '["-c",$w,"cua-repl",$s,"--x"]')" "$E" $'argv=--x\nid=unset\nparent=node' 0
t "plain command passes"      "$T/stub" '["--y"]' "$E" $'argv=--y\nid=unset\nparent=node' 0
t "exit code passes through"  "$T/stub" '["--exit3"]' "$E" "argv=--exit3" 3
t "unknown wrapper fails"     /bin/sh "$(jq -cn '["-c","export BROWSER_USE_ACCESS_EXECUTOR_ID=; true"]')" "$E" "unknown /bin/sh wrapper" 1
t "no signed node fails"      "$T/stub" '[]' '{}' "NODE_REPL_NODE_PATH missing" 1
exit "$fail"
