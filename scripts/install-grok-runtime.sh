#!/usr/bin/env bash
# Grok Build's own files. Does not read or write ~/.cursor.
#   ~/.grok/rules/ponytail.md  — markdown body of the installed ponytail rule
#   ~/.grok/statusline.sh      — scripts/grok-statusline.sh (claude-hud wrapper)
#   ~/.grok/config.toml        — [ui.status_line] command (replaced); compat policy,
#                                session compact, default model's context_window
#                                (each only when its table is absent)
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
touch "$cfg"
# Append a table only when its header is absent; a present table is the user's to tune.
add_table() {  # $1 = header line, $2 = body
  if grep -qxF "$1" "$cfg"; then
    echo "PASS [grok-own] $cfg already has $1"
  else
    printf '\n%s\n%s\n' "$1" "$2" >> "$cfg"
    echo "PASS [grok-own] appended $1 to $cfg"
  fi
}
# Owner policy 2026-11-01: Claude compat on (kernel, hooks, skills, MCP come from it),
# Cursor compat off, Codex only skills.
add_table '[compat.claude]' "$(printf '%s = true\n' agents hooks mcps rules skills sessions)"
add_table '[compat.cursor]' "$(printf '%s = false\n' agents hooks mcps rules skills sessions)"
add_table '[compat.codex]' 'skills = true'
# Owner policy 2026-11-01: 500k window on the default model, compact at 90%.
add_table '[session]' 'auto_compact_threshold_percent = 90'
default_model="$(awk -F'"' '/^\[/{s=($0=="[models]")} s && /^default[[:space:]]*=/{print $2; exit}' "$cfg")"
if [ -n "$default_model" ]; then
  add_table "[model.\"${default_model}\"]" 'context_window = 500000'
else
  echo "WARN [grok-own] no [models] default in $cfg; context_window not set" >&2
fi

# Status line: the claude-hud wrapper, like agy and Cursor. This table is owned
# here: an existing one is replaced, so edit scripts/grok-statusline.sh instead.
# Last step, so the table always ends the file and a rerun changes nothing.
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
install -m 0755 "${ROOT}/scripts/grok-statusline.sh" "${HOME}/.grok/statusline.sh"
if [ "$(md5 -q "${ROOT}/scripts/grok-statusline.sh")" != "$(md5 -q "${HOME}/.grok/statusline.sh")" ]; then
  echo "FAIL [grok-own] statusline.sh md5 mismatch after install" >&2
  exit 1
fi
tmp="$(mktemp)"
awk '/^\[/{skip=($0=="[ui.status_line]")} !skip{l[++n]=$0} END{while(n&&l[n]=="")n--; for(i=1;i<=n;i++)print l[i]}' "$cfg" > "$tmp" && mv "$tmp" "$cfg"
# No padding: Grok's pane already insets the row, and padding 2 pushed it out of line with the prompt box.
add_table '[ui.status_line]' "$(printf 'type = "command"\ncommand = "~/.grok/statusline.sh"')"
