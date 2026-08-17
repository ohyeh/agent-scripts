#!/usr/bin/env bash
# Regression check for the ✈ every-reply canary rule (canonical wording in
# the current global kernel). Incident: 6e11d5d narrowed the canary to
# first-reply-only and reply coverage fell 65%->7% for two days before a
# human noticed. This check fails if either global file loses or narrows
# the every-reply wording.
#
# Usage: scripts/check-canary.sh   (run from repo root; exit 0 = PASS)
set -euo pipefail

GOLDEN='The final message MUST end with `✈` alone on the last line'
fail=0
for f in global/CLAUDE.md global/AGENTS.md; do
  if grep -qF "$GOLDEN" "$f"; then
    echo "PASS [canary] $f"
  else
    echo "FAIL [canary] $f missing/narrowed every-reply ✈ wording" >&2
    fail=1
  fi
done
# self-validation (rule G): the golden string must match a known positive —
# guards against the check itself silently rotting into an always-fail/always-pass.
printf '%s\n' "$GOLDEN" | grep -qF "$GOLDEN" || { echo "FAIL [self-check] grep broken" >&2; exit 2; }
exit "$fail"
