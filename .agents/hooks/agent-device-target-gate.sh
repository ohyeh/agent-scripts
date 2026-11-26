#!/usr/bin/env bash
# PreToolUse gate (W33 machine-gates, user ruling 2026-08-08): `agent-device open`
# for a mobile platform without --device falls back to a simulator, but this fleet
# targets USB physical devices (which coexist with same-named simulators). Root
# fix: the missing target parameter fails loudly instead of silently booting a
# simulator. Verified flag usage: help workflow line 25 —
#   agent-device open MyApp --platform ios --device "iPhone 17 Pro"
# --udid (iOS) and --serial (Android) are explicit selectors too (agent-device
# 0.21.8 open help: "explicit --device/--udid/--serial, then session").
# web/macOS surfaces are exempt. Deny = exit 2 + stderr (fed back to the model).
set -u

IN="$(cat)"
command -v jq >/dev/null 2>&1 || exit 0
[ "$(printf '%s' "$IN" | jq -r '.tool_name // ""')" = "Bash" ] || exit 0

CMD="$(printf '%s' "$IN" | jq -r '.tool_input.command // ""')"
# Inspect each shell segment independently. A --device token in a sibling
# command must not authorize the agent-device invocation. A newline also ends a
# segment, so an invocation on a later line of a script is inspected; a line
# ending in an odd number of backslashes continues (bash rule) and is joined
# first. A target flag counts only as its own argument.
# ponytail: separator-level parsing; use a shell AST if quoted separators
# become common in agent-device arguments.
MISSING="$(printf '%s\n' "$CMD" | awk '{ if (match($0, /\\+$/) && RLENGTH % 2) printf "%s", substr($0, 1, length($0) - 1); else print }' | awk -v RS='[|;&\n]+' '
  /^[[:space:]]*agent-device[[:space:]]+open([[:space:]]|$)/ {
    if ($0 !~ /(^|[[:space:]])--(device|udid|serial)([=[:space:]]|$)/ &&
        $0 !~ /--platform[[:space:]=]+web([[:space:]]|$)/ &&
        $0 !~ /--surface([=[:space:]]|$)/) { print; exit }
  }
')"
[ -n "$MISSING" ] || exit 0

echo "BLOCKED: agent-device open without --device, --udid or --serial silently falls back to a SIMULATOR; this machine targets USB physical devices that coexist with same-named simulators. Run \`agent-device devices\` and re-issue with an explicit target, e.g. agent-device open MyApp --platform ios --device \"ohYEH's iPhone 17 Pro\". A simulator must be named explicitly via --device too. (web/macOS: add --platform web or --surface to bypass.)" >&2
exit 2
