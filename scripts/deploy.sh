#!/usr/bin/env bash
# Clone-free fleet deploy: downloads the current agent-scripts main tarball
# to a scratch dir and deploys all four runtime layers from it. No git
# clone, no working copy left behind on the target machine — the repo is
# canonical, machines are deployed copies only.
#
# Usage: scripts/deploy.sh   (no flags; always runs all four layers, per
# YAGNI -- this script has exactly one job)
#
# Layers, in order (each layer prints PASS/FAIL + the hash/diff evidence it
# checked; the FIRST failing layer aborts the whole run non-zero -- fail
# fast, no silent fallback to a partial deploy):
#   1. global   - global/CLAUDE.md -> ~/.claude/CLAUDE.md,
#                 global/AGENTS.md -> ~/.codex/AGENTS.md, verified by md5.
#   2. rules    - rsync -a --delete --exclude lessons.md .agents/rules/ -> ~/.agents/rules/,
#                 verified by a diff (lessons.md excluded, always local-only).
#   3. workflows- skills/using-workflows/scripts/install.sh --force into
#                 ~/.claude/workflows/, verified by matching aggregate
#                 sha256 (computed with a relative cd so paths don't leak
#                 into the hash) against the downloaded tree.
#   4. skills   - restores skills-lock.json via `npx skills experimental_install`,
#                 run from $HOME per the CLI's cwd-relative install path
#                 (see README.md "Fleet skill restore").
set -euo pipefail

REPO_TARBALL_URL="https://github.com/ohyeh/agent-scripts/archive/refs/heads/main.tar.gz"
WORKDIR="$(mktemp -d)"
cleanup() { rm -rf "$WORKDIR"; }
trap cleanup EXIT

echo "==> Downloading agent-scripts (main) to scratch dir..."
curl -fsSL "$REPO_TARBALL_URL" | tar xz -C "$WORKDIR"
SRC="$(find "$WORKDIR" -maxdepth 1 -type d -name 'agent-scripts-*' | head -1)"
if [ -z "$SRC" ] || [ ! -d "$SRC" ]; then
  echo "FAIL [download] could not locate the extracted repo tree under $WORKDIR" >&2
  exit 1
fi
echo "PASS [download] extracted to $SRC"

# --- Layer 1: global runtime files -----------------------------------------
echo "==> [global] deploying CLAUDE.md + AGENTS.md"
cp "$SRC/global/CLAUDE.md" ~/.claude/CLAUDE.md
cp "$SRC/global/AGENTS.md" ~/.codex/AGENTS.md
claude_src_md5="$(md5 -q "$SRC/global/CLAUDE.md")"
claude_dst_md5="$(md5 -q ~/.claude/CLAUDE.md)"
agents_src_md5="$(md5 -q "$SRC/global/AGENTS.md")"
agents_dst_md5="$(md5 -q ~/.codex/AGENTS.md)"
if [ "$claude_src_md5" != "$claude_dst_md5" ] || [ "$agents_src_md5" != "$agents_dst_md5" ]; then
  echo "FAIL [global] md5 mismatch: CLAUDE.md $claude_src_md5 vs $claude_dst_md5 | AGENTS.md $agents_src_md5 vs $agents_dst_md5" >&2
  exit 1
fi
echo "PASS [global] md5 match (CLAUDE.md=$claude_src_md5, AGENTS.md=$agents_src_md5)"

# --- Layer 2: rules ----------------------------------------------------------
echo "==> [rules] rsync .agents/rules/ -> ~/.agents/rules/ (lessons.md excluded, local-only)"
mkdir -p ~/.agents/rules
rsync -a --delete --exclude lessons.md "$SRC/.agents/rules/" ~/.agents/rules/
rules_diff="$(diff -rq --exclude=lessons.md ~/.agents/rules/ "$SRC/.agents/rules/" || true)"
if [ -n "$rules_diff" ]; then
  echo "FAIL [rules] diff found after rsync:" >&2
  echo "$rules_diff" >&2
  exit 1
fi
if [ ! -f ~/.agents/rules/lessons.md ]; then
  echo "FAIL [rules] lessons.md is missing after sync (must never be deleted)" >&2
  exit 1
fi
echo "PASS [rules] 0 diff (excl lessons.md), lessons.md preserved"

# --- Layer 3: workflows -------------------------------------------------------
echo "==> [workflows] install.sh --force -> ~/.claude/workflows/"
mkdir -p ~/.claude/workflows
manifest=~/.claude/workflows/.using-workflows-managed-files
[ -f "$manifest" ] || : > "$manifest"   # bootstrap: empty manifest on a fresh machine
bash "$SRC/skills/using-workflows/scripts/install.sh" --previous-manifest "$manifest" --force
deployed_hash="$(cd ~/.claude/workflows && shasum -a 256 *.workflow.js | shasum -a 256)"
repo_hash="$(cd "$SRC/skills/using-workflows/workflows" && shasum -a 256 *.workflow.js | shasum -a 256)"
if [ "$deployed_hash" != "$repo_hash" ]; then
  echo "FAIL [workflows] aggregate hash mismatch: deployed=$deployed_hash repo=$repo_hash" >&2
  exit 1
fi
echo "PASS [workflows] aggregate hash match ($deployed_hash)"

# --- Layer 4: skills -----------------------------------------------------------
echo "==> [skills] restoring skills-lock.json via npx skills experimental_install"
if [ ! -f "$SRC/skills-lock.json" ]; then
  echo "FAIL [skills] no skills-lock.json in the downloaded repo tree" >&2
  exit 1
fi
cp "$SRC/skills-lock.json" ~/skills-lock.json
( cd ~ && npx -y skills experimental_install )
rm -f ~/skills-lock.json
if [ ! -d ~/.agents/skills ]; then
  echo "FAIL [skills] ~/.agents/skills does not exist after restore" >&2
  exit 1
fi
echo "PASS [skills] experimental_install completed, ~/.agents/skills present"

echo "==> DEPLOY OK — all four layers PASS"
