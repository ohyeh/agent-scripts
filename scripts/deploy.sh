#!/usr/bin/env bash
# Clone-free fleet deploy: downloads the current agent-scripts main tarball
# to a scratch dir and deploys every runtime layer from it. No git
# clone, no working copy left behind on the target machine — the repo is
# canonical, machines are deployed copies only.
#
# Usage: scripts/deploy.sh   (no flags; always runs every layer, per
# YAGNI -- this script has exactly one job)
#
# Layers, in order (each layer prints PASS/FAIL + the hash/diff evidence it
# checked; the FIRST failing layer aborts the whole run non-zero -- fail
# fast, no silent fallback to a partial deploy):
#   0. invariants - scripts/check-rules-invariants.mjs run inside the
#                 downloaded tree; any FAIL aborts before ~ is touched.
#   1. global   - global/CLAUDE.md -> ~/.claude/CLAUDE.md,
#                 global/AGENTS.md -> ~/.codex/AGENTS.md, verified by md5.
#   2. rules    - rsync -a --delete .agents/rules/ -> ~/.agents/rules/,
#                 verified by a full diff. The repo is canonical, including lessons.md.
#   3. workflows- skills/using-workflows/scripts/install.sh --force into
#                 ~/.claude/workflows/, verified by matching aggregate
#                 sha256 (computed with a relative cd so paths don't leak
#                 into the hash) against the downloaded tree.
#   4. skills   - restores skills-lock.json via `npx skills experimental_install`,
#                 run from $HOME per the CLI's cwd-relative install path
#                 (see README.md "Fleet skill restore").
#   5. hooks    - installs the kernel sentinel hooks (.agents/hooks/) into
#                 ~/.agents/hooks/; registers them in ~/.claude/settings.json
#                 (Claude events) and ~/.cursor/hooks.json (Cursor events via
#                 cursor-adapt.sh). Removes the retired tmux dispatch hook
#                 (workflow-gate hooks live with their owning plugins).
#   6. context-mode dir - pin CONTEXT_MODE_DIR to ~/.claude/context-mode on
#                 every present runtime (Codex/Cursor/Gemini/zshrc + Cursor
#                 symlink). Plugin upgrades rewrite MCP env; this layer
#                 puts the pin back and fails closed if it did not stick.
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

# --- Layer 0: rules invariants (the only caller of this check; a red here
# means main is not deployable — abort before any layer mutates ~) -----------
echo "==> [invariants] node scripts/check-rules-invariants.mjs @ $DEPLOYED_SHA"
if ! (cd "$SRC" && node scripts/check-rules-invariants.mjs); then
  echo "FAIL [invariants] check-rules-invariants exited non-zero; refusing to deploy" >&2
  exit 1
fi
echo "PASS [invariants] all checks green"

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
echo "==> [rules] rsync canonical .agents/rules/ -> ~/.agents/rules/"
mkdir -p ~/.agents/rules
rsync -a --delete "$SRC/.agents/rules/" ~/.agents/rules/
rules_diff="$(diff -rq ~/.agents/rules/ "$SRC/.agents/rules/" || true)"
if [ -n "$rules_diff" ]; then
  echo "FAIL [rules] diff found after rsync:" >&2
  echo "$rules_diff" >&2
  exit 1
fi
echo "PASS [rules] 0 diff, including repo-canonical lessons.md"

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
rm -f ~/.agents/hooks/bol-prompt-warn.sh      # retired 2026-08-25; replaced by bol-prompt-gate.sh (blocking)
mkdir -p ~/.agents/hooks
install -m 0755 "$SRC/.agents/hooks/claude-version-sentinel.sh" ~/.agents/hooks/
install -m 0755 "$SRC/.agents/hooks/session-title-sentinel.sh" ~/.agents/hooks/
install -m 0755 "$SRC/.agents/hooks/bol-prompt-gate.sh" ~/.agents/hooks/
install -m 0755 "$SRC/.agents/hooks/subagent-ledger.sh" ~/.agents/hooks/
install -m 0755 "$SRC/scripts/check-bol-prompt.sh" ~/.agents/hooks/
install -m 0755 "$SRC/.agents/hooks/context-ledger.sh" ~/.agents/hooks/
install -m 0755 "$SRC/.agents/hooks/bash-read-audit.sh" ~/.agents/hooks/
install -m 0755 "$SRC/.agents/hooks/agent-device-target-gate.sh" ~/.agents/hooks/
install -m 0755 "$SRC/.agents/hooks/tmux-assign-host-gate.sh" ~/.agents/hooks/
install -m 0755 "$SRC/.agents/hooks/cursor-adapt.sh" ~/.agents/hooks/

SETTINGS=~/.claude/settings.json
[ -f "$SETTINGS" ] || echo '{}' > "$SETTINGS"
tmp_settings="$(mktemp)"
jq --arg vs "\"\$HOME/.agents/hooks/claude-version-sentinel.sh\"" \
   --arg ts "\"\$HOME/.agents/hooks/session-title-sentinel.sh\"" \
   --arg bolold "\"\$HOME/.agents/hooks/bol-prompt-warn.sh\"" \
   --arg bol "\"\$HOME/.agents/hooks/bol-prompt-gate.sh\"" \
   --arg subledger "\"\$HOME/.agents/hooks/subagent-ledger.sh\"" \
   --arg ledger "\"\$HOME/.agents/hooks/context-ledger.sh\"" \
   --arg audit "\"\$HOME/.agents/hooks/bash-read-audit.sh\"" \
   --arg device "\"\$HOME/.agents/hooks/agent-device-target-gate.sh\"" \
   --arg assignhost "\"\$HOME/.agents/hooks/tmux-assign-host-gate.sh\"" '
  def ensure(ev; cmd):
    .hooks[ev] = ((.hooks[ev] // [])
      | if any(.[]; any(.hooks[]?; .command == cmd))
        then . else . + [{"hooks":[{"type":"command","command":cmd}]}] end);
  def ensureMatched(ev; matcher; cmd):
    .hooks[ev] = ((.hooks[ev] // [])
      | if any(.[]; any(.hooks[]?; .command == cmd))
        then . else . + [{"matcher": matcher, "hooks":[{"type":"command","command":cmd}]}] end);
  def retire(ev; cmd):
    .hooks[ev] = ((.hooks[ev] // [])
      | map(.hooks |= map(select(.command != cmd))) | map(select(.hooks | length > 0)));
  retire("PreToolUse"; $bolold)
  | ensure("SessionStart"; $vs)
  | ensure("Stop"; $ts)
  | ensureMatched("PreToolUse"; "Agent"; $bol)
  | ensure("SubagentStart"; $subledger)
  | ensure("SubagentStop"; $subledger)
  | ensureMatched("PreToolUse"; "Bash"; $audit)
  | ensureMatched("PreToolUse"; "Bash"; $device)
  | ensureMatched("PreToolUse"; "Bash"; $assignhost)
  | ensureMatched("PostToolUse"; "*"; $ledger)
' "$SETTINGS" > "$tmp_settings" && mv "$tmp_settings" "$SETTINGS"

for h in claude-version-sentinel session-title-sentinel bol-prompt-gate subagent-ledger context-ledger bash-read-audit agent-device-target-gate tmux-assign-host-gate; do
  if [ ! -x ~/.agents/hooks/$h.sh ] || ! grep -q "$h" "$SETTINGS"; then
    echo "FAIL [hooks] $h.sh not installed or not registered in settings.json" >&2
    exit 1
  fi
done
# The gate fails closed: a missing validator would deny every dispatch, so its presence is a deploy check.
[ -x ~/.agents/hooks/check-bol-prompt.sh ] || { echo "FAIL [hooks] check-bol-prompt.sh (bol-prompt-gate validator) not installed" >&2; exit 1; }
[ -x ~/.agents/hooks/cursor-adapt.sh ] || { echo "FAIL [hooks] cursor-adapt.sh not installed" >&2; exit 1; }
if [ -e ~/.agents/hooks/bol-prompt-warn.sh ] || grep -q 'bol-prompt-warn' "$SETTINGS"; then
  echo "FAIL [hooks] retired bol-prompt-warn.sh still installed or registered" >&2
  exit 1
fi
jq -e . "$SETTINGS" >/dev/null || { echo "FAIL [hooks] settings.json is no longer valid JSON" >&2; exit 1; }
echo "PASS [hooks] sentinel hooks installed + registered, retired dispatch/warn hooks absent"

echo "==> [hooks] registering portable sentinels in ~/.cursor/hooks.json"
bash "$SRC/scripts/install-cursor-hooks.sh"
bash "$SRC/scripts/check-cursor-hooks.sh"
echo "PASS [hooks] Cursor adapter registry"

# --- Layer 6: context-mode storage pin ---------------------------------------
# Machine-local. Layer 0 cannot see ~/. Plugin upgrades drop CONTEXT_MODE_DIR.
echo "==> [context-mode] pin storage to ~/.claude/context-mode"
bash "$SRC/scripts/install-context-mode-dir.sh"
echo "PASS [context-mode] canonical store ~/.claude/context-mode"

echo "==> DEPLOY OK — all layers PASS"
}

# :- so piping the script in (ssh host 'bash -s' < deploy.sh) works under set -u,
# where BASH_SOURCE is unset and the guard must still run main.
if [[ "${BASH_SOURCE[0]:-$0}" == "$0" ]]; then
  main "$@"
fi
