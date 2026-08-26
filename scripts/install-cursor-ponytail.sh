#!/usr/bin/env bash
# Copy Ponytail's Cursor instruction rule into ~/.cursor/rules/.
# Does not vendor ponytail: source is the installed plugin cache (Claude, then Codex).
# Missing plugin = WARN (third-party, not a fleet kernel file).
#
# Usage: scripts/install-cursor-ponytail.sh
set -euo pipefail

DST_DIR="${HOME}/.cursor/rules"
DST="${DST_DIR}/ponytail.mdc"

find_src() {
  local root ver dir candidate
  for root in \
    "${HOME}/.claude/plugins/cache/ponytail/ponytail" \
    "${HOME}/.codex/plugins/cache/ponytail/ponytail"
  do
    [ -d "$root" ] || continue
    ver="$(find "$root" -mindepth 1 -maxdepth 1 -type d -exec basename {} \; | sort -V | tail -1)"
    [ -n "$ver" ] || continue
    dir="${root}/${ver}"
    candidate="${dir}/.cursor/rules/ponytail.mdc"
    if [ -f "$candidate" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  return 1
}

src="$(find_src || true)"
if [ -z "$src" ]; then
  echo "WARN [cursor-ponytail] no ponytail.mdc in Claude/Codex plugin cache; skipped" >&2
  exit 0
fi

mkdir -p "$DST_DIR"
cp "$src" "$DST"
if ! grep -q 'alwaysApply: true' "$DST"; then
  echo "FAIL [cursor-ponytail] copied rule missing alwaysApply: true ($src)" >&2
  exit 1
fi
src_md5="$(md5 -q "$src")"
dst_md5="$(md5 -q "$DST")"
if [ "$src_md5" != "$dst_md5" ]; then
  echo "FAIL [cursor-ponytail] md5 mismatch after copy" >&2
  exit 1
fi
echo "PASS [cursor-ponytail] $DST (from $src, md5=$src_md5)"
