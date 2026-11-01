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

# 3. Load errors: Cursor hooks.json entries are expected (Grok does not read Cursor replies); any other fails.
cursor_errs="$(q '[.hookLoadErrors[]? | select(contains("/.cursor/hooks.json"))] | length')"
other_errs="$(q '.hookLoadErrors[]? | select(contains("/.cursor/hooks.json") | not)')"
if [ -n "$other_errs" ]; then
  say_fail "hook load errors:"; printf '  %s\n' "$other_errs" >&2
else
  say_pass "no hook load errors outside ~/.cursor/hooks.json ($cursor_errs Cursor entries not run by Grok)"
fi

# 4. Skills: every ~/.agents/skills/<name>/SKILL.md is visible as a user skill.
want_skills=0
[ ! -d "$HOME/.agents/skills" ] ||
  want_skills="$(find "$HOME/.agents/skills" -mindepth 2 -maxdepth 2 -name SKILL.md | wc -l | tr -d ' ')"
got_skills="$(q --arg d "$HOME/.agents/skills/" '[.skills[]? | (.source.path? // .path // "")
  | select(startswith($d) and (ltrimstr($d) | test("^[^/]+/SKILL\\.md$")))] | length')"
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
fi

exit "$fail"
