#!/bin/sh
# Verifies the canonical .claude/workflows/ tree and the distributable
# skills/using-workflows/workflows/ install snapshot stay byte-identical.
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)

diff -qr "$REPO_ROOT/.claude/workflows" "$REPO_ROOT/skills/using-workflows/workflows"
