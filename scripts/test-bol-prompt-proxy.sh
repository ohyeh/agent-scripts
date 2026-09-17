#!/usr/bin/env bash
# Regression check for the typed proxy contract in check-bol-prompt.sh.
# Cases D/E/F are Codex's counterexamples A/B/C from the 2026-08-30 adversarial
# review (review-item4-findings.md): unmarked briefs that merely QUOTE dispatch
# vocabulary must keep passing, or the gate blocks its own review and tests.
# Run: ./scripts/test-bol-prompt-proxy.sh   (exit 0 = all cases as expected)
# shellcheck disable=SC2016  # single-quoted fixtures hold literal backticks on purpose
set -u
CHECK="${CHECK:-$(dirname "$0")/check-bol-prompt.sh}"
fails=0

expect() { # expect <name> <want_exit> <prompt>
  local name="$1" want="$2" prompt="$3" got
  printf '%s' "$prompt" | "$CHECK" >/dev/null 2>&1
  got=$?
  if [ "$got" -eq "$want" ]; then
    echo "ok   $name (exit $got)"
  else
    echo "FAIL $name (want exit $want, got $got)"
    fails=$((fails + 1))
  fi
}

CANON_REPORT='REPORT
exit code + status/summary only; do not read or reproduce worker output.'

expect "A canonical marked proxy brief" 0 "PROXY_MODE: agent-tmux-assign
WORKER_ARTIFACT: /tmp/run/findings.md

GOAL
Host exactly one blocking \`agent-tmux agy assign w1 /tmp/run /tmp/run/p.md\` call.

ACCEPTANCE
The assign call returns; no status/capture/probe/result call is made.

$CANON_REPORT"

expect "B marked brief, altered REPORT" 1 "PROXY_MODE: agent-tmux-assign
WORKER_ARTIFACT: /tmp/run/findings.md

GOAL
Host exactly one blocking \`agent-tmux agy assign w1 /tmp/run /tmp/run/p.md\` call.

ACCEPTANCE
The assign call returns.

REPORT
Return the worker's answer VERBATIM."

expect "C marked brief, no WORKER_ARTIFACT" 1 "PROXY_MODE: agent-tmux-assign

GOAL
Host exactly one blocking \`agent-tmux agy assign w1 /tmp/run /tmp/run/p.md\` call.

ACCEPTANCE
The assign call returns.

$CANON_REPORT"

expect "D unmarked runbook brief (Codex A)" 0 'GOAL: Update the dispatch runbook. Explain why `agent-tmux agy assign NAME DIR PROMPT`
must be hosted by a supervision proxy.

ACCEPTANCE: Preserve the current policy sentence "reports exit code + status/summary
only" VERBATIM, add one valid command example, and run `bash scripts/check-rules-invariants.mjs`.

REPORT: List changed files and the checker exit code.'

expect "E unmarked review-of-this-hook brief (Codex B)" 0 'GOAL: Adversarially review a hook that rejects prompts containing
`agent-tmux` followed by `assign` plus a full-output demand.

ACCEPTANCE: Quote each tested denial message word for word and include the complete
output of `bash scripts/test-bol-prompt-proxy.sh`. Do not summarize the supplied incident quotation.

REPORT: Write findings to review.md and return only the verdict.'

expect "F unmarked debugging brief (Codex C)" 0 'GOAL: Diagnose why the documented `agent-tmux claude assign` example exits 2.

ACCEPTANCE: Reproduce locally with `zsh -n scripts/agent-tmux`. Capture the error line VERBATIM so its
punctuation can be compared with the parser fixture. Do not summarise the error message.

REPORT: Give the root cause, test exit code, and the exact failing log line only.'

[ "$fails" -eq 0 ] && { echo "PASS: 6/6 proxy-contract cases"; exit 0; }
echo "FAIL: $fails case(s)"; exit 1
