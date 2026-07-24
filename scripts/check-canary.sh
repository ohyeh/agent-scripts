#!/usr/bin/env bash
# Regression check for the ✈ every-reply canary rule (golden wording pinned
# from commit e260cc5, v4.6.12). Incident: 6e11d5d narrowed the canary to
# first-reply-only and reply coverage fell 65%->7% for two days before a
# human noticed. This check fails if either global file loses or narrows
# the every-reply wording.
#
# Usage: scripts/check-canary.sh   (run from repo root; exit 0 = PASS)
set -euo pipefail

GOLDEN='End every reply with the codeword `✈` on its own final line'
fail=0
for f in global/CLAUDE.md global/AGENTS.md; do
  if grep -qF "$GOLDEN" "$f"; then
    echo "PASS [canary] $f"
  else
    echo "FAIL [canary] $f missing/narrowed every-reply ✈ wording (golden: e260cc5)" >&2
    fail=1
  fi
done
# self-validation (rule G): the golden string must match a known positive —
# guards against the check itself silently rotting into an always-fail/always-pass.
printf '%s\n' "$GOLDEN" | grep -qF "$GOLDEN" || { echo "FAIL [self-check] grep broken" >&2; exit 2; }
exit "$fail"
