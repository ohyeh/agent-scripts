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

# Build-shaped briefs (IMPLEMENT / REFACTOR templates) must name a runnable
# check — a command the worker can execute, not a prose condition like "tests
# pass". Thin evals start as thin briefs (user, 2026-08-26: 「evals 薄弱」).
# Runnable = a backtick-quoted command with an argument, or a known runner.
# SEARCH / RESEARCH / REVIEW briefs are exempt: their acceptance is citations
# and verdicts, not execution.
goal_line="$(printf '%s' "$PROMPT" | grep -iE '(^|[^A-Za-z])GOAL([^A-Za-z]|$)' | head -1)"
if printf '%s' "$goal_line" | grep -qiE '\b(implement|refactor|fix|add|change|migrate|build|write|create|update|port)\b|實作|重構|修(復|好|正)|新增|改|建置|遷移'; then
  runner='(^|[^A-Za-z])(flutter|dart|npm|pnpm|yarn|npx|node|pytest|python3?|go|cargo|make|bash|sh|zsh|jest|vitest|mocha|xcodebuild|xcrun|gradle|swift|dotnet|mvn|rspec|bundle|curl|agent-device|agent-browser|agent-tmux|rg|diff|git|jq) '
  if ! printf '%s' "$PROMPT" | grep -qE '`[^`]+ [^`]+`' && ! printf '%s' "$PROMPT" | grep -qE "$runner"; then
    echo "FAIL: build-shaped brief has no runnable check (ACCEPTANCE/VERIFY must name a command, e.g. \`flutter test\` exits 0)"
    exit 1
  fi
fi

echo "PASS: GOAL/ACCEPTANCE/REPORT all present"
exit 0
