#!/usr/bin/env bash
# Fail closed if Grok Build (xAI `grok` CLI) does not load the deployed runtime.
# Grok reads the Claude layout through its default Claude compatibility: the kernel
# (~/.claude/CLAUDE.md), ~/.claude/settings.json hooks, ~/.agents/skills. Nothing is
# installed for it; this check reads `grok inspect --json` (no write to ~).
# Paths are $HOME-relative — never hard-code a user.
#
# Usage: scripts/check-grok-runtime.sh   (exit 0 = PASS or SKIP when grok is absent)
set -euo pipefail

if ! command -v grok >/dev/null 2>&1; then
  echo "SKIP [grok-runtime] grok not on PATH (Grok Build not installed)"
  exit 0
fi

fail=0
say_fail() { echo "FAIL [grok-runtime] $*" >&2; fail=1; }
say_pass() { echo "PASS [grok-runtime] $*"; }
say_warn() { echo "WARN [grok-runtime] $*" >&2; }

inspect="$(cd "$HOME" && grok inspect --json)" || { say_fail "grok inspect --json exit $?"; exit 1; }
q() { jq -r "$@" <<<"$inspect"; }
# Value of key under an exact table header. Empty if the key is absent.
# Scope resets at the next [ — same shape as the [ui.status_line] scan below.
toml_val() { # $1 file, $2 header, $3 key
  awk -v table="$2" -v key="$3" '
    $0 == table { s=1; next }
    /^\[/ { s=0 }
    s && $0 ~ ("^" key "[[:space:]]*=") {
      sub(/^[^=]*=[[:space:]]*/, "")
      sub(/[[:space:]]+$/, "")
      print
      exit
    }
  ' "$1"
}

# 1. Kernel: the global instruction file is ~/.claude/CLAUDE.md (case-insensitive FS may report Claude.md).
want="$(tr '[:upper:]' '[:lower:]' <<<"$HOME/.claude/claude.md")"
if q '.projectInstructions[]? | select(.scope=="global") | .path' | tr '[:upper:]' '[:lower:]' | grep -qxF "$want"; then
  say_pass "kernel loaded from ~/.claude/CLAUDE.md"
else
  say_fail "~/.claude/CLAUDE.md not among global instructions (check [compat.claude] agents)"
fi

# 2. Hooks: every ~/.claude/settings.json command handler is loaded as a user hook.
want_hooks=0
[ ! -f "$HOME/.claude/settings.json" ] ||
  want_hooks="$(jq '[.hooks // {} | .. | objects | select(has("command"))] | length' "$HOME/.claude/settings.json")"
got_hooks="$(q '[.hooks[]? | select((.source|type)=="object" and .source.type=="user")] | length')"
if [ "$want_hooks" = "$got_hooks" ]; then
  say_pass "$got_hooks/$want_hooks ~/.claude/settings.json hooks loaded"
else
  say_fail "$got_hooks/$want_hooks ~/.claude/settings.json hooks loaded (check [compat.claude] hooks)"
fi

# 3. grok 1.0.70 inspect JSON has no plugin/hook load-error field (no hookLoadErrors).
say_warn "inspect has no hook-error field; hook load errors are not checked"

# 4. Skills: every ~/.agents/skills/<name>/SKILL.md is visible as a user skill.
want_skills=0
[ ! -d "$HOME/.agents/skills" ] ||
  want_skills="$(find "$HOME/.agents/skills" -mindepth 2 -maxdepth 2 -name SKILL.md | wc -l | tr -d ' ')"
# By realpath: `npx skills upgrade -g` links ~/.grok/skills/<name> -> ~/.agents/skills/<name>,
# and Grok then reports that skill under the ~/.grok path.
skills_root="$(realpath "$HOME/.agents/skills" 2>/dev/null || echo "$HOME/.agents/skills")/"
got_skills="$(q '.skills[]? | (.source.path? // .path // "")' | while IFS= read -r p; do
  [ -n "$p" ] && realpath "$p" 2>/dev/null
done | awk -v d="$skills_root" 'index($0, d) == 1 && substr($0, length(d) + 1) ~ /^[^\/]+\/SKILL\.md$/' | sort -u | wc -l | tr -d ' ')"
if [ "$want_skills" = "$got_skills" ]; then
  say_pass "$got_skills/$want_skills ~/.agents/skills visible"
else
  say_fail "$got_skills/$want_skills ~/.agents/skills visible (check [compat.claude] skills)"
fi

# 5. Grok's own files. Absent ~/.grok means this host has no Grok Build.
# A present install must carry the ponytail rule (when the plugin is installed)
# and a builtin status line. Cursor paths are not consulted.
if [ -d "$HOME/.grok" ]; then
  plugin_mdc=""
  for root in \
    "${HOME}/.claude/plugins/cache/ponytail/ponytail" \
    "${HOME}/.codex/plugins/cache/ponytail/ponytail"
  do
    [ -d "$root" ] || continue
    ver="$(find "$root" -mindepth 1 -maxdepth 1 -type d -exec basename {} \; | sort -V | tail -1)"
    [ -n "$ver" ] || continue
    cand="${root}/${ver}/.cursor/rules/ponytail.mdc"
    if [ -f "$cand" ]; then
      plugin_mdc="$cand"
      break
    fi
  done
  rule="$HOME/.grok/rules/ponytail.md"
  if [ -n "$plugin_mdc" ]; then
    if [ ! -f "$rule" ]; then
      say_fail "ponytail plugin present but \$HOME/.grok/rules/ponytail.md missing"
    else
      body="$(awk 'BEGIN{c=0} /^---$/{c++; next} c>=2{print}' "$plugin_mdc" | md5 -q)"
      got="$(md5 -q "$rule")"
      if [ "$body" != "$got" ]; then
        say_fail "ponytail.md body md5 $got != plugin body $body"
      else
        say_pass "ponytail.md matches plugin body"
      fi
    fi
  else
    say_warn "ponytail plugin cache absent; ~/.grok/rules/ponytail.md not required"
  fi

  cfg="$HOME/.grok/config.toml"
  if [ ! -f "$cfg" ]; then
    say_fail "missing \$HOME/.grok/config.toml"
  elif awk '
      /^\[ui\.status_line\]/ { s=1; next }
      /^\[/ { s=0 }
      s && /^type[[:space:]]*=[[:space:]]*"command"/ { t=1 }
      s && /^command[[:space:]]*=[[:space:]]*"~\/\.grok\/statusline\.sh"/ { c=1 }
      END { exit (t && c) ? 0 : 1 }
    ' "$cfg"; then
    say_pass "config.toml [ui.status_line] command=~/.grok/statusline.sh"
  else
    say_fail "config.toml [ui.status_line] is not the ~/.grok/statusline.sh command"
  fi
  src_sl="$(cd "$(dirname "$0")" && pwd)/grok-statusline.sh"
  if [ ! -x "$HOME/.grok/statusline.sh" ]; then
    say_fail "missing executable \$HOME/.grok/statusline.sh"
  elif [ -f "$src_sl" ] && [ "$(md5 -q "$src_sl")" != "$(md5 -q "$HOME/.grok/statusline.sh")" ]; then
    say_fail "~/.grok/statusline.sh drifted from $src_sl"
  else
    say_pass "~/.grok/statusline.sh installed"
  fi

  # Compat policy as Grok resolved it: every Claude cell on, all six Cursor cells off.
  claude_off="$(q '[.externalCompat.cells[]? | select(.vendor=="claude" and .enabled!=true) | .surface] | join(",")')"
  cursor_off="$(q '[.externalCompat.cells[]? | select(.vendor=="cursor" and .enabled==false)] | length')"
  if [ -n "$claude_off" ]; then
    say_fail "Claude compat off for: $claude_off"
  elif [ "$cursor_off" != 6 ]; then
    say_fail "$cursor_off/6 Cursor compat cells off (want [compat.cursor] all false)"
  else
    say_pass "compat: Claude on, Cursor 6/6 off"
  fi
  for key in '^\[session\]$' '^\[model\."[^"]+"\]$'; do
    grep -Eq "$key" "$cfg" || say_fail "config.toml missing table $key"
  done
  # Owner policy 2026-11-01: same literals install-grok-runtime.sh appends.
  if [ -f "$cfg" ]; then
    found="$(toml_val "$cfg" '[session]' auto_compact_threshold_percent)"
    if [ "$found" = 90 ]; then
      say_pass "config.toml [session] auto_compact_threshold_percent=90"
    else
      say_fail "config.toml [session] auto_compact_threshold_percent found=${found:-<absent>} expected=90"
    fi
    def_model="$(awk -F'"' '/^\[/{s=($0=="[models]")} s && /^default[[:space:]]*=/{print $2; exit}' "$cfg")"
    if [ -n "$def_model" ]; then
      model_table="[model.\"${def_model}\"]"
      found="$(toml_val "$cfg" "$model_table" context_window)"
      if [ "$found" = 500000 ]; then
        say_pass "config.toml ${model_table} context_window=500000"
      else
        say_fail "config.toml ${model_table} context_window found=${found:-<absent>} expected=500000"
      fi
    else
      say_fail "config.toml [models] default found=<absent> expected=<model id>"
    fi
  fi
fi

exit "$fail"
