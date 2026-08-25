#!/usr/bin/env bash
# Bill-of-lading validator (A2): checks a delegated-agent prompt for the
# GOAL/ACCEPTANCE/REPORT sections required by
# ~/.agents/skills/delegation-templates/SKILL.md. Read the prompt text from
# stdin (or $1 as a file path) and report which of the three are missing.
#
# Direct use:  ./scripts/check-bol-prompt.sh < prompt.txt
#              echo "$PROMPT" | ./scripts/check-bol-prompt.sh
# Exit 0 = all three sections present. Exit 1 = at least one missing.
# This script only reports; the PreToolUse hook (.agents/hooks/bol-prompt-gate.sh)
# that wraps it denies the Agent call on exit 1.
set -u

if [ -n "${1:-}" ] && [ -f "$1" ]; then
  PROMPT="$(cat "$1")"
else
  PROMPT="$(cat)"
fi

missing=()
for section in GOAL ACCEPTANCE REPORT; do
  printf '%s' "$PROMPT" | grep -qiE "(^|[^A-Za-z])${section}([^A-Za-z]|:)" || missing+=("$section")
done

if [ "${#missing[@]}" -eq 0 ]; then
  echo "PASS: GOAL/ACCEPTANCE/REPORT all present"
  exit 0
else
  IFS=,; echo "FAIL: missing sections: ${missing[*]}"; unset IFS
  exit 1
fi
