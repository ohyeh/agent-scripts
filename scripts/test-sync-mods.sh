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
reg() { printf '{"plugins":{"m1@agent-scripts":[{"version":"%s"}]}}' "$1" > "$IP"; }
# fake CLI: `plugin update m1@agent-scripts` moves m1 to $LANDS (the release, or not)
cat > "$T/bin/claude" <<'SH'
#!/usr/bin/env bash
echo "$*" >> "$CALLS"
if [ "$2" = update ] && [ "$3" = m1@agent-scripts ]; then
  printf '{"plugins":{"m1@agent-scripts":[{"version":"%s"}]}}' "$LANDS" > "$HOME/.claude/plugins/installed_plugins.json"
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

exit "$fail"
