#!/usr/bin/env bash
# recipe-usage-stats.sh counts only run-dir files changed inside the window (W43-4).
cd "$(dirname "$0")/.." || exit 1
set -euo pipefail
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
mkdir -p "$T/wf/old" "$T/wf/new"
echo 'ran spec-implement-dual-review-verify' > "$T/wf/old/notes.md"
touch -t 202601010000 "$T/wf/old/notes.md"
echo 'ran consensus-gate' > "$T/wf/new/notes.md"
fail=0
uses() { RECIPE_SINCE=2026-06-01 bash scripts/recipe-usage-stats.sh "$1" "$T/wf" "$T/stats.json" | jq -r .uses; }
[ "$(uses spec-implement-dual-review-verify)" = 0 ] && echo "ok   used only before the window: 0" || { echo "FAIL old use counted"; fail=1; }
[ "$(uses consensus-gate)" = 1 ] && echo "ok   used inside the window: 1" || { echo "FAIL new use missed"; fail=1; }
exit "$fail"
