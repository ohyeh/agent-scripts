#!/usr/bin/env bash
# Install the fleet kernel as one Cursor user rule.
# Analog of: cp global/CLAUDE.md ~/.claude/CLAUDE.md
#
# Canonical source stays global/AGENTS.md (same bytes as global/CLAUDE.md).
# Cursor has no ~/.codex/AGENTS.md slot, so this wraps that file as
# ~/.cursor/rules/kernel.mdc with alwaysApply: true.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${ROOT}/global/AGENTS.md"
DST_DIR="${HOME}/.cursor/rules"
DST="${DST_DIR}/kernel.mdc"

if [ ! -f "$SRC" ]; then
  echo "FAIL [cursor-kernel] missing canonical kernel: $SRC" >&2
  exit 1
fi

mkdir -p "$DST_DIR"
rm -f "${DST_DIR}/ohyeh-kernel.mdc"
{
  cat <<'EOF'
---
description: Fleet kernel — same iron laws as ~/.claude/CLAUDE.md and ~/.codex/AGENTS.md
alwaysApply: true
---
EOF
  cat "$SRC"
} > "$DST"

src_md5="$(md5 -q "$SRC")"
# Strip YAML frontmatter + the blank line after --- for the body hash.
body_md5="$(awk 'BEGIN{p=0} /^---$/{c++; next} c>=2{print}' "$DST" | md5 -q)"
if [ "$src_md5" != "$body_md5" ]; then
  echo "FAIL [cursor-kernel] body md5 $body_md5 != global/AGENTS.md $src_md5" >&2
  exit 1
fi

echo "PASS [cursor-kernel] $DST (body md5=$src_md5)"
echo "Restart the Cursor CLI session for the rule to load."
