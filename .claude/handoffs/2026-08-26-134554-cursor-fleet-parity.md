# Handoff: Cursor fleet parity (hooks, store pin, kernel, HUD, ponytail)

## Session Metadata
- Created: 2026-08-26 13:45:54
- Project: ~/git/agent-scripts
- Branch: main (local ahead of origin; commit `8d87757` plus uncommitted Layer 7 at handoff time)
- Session duration: ~2.5 hours (resume of 11:45 handoff through 13:45 UTC+8)

### Recent Commits (for context)
  - 8d87757 feat(deploy): pin context-mode store and wire Cursor fleet hooks
  - a927ca5 feat(cursor): add HUD plan-usage injector and kernel install script
  - 41483fb chore(statusline): backup the shared Claude/Cursor HUD wrapper
  - 2f11789 feat(hooks): wire the detectors to actuators — bol gate blocks, deploy refuses red invariants
  - 678a75f fix(judgment-rubrics): act on codex BLOCK — narrow the absence rule, unlaunder the baseline

## Handoff Chain

- **Continues from**: [2026-08-26-114552-cursor-cli-kernel-hud.md](./2026-08-26-114552-cursor-cli-kernel-hud.md)
  - Previous title: Cursor CLI kernel + HUD + usage
- **Supersedes**: that handoff's "kernel/HUD not in deploy" and "hooks uninvestigated" claims. Kernel is live; HUD was already live; both are now install scripts + `deploy.sh` Layer 7 (uncommitted at scaffold time — next session should treat them as committed if this session's push landed).

## Current State Summary

This session finished Cursor as a first-class fleet runtime on this machine and in `deploy.sh`: context-mode storage pinned to `$HOME/.claude/context-mode`, fleet hooks registered in `$HOME/.cursor/hooks.json` via `cursor-adapt.sh`, kernel already at `$HOME/.cursor/rules/kernel.mdc`, Ponytail instruction rule copied from the plugin cache, HUD scripts + `statusLine` merge. Commit `8d87757` covers the store pin + Cursor hook adapter. Layer 7 (kernel/HUD/ponytail installers) was implemented and live-installed but not yet committed when the handoff scaffold ran. The running Cursor CLI process may not have reloaded `hooks.json` / `ponytail.mdc` — restart is still required for those. Fleet `deploy.sh` from origin/main is still blocked by Layer 0: the previous handoff's `Project:` home path (fix in this change) and `rulesBytes` over baseline (untouched; needs an explicit `--accept` or a shrink).

## Codebase Understanding

## Architecture Overview

agent-scripts deploys a dual-runtime kernel (`global/CLAUDE.md` = `global/AGENTS.md`) plus routed rules, skills, and hooks. Cursor has no `~/.codex/AGENTS.md` slot: the analog is `$HOME/.cursor/rules/kernel.mdc`. Fleet hooks are Claude-shaped (`tool_name=Bash`, `session_id`, exit 2) and live in `.agents/hooks/`. Cursor native hooks use different event names (`preToolUse`), tool names (`Shell`), session keys (`conversation_id`), and treat empty stdout as invalid. The adapter at `.agents/hooks/cursor-adapt.sh` remaps stdin and always emits JSON. Plugin-owned hooks (context-mode Cursor hooks, tmux-dispatch, Ponytail lifecycle) stay with their plugins. Ponytail on Cursor is instruction-only: copy the plugin's Cursor rule file into the user rules dir, do not vendor it.

## Critical Files

| File | Purpose | Relevance |
|------|---------|-----------|
| `scripts/deploy.sh` | Clone-free fleet deploy | Layers 5 (hooks+Cursor adapter), 6 (CONTEXT_MODE_DIR pin), 7 (kernel/HUD/ponytail) |
| `.agents/hooks/cursor-adapt.sh` | Cursor stdin → Claude-shaped fleet hooks | Do not pipe JSON into a python heredoc (stdin collision) |
| `scripts/install-cursor-hooks.sh` | Writes `$HOME/.cursor/hooks.json` + `./hooks/fleet-*.sh` | User-hook cwd is `$HOME/.cursor/` |
| `scripts/install-cursor-kernel.sh` | Wraps `global/AGENTS.md` as `kernel.mdc` | Body md5 must match |
| `scripts/install-cursor-hud.sh` | Copies HUD scripts; merges `statusLine` only | Never copy full `cli-config.json` |
| `scripts/install-cursor-ponytail.sh` | Copies rule from plugin cache | WARN if plugin absent |
| `scripts/install-context-mode-dir.sh` | Pins every present runtime to Claude store | Plugin upgrades drop the env |
| `scripts/check-cursor-hooks.sh` | Fail-closed hook registry | Skips Claude-only/unsafe gates |
| `scripts/check-cursor-runtime.sh` | Fail-closed kernel/HUD/ponytail | After Layer 7 |
| `scripts/test-cursor-hook-adapter.sh` | Adapter unit tests | Must stay green |

### Key Patterns Discovered

- User Cursor hooks: relative `./hooks/...` from `$HOME/.cursor/`, not `$HOME/.agents/hooks/...`.
- Cursor `failClosed` + empty stdout: adapter must emit `{"agent_message":""}` on allow and `permission: deny` JSON on exit 2.
- `subagentStop` omits `subagent_id`; ledger ids are `sha256(type+task)` so start/stop match.
- Do not symlink leftover adapter session trees (Codex vs Claude inodes differ). Canonical store only: `$HOME/.claude/context-mode`.
- `public-sensitive-literals` greps `.claude/handoffs` for absolute macOS home paths. Handoff `Project:` must be `~/git/agent-scripts`. `validate_handoff.py` does not check that — its PASS is not Layer 0 evidence.

## Work Completed

### Tasks Finished

- [x] Verified kernel load in this Cursor CLI session (`alwaysApply` `kernel.mdc`, body md5 matches `global/AGENTS.md`)
- [x] Pinned context-mode storage to `$HOME/.claude/context-mode` across Codex/Cursor/Gemini/zshrc; leftover adapter dirs WARN only
- [x] Cursor fleet hooks via adapter; tests PASS; live `hooks.json` registered
- [x] Commit `8d87757` (store pin + Cursor hooks); not pushed at that moment
- [x] Copied Ponytail 4.9.0 `ponytail.mdc` to `$HOME/.cursor/rules/`
- [x] Wired kernel + HUD + ponytail into `deploy.sh` Layer 7; `check-cursor-runtime.sh` PASS on this machine
- [x] Merged Cursor `statusLine` only (did not copy `cli-config.json`)

## Files Modified

| File | Changes | Rationale |
|------|---------|-----------|
| `scripts/deploy.sh` | Layers 5 Cursor hooks, 6 store pin, 7 kernel/HUD/ponytail | Fleet must reproduce this machine |
| `scripts/claude-hud-statusline.sh` | Restore comment points at installer | Manual cp is no longer the contract |
| `.agents/hooks/cursor-adapt.sh` | New adapter | Payload mismatch is the root seam |
| `scripts/install-cursor-hooks.sh` | New | Idempotent `hooks.json` |
| `scripts/install-cursor-hud.sh` | New | Scripts + statusLine merge |
| `scripts/install-cursor-ponytail.sh` | New | Instruction-only Cursor adapter |
| `scripts/install-context-mode-dir.sh` | New | Pin survives plugin upgrades |
| `scripts/check-cursor-hooks.sh` | New | Fail-closed registry |
| `scripts/check-cursor-runtime.sh` | New | Fail-closed Layer 7 |
| `scripts/check-context-mode-dir.sh` | New | Fail-closed pin |
| `scripts/test-cursor-hook-adapter.sh` | New | Adapter evidence |
| `scripts/ctx-usage-report.py` | Default sessions dir = Claude store | Stop double-counting leftovers |
| `scripts/fleet-deploy.sh` | Drop "five-layer" wording | Layer count moved |

## Decisions Made

| Decision | Options Considered | Rationale |
|----------|-------------------|-----------|
| Adapter wrapping existing hooks | Duplicate Cursor-native hooks | One policy surface; Claude scripts stay canonical |
| Skip `tmux-assign-host-gate` on Cursor | Register it on `preToolUse` Shell | Cursor Shell payload has no `agent_type`; would deny Task-hosted assign |
| Skip `session-title-sentinel` on Cursor | Map Stop → `followup_message` | Claude transcript grep + `{decision:block}` is the wrong Stop schema |
| bol-prompt-gate on `subagentStart` not `preToolUse` Task | Also matcher `Task` | `subagentStart` documents `task` + `subagent_type`; Task `tool_input` still unconfirmed |
| Ponytail copy from plugin cache | Vendor `ponytail.mdc` in this repo | Third-party; would drift |
| HUD merges `statusLine` only | Copy `cli-config.json` | File contains auth |
| Do not symlink Codex `context-mode` tree | Merge DBs | Different inodes / session files; leftover = archive |

## Pending Work

## Immediate Next Steps

1. Confirm Layer 7 files are committed and `git push` to `origin/main` if this session's push did not finish.
2. Restart the Cursor CLI (and Codex/Gemini) so MCP `ctx_doctor` shows `$HOME/.claude/context-mode` and so `hooks.json` / `ponytail.mdc` load.
3. Decide Layer 0 `rulesBytes` (over baseline from the HUD/kernel paragraph in `agent-environment-provisioning.md`): shrink, or `--accept` with an approved review. Until green, `deploy.sh` aborts before mutating `~`.

### Blockers/Open Questions

- [ ] `rulesBytes` still over baseline — fleet deploy from `main` fails Layer 0 even after the handoff path leak is fixed
- [ ] Live Cursor CLI in this session: hooks/ponytail load after write is UNCONFIRMED without restart
- [ ] `preToolUse` Task payload shape still UNCONFIRMED (need one dump before adding a second bol matcher)

### Deferred Items

- `tmux-assign-host-gate` / `session-title-sentinel` on Cursor until payload fields exist
- Ponytail / tmux-dispatch lifecycle hooks (no Cursor plugin format)
- Semantic update of `agent-environment-provisioning.md` (still says kernel/HUD are not a deploy layer — now false; maintenance §1 needs approval)
- `install-cursor-kernel.sh` was previously deferred pending proof; proof existed this session and Layer 7 wired it — no longer deferred
- Do not merge leftover Codex/Gemini session DBs into Claude by symlink

## Context for Resuming Agent

## Important Context

Kernel in *this* Cursor CLI session was already loaded (`always_applied_workspace_rule` injected `$HOME/.cursor/rules/kernel.mdc`). Respond in Traditional Chinese (Taiwan); code stays English. Substantive replies end with `✈`. Do not commit `cli-config.json`, tokens, or usage cache. Canonical context-mode store is `$HOME/.claude/context-mode` (`CONTEXT_MODE_DIR`, not the old `CONTEXT_MODE_DATA_DIR`). Cursor user hooks live in `$HOME/.cursor/hooks.json` with commands `./hooks/fleet-*.sh`. context-mode's own Cursor hooks are plugin-declared and must not be overwritten. Codex trusted plugin hooks (ponytail, tmux-agent-tools, security-guidance, warp) do not apply to Cursor. MCP Atlassian/X/Mobbin/Cloudflare bindings may show `needsAuth` — that is not a fleet-hook gap.

## Assumptions Made

- Cursor CLI loads the same user `hooks.json` / `~/.cursor/rules/*.mdc` as desktop (documented for desktop; CLI reload still UNCONFIRMED without restart)
- `explore` → `Explore` is enough for bol exemption; Cursor `shell` subagent type stays gated
- Ponytail source of truth is Claude plugin cache `ponytail/ponytail/<latest>/.cursor/rules/ponytail.mdc`

## Potential Gotchas

- `python3 - <<'PY'` plus a pipe: heredoc owns stdin; adapter writes payload to a temp file for argv
- `deploy.sh` always downloads origin `main` tarball — uncommitted Layer 7 is invisible to fleet until pushed
- Layer 0 `public-sensitive-literals` will FAIL a handoff that writes `Project:` as an absolute macOS home path
- `tmux-agent-tools` Cursor plugin manifest has skills only — its Claude-format hooks file does not attach
- Leftover `$HOME/.codex/context-mode` / `$HOME/.gemini/context-mode` real dirs are archives; WARN, do not delete without asking
- Cursor `cli-config.json` contains auth; installer jq-merges `statusLine` in place

## Environment State

### Tools/Services Used

- Cursor CLI (this session) with context-mode MCP, Gmail/Calendar/Drive, browser-use, Cloudflare docs, eToro docs
- Cursor plugins in cache: context-mode, tmux-agent-tools, cursor-public
- Claude plugin cache: ponytail 4.9.0 (source of `ponytail.mdc`)
- Codex Marketplace still has extra plugins this Cursor session does not (FableCodex, codex-warp, official Claude plugins as Codex hooks)

### Active Processes

- This Cursor CLI session — restart needed for new hooks/ponytail rule
- No fleet `deploy.sh` was run (Layer 0 red on origin; would also miss unpushed Layer 7)

### Environment Variables

- `CONTEXT_MODE_DIR` (canonical value: `$HOME/.claude/context-mode`)
- `CONTEXT_MODE_PLATFORM` (cursor / codex / etc.)

## Related Resources

- Prior handoff: `.claude/handoffs/2026-08-26-114552-cursor-cli-kernel-hud.md`
- Cursor hooks docs: https://cursor.com/docs/agent/hooks
- Ponytail Cursor adapter: instruction-only user rule (see the plugin portability doc)
- Sensitive-literals lesson: `.agents/rules/lessons.md` (handoff `Project:` path) and `ops/evidence/2026-08-20-sensitive-literals-handoff.md`

---

**Security Reminder**: `Project:` uses `~/git/agent-scripts`. Never put an absolute macOS home path in `.claude/handoffs/`.
