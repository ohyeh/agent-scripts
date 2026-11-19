#!/usr/bin/env bash
# Self-check for scripts/sync-mods.sh --check: a mod of this repo enabled from another marketplace
# (the local copy) must fail; the same mods enabled only @agent-scripts must pass.
# Writes only under $HOME, which run-layer0-tests.sh points at a scratch dir.
cd "$(dirname "$0")/.." || exit 1
case "$HOME" in "$(eval echo ~"$(id -un)")") echo "refusing to run with the real HOME" >&2; exit 1 ;; esac
unset CLAUDE_CONFIG_DIR  # an exported one would point the script at the real settings
P="$HOME/.claude/plugins"; mkdir -p "$P"
reg='{"plugins":{}}'
while IFS=$'\t' read -r name ver; do
  d="$P/cache/agent-scripts/$name/$ver"; mkdir -p "$d/.claude-plugin"; echo '{}' > "$d/.claude-plugin/plugin.json"
  reg="$(jq --arg k "$name@agent-scripts" --arg v "$ver" --arg p "$d" '.plugins[$k]=[{version:$v,installPath:$p}]' <<<"$reg")"
done < <(jq -r '.plugins[] | [.name, .version] | @tsv' .claude-plugin/marketplace.json)
echo "$reg" > "$P/installed_plugins.json"
fail=0
t() {
  echo "$3" > "$HOME/.claude/settings.json"
  bash scripts/sync-mods.sh --check >/dev/null 2>&1; got=$?
  if [ "$got" = "$2" ]; then printf 'ok   %-24s exit=%s\n' "$1" "$got"
  else printf 'FAIL %-24s want=%s got=%s\n' "$1" "$2" "$got"; fail=1; fi
}
t "local copy enabled" 1 '{"enabledPlugins":{"agent-should-know@agent-scripts":false,"agent-should-know@agent-scripts-local":true}}'
t "only agent-scripts" 0 '{"enabledPlugins":{"agent-should-know@agent-scripts":true,"agent-should-know@agent-scripts-local":false}}'
t "other plugin local" 0 '{"enabledPlugins":{"not-a-mod@agent-scripts-local":true}}'
mv "$P/installed_plugins.json" "$P/ip.bak"
t "no registry, local on" 1 '{"enabledPlugins":{"agent-should-know@agent-scripts-local":true}}'
mv "$P/ip.bak" "$P/installed_plugins.json"
# CLAUDE_CONFIG_DIR moves the user scope; HOME/.claude is then not read
C="$HOME/cfg"; mkdir -p "$C"; echo '{"enabledPlugins":{"agent-should-know@agent-scripts-local":true}}' > "$C/settings.json"
echo '{}' > "$HOME/.claude/settings.json"
CLAUDE_CONFIG_DIR="$C" bash scripts/sync-mods.sh --check >/dev/null 2>&1; got=$?
if [ "$got" = 1 ]; then echo "ok   config dir, local on     exit=1"; else echo "FAIL config dir, local on     want=1 got=$got"; fail=1; fi
exit "$fail"
