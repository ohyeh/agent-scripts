#!/usr/bin/env bash
# Clone-free fleet deploy: downloads the current agent-scripts main tarball
# to a scratch dir and deploys every runtime layer from it. No git
# clone, no working copy left behind on the target machine — the repo is
# canonical, machines are deployed copies only.
#
# Usage: scripts/deploy.sh   (no flags; always runs every layer, per
# YAGNI -- this script has exactly one job)
#
# Clone-tracked layout (grok-bot VM): when ~/.agents/rules is a symlink into
# a working clone of this repo, the clone IS the source: `git pull --ff-only`
# replaces the tarball, the rules rsync and the hook copies are skipped
# (they would overwrite the symlink targets in place and dirty the git
# tree), every verify step still runs. Everything else is identical.
#
# Layers, in order (each layer prints PASS/FAIL + the hash/diff evidence it
# checked; the FIRST failing layer aborts the whole run non-zero -- fail
# fast, no silent fallback to a partial deploy):
#   0. invariants - scripts/check-rules-invariants.mjs run inside the
#                 downloaded tree; any FAIL aborts before ~ is touched.
#   1. global   - global/CLAUDE.md -> ~/.claude/CLAUDE.md,
#                 global/AGENTS.md -> ~/.codex/AGENTS.md,
#                 global/CLAUDE.md -> ~/.gemini/GEMINI.md (if ~/.gemini exists),
#                 each verified by md5.
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
#   7. cursor   - kernel.mdc, Ponytail instruction rule (if plugin present),
#                 HUD scripts + statusLine merge (never copies cli-config).
#   8. agents   - global/agents/<runtime>/ -> that runtime's agent dir
#                 (claude -> ~/.claude/agents, codex -> ~/.codex/agents),
#                 rsync --delete + diff, only for sub-dirs present in the repo.
set -euo pipefail

# macOS ships `md5 -q`; Linux (grok-bot VM) has md5sum only and a non-login ssh
# PATH. Shim once here; `export -f` reaches every `bash scripts/*.sh` child.
if ! command -v md5 >/dev/null 2>&1; then
  md5() { [ "${1:-}" = -q ] && shift; { if [ $# -gt 0 ]; then md5sum "$1"; else md5sum; fi; } | cut -d' ' -f1; }
  export -f md5
fi

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

CLONE_TRACKED=0
detect_clone_tracked() {
  [ -L ~/.agents/rules ] || return 0
  local target; target="$(cd "$(dirname "$(readlink ~/.agents/rules)")/.." && pwd -P)"
  # the symlink must point at <clone>/.agents/rules of THIS repo, on branch main
  if [ ! -f "$target/scripts/deploy.sh" ] || ! git -C "$target" remote get-url origin 2>/dev/null | grep -q 'ohyeh/agent-scripts'; then
    echo "FAIL [resolve] ~/.agents/rules is a symlink but not into an agent-scripts clone: $target" >&2
    return 1
  fi
  if [ -n "$(git -C "$target" status --porcelain --untracked-files=no)" ]; then
    echo "FAIL [resolve] clone $target has tracked changes; refusing to pull over them" >&2
    return 1
  fi
  CLONE_TRACKED=1; SRC="$target"
  echo "==> [resolve] clone-tracked layout: ~/.agents/rules -> $target; pulling $RELEASE_REF"
  git -C "$SRC" pull -q --ff-only origin "${RELEASE_REF#refs/heads/}"
  DEPLOYED_SHA="$(git -C "$SRC" rev-parse HEAD)"
  echo "PASS [resolve] clone @ $DEPLOYED_SHA (git pull --ff-only; tarball skipped)"
}

main() {
WORKDIR="$(mktemp -d)"
trap cleanup EXIT
detect_clone_tracked
if [ "$CLONE_TRACKED" = 0 ]; then
  resolve_release
  download_release
fi

# --- Layer 0: rules invariants (the only caller of this check; a red here
# means main is not deployable — abort before any layer mutates ~) -----------
echo "==> [invariants] node scripts/check-rules-invariants.mjs @ $DEPLOYED_SHA"
if ! (cd "$SRC" && node scripts/check-rules-invariants.mjs); then
  echo "FAIL [invariants] check-rules-invariants exited non-zero; refusing to deploy" >&2
  exit 1
fi
echo "PASS [invariants] all checks green"

# --- Layer 1: global runtime files -----------------------------------------
# Same kernel to every present runtime: Claude, Codex, and Gemini/agy (GEMINI.md
# only when ~/.gemini exists — that runtime is optional).
echo "==> [global] deploying CLAUDE.md + AGENTS.md (+ GEMINI.md if ~/.gemini present)"
global_targets=(
  "$SRC/global/CLAUDE.md:$HOME/.claude/CLAUDE.md"
  "$SRC/global/AGENTS.md:$HOME/.codex/AGENTS.md"
)
if [ -d "$HOME/.gemini" ]; then
  global_targets+=("$SRC/global/CLAUDE.md:$HOME/.gemini/GEMINI.md")
fi
global_report=""
for pair in "${global_targets[@]}"; do
  src="${pair%%:*}"; dst="${pair#*:}"
  cp "$src" "$dst"
  src_md5="$(md5 -q "$src")"; dst_md5="$(md5 -q "$dst")"
  if [ "$src_md5" != "$dst_md5" ]; then
    echo "FAIL [global] md5 mismatch: $dst $src_md5 vs $dst_md5" >&2
    exit 1
  fi
  global_report="$global_report $(basename "$dst")=$src_md5"
done
echo "PASS [global] md5 match ($global_report )"

# --- Layer 2: rules ----------------------------------------------------------
echo "==> [rules] rsync canonical .agents/rules/ -> ~/.agents/rules/"
if [ "$CLONE_TRACKED" = 1 ]; then
  echo "     (clone-tracked: symlink already points at the pulled clone; rsync skipped, diff still verified)"
else
  mkdir -p ~/.agents/rules
  rsync -a --delete "$SRC/.agents/rules/" ~/.agents/rules/
fi
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
# same-file guard: on the clone-tracked layout ~/.agents/hooks IS $SRC/.agents/hooks
hook_install() { [ "$1" -ef ~/.agents/hooks/"$(basename "$1")" ] || install -m 0755 "$1" ~/.agents/hooks/; }
hook_install "$SRC/.agents/hooks/claude-version-sentinel.sh"
hook_install "$SRC/.agents/hooks/session-title-sentinel.sh"
hook_install "$SRC/.agents/hooks/bol-prompt-gate.sh"
hook_install "$SRC/.agents/hooks/subagent-ledger.sh"
install -m 0755 "$SRC/scripts/check-bol-prompt.sh" ~/.agents/hooks/
hook_install "$SRC/.agents/hooks/context-ledger.sh"
hook_install "$SRC/.agents/hooks/bash-read-audit.sh"
hook_install "$SRC/.agents/hooks/bash-readonly-gate.sh"   # attached by global/agents/claude/*.md frontmatter, not settings.json
hook_install "$SRC/.agents/hooks/agent-device-target-gate.sh"
hook_install "$SRC/.agents/hooks/tmux-assign-host-gate.sh"
hook_install "$SRC/.agents/hooks/cursor-adapt.sh"
hook_install "$SRC/.agents/hooks/compaction-recall.sh"
hook_install "$SRC/.agents/hooks/precompact-instructions.sh"
hook_install "$SRC/.agents/hooks/postcompact-handoff.sh"
hook_install "$SRC/.agents/hooks/evidence-tokens.sh"
hook_install "$SRC/.agents/hooks/claim-evidence-gate.sh"
hook_install "$SRC/.agents/hooks/subagent-concurrency-gate.sh"
hook_install "$SRC/.agents/hooks/deny-replay-gate.sh"

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
   --arg assignhost "\"\$HOME/.agents/hooks/tmux-assign-host-gate.sh\"" \
   --arg recall "\"\$HOME/.agents/hooks/compaction-recall.sh\"" \
   --arg precompact "\"\$HOME/.agents/hooks/precompact-instructions.sh\"" \
   --arg postcompact "\"\$HOME/.agents/hooks/postcompact-handoff.sh\"" \
   --arg claim "\"\$HOME/.agents/hooks/claim-evidence-gate.sh\"" \
   --arg conc "\"\$HOME/.agents/hooks/subagent-concurrency-gate.sh\"" \
   --arg deny "\"\$HOME/.agents/hooks/deny-replay-gate.sh\"" '
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
  | ensureMatched("SessionStart"; "compact"; $recall)
  | ensure("PreCompact"; $precompact)
  | ensure("PostCompact"; $postcompact)
  | ensure("Stop"; $claim)
  | ensureMatched("PreToolUse"; "Agent"; $conc)
  | ensureMatched("PreToolUse"; "*"; $deny)
' "$SETTINGS" > "$tmp_settings" && mv "$tmp_settings" "$SETTINGS"

for h in claude-version-sentinel session-title-sentinel claim-evidence-gate bol-prompt-gate subagent-concurrency-gate deny-replay-gate subagent-ledger context-ledger bash-read-audit agent-device-target-gate tmux-assign-host-gate compaction-recall precompact-instructions postcompact-handoff; do
  if [ ! -x ~/.agents/hooks/$h.sh ] || ! grep -q "$h" "$SETTINGS"; then
    echo "FAIL [hooks] $h.sh not installed or not registered in settings.json" >&2
    exit 1
  fi
done
# The gate fails closed: a missing validator would deny every dispatch, so its presence is a deploy check.
[ -x ~/.agents/hooks/check-bol-prompt.sh ] || { echo "FAIL [hooks] check-bol-prompt.sh (bol-prompt-gate validator) not installed" >&2; exit 1; }
[ -x ~/.agents/hooks/evidence-tokens.sh ] || { echo "FAIL [hooks] evidence-tokens.sh (shared by context-ledger + claim-evidence-gate) not installed" >&2; exit 1; }
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

# --- Layer 7: Cursor runtime (kernel / ponytail rule / HUD) -------------------
echo "==> [cursor] kernel.mdc + ponytail rule + HUD statusLine"
bash "$SRC/scripts/install-cursor-kernel.sh"
bash "$SRC/scripts/install-cursor-ponytail.sh"
bash "$SRC/scripts/install-cursor-hud.sh"
bash "$SRC/scripts/check-cursor-runtime.sh"
echo "PASS [cursor] kernel + HUD + ponytail wiring"

# --- Layer 8: agent definitions ----------------------------------------------
echo "==> [agents] global/agents/<runtime>/ -> runtime agent dirs"
agents_report=""
for rt in claude codex; do
  src="$SRC/global/agents/$rt"
  [ -d "$src" ] || continue
  case "$rt" in claude) dst="$HOME/.claude/agents";; codex) dst="$HOME/.codex/agents";; esac
  # A frontmatter hook whose script is missing is a SILENT ALLOW (measured
  # 2026-09-04: bogus command path -> `echo x > f` succeeded). Fail closed:
  # every `command:` a definition references must already be executable here.
  while IFS= read -r hook_cmd; do
    hook_path="${hook_cmd//\$HOME/$HOME}"; hook_path="${hook_path//\~/$HOME}"
    if [ ! -x "$hook_path" ]; then
      echo "FAIL [agents] $rt definition references hook not installed/executable: $hook_cmd" >&2
      exit 1
    fi
  done < <(grep -h -E '^[[:space:]]*command:[[:space:]]*' "$src"/*.md 2>/dev/null | sed -E 's/^[[:space:]]*command:[[:space:]]*//; s/^"//; s/"$//')
  mkdir -p "$dst"
  rsync -a --delete "$src/" "$dst/"
  agents_diff="$(diff -rq "$dst/" "$src/" || true)"
  if [ -n "$agents_diff" ]; then
    echo "FAIL [agents] $rt diff found after rsync:" >&2
    echo "$agents_diff" >&2
    exit 1
  fi
  agents_report="$agents_report $rt=$(find "$src" -type f | wc -l | tr -d ' ')"
done
echo "PASS [agents] 0 diff (${agents_report# })"

# W35 retro F2: a per-host deploy record, so a retro can window "after both
# hosts ran version X" instead of comparing hosts on different gate versions.
mkdir -p ~/.local/state/agent-scripts
deploy_method=tarball; [ "$CLONE_TRACKED" = 1 ] && deploy_method=clone-tracked
printf '{"timestamp":"%s","host":"%s","sha":"%s","method":"%s"}\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$(hostname)" "$DEPLOYED_SHA" "$deploy_method" >> ~/.local/state/agent-scripts/deploy-log.jsonl
echo "PASS [deploy-log] appended $(hostname) @ ${DEPLOYED_SHA:0:7} -> ~/.local/state/agent-scripts/deploy-log.jsonl"
echo "==> DEPLOY OK — all layers PASS"
}

# :- so piping the script in (ssh host 'bash -s' < deploy.sh) works under set -u,
# where BASH_SOURCE is unset and the guard must still run main.
if [[ "${BASH_SOURCE[0]:-$0}" == "$0" ]]; then
  main "$@"
fi
