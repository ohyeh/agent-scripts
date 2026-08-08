#!/usr/bin/env bash
# PreToolUse gate (W33 machine-gates, user ruling 2026-08-08): `agent-device open`
# for a mobile platform without --device falls back to a simulator, but this fleet
# targets USB physical devices (which coexist with same-named simulators). Root
# fix: the missing target parameter fails loudly instead of silently booting a
# simulator. Verified flag usage: help workflow line 25 —
#   agent-device open MyApp --platform ios --device "iPhone 17 Pro"
# web/macOS surfaces are exempt. Deny = exit 2 + stderr (fed back to the model).
set -u

IN="$(cat)"
command -v jq >/dev/null 2>&1 || exit 0
[ "$(printf '%s' "$IN" | jq -r '.tool_name // ""')" = "Bash" ] || exit 0

CMD="$(printf '%s' "$IN" | jq -r '.tool_input.command // ""')"
printf '%s' "$CMD" | grep -qE '(^|\||;|&&)[[:space:]]*agent-device[[:space:]]+open([[:space:]]|$)' || exit 0
printf '%s' "$CMD" | grep -q -- '--device' && exit 0
printf '%s' "$CMD" | grep -qE -- '--platform[[:space:]=]+web|--surface[[:space:]=]' && exit 0

echo "BLOCKED: agent-device open without --device silently falls back to a SIMULATOR; this machine targets USB physical devices that coexist with same-named simulators. Run \`agent-device devices\` and re-issue with an explicit target, e.g. agent-device open MyApp --platform ios --device \"ohYEH's iPhone 17 Pro\". A simulator must be named explicitly via --device too. (web/macOS: add --platform web or --surface to bypass.)" >&2
exit 2
