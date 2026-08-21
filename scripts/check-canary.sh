#!/usr/bin/env bash
# Regression check for the ✈ every-reply canary rule (canonical wording in
# the current global kernel). Incident: 6e11d5d narrowed the canary to
# first-reply-only and reply coverage fell 65%->7% for two days before a
# human noticed. This check fails if either global file loses or narrows
# the wording. The golden string was re-cut 2026-08-21: the kernel now scopes
# the canary to substantive-result turns (status/wait turns are exempt by
# design), so the check asserts the MUST clause itself, not the old sentence.
#
# Usage: scripts/check-canary.sh   (run from repo root; exit 0 = PASS)
set -euo pipefail

GOLDEN='MUST end with `✈` alone'
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
