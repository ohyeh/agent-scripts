#!/usr/bin/env bash
# Layer 0 hook and recipe regressions. deploy.sh runs this on the release tree before any layer
# mutates ~; run it by hand before a push: `bash scripts/run-layer0-tests.sh`. Not a gate.
# Explicit list (no glob: installers and live-model evals must not run here); each test gets its
# own HOME/XDG/TMPDIR so a fixture never writes the real home. Each test must pass in a
# git-archive tree (no .git); test-deploy-check.sh needs a checkout, so it runs by hand, not here.
# Budget: ~30s total on the operator host.
# Usage: run-layer0-tests.sh [src-dir] [work-dir]. Prints one exit line per test.
# Without src-dir it tests `git archive HEAD` of this repo, the same tree shape deploy gets.
set -uo pipefail
WORK="${2:-$(mktemp -d)}"
if [ $# -ge 1 ]; then SRC="$1"; else
  SRC="$WORK/tree"; mkdir -p "$SRC"
  git -C "$(dirname "$0")/.." archive HEAD | tar -x -C "$SRC" || { echo "FAIL [tests] git archive HEAD" >&2; exit 1; }
fi
layer0_tests=(
  test-rm-home-gate.sh test-codex-cu-chrome-gate.sh test-pr-create-gate.sh test-tmux-assign-host-gate.sh
  test-review-dispatch-gate.sh test-running-script-edit-gate.sh test-skill-chain-nudge.sh
  test-jsonl-hooks-smoke test-sync-skills-lock.sh test-grok-bot-app.sh
)
failed=0
for t in "${layer0_tests[@]}"; do
  th="$WORK/t-$t"; mkdir -p "$th/tmp"
  case "$t" in *.mjs) run=(node "scripts/$t") ;; *.sh) run=(bash "scripts/$t") ;; *) run=("scripts/$t") ;; esac
  (cd "$SRC" && HOME="$th" XDG_STATE_HOME="$th/.local/state" XDG_DATA_HOME="$th/.local/share" \
    XDG_CONFIG_HOME="$th/.config" XDG_CACHE_HOME="$th/.cache" TMPDIR="$th/tmp" \
    "${run[@]}" >"$th/log" 2>&1 </dev/null)
  rc=$?
  echo "exit=$rc $t"
  if [ "$rc" != 0 ]; then
    failed=$((failed + 1))
    echo "FAIL [tests] $t. Log:" >&2
    tail -20 "$th/log" >&2
  fi
done
[ "$failed" = 0 ] || { echo "FAIL [tests] $failed of ${#layer0_tests[@]} failed" >&2; exit 1; }
echo "PASS [tests] ${#layer0_tests[@]} hook/recipe regressions"
