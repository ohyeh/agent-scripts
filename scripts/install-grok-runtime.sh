#!/usr/bin/env bash
# Grok Build's own files. Does not read or write ~/.cursor.
#   ~/.grok/rules/ponytail.md  — markdown body of the installed ponytail rule
#   ~/.grok/config.toml        — [ui.status_line] type = "builtin" when absent
# Missing ~/.grok means Grok Build is not installed here. Missing ponytail
# plugin is a WARN: the rule is third-party, not a kernel file.
#
# Usage: scripts/install-grok-runtime.sh
set -euo pipefail

if [ ! -d "${HOME}/.grok" ]; then
  echo "SKIP [grok-own] ~/.grok absent (Grok Build not installed)"
  exit 0
fi

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

body_md5() { awk 'BEGIN{c=0} /^---$/{c++; next} c>=2{print}' "$1" | md5 -q; }

src="$(find_src || true)"
if [ -z "$src" ]; then
  echo "WARN [grok-own] no ponytail.mdc in Claude/Codex plugin cache; rule skipped" >&2
else
  mkdir -p "${HOME}/.grok/rules"
  dst="${HOME}/.grok/rules/ponytail.md"
  awk 'BEGIN{c=0} /^---$/{c++; next} c>=2{print}' "$src" > "$dst"
  src_md5="$(body_md5 "$src")"
  dst_md5="$(md5 -q "$dst")"
  if [ "$src_md5" != "$dst_md5" ]; then
    echo "FAIL [grok-own] ponytail.md body md5 mismatch" >&2
    exit 1
  fi
  if ! grep -q '^# Ponytail' "$dst"; then
    echo "FAIL [grok-own] ponytail.md missing heading ($src)" >&2
    exit 1
  fi
  echo "PASS [grok-own] $dst (body of $src, md5=$dst_md5)"
fi

cfg="${HOME}/.grok/config.toml"
if [ ! -f "$cfg" ]; then
  printf '[ui.status_line]\ntype = "builtin"\n' > "$cfg"
  echo "PASS [grok-own] wrote $cfg status line"
elif grep -q '^\[ui\.status_line\]' "$cfg"; then
  echo "PASS [grok-own] $cfg already has [ui.status_line]"
else
  printf '\n[ui.status_line]\ntype = "builtin"\n' >> "$cfg"
  echo "PASS [grok-own] appended [ui.status_line] to $cfg"
fi
