#!/usr/bin/env bash
# Deployment PROVENANCE drift: does the last successful deploy on this host
# match the release ref deploy.sh would install now?
#
# Not a content check. deploy-log.jsonl records what was installed; it cannot
# see a later hand-edit of a runtime file. The full-file comparison in
# check-rules-invariants.mjs / deploy.sh remains the integrity check, and
# neither replaces the other.
#
# `Version:` in global/CLAUDE.md is a policy EDITION label on the periodic
# review cadence (maintenance.md §4) — it is not a drift signal. It stayed
# 4.24.0-ironlaws across 8 commits while this host ran 3-day-old kernels
# (session 76409ec8, 2026-08-31). This script is the drift signal.
#
# Compares against RELEASE_REF, the ref deploy.sh resolves — NOT local
# `git rev-parse HEAD`, which can be ahead, behind, or dirty relative to what
# was actually deployed (codex review, 2026-09-01).
set -euo pipefail

REPO_GIT_URL="${REPO_GIT_URL:-https://github.com/ohyeh/agent-scripts.git}"
RELEASE_REF="${RELEASE_REF:-refs/heads/main}"
LOG="${DEPLOY_LOG:-$HOME/.local/state/agent-scripts/deploy-log.jsonl}"

# Hook execution: run the active context-mode PreToolUse hook once. A mounted
# hook is not a working hook — grok-bot-vm ran 7 days with its bun replaced by
# an exit-127 shim and every check passed (W41 F2). Uses the command string from
# the ACTIVE install's hooks.json, so an absolute interpreter path is tested as is.
PLUGINS="$HOME/.claude/plugins/installed_plugins.json"
root="$(jq -r '.plugins["context-mode@context-mode"][0].installPath // empty' "$PLUGINS" 2>/dev/null || true)"
if [ -z "$root" ]; then
  echo "SKIP [hook] context-mode not installed for Claude on $(hostname)"
else
  cmd="$(jq -r '.hooks.PreToolUse[0].hooks[0].command' "$root/hooks/hooks.json")"
  probe='{"hook_event_name":"PreToolUse","session_id":"deploy-drift-probe","tool_name":"Read","tool_input":{"file_path":"/dev/null"}}'
  set +e
  printf '%s' "$probe" | CLAUDE_PLUGIN_ROOT="$root" perl -e 'alarm 30; exec @ARGV' bash -c "$cmd" >/dev/null 2>&1
  rc=$?
  set -e
  if [ "$rc" -ne 0 ]; then
    echo "FAIL [hook] context-mode PreToolUse exit=$rc on $(hostname): $cmd" >&2
    exit 1
  fi
  echo "PASS [hook] context-mode PreToolUse exit=0"
fi

[ -r "$LOG" ] || { echo "FAIL [drift] no deploy log at $LOG — host never deployed, or state was wiped" >&2; exit 1; }

# The log is per-machine (deploy.sh appends to its own ~), so the last valid
# entry IS this host's deploy. No filter on .host: macOS `hostname` moves with
# the network, and one machine logged under two names (2026-09-30).
deployed="$(jq -r 'select(.sha|test("^[0-9a-f]{40}$")) | .sha' "$LOG" | tail -1)"
[ -n "$deployed" ] || { echo "FAIL [drift] no valid 40-char sha in $LOG" >&2; exit 1; }

remote="$(git ls-remote "$REPO_GIT_URL" "$RELEASE_REF" | cut -f1)"
case "$remote" in
  ????????????????????????????????????????) ;;
  *) echo "FAIL [drift] could not resolve $RELEASE_REF to one 40-char sha" >&2; exit 1;;
esac

if [ "$deployed" = "$remote" ]; then
  echo "PASS [drift] $(hostname) deployed $RELEASE_REF @ $deployed"
  exit 0
fi
echo "FAIL [drift] $(hostname) is behind $RELEASE_REF" >&2
echo "  deployed: $deployed" >&2
echo "  release:  $remote" >&2
exit 1
