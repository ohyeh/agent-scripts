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

exit "$fail"
