#!/usr/bin/env bash
# deploy.sh --check on THIS host (W43-3): (1) exit 0 and zero writes; (2) kernel in sync but one
# skill pin drifted -> exit 1 at [skills]. Real HOME + network, so not in deploy.sh layer0_tests.
#
# Zero writes = the files deploy.sh and its install-* children write (paths taken from those
# scripts), plus plugins/installed_plugins.json (W43-7). Not covered: stores a live session
# writes on its own (~/.claude/context-mode, ~/.claude.json, ~/.claude/projects).
# Usage: scripts/test-deploy-check.sh
cd "$(dirname "$0")/.." || exit 1
set -uo pipefail
fail=0
ok() { printf 'ok   %s\n' "$1"; }
bad() { printf 'FAIL %s\n' "$1"; fail=1; }

paths=(
  ~/.claude/CLAUDE.md ~/.claude/settings.json ~/.claude/workflows ~/.claude/agents ~/.claude/skills
  ~/.claude/plugins/installed_plugins.json ~/.claude/context-mode-mcp.sh ~/.claude/claude-hud.json
  ~/.claude/claude-hud-statusline.sh ~/.claude/cursor-plan-usage.py
  ~/.codex/AGENTS.md ~/.codex/hooks.json ~/.codex/config.toml ~/.codex/agents
  ~/.gemini/GEMINI.md ~/.gemini/settings.json ~/.gemini/config/plugins ~/.gemini/config/skills
  ~/.agents/rules ~/.agents/hooks ~/.agents/.skill-lock.json ~/.agents/skills
  ~/.cursor/hooks.json ~/.cursor/mcp.json ~/.cursor/cli-config.json ~/.cursor/rules
  ~/.local/bin ~/.local/state/agent-scripts ~/.config/codex-cu ~/.zshrc ~/skills-lock.json
)
snap() {
  local p l
  for p in "${paths[@]}"; do
    [ -e "$p" ] || [ -L "$p" ] || { echo "absent $p"; continue; }
    find "$p" -print | sort
    find "$p" -type f -exec shasum -a 256 {} + | sort
    find "$p" -type l | sort | while IFS= read -r l; do echo "$l -> $(readlink "$l")"; done
  done
}

T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT

snap > "$T/before"
if bash scripts/deploy.sh --check > "$T/check.log" 2>&1; then ok "--check exit 0"
else bad "--check exit non-zero:"; grep -E '^FAIL' "$T/check.log"; fi
snap > "$T/after"
if cmp -s "$T/before" "$T/after"; then ok "zero writes ($(wc -l < "$T/before" | tr -d ' ') entries unchanged)"
else bad "--check changed files:"; diff "$T/before" "$T/after" | head -20; fi

# One pin drifted, timestamps old (not a local upgrade): the kernel layers pass, [skills] fails.
last="$(tail -n 1 ~/.local/state/agent-scripts/deploy-log.jsonl | jq -r .timestamp)"
key="$(jq -r --arg last "$last" '[.skills | to_entries[] | select(.value.updatedAt < $last) | .key][0]' ~/.agents/.skill-lock.json)"
jq --arg k "$key" '.skills[$k].skillFolderHash = "0000000000000000000000000000000000000000"' \
  ~/.agents/.skill-lock.json > "$T/lock.json"
if SKILLS_GLOBAL_LOCK="$T/lock.json" bash scripts/deploy.sh --check > "$T/neg.log" 2>&1; then
  bad "drifted pin: exit 0"
elif grep -q '^PASS \[global\]' "$T/neg.log" && grep -q "^FAIL \[skills\].* $key\$" "$T/neg.log"; then
  ok "drifted pin '$key': global PASS, [skills] exit 1 names it"
else bad "drifted pin: wrong failure:"; grep -E '^(PASS|FAIL) \[(global|skills)' "$T/neg.log"; fi

exit "$fail"
