#!/usr/bin/env bash
# Deployment PROVENANCE drift: does the last successful deploy on this host
# match the release ref deploy.sh would install now?
#
# Not a content check. deploy-log.jsonl records what was installed; it cannot
# see a later hand-edit of a runtime file. The full-file comparison in
# check-rules-invariants.mjs / deploy.sh remains the integrity check, and
# neither replaces the other.
#
# `Version:` in global/CLAUDE.md is a policy EDITION label on the periodic
# review cadence (maintenance.md §4) — it is not a drift signal. It stayed
# 4.24.0-ironlaws across 8 commits while this host ran 3-day-old kernels
# (session 76409ec8, 2026-08-31). This script is the drift signal.
#
# Compares against RELEASE_REF, the ref deploy.sh resolves — NOT local
# `git rev-parse HEAD`, which can be ahead, behind, or dirty relative to what
# was actually deployed (codex review, 2026-09-01).
set -euo pipefail

REPO_GIT_URL="${REPO_GIT_URL:-https://github.com/ohyeh/agent-scripts.git}"
RELEASE_REF="${RELEASE_REF:-refs/heads/main}"
LOG="${DEPLOY_LOG:-$HOME/.local/state/agent-scripts/deploy-log.jsonl}"

[ -r "$LOG" ] || { echo "FAIL [drift] no deploy log at $LOG — host never deployed, or state was wiped" >&2; exit 1; }

deployed="$(jq -r --arg h "$(hostname)" \
  'select(.host==$h) | select(.sha|test("^[0-9a-f]{40}$")) | .sha' "$LOG" 2>/dev/null | tail -1)"
[ -n "$deployed" ] || { echo "FAIL [drift] no valid 40-char sha for $(hostname) in $LOG" >&2; exit 1; }

remote="$(git ls-remote "$REPO_GIT_URL" "$RELEASE_REF" | cut -f1)"
case "$remote" in
  ????????????????????????????????????????) ;;
  *) echo "FAIL [drift] could not resolve $RELEASE_REF to one 40-char sha" >&2; exit 1;;
esac

if [ "$deployed" = "$remote" ]; then
  echo "PASS [drift] $(hostname) deployed $RELEASE_REF @ $deployed"
  exit 0
fi
echo "FAIL [drift] $(hostname) is behind $RELEASE_REF" >&2
echo "  deployed: $deployed" >&2
echo "  release:  $remote" >&2
exit 1
