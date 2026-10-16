#!/usr/bin/env bash
# This repo's Claude Code plugins (mods) at the release version. A marketplace refresh does not
# move an installed plugin: 2026-10-15 the repo shipped grok-bot-watch 0.13.0 while the cache kept
# 0.12.1, and /reload-plugins loaded the old one (W43-3c). A mod this host never installed is a
# person's choice: reported, not installed.
#
# Usage: scripts/sync-mods.sh           # update every installed mod that is behind, then verify
#        scripts/sync-mods.sh --check   # exit 1 and list them, change nothing
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MP="$ROOT/.claude-plugin/marketplace.json"
IP="$HOME/.claude/plugins/installed_plugins.json"
have() { jq -r --arg k "$1@agent-scripts" '.plugins[$k][0].version // empty' "$IP" 2>/dev/null || true; }

[ -f "$IP" ] || { echo "SKIP [mods] no Claude plugin registry at $IP"; exit 0; }
report="" behind=""
while IFS=$'\t' read -r name want; do
  h="$(have "$name")"
  if [ -z "$h" ]; then report="$report $name=not-installed"
  elif [ "$h" = "$want" ]; then report="$report $name=$h"
  else behind="$behind $name($h->$want)"; fi
done < <(jq -r '.plugins[] | [.name, .version] | @tsv' "$MP")

if [ -z "$behind" ]; then echo "PASS [mods]$report"; exit 0; fi
if [ "${1:-}" = --check ]; then echo "FAIL [mods] behind the release:$behind; deploy updates them" >&2; exit 1; fi
command -v claude >/dev/null || { echo "FAIL [mods] behind:$behind and no claude CLI to update them" >&2; exit 1; }
claude plugin marketplace update agent-scripts >/dev/null
for item in $behind; do
  name="${item%%(*}"
  claude plugin update "$name@agent-scripts" >/dev/null
done
# re-read: the update must have landed at the release version (restart loads it)
still=""
while IFS=$'\t' read -r name want; do
  h="$(have "$name")"; [ -z "$h" ] || [ "$h" = "$want" ] || still="$still $name($h->$want)"
done < <(jq -r '.plugins[] | [.name, .version] | @tsv' "$MP")
[ -z "$still" ] || { echo "FAIL [mods] still behind after update:$still" >&2; exit 1; }
echo "PASS [mods] updated:$behind (a new session loads them)"
