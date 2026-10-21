#!/usr/bin/env bash
# Self-check for .agents/hooks/codex-cu-chrome-gate.sh. Never calls cua.
cd "$(dirname "$0")/.." || exit 1
H="$PWD/.agents/hooks/codex-cu-chrome-gate.sh"
export XDG_CONFIG_HOME="$(mktemp -d)"
mkdir -p "$XDG_CONFIG_HOME/codex-cu"
S="$XDG_CONFIG_HOME/codex-cu/chrome-browser.json"
fail=0
t() {
  jq -cn --arg c "$3" '{tool_name:"mcp__codex-cu__js",tool_input:{code:$c}}' | bash "$H" >/dev/null 2>&1
  got=$?
  if [ "$got" = "$2" ]; then printf 'ok   %-30s exit=%s\n' "$1" "$got"
  else printf 'FAIL %-30s want=%s got=%s\n' "$1" "$2" "$got"; fail=1; fi
}
t "getState no record"          0 'await cua.getState();'
t "getTab no record"            2 'await cua.getTab(1, { browser: "2" });'
printf '{"id":"2","extensionInstanceId":"ext-c","verified_at":%s}\n' "$(date +%s)" > "$S"
t "getTab literal id"           2 'let tab = await cua.getTab(709, { browser: "2" });'
t "getTab via proven ext"       0 'const b = await cua.getBrowser({ extensionInstanceId: "ext-c" }); let tab = await cua.getTab(709, { browser: b.id });'
t "createBrowserTab via ext"    0 'const b = await cua.getBrowser({ extensionInstanceId: "ext-c" }); await cua.createBrowserTab(b.id, "https://x", { sessionName: "t" });'
t "createBrowserTab chrome"     2 'await cua.createBrowserTab("chrome", "https://x", {});'
t "getBrowser other ext (Arc)"  2 'await cua.getBrowser({ extensionInstanceId: "ext-arc" });'
t "getBrowser by url"           2 'await cua.getBrowser({ url: "https://x" });'
t "variable id, no ext"         2 'await cua.getTab(1, { browser: b });'
t "iab"                         0 'await cua.createBrowserTab("iab", "https://x", { visible: false });'
t "mention"                     0 'await cua.getTab({ mention: "plugin://tab-v1/abc" });'
t "getApp Arc"                  2 'await cua.getApp("Arc");'
t "getApp TextEdit"             0 'await cua.getApp("TextEdit");'
t "getApp Archive Utility"      0 'await cua.getApp("Archive Utility");'
printf '{"id":"2","extensionInstanceId":"ext-c","verified_at":%s}\n' "$(( $(date +%s) - 3600 ))" > "$S"
t "stale record"                2 'const b = await cua.getBrowser({ extensionInstanceId: "ext-c" });'
rm -rf "$XDG_CONFIG_HOME"
exit "$fail"
