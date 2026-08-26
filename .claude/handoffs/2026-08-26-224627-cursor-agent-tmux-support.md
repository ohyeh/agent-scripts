# Handoff: cursor-agent CLI profile + Cursor assign-host-gate

## Session Metadata
- Created: 2026-08-26 22:46:27
- Project: ~/git/agent-scripts
- Branch: feat/cursor-assign-host-gate (synced with origin at `e91c41e` before this handoff commit)
- Session duration: ~2 hours (evening work after the 14:47 store-pin handoff)
- Handoff sequence: [4] in the Cursor fleet-parity chain

### Recent Commits (for context)
  - e91c41e feat(cursor): register tmux-assign-host-gate on Cursor parent Shell
  - efed709 fix(sentinel): accept PASS [..] / DEPLOY OK / n/m passed as raw evidence (false block on this session's own deploy report)
  - e1fefc9 feat(hooks): completion claims need text evidence + a real run; build briefs need a runnable check
  - f2293cb feat(hooks): compaction recall + ✅-without-evidence gate
  - d7fbd3e docs(handoff): record context-mode Claude store wrapper pin

Sibling `ohyeh/tmux-agent-tools` (not this repo):
  - f866b48 feat(cursor): point the cursor profile at cursor-agent and ship Cursor hooks
  - Branch: feat/cursor-agent-cli-profile (already on origin)

## Handoff Chain

- **Continues from**: [2026-08-26-144749-context-mode-claude-store.md](./2026-08-26-144749-context-mode-claude-store.md)
  - Previous title: context-mode Claude store (wrapper pin; agy out of gate)
- **Supersedes**: that handoff's deferred item "tmux-assign-host-gate on Cursor until payload fields exist". Parent Shell is now fail-closed: `agent_type` ABSENT → deny. Also supersedes treating `cursor.conf` as an agent-scripts config-check. Worker binary and profile live in the sibling.

## Current State Summary

This session added live Cursor Agent CLI worker support across the two owning repos, then committed and pushed both feature branches. Sibling `ohyeh/tmux-agent-tools` `f866b48`: cursor profile `bin=cursor-agent` (not editor `cursor`, not PATH `agent` which is Grok), launch/headless flags `--force --trust --approve-mcps`, Cursor plugin `hooks` plus remap adapter. This repo `e91c41e`: register `tmux-assign-host-gate` on Cursor `preToolUse` Shell (`failClosed` true), adapter skip-comment updated, three adapter tests (parent deny / Task-hosted allow / background allow), layers lesson proposed. Machine-local (not git): user profile override so the live PATH `agent-tmux` (old skill copy) also resolves; `$HOME/.cursor/hooks.json` lists the fleet-tmux-assign-host-gate wrapper; context-mode plugin command re-wrapped after a 21:56 plugin upgrade reset it to `npx`. `agent-tmux cursor doctor --json` this session: `ok:true`, binary `$HOME/.local/bin/cursor-agent`. Neither feature branch is on `main`. No PRs opened. Nested Cursor-from-Cursor still shares `$HOME/.cursor` and the Claude store; the new gate is meant to block parent-foreground `assign`.

## Codebase Understanding

## Architecture Overview

Three-repo ecosystem: this repo = kernel / rules / fleet hooks / deploy; `ohyeh/tmux-agent-tools` = worker lifecycle + engine profiles + plugin hooks; `ohyeh/context-mode-local-insight` = session store. Cursor analog of the dual-runtime kernel is `$HOME/.cursor/rules/kernel.mdc` (`alwaysApply`). Fleet hooks are Claude-shaped (`tool_name=Bash`, `session_id`, exit 2). Cursor native hooks use `preToolUse`, `Shell`, `conversation_id`, and reject empty stdout. `.agents/hooks/cursor-adapt.sh` remaps stdin (`Shell`→`Bash`, `conversation_id`→`session_id`, `subagent_id`→`agent_type`) and always emits JSON. `tmux-assign-host-gate` keys on `agent_type` ABSENT vs present, plus a `run_in_background` fallback. `tmux-dispatch-gate` is a sibling plugin hook (Claude `PreToolUse` Bash); this repo must not reimplement it. Canonical context-mode store remains `$HOME/.claude/context-mode` via wrapper command, not JSON env (prior handoff). Cursor plugin upgrades reset plugin.json `command` to `npx`; Layer 6 must re-wrap.

## Critical Files

| File | Purpose | Relevance |
|------|---------|-----------|
| `scripts/install-cursor-hooks.sh` | Writes `$HOME/.cursor/hooks.json` + fleet wrappers | Registry now includes tmux-assign-host-gate on preToolUse Shell failClosed true |
| `scripts/check-cursor-hooks.sh` | Fail-closed Cursor hook presence | Asserts the assign-host wrapper in preToolUse |
| `.agents/hooks/cursor-adapt.sh` | Cursor stdin → Claude-shaped fleet hooks | Skip list no longer claims assign-host-gate is unregistered |
| `.agents/hooks/tmux-assign-host-gate.sh` | Deny parent-foreground assign | agent_type ABSENT → deny; Task-hosted / background allow |
| `scripts/test-cursor-hook-adapter.sh` | Adapter smoke | Three assign cases plus JSON stdout |
| `scripts/context-mode-mcp.sh` | MCP launch wrapper | DIR must stay in command; plugin upgrades undo the wrap |
| `scripts/install-context-mode-dir.sh` | Layer 6 pin + wrap | Re-run after context-mode plugin upgrade |
| `.agents/rules/lessons.md` | Proposed layers lesson | cursor.conf is sibling-owned |
| `AGENTS.md` | Repo scope | tmux worker lifecycle stays in the sibling |

Sibling (do not vendor here): cursor profile, `agent-tmux` PATH fallback (`cursor-agent` then `cursor`, never `agent`), Cursor plugin `hooks` key, remap adapter, profile smoke (16/16 PASS at `f866b48`).

### Key Patterns Discovered

- Layer first: a missing `cursor-*` tmux pane is a sibling profile/binary problem, not an agent-scripts doctor miss. User correction: "你沒看REPO我們負責哪些嗎" then "所以要開發支援啊".
- PATH `agent` is Grok. Editor `cursor` may be absent. Worker binary is `cursor-agent` at `$HOME/.local/bin/cursor-agent`. `CURSOR=` env override exists on the sibling wrapper.
- Live `agent-tmux` on PATH can be an old skill copy. Bundled profile change does not reach that copy until plugin/skill update. A user profile at `$HOME/.config/agent-tmux/profiles/cursor.conf` unblocks the live wrapper without waiting.
- Cursor plugin cache (the cached plugin.json) is the live MCP and the live plugin-hook surface. User `$HOME/.cursor/mcp.json` is not the live Cursor MCP. Plugin upgrades reset `command` to `npx`.
- GetDynamicTools catalog this session listed only the `cursor` namespace. Disk wrap of the plugin command is not proof the running process loaded it. Restart is the live MCP proof.
- `tmux-assign-host-gate` on Cursor does not need a new payload field. Parent Shell has no `subagent_id` → mapped `agent_type` ABSENT → deny. Task-hosted allow is synthetic-JSON green; live `subagent_id` on Task Shell is UNCONFIRMED.
- Do not `chmod +x` sentinel hooks from the adapter test into git (mode-only noise; reverted, not committed).

## Work Completed

### Tasks Finished

- [x] Diagnose Cursor fleet disk vs live gaps (kernel/HUD/ponytail/hooks already PASS; worker binary + plugin MCP wrap were the holes)
- [x] Sibling: cursor profile `bin=cursor-agent`, launch/headless flags, PATH fallback, Cursor plugin hooks, smoke 16/16, CHANGELOG Unreleased — commit `f866b48`, pushed
- [x] This repo: register assign-host-gate on Cursor parent Shell, adapter comment, checker, three adapter tests, layers lesson — commit `e91c41e`, pushed
- [x] Machine-local: user `cursor.conf` override; re-run Layer 6 wrap after 21:56 plugin upgrade; confirm `agent-tmux cursor doctor --json` `ok:true`
- [x] User-authorized commit+push of both feature branches (not `main`)

## Files Modified

This repo (on `feat/cursor-assign-host-gate` vs `main`, already pushed except this handoff):

| File | Changes | Rationale |
|------|---------|-----------|
| `scripts/install-cursor-hooks.sh` | Add tmux-assign-host-gate to REGISTRY | Parent Cursor must not foreground-assign |
| `scripts/check-cursor-hooks.sh` | Expect the new wrapper in preToolUse | Fail-closed install check |
| `.agents/hooks/cursor-adapt.sh` | Skip comment: gate IS registered | Stop telling the next agent it was deferred |
| `scripts/test-cursor-hook-adapter.sh` | Parent deny / Task-hosted allow / background allow | Smallest check that fails if remap or gate breaks |
| `.agents/rules/lessons.md` | Proposed layers lesson | Record the ownership correction |
| `.claude/handoffs/2026-08-26-224627-cursor-agent-tmux-support.md` | This file | Chain [4] |

Sibling already pushed at `f866b48`: cursor profile, `agent-tmux` preset, Cursor plugin hooks + remap, smoke script, CHANGELOG, profiles README. Out of this repo.

## Decisions Made

| Decision | Options Considered | Rationale |
|----------|-------------------|-----------|
| Fix sibling profile, do not vendor cursor.conf here | Patch agent-scripts; wait for a Cursor PATH `cursor` binary | AGENTS.md: tmux lifecycle is sibling. User asked for support, not a second profile. |
| `bin=cursor-agent` | `cursor`; PATH `agent` | `cursor` not on PATH; `agent` is Grok. Live binary is cursor-agent. |
| Register assign-host-gate on Cursor now | Keep deferring until Task payload is live-probed | Parent deny needs no new field. Task-hosted allow is tested with synthetic JSON. |
| User profile override plus bundled profile | Only change the sibling tree | Live PATH wrapper was a stale skill copy; override unblocks tonight. |
| Feature branches, no merge to `main` | Direct to main | User said commit and push, not merge. Deploy still reads origin `main`. |
| Re-wrap plugin.json after upgrade | Treat installer PASS as durable | Upgrade at 21:56 reset command to `npx`. Layer 6 is the restore. |
| Leave leftover Codex/Gemini store dirs | Delete or symlink into Claude | Archives. User did not authorize deletion. Prior handoff still binds. |

## Pending Work

## Immediate Next Steps

1. Restart (or otherwise reload) this Cursor process, then prove live MCP: GetDynamicTools / `ctx_doctor` must show the Claude store `via CONTEXT_MODE_DIR`. Disk wrap alone is not that proof.
2. Ask the user whether to open PRs for `feat/cursor-assign-host-gate` (this repo) and `feat/cursor-agent-cli-profile` (sibling). Do not merge to `main` without that ask. `deploy.sh` still ships origin `main` only.
3. Refresh the Cursor plugin cache from the sibling so plugin `hooks` (tmux-dispatch-gate) attach. Live cache was skills-only when last inspected.
4. Live-verify one Task-hosted Shell: confirm Cursor sends `subagent_id` (or equivalent) so assign-host-gate allows the child. Synthetic adapter tests already PASS.
5. Layer 0 `rulesBytes` over baseline is still red (unchanged from chain [3]). `deploy.sh` aborts before mutating `~` unless `--accept` or a shrink.

### Blockers/Open Questions

- [ ] Live Task Shell `subagent_id` UNCONFIRMED — synthetic JSON allow is not a live payload
- [ ] This session's GetDynamicTools catalog was only `cursor` — MCP wrap is disk-true, running process UNCONFIRMED until reload
- [ ] Cursor plugin cache for tmux-agent-tools still skills-only until a plugin update — dispatch-gate not attached in the running editor
- [ ] Nested Cursor-from-Cursor: workers share `$HOME/.cursor` and the Claude SQLite store. Assign-host-gate blocks parent-foreground assign; it does not isolate stores
- [ ] `rulesBytes` over baseline — fleet deploy from `main` still fails Layer 0
- [ ] context-mode `ctx_doctor` may still say `preToolUse hook not configured` for *its* plugin hook vs fleet hooks — not a store-path failure (open from chain [3])

### Deferred Items

- Merge either feature branch to `main` (user did not ask)
- Open GitHub PRs (user did not ask this turn; next session may)
- Delete leftover `$HOME/.codex/context-mode` and `$HOME/.gemini/context-mode` (ask first)
- Maintenance §1 approval to fix `agent-environment-provisioning.md` (still says kernel/HUD are not a deploy layer)
- Semantic update of kernel-lean.md (byte cap)
- Ponytail lifecycle hooks on Cursor (instruction-only copy remains)
- Vendor a second cursor profile inside agent-scripts (forbidden by scope)

## Context for Resuming Agent

## Important Context

Do not reimplement tmux worker lifecycle in this repo. Binary, flags, `agent-tmux cursor doctor`, and plugin dispatch-gate belong to `ohyeh/tmux-agent-tools`. This repo owns fleet hook registration via `cursor-adapt.sh` and whether `tmux-assign-host-gate` is in the Cursor registry.

Never treat PATH `agent` as Cursor. Never write `bin=cursor` without checking that `cursor-agent` is the installed CLI.

Canonical store is `$HOME/.claude/context-mode`. Proof is that process's doctor line `via CONTEXT_MODE_DIR`. After any context-mode plugin upgrade, re-run `scripts/install-context-mode-dir.sh` and `scripts/check-context-mode-dir.sh`.

Handoff `Project:` must stay `~/git/agent-scripts`. `validate_handoff.py` PASS is not Layer 0 evidence. Do not write an absolute macOS home path, Tailscale IP, or host alias into this tree.

Do not dump credentials. Process listings of cursor-agent can expose CLI secret flags. Never copy those into a handoff, recap, or commit.

Both feature commits are already on origin. This handoff file is the only likely unpushed piece at scaffold time.

## Assumptions Made

- User "commit and push" authorized the two feature branches, not a merge to `main`.
- Machine-local user profile override is acceptable until the Cursor plugin/skill copy of `agent-tmux` updates.
- Synthetic assign-host-gate tests are enough to ship the registry change; live Task payload is a follow-up, not a revert trigger.
- Gemini CLI wrap from chain [3] is still wanted. agy stays out of the Layer 6 gate.
- Leaving leftover Codex/Gemini session dirs as archives is still correct.

## Potential Gotchas

- `python3 - <<'PY'` plus a pipe: heredoc owns stdin (adapter writes a temp file and passes argv).
- `deploy.sh` downloads origin `main` tarball — these feature branches are invisible to fleet deploy until merged.
- Plugin upgrade resets context-mode `command` to `npx` and can drop sibling plugin `hooks`. Disk doctor can flip red after a green wrap.
- `check-cursor-runtime.sh` kernel md5 vs `$HOME/.codex/AGENTS.md` can FAIL while the kernel body equals repo `global/AGENTS.md`.
- Adapter test that `install -m 0755` copies hooks into `$HOME/.agents/hooks/` can flip file modes; revert mode-only noise.
- `public-sensitive-literals` greps `.claude/handoffs`. An absolute macOS home path in `Project:` fails Layer 0 even if `validate_handoff.py` scores 100.
- User profile at `$HOME/.config/agent-tmux/profiles/cursor.conf` can drift from the sibling bundled file. Prefer the bundled file after the plugin catches up.

## Environment State

### Tools/Services Used

- Cursor Agent CLI: `$HOME/.local/bin/cursor-agent` (installed this evening)
- `agent-tmux cursor doctor --json`: `ok:true` this session
- context-mode: wrapper `$HOME/.claude/context-mode-mcp.sh`; canonical dir `$HOME/.claude/context-mode`
- session-handoff scripts under the skill `scripts/` dir

### Active Processes

- This Cursor CLI session (hooks.json / plugin MCP reload UNCONFIRMED for the running process)
- No fleet `deploy.sh` run (Layer 0 still red; feature branches not on `main`)
- No lingering tmux cursor worker started from this parent (gate is meant to keep it that way)

### Environment Variables

- `CONTEXT_MODE_DIR` (canonical: `$HOME/.claude/context-mode`)
- `CURSOR` (sibling wrapper override for the worker binary name)
- `CONTEXT_MODE_PLATFORM` (plugin may set `cursor`)

## Related Resources

- Prior store-pin handoff: `.claude/handoffs/2026-08-26-144749-context-mode-claude-store.md`
- Fleet-parity handoff: `.claude/handoffs/2026-08-26-134554-cursor-fleet-parity.md`
- Kernel/HUD chain start: `.claude/handoffs/2026-08-26-114552-cursor-cli-kernel-hud.md`
- Lesson: `.agents/rules/lessons.md` entries 2026-08-26 context-mode and layers
- Sibling branch: feat/cursor-agent-cli-profile at `f866b48`

---

**Security Reminder**: `Project:` is `~/git/agent-scripts` on purpose. Do not write an absolute macOS home path into this file. Never paste API keys, `cli-config.json`, or usage-cache contents.
