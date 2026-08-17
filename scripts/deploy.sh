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
#   5. hooks    - installs the kernel sentinel hooks (.agents/hooks/) into
#                 ~/.agents/hooks/ and registers them idempotently in
#                 ~/.claude/settings.json; removes the retired tmux dispatch
#                 hook (workflow-gate hooks live with their owning plugins).
set -euo pipefail

REPO_GIT_URL="https://github.com/ohyeh/agent-scripts.git"
RELEASE_REF="refs/heads/main"
cleanup() { rm -rf "$WORKDIR"; }

resolve_release() {
  echo "==> Resolving agent-scripts $RELEASE_REF..."
  DEPLOYED_SHA="$(git ls-remote "$REPO_GIT_URL" "$RELEASE_REF" | cut -f1)"
  if [[ ! "$DEPLOYED_SHA" =~ ^[0-9a-f]{40}$ ]]; then
    echo "FAIL [resolve] expected one 40-character commit SHA for $RELEASE_REF" >&2
    return 1
  fi
  REPO_TARBALL_URL="https://github.com/ohyeh/agent-scripts/archive/${DEPLOYED_SHA}.tar.gz"
  echo "PASS [resolve] $RELEASE_REF -> $DEPLOYED_SHA"
}

download_release() {
  echo "==> Downloading agent-scripts @ $DEPLOYED_SHA to scratch dir..."
  curl -fsSL "$REPO_TARBALL_URL" | tar xz -C "$WORKDIR"
  SRC="$WORKDIR/agent-scripts-$DEPLOYED_SHA"
  if [ ! -d "$SRC" ]; then
    echo "FAIL [download] archive did not extract the expected SHA-pinned tree: $SRC" >&2
    return 1
  fi
  echo "PASS [download] extracted to $SRC"
  echo "PASS [download] deploying $RELEASE_REF @ $DEPLOYED_SHA"
}

main() {
WORKDIR="$(mktemp -d)"
trap cleanup EXIT
resolve_release
download_release

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

# `experimental_install` adds/updates the lock roster but retains removed
# skills. Reconcile the managed directory so every deployment converges.
allowed_skills="$(jq -r '.skills | keys[]' "$SRC/skills-lock.json")"
removed_skills=0
while IFS= read -r installed_skill; do
  if ! grep -Fqx "$installed_skill" <<<"$allowed_skills"; then
    rm -rf "$HOME/.agents/skills/$installed_skill"
    removed_skills=$((removed_skills + 1))
  fi
done < <(find "$HOME/.agents/skills" -mindepth 1 -maxdepth 1 -type d -exec basename {} \; | sort)

unexpected_skills="$(comm -23 \
  <(find "$HOME/.agents/skills" -mindepth 1 -maxdepth 1 -type d -exec basename {} \; | sort) \
  <(printf '%s\n' "$allowed_skills" | sort))"
if [ -n "$unexpected_skills" ]; then
  echo "FAIL [skills] stale managed skills remain: $unexpected_skills" >&2
  exit 1
fi
echo "PASS [skills] experimental_install completed; removed $removed_skills stale skill(s)"

# --- Layer 5: hooks ------------------------------------------------------------
# Kernel sentinel hooks (version-upgrade tripwire + session-title nudge) are
# repo-managed: installed to ~/.agents/hooks/ and registered idempotently in
# ~/.claude/settings.json. Workflow-gate hooks stay with their owning plugins.
echo "==> [hooks] installing sentinel hooks + registering in ~/.claude/settings.json"
rm -f ~/.agents/hooks/tmux-dispatch-gate.sh   # retired; owned by the tmux-agent-tools plugin
mkdir -p ~/.agents/hooks
install -m 0755 "$SRC/.agents/hooks/claude-version-sentinel.sh" ~/.agents/hooks/
install -m 0755 "$SRC/.agents/hooks/session-title-sentinel.sh" ~/.agents/hooks/
install -m 0755 "$SRC/.agents/hooks/bol-prompt-warn.sh" ~/.agents/hooks/
install -m 0755 "$SRC/scripts/check-bol-prompt.sh" ~/.agents/hooks/
install -m 0755 "$SRC/.agents/hooks/context-ledger.sh" ~/.agents/hooks/

SETTINGS=~/.claude/settings.json
[ -f "$SETTINGS" ] || echo '{}' > "$SETTINGS"
tmp_settings="$(mktemp)"
jq --arg vs "\"\$HOME/.agents/hooks/claude-version-sentinel.sh\"" \
   --arg ts "\"\$HOME/.agents/hooks/session-title-sentinel.sh\"" \
   --arg bol "\"\$HOME/.agents/hooks/bol-prompt-warn.sh\"" \
   --arg ledger "\"\$HOME/.agents/hooks/context-ledger.sh\"" '
  def ensure(ev; cmd):
    .hooks[ev] = ((.hooks[ev] // [])
      | if any(.[]; any(.hooks[]?; .command == cmd))
        then . else . + [{"hooks":[{"type":"command","command":cmd}]}] end);
  def ensureMatched(ev; matcher; cmd):
    .hooks[ev] = ((.hooks[ev] // [])
      | if any(.[]; any(.hooks[]?; .command == cmd))
        then . else . + [{"matcher": matcher, "hooks":[{"type":"command","command":cmd}]}] end);
  ensure("SessionStart"; $vs)
  | ensure("Stop"; $ts)
  | ensureMatched("PreToolUse"; "Agent"; $bol)
  | ensureMatched("PostToolUse"; "*"; $ledger)
' "$SETTINGS" > "$tmp_settings" && mv "$tmp_settings" "$SETTINGS"

for h in claude-version-sentinel session-title-sentinel bol-prompt-warn context-ledger; do
  if [ ! -x ~/.agents/hooks/$h.sh ] || ! grep -q "$h" "$SETTINGS"; then
    echo "FAIL [hooks] $h.sh not installed or not registered in settings.json" >&2
    exit 1
  fi
done
jq -e . "$SETTINGS" >/dev/null || { echo "FAIL [hooks] settings.json is no longer valid JSON" >&2; exit 1; }
echo "PASS [hooks] sentinel hooks installed + registered, retired dispatch hook absent"

echo "==> DEPLOY OK — all layers PASS"
}

# :- so piping the script in (ssh host 'bash -s' < deploy.sh) works under set -u,
# where BASH_SOURCE is unset and the guard must still run main.
if [[ "${BASH_SOURCE[0]:-$0}" == "$0" ]]; then
  main "$@"
fi
