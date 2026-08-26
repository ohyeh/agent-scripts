# Handoff: Cursor CLI kernel + HUD + usage

## Session Metadata
- Created: 2026-08-26 11:45:52
- Project: /Users/paul.yeh/git/agent-scripts
- Branch: main (ahead of origin/main by 1 commit: `41483fb`; plus uncommitted work)
- Session duration: ~75 minutes (10:31–11:45 UTC+8)

### Recent Commits (for context)
  - 41483fb chore(statusline): backup the shared Claude/Cursor HUD wrapper
  - 2f11789 feat(hooks): wire the detectors to actuators — bol gate blocks, deploy refuses red invariants
  - 678a75f fix(judgment-rubrics): act on codex BLOCK — narrow the absence rule, unlaunder the baseline
  - 943ed36 rules(judgment-rubrics): symmetric evidence bar for negative-state claims
  - 7607a68 docs: WEB-AGENTS.md — one-URL setup prompt for network-only agents

## Handoff Chain

- **Continues from**: None (scaffold auto-linked `2026-08-20-122706-session-title-as-address.md`; that work is unrelated — session titles, not Cursor CLI)
- **Supersedes**: None

## Current State Summary

This session wired Cursor CLI into two fleet surfaces that Claude/Codex already had: (1) a shared Claude HUD statusline plus Cursor plan usage, and (2) a Cursor analog of `~/.claude/CLAUDE.md` as a single alwaysApply user rule. The HUD path is live on the machine (`~/.claude/claude-hud-statusline.sh` + `cursor-plan-usage.py`, Cursor `cli-config.json` `statusLine` points at the shell script). The kernel rule is live at `~/.cursor/rules/kernel.mdc` (body md5-matches `global/AGENTS.md`). Neither Cursor kernel nor usage injector is in `deploy.sh`. Uncommitted: `scripts/install-cursor-kernel.sh`, `scripts/cursor-plan-usage.py`, HUD/provisioning edits. The current Cursor CLI session has **not** been restarted, so it is **not** running under `kernel.mdc` yet. Live-verify that CLI loads `~/.cursor/rules/*.mdc` in a **different directory** before adding a deploy layer.

## Codebase Understanding

## Architecture Overview

agent-scripts is a dual-runtime fleets repo. Canonical kernel is `global/CLAUDE.md` + `global/AGENTS.md` (byte-identical, same `Version:`, never symlink). Deploy copies them to `~/.claude/CLAUDE.md` and `~/.codex/AGENTS.md`. Routed rules are one tree: repo `.agents/rules/` → `~/.agents/rules/`. Those rules are **not** auto-scanned by runtimes; the kernel routing index tells the model to read bare names (`model-dispatch.md`, `judgment-rubrics.md`, …) and skills at `~/.agents/skills/<name>/SKILL.md`. Cursor CLI has **no** home-dir `AGENTS.md` slot and does not read `~/.codex/AGENTS.md`. It loads project `AGENTS.md` / `CLAUDE.md` plus `.cursor/rules`. This repo's root `AGENTS.md` is **not** the kernel (skills/router scope only). Cursor analog of Claude's global CLAUDE.md is therefore `~/.cursor/rules/kernel.mdc` (`alwaysApply: true`), generated from `global/AGENTS.md`.

## Critical Files

| File | Purpose | Relevance |
|------|---------|-----------|
| `global/AGENTS.md` | Canonical kernel (Codex deploy target) | Source body for `kernel.mdc` |
| `global/CLAUDE.md` | Same kernel (Claude deploy target) | Must stay byte-identical with AGENTS.md |
| `scripts/install-cursor-kernel.sh` | Writes `~/.cursor/rules/kernel.mdc`, md5-checks body | Install/update; untracked |
| `~/.cursor/rules/kernel.mdc` | Live Cursor user rule | Machine-local; do not commit |
| `scripts/claude-hud-statusline.sh` | Shared HUD wrapper | Canonical backup; live copy `~/.claude/` |
| `scripts/cursor-plan-usage.py` | Injects Cursor plan/auto/api into stdin `rate_limits.model_scoped` | Untracked; live copy `~/.claude/` |
| `.agents/rules/agent-environment-provisioning.md` | Restore runbook | Documents HUD + kernel (not deploy.sh) |
| `scripts/deploy.sh` | Fleet deploy | Still Claude/Codex + rules + skills only |
| `~/.cursor/cli-config.json` | Cursor CLI config | Has `statusLine`; contains auth — never commit |

### Key Patterns Discovered

- Kernel contract: edit **both** global files together; `Version:` must match. Do not add a third canonical kernel file.
- Cursor `cli-config.json` contains auth; repo may document keys only.
- HUD `model_scoped` windows are how Cursor monthly usage is labeled (`plan` / `auto` / `api`) without faking Claude 5h/7d.
- Cursor spawn() has no login shell: statusline must set PATH (Homebrew + bun).
- Usage token: macOS keychain service `cursor-access-token` account `cursor-user`; cache `~/.cursor/statusline-usage-cache.json` stores percents only, never the token.

## Work Completed

### Tasks Finished

- [x] Configure Cursor CLI statusLine to the shared Claude HUD wrapper
- [x] Collapse to one script (`~/.claude/claude-hud-statusline.sh`); both CLIs point at it
- [x] Commit HUD backup (`41483fb`) — earlier HUD-only snapshot
- [x] Inject Cursor monthly plan usage (`totalPercentUsed` → `plan`)
- [x] Add `autoPercentUsed` / `apiPercentUsed` as extra `model_scoped` windows
- [x] Install Cursor kernel as alwaysApply rule; rename to `kernel.mdc`
- [x] Add `scripts/install-cursor-kernel.sh` (not yet committed)

## Files Modified

| File | Changes | Rationale |
|------|---------|-----------|
| `scripts/claude-hud-statusline.sh` | PATH, COLUMNS, HUD + sid + Cursor extras; pipes through usage helper | Shared Claude/Cursor HUD |
| `scripts/cursor-plan-usage.py` | New: GetCurrentPeriodUsage → plan/auto/api inject | Cursor stdin has no `rate_limits` |
| `scripts/install-cursor-kernel.sh` | New: wrap `global/AGENTS.md` as `kernel.mdc` | CLAUDE.md analog for Cursor |
| `.agents/rules/agent-environment-provisioning.md` | Restore notes for HUD, usage, kernel | Disaster recovery |
| `~/.claude/claude-hud-statusline.sh` | Live copy of HUD script | Runtime |
| `~/.claude/cursor-plan-usage.py` | Live copy of injector | Runtime |
| `~/.cursor/cli-config.json` | `statusLine` key only | Cursor HUD (do not commit) |
| `~/.cursor/rules/kernel.mdc` | alwaysApply kernel | Cursor global iron laws |
| `~/.cursor/statusline-usage-cache.json` | Cached percents + `resets_at` | Not a secret; not in repo |

## Decisions Made

| Decision | Options Considered | Rationale |
|----------|-------------------|-----------|
| One HUD script for both CLIs | Dual wrappers vs one file | User did not want two copies; Cursor extras only print when fields present |
| Usage via `model_scoped` not 5h/7d | Fake weekly window vs named windows | HUD would mislabel monthly plan as 7d |
| Kernel as `~/.cursor/rules/kernel.mdc` not project AGENTS.md | User Rules UI, third canonical file, per-repo AGENTS.md | File-based, md5-able; project AGENTS.md is the wrong document; no third kernel source |
| Solid kernel body not `kernel-lean.md` | Lean vs solid | User asked for CLAUDE.md analog; Claude deploys solid |
| Not a `deploy.sh` layer yet | Wire now vs prove CLI load first | `~/.cursor/rules` for CLI is not live-verified in a fresh session |

## Pending Work

## Immediate Next Steps

1. **Commit** untracked/modified scripts if the user asks (`install-cursor-kernel.sh`, `cursor-plan-usage.py`, HUD + provisioning). Do not commit `cli-config.json` or usage cache.
2. **Restart Cursor CLI** (or start `agent` in a **different directory**) and verify `kernel.mdc` is in context (Traditional Chinese, routing index, canary `✈` on substantive turns).
3. Only after that proof: consider adding a `deploy.sh` Cursor layer that runs `install-cursor-kernel.sh` (or inlines it) with md5 vs `global/AGENTS.md`.

### Blockers/Open Questions

- [ ] CLI actually loads `~/.cursor/rules/*.mdc` with `alwaysApply` — UNCONFIRMED. Official docs emphasize **project** `.cursor/rules`. Fallback: User Rules (Customize → Rules), not git-md5.
- [ ] This session never restarted after writing `kernel.mdc`; do not claim iron laws are active here.

### Deferred Items

- `deploy.sh` Cursor layer (needs live proof)
- ADR / `maintenance.md` third-runtime contract (user chose “generated entry from existing kernel”, not a third canonical file)
- Slim HUD usage line (reset time repeated on plan/auto/api)
- Spend-limit window (`spendLimitUsage`)
- Cursor Remote Control vs `agent worker` — explained only, not configured

## Context for Resuming Agent

## Important Context

- **Two different AGENTS.md files:** repo root `AGENTS.md` = this repo's skills/router scope. `global/AGENTS.md` = fleets kernel = `~/.codex/AGENTS.md`. Cursor CLI in this repo previously only saw the former.
- **`kernel.mdc` ≈ Codex GLOBAL AGENTS.md.** Cursor injects alwaysApply rules at session start; the model then point-reads `~/.agents/rules/<bare-name>.md` and `~/.agents/skills/<name>/SKILL.md` on routing triggers. It does not dump all of `~/.agents`.
- **Update kernel on Cursor:** change `global/AGENTS.md` (and `global/CLAUDE.md` in the same change), then `scripts/install-cursor-kernel.sh`.
- **StatusLine:** Cursor `statusLine.command` = `~/.claude/claude-hud-statusline.sh`; timeoutMs 5000; updateIntervalMs 1000. Claude settings still `bash -c '~/.claude/claude-hud-statusline.sh'`.
- **Usage inject** only if stdin has no `rate_limits` (Claude subscribers unchanged). API: `POST https://api2.cursor.sh/aiserver.v1.DashboardService/GetCurrentPeriodUsage`. `billingCycleEnd` may be a **string** millis. Sub-1% displays as 1% to match `/usage`.
- **Do not** print or commit access tokens, `cli-config.json` auth blobs, or keychain output.

## Assumptions Made

- Cursor CLI will load user-global `~/.cursor/rules/kernel.mdc` the same way the IDE loads alwaysApply rules (needs proof).
- User wants Cursor as a **deploy entry** for the existing kernel, not a consumer-only setup, once load is proven.
- Git commit of remaining scripts was not requested after the kernel/rename work.

## Potential Gotchas

- Old filename `ohyeh-kernel.mdc` is deleted on install; do not recreate it.
- `install-cursor-kernel.sh` awk strips YAML between the first two `---` lines; kernel body must not rely on a leading `---` document.
- First usage fetch needs Keychain; may prompt. Cache TTL 60s; stale cache up to 24h with background `--refresh`.
- `python3` `str | None` requires 3.10+ (worked on this machine).
- Branch was behind origin at session start; later `main` was up to date then **ahead 1** (`41483fb`). Uncommitted files sit on top of that.
- Maintenance: semantic edits to `agent-environment-provisioning.md` normally need approval; user asked to backup/install into the repo.

## Environment State

### Tools/Services Used

- Cursor CLI (`agent`) with statusLine → Claude HUD via bun
- claude-hud plugin under `~/.claude/plugins/cache/claude-hud/claude-hud/` (latest dir via `ls -td`)
- jq, bun (`~/.bun/bin/bun`), python3
- Cursor usage API via keychain token (never store token in files)

### Active Processes

- None started by this session (no `agent worker`)

### Environment Variables

- Statusline sets `PATH` (Homebrew + bun) and `COLUMNS` from `render_width_chars`
- Usage fetch uses `Authorization: Bearer` from keychain, not env (optional `CURSOR_API_KEY` exists for CLI but was not used)

## Related Resources

- Cursor CLI statusline skill: `~/.cursor/skills-cursor/statusline/SKILL.md`
- Cursor CLI config: `https://cursor.com/docs/cli/reference/configuration.md`
- Cursor rules: `https://cursor.com/docs/rules.md` (User Rules vs project `.cursor/rules`; CLI also reads project `AGENTS.md`/`CLAUDE.md`)
- My Machines / worker: `https://cursor.com/docs/cloud-agent/my-machines`
- Fleet kernel: `global/AGENTS.md`, `global/CLAUDE.md`, `scripts/deploy.sh` Layer 1
- HUD usage inject: `scripts/cursor-plan-usage.py`

---

**Security Reminder**: Before finalizing, run `validate_handoff.py` to check for accidental secret exposure.
