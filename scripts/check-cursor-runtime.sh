#!/usr/bin/env bash
# Fail closed if Cursor runtime files installed by Layer 7 are missing or drifted.
# Paths are $HOME-relative — never hard-code a user.
#
# Usage: scripts/check-cursor-runtime.sh   (exit 0 = PASS)
set -euo pipefail

fail=0
say_fail() { echo "FAIL [cursor-runtime] $*" >&2; fail=1; }
say_pass() { echo "PASS [cursor-runtime] $*"; }
say_warn() { echo "WARN [cursor-runtime] $*" >&2; }

KERNEL="${HOME}/.cursor/rules/kernel.mdc"
AGENTS="${HOME}/.codex/AGENTS.md"
PONYTAIL="${HOME}/.cursor/rules/ponytail.mdc"
HUD="${HOME}/.claude/claude-hud-statusline.sh"
USAGE="${HOME}/.claude/cursor-plan-usage.py"
CURSOR_CFG="${HOME}/.cursor/cli-config.json"
CLAUDE_SETTINGS="${HOME}/.claude/settings.json"

if [ ! -f "$KERNEL" ]; then
  say_fail "missing \$HOME/.cursor/rules/kernel.mdc"
elif ! grep -q 'alwaysApply: true' "$KERNEL"; then
  say_fail "kernel.mdc missing alwaysApply: true"
elif [ -f "$AGENTS" ]; then
  body_md5="$(awk 'BEGIN{p=0} /^---$/{c++; next} c>=2{print}' "$KERNEL" | md5 -q)"
  agents_md5="$(md5 -q "$AGENTS")"
  if [ "$body_md5" != "$agents_md5" ]; then
    say_fail "kernel.mdc body md5 $body_md5 != AGENTS.md $agents_md5"
  else
    say_pass "kernel.mdc body matches AGENTS.md"
  fi
else
  say_warn "no AGENTS.md to hash against; kernel.mdc present"
fi

[ -x "$HUD" ] || say_fail "missing executable \$HOME/.claude/claude-hud-statusline.sh"
[ -x "$USAGE" ] || say_fail "missing executable \$HOME/.claude/cursor-plan-usage.py"
if [ -x "$HUD" ] && [ -x "$USAGE" ]; then
  say_pass "HUD scripts in ~/.claude/"
fi

if [ -f "$CURSOR_CFG" ]; then
  cmd="$(jq -r '.statusLine.command // empty' "$CURSOR_CFG")"
  if [ "$cmd" = "~/.claude/claude-hud-statusline.sh" ]; then
    say_pass "cli-config.json statusLine command"
  else
    say_fail "cli-config.json statusLine.command is not the HUD wrapper"
  fi
else
  say_warn "no cli-config.json (statusLine not wired)"
fi

if [ -f "$CLAUDE_SETTINGS" ]; then
  cmd="$(jq -r '.statusLine.command // empty' "$CLAUDE_SETTINGS")"
  case "$cmd" in
    *claude-hud-statusline.sh*) say_pass "Claude settings.json statusLine command" ;;
    *) say_fail "Claude settings.json statusLine.command is not the HUD wrapper" ;;
  esac
fi

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

if [ -n "$plugin_mdc" ]; then
  if [ ! -f "$PONYTAIL" ]; then
    say_fail "ponytail plugin present but \$HOME/.cursor/rules/ponytail.mdc missing"
  elif [ "$(md5 -q "$plugin_mdc")" != "$(md5 -q "$PONYTAIL")" ]; then
    say_fail "ponytail.mdc drifted from plugin cache"
  else
    say_pass "ponytail.mdc matches plugin cache"
  fi
else
  say_warn "ponytail plugin cache absent; instruction rule not required"
fi

if [ "$fail" -ne 0 ]; then
  exit 1
fi
say_pass "kernel + HUD + ponytail wiring"
