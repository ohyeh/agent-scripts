# Handoff: Cursor fleet wrap (PRs open; Claude store only)

## Session Metadata
- Created: 2026-08-27 01:43:57
- Project: ~/git/agent-scripts
- Branch: feat/cursor-assign-host-gate (synced with origin at `7b5de63` before this handoff commit)
- Session duration: ~3 hours across the reload-proof / PR / leftover-delete stretch
- Handoff sequence: [5] in the Cursor fleet-parity chain

### Recent Commits (for context)
  - 7b5de63 docs(handoff): record cursor-agent tmux profile and assign-host-gate
  - e91c41e feat(cursor): register tmux-assign-host-gate on Cursor parent Shell
  - efed709 fix(sentinel): accept PASS [..] / DEPLOY OK / n/m passed as raw evidence (false block on this session's own deploy report)
  - e1fefc9 feat(hooks): completion claims need text evidence + a real run; build briefs need a runnable check
  - f2293cb feat(hooks): compaction recall + ✅-without-evidence gate

Sibling `ohyeh/tmux-agent-tools` (not this repo):
  - f866b48 feat(cursor): point the cursor profile at cursor-agent and ship Cursor hooks
  - Branch: feat/cursor-agent-cli-profile (already on origin)

## Handoff Chain

- **Continues from**: [2026-08-26-224627-cursor-agent-tmux-support.md](./2026-08-26-224627-cursor-agent-tmux-support.md)
  - Previous title: cursor-agent CLI profile + Cursor assign-host-gate
- **Supersedes**: leftover Codex/Gemini context-mode dirs as archives (user: Claude DB only; both leftover trees deleted this session). Also supersedes "live Task `subagent_id` UNCONFIRMED": live Cursor Task Shell has no host-identity field.

## Current State Summary

This session reloaded Cursor, proved live MCP on the Claude store (`ctx_doctor`: sessions/content/stats under `$HOME/.claude/context-mode` with tag `via CONTEXT_MODE_DIR`), opened both feature PRs, overlaid the sibling Cursor plugin hooks onto the marketplace plugin cache (disk only; running editor still needs another reload for dispatch-gate), live-probed Task-hosted Shell (denied as parent; payload has no `subagent_id`), and deleted leftover `$HOME/.codex/context-mode` and `$HOME/.gemini/context-mode` after the user said Claude DB only. Neither feature branch is on `main`. PRs: `ohyeh/agent-scripts` #4 and `ohyeh/tmux-agent-tools` #319. Adapter tests and sibling zsh smoke were green this session. Child-hosted `assign` on Cursor will stay denied until Cursor adds a host field or we accept `run_in_background` as the only live allow path.

## Codebase Understanding

## Architecture Overview

Three-repo split is unchanged: this repo owns fleet hooks + Cursor adapter + Layer 6 store pin; sibling `ohyeh/tmux-agent-tools` owns `cursor-agent` profile and plugin dispatch-gate; context-mode store is `$HOME/.claude/context-mode` via wrapper command. Cursor `preToolUse` Shell has no live `subagent_id`. `tmux-assign-host-gate` therefore treats Task-hosted Shell like parent (`agent_type` ABSENT). Synthetic tests that inject `subagent_id` are not live proof. Layer 6 still skips wrapping agy; a Warp `agy` started with `zsh --no_rcs` can recreate an empty `$HOME/.gemini/context-mode` stats file.

## Critical Files

| File | Purpose | Relevance |
|------|---------|-----------|
| `scripts/install-cursor-hooks.sh` | Cursor `hooks.json` + fleet wrappers | assign-host-gate on preToolUse Shell failClosed true |
| `scripts/check-cursor-hooks.sh` | Fail-closed Cursor hook presence | Asserts the assign-host wrapper |
| `.agents/hooks/cursor-adapt.sh` | Cursor stdin → Claude-shaped fleet hooks | Maps `subagent_id` when present; live payload has none |
| `.agents/hooks/tmux-assign-host-gate.sh` | Deny parent-foreground assign/poll | Logs `agent_type` to local probe jsonl |
| `scripts/test-cursor-hook-adapter.sh` | Adapter smoke | Parent deny / Task-hosted allow / background allow (synthetic) |
| `scripts/check-context-mode-dir.sh` | Layer 6 poke-yoke | Wrapper command; leftover dirs WARN only |
| `scripts/install-context-mode-dir.sh` | Layer 6 pin + wrap | Re-run after context-mode plugin upgrade |

Sibling (do not vendor here): cursor profile, Cursor plugin hooks key pointing at the sibling hooks/cursor JSON, plus the sibling cursor-pretooluse remap script.

## Key Patterns Discovered

- GetDynamicTools catalog with a ready `context-mode` namespace plus `ctx_doctor` `via CONTEXT_MODE_DIR` is running-process store proof. Disk wrap is not.
- Cursor live `preToolUse` Shell keys this session: `tool_name`, `tool_input` (`command`, `cwd`, `timeout`), conversation/session ids, `generation_id`. No `subagent_id`, `subagent_type`, `agent_type`, `parent_conversation_id`.
- A parent Shell command string that contains `agent-tmux` plus a poll verb (even inside a heredoc PR body) trips assign-host-gate.
- Sibling smoke is zsh (`${(%):-%x}`). bash fails at line 5.
- Cursor plugin cache for tmux-agent-tools was a detached marketplace snapshot without `hooks`. Overlay from the sibling tree is machine-local; plugin update overwrites it. Running process still needs reload.
- Leftover Codex/Gemini stores were separate inodes, not the Claude store. Do not symlink old DBs into Claude.

## Work Completed

## Tasks Finished

- [x] Live MCP proof after reload: `ctx_doctor` Claude store `via CONTEXT_MODE_DIR` (this session)
- [x] Open PR #4 (this repo) and PR #319 (sibling)
- [x] `bash scripts/test-cursor-hook-adapter.sh` exit 0; `bash scripts/check-cursor-hooks.sh` PASS
- [x] `zsh scripts/test-cursor-profile-smoke` 16/16 in the sibling tree
- [x] Overlay sibling Cursor plugin hooks onto the live plugin cache (disk)
- [x] Live Task Shell probe: two Task runs denied as parent poll; keys-only dump shows no host identity
- [x] Delete leftover Codex and Gemini context-mode dirs (user: Claude DB only). Codex gone. Gemini archive gone; one empty stats stub from live agy was deleted again
- [x] Restore `$HOME/.agents/hooks/cursor-adapt.sh` from the repo copy after the keys-only probe

## Files Modified

This repo vs `main` (already on origin except this wrap handoff):

| File | Changes | Rationale |
|------|---------|-----------|
| `scripts/install-cursor-hooks.sh` | assign-host-gate in REGISTRY | Parent Cursor must not foreground-assign |
| `scripts/check-cursor-hooks.sh` | Expect the wrapper | Fail-closed install check |
| `.agents/hooks/cursor-adapt.sh` | Skip comment: gate is registered | Stop telling the next agent it was deferred |
| `scripts/test-cursor-hook-adapter.sh` | Parent deny / Task-hosted allow / background allow | Smallest check that fails if remap or gate breaks |
| `.agents/rules/lessons.md` | Proposed layers lesson | cursor.conf is sibling-owned |
| `.claude/handoffs/2026-08-26-224627-cursor-agent-tmux-support.md` | Chain [4] | Prior session |
| `.claude/handoffs/2026-08-27-014357-cursor-fleet-wrap.md` | This file | Chain [5] wrap |

Machine-local, not git: leftover store deletion; plugin-cache overlay; temporary keys-only logger (removed).

## Decisions Made

| Decision | Options Considered | Rationale |
|----------|-------------------|-----------|
| Open PRs, do not merge | Merge to `main`; wait | User said handle wrap-up and push feature branches. `deploy.sh` still ships origin `main` only. |
| Keep fail-closed parent deny even though Task Shell looks like parent | Relax gate when tool is Task; guess from `generation_id` | Live payload has no host field. Guessing would let parent assign through. |
| Delete leftover Codex/Gemini stores, no symlink | Keep archives; symlink into Claude | User: Claude DB only, said more than once. Old DBs were separate inodes. |
| Leave agy out of Layer 6 | Re-wrap agy mcp_config | Prior user ruling. Warp `agy` with `zsh --no_rcs` can recreate a Gemini stats dir; do not kill that process from here. |
| Overlay plugin cache from sibling | Wait for marketplace plugin update | Handoff asked to refresh cache so dispatch-gate files exist on disk. Attach in the running editor still needs reload. |

## Pending Work

## Immediate Next Steps

1. Review and merge (or request changes on) PR #4 and sibling PR #319. Do not merge to `main` from this handoff. `deploy.sh` still ships origin `main` only. Layer 0 `rulesBytes` over baseline is still red.
2. Reload Cursor after any plugin update so the overlaid (or newly published) tmux-agent-tools `hooks` actually attach. Disk overlay is not running-process proof.
3. Treat Cursor Task-hosted `assign` as denied until Cursor ships a host-identity field on Shell `preToolUse`, or an explicit policy accepts `run_in_background` as the only live allow path. Do not "fix" the adapter by inventing a field.

## Blockers/Open Questions

- [ ] Live Cursor Shell has no `subagent_id` — child-hosted assign is denied like parent
- [ ] tmux-agent-tools plugin hooks on the running editor UNCONFIRMED until reload after overlay or marketplace update
- [ ] Layer 0 `rulesBytes` over baseline — fleet deploy from `main` still fails unless `--accept` or a shrink
- [ ] A Warp `agy` started with `zsh --no_rcs` has no `CONTEXT_MODE_DIR` and can recreate `$HOME/.gemini/context-mode` as a stats stub. agy stays out of Layer 6 unless the user puts it back

## Deferred Items

- Merge either feature branch to `main`
- Layer 0 shrink or `--accept`
- Re-add agy to the Layer 6 fail-closed gate
- Maintenance §1 approval to fix `agent-environment-provisioning.md` (still says kernel/HUD are not a deploy layer)
- Semantic update of kernel-lean.md (byte cap)
- Ponytail lifecycle hooks on Cursor (instruction-only copy remains)
- Vendor a second cursor profile inside agent-scripts (forbidden by scope)

## Context for Resuming Agent

## Important Context

Do not reimplement tmux worker lifecycle in this repo. Binary, flags, `agent-tmux cursor doctor`, and plugin dispatch-gate belong to `ohyeh/tmux-agent-tools`. This repo owns fleet hook registration via `cursor-adapt.sh` and whether `tmux-assign-host-gate` is in the Cursor registry.

Canonical store is `$HOME/.claude/context-mode`. Proof is that process's doctor line `via CONTEXT_MODE_DIR`. Leftover Codex/Gemini session dirs were deleted this session. Do not recreate them. Do not symlink leftover DBs into Claude.

Handoff `Project:` must stay `~/git/agent-scripts`. `validate_handoff.py` PASS is not Layer 0 evidence. Do not write an absolute macOS home path, Tailscale IP, or host alias into this tree.

Never treat PATH `agent` as Cursor. Never write `bin=cursor` without checking that `cursor-agent` is the installed CLI.

Do not dump credentials. Process listings of cursor-agent or agy can expose CLI secret flags. Never copy those into a handoff, recap, or commit.

Both feature PRs are already on origin. This wrap handoff is the commit that still needs push at scaffold time.

## Assumptions Made

- User "收尾了 相關的都 PUSH 上去" authorizes a wrap handoff commit plus push of both feature branches, not a merge to `main`.
- Synthetic Task-hosted allow tests stay in the suite as the contract if Cursor later adds `subagent_id`; they are not live proof today.
- Leaving agy out of Layer 6 still holds after leftover deletion.
- Gemini CLI wrap from chain [3] is still wanted.

## Potential Gotchas

- `python3 - <<'PY'` plus a pipe: heredoc owns stdin (adapter writes a temp file and passes argv).
- `deploy.sh` downloads origin `main` tarball — these feature branches are invisible to fleet deploy until merged.
- Plugin upgrade resets context-mode `command` to `npx` and can drop sibling plugin `hooks`. Disk doctor can flip red after a green wrap. Layer 6 must re-wrap.
- Adapter test that `install -m 0755` copies hooks into `$HOME/.agents/hooks/` can flip file modes in the git tree (mode-only noise on sentinels; revert, do not commit).
- `public-sensitive-literals` greps `.claude/handoffs`. An absolute macOS home path in `Project:` fails Layer 0 even if `validate_handoff.py` scores 100.
- Parent Shell that mentions `agent-tmux` plus assign/poll verbs in the command string is denied, including documentation heredocs.
- User profile at `$HOME/.config/agent-tmux/profiles/cursor.conf` can drift from the sibling bundled file.

## Environment State

### Tools/Services Used

- Cursor Agent CLI worker binary: `cursor-agent` on PATH under `$HOME/.local/bin`
- context-mode live MCP: wrapper `$HOME/.claude/context-mode-mcp.sh`; canonical dir `$HOME/.claude/context-mode`; doctor tag `via CONTEXT_MODE_DIR`
- PRs: `ohyeh/agent-scripts` #4, `ohyeh/tmux-agent-tools` #319 (both OPEN at wrap time)

### Active Processes

- This Cursor CLI session
- A Warp `agy --dangerously-skip-permissions` was still running when leftovers were deleted; it wrote one Gemini stats stub that was deleted again. Do not kill it from a wrap unless the user asks.

### Environment Variables

- `CONTEXT_MODE_DIR` (canonical: `$HOME/.claude/context-mode`)
- `CONTEXT_MODE_PLATFORM` (plugin may set `cursor`)
- `CURSOR` (sibling wrapper override for the worker binary name)

## Related Resources

- Chain [4]: `.claude/handoffs/2026-08-26-224627-cursor-agent-tmux-support.md`
- Store-pin: `.claude/handoffs/2026-08-26-144749-context-mode-claude-store.md`
- Fleet-parity: `.claude/handoffs/2026-08-26-134554-cursor-fleet-parity.md`
- PRs: https://github.com/ohyeh/agent-scripts/pull/4 and https://github.com/ohyeh/tmux-agent-tools/pull/319

---

**Security Reminder**: `Project:` is `~/git/agent-scripts` on purpose. Do not write an absolute macOS home path into this file. Never paste API keys, `cli-config.json`, or usage-cache contents.
