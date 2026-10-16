#!/usr/bin/env bash
# sync-mods.sh against a fake HOME and a fake `claude` that records its calls (W43-3c).
cd "$(dirname "$0")/.." || exit 1
set -euo pipefail
fail=0
ok() { printf 'ok   %s\n' "$1"; }
bad() { printf 'FAIL %s\n' "$1"; fail=1; }

T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT
mkdir -p "$T/tree/scripts" "$T/tree/.claude-plugin" "$T/hm/.claude/plugins" "$T/bin"
cp scripts/sync-mods.sh "$T/tree/scripts/"
echo '{"plugins":[{"name":"m1","version":"0.13.0"},{"name":"m2","version":"1.0.0"}]}' > "$T/tree/.claude-plugin/marketplace.json"
IP="$T/hm/.claude/plugins/installed_plugins.json"
# a registered install: the version plus plugin.json at its installPath
reg() { mkdir -p "$T/hm/cache/m1/$1/.claude-plugin"; : > "$T/hm/cache/m1/$1/.claude-plugin/plugin.json"
  printf '{"plugins":{"m1@agent-scripts":[{"version":"%s","installPath":"%s"}]}}' "$1" "$T/hm/cache/m1/$1" > "$IP"; }
# fake CLI: `plugin update m1@agent-scripts` moves m1 to $LANDS (the release, or not)
cat > "$T/bin/claude" <<'SH'
#!/usr/bin/env bash
echo "$*" >> "$CALLS"
if [ "$2" = update ] && [ "$3" = m1@agent-scripts ]; then
  d="$HOME/cache/m1/$LANDS"; mkdir -p "$d/.claude-plugin"; : > "$d/.claude-plugin/plugin.json"
  printf '{"plugins":{"m1@agent-scripts":[{"version":"%s","installPath":"%s"}]}}' "$LANDS" "$d" > "$HOME/.claude/plugins/installed_plugins.json"
fi
SH
chmod +x "$T/bin/claude"
run() { HOME="$T/hm" PATH="$T/bin:$PATH" CALLS="$T/calls" LANDS="${LANDS:-0.13.0}" bash "$T/tree/scripts/sync-mods.sh" "$@" 2>&1; }

reg 0.13.0
if out="$(run --check)" && grep -q 'PASS \[mods\] m1=0.13.0 m2=not-installed' <<<"$out"; then ok "in sync: PASS, an uninstalled mod is reported"
else bad "in sync: $out"; fi

reg 0.12.1; : > "$T/calls"
if out="$(run --check)"; then bad "behind --check: exit 0 ($out)"
elif grep -q 'm1(0.12.1->0.13.0)' <<<"$out" && [ ! -s "$T/calls" ]; then ok "behind --check: exit 1, names it, no CLI call"
else bad "behind --check: $out / calls $(cat "$T/calls")"; fi

if out="$(run)" && grep -q 'updated: m1' <<<"$out" && grep -q 'plugin update m1@agent-scripts' "$T/calls" \
   && ! grep -q 'm2' "$T/calls"; then ok "behind: deploy updates m1 only, then verifies"
else bad "behind deploy: $out / calls $(cat "$T/calls")"; fi

reg 0.12.1
if out="$(LANDS=0.12.1 run)"; then bad "update that does not land: exit 0 ($out)"
elif grep -q 'still behind after update: m1' <<<"$out"; then ok "update that does not land: exit 1"
else bad "no-land: $out"; fi

# sol W43 review F5: a broken registry or a registered install with no files must not PASS
echo '{"plugins":' > "$IP"
if out="$(run --check)"; then bad "malformed registry: exit 0 ($out)"
elif grep -q 'not valid JSON' <<<"$out"; then ok "malformed registry: exit 1"
else bad "malformed registry: $out"; fi

reg 0.13.0; rm -rf "$T/hm/cache/m1/0.13.0"
if out="$(run --check)"; then bad "installPath gone: exit 0 ($out)"
elif grep -q 'no plugin.json at installPath: m1' <<<"$out"; then ok "installPath gone: exit 1, names it"
else bad "installPath gone: $out"; fi

exit "$fail"
