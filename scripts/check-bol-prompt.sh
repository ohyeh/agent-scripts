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
  printf '%s' "$PROMPT" | grep -qiE "(^|[^A-Za-z])${section}([^A-Za-z]|$)" || missing+=("$section")
done

if [ "${#missing[@]}" -ne 0 ]; then
  IFS=,; echo "FAIL: missing sections: ${missing[*]}"; unset IFS
  exit 1
fi

# Typed proxy contract (2026-08-30, replaces the BLOCKed prose-scanning gate).
# Only a brief that DECLARES itself a supervision proxy is checked, and only its
# declared fields are checked — never arbitrary prose for synonyms. An unmarked
# brief that merely quotes an `agent-tmux ... assign` command (runbook, review,
# debugging) is structurally not a target.
if printf '%s\n' "$PROMPT" | grep -qE '^[[:space:]]*PROXY_MODE:[[:space:]]*agent-tmux-assign[[:space:]]*$'; then
  if ! printf '%s\n' "$PROMPT" | grep -qE '^[[:space:]]*WORKER_ARTIFACT:[[:space:]]*/[^[:space:]]+[[:space:]]*$'; then
    echo "FAIL: proxy brief must declare WORKER_ARTIFACT: <absolute path> (the parent reads that file; the proxy never relays worker output)"
    exit 1
  fi
  # The REPORT block of a proxy brief is FIXED, not free-form: take everything
  # from the REPORT line to EOF, squeeze whitespace, compare to the canonical.
  canonical='REPORT exit code + status/summary only; do not read or reproduce worker output.'
  actual="$(printf '%s\n' "$PROMPT" \
    | awk 'f{print} /^[[:space:]]*REPORT([[:space:]]*:)?[[:space:]]*$/{f=1;print "REPORT"}' \
    | tr '\n' ' ' | tr -s ' ' | sed 's/^ //; s/ $//')"
  if [ "$actual" != "$canonical" ]; then
    echo "FAIL: proxy brief REPORT block is not the canonical one. Use exactly:"
    echo "REPORT"
    echo "exit code + status/summary only; do not read or reproduce worker output."
    exit 1
  fi
  echo "PASS: proxy brief (PROXY_MODE/WORKER_ARTIFACT/fixed REPORT) valid"
  exit 0
fi

echo "PASS: GOAL/ACCEPTANCE/REPORT all present"
exit 0
