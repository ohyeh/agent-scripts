# Handoff: context-mode Claude store (wrapper pin; agy out of gate)

## Session Metadata
- Created: 2026-08-26 14:47:49
- Project: ~/git/agent-scripts
- Branch: main (synced with origin at `e9a7d25`)
- Session duration: ~1 hour (resume of 13:45 fleet-parity handoff)
- Handoff sequence: [3] in the Cursor fleet-parity chain

### Recent Commits (for context)
  - e9a7d25 fix(deploy): keep agy out of the context-mode pin gate
  - 9239c44 fix(deploy): wrap context-mode MCP so every runtime uses the Claude store
  - ab2fd50 feat(cursor): deploy kernel, HUD, and ponytail rule
  - 8d87757 feat(deploy): pin context-mode store and wire Cursor fleet hooks
  - a927ca5 feat(cursor): add HUD plan-usage injector and kernel install script

## Handoff Chain

- **Continues from**: [2026-08-26-134554-cursor-fleet-parity.md](./2026-08-26-134554-cursor-fleet-parity.md)
  - Previous title: Cursor fleet parity (hooks, store pin, kernel, HUD, ponytail)
- **Supersedes**: that handoff's claim that a JSON `CONTEXT_MODE_DIR` pin plus CLI restart is enough for Cursor. Cursor CLI drops `mcpServers.env`. The live Cursor server is the plugin MCP (`npx -y context-mode`), not `$HOME/.cursor/mcp.json`. Restart alone left `ctx_doctor` on `$HOME/.gemini/context-mode (default)`.

## Current State Summary

This session made every fleet `context-mode` launch write the Claude store by putting `CONTEXT_MODE_DIR` in the **command**, not only JSON env. Wrapper: `scripts/context-mode-mcp.sh` installed to `$HOME/.claude/context-mode-mcp.sh`. Installer wraps Cursor user MCP, Cursor plugin `mcpServers`, Codex `config.toml` command, and Gemini CLI `settings.json`. Live Cursor `ctx_doctor` this session: sessions/content/stats under `$HOME/.claude/context-mode` with tag `via CONTEXT_MODE_DIR`. One-shot agy worker (after user-authorized workspace trust) also PASS on that store via `/opt/homebrew/bin/context-mode doctor` (agy had no MCP `ctx_doctor`). User then removed agy from the fail-closed gate. Both commits are on `origin/main` (`9239c44`, `e9a7d25`). Layer 0 `rulesBytes` over baseline is still red — `deploy.sh` still aborts before mutating `~` unless `--accept` or a shrink. `agent-environment-provisioning.md` still says kernel/HUD are not a deploy layer (now false; maintenance §1 needs approval).

## Codebase Understanding

## Architecture Overview

context-mode storage is `resolveSessionStorageDir(getDefaultSessionDir)`. If `CONTEXT_MODE_DIR` is unset, `describeStorageDirectorySource` prints `default` and the path comes from `detectPlatform()`. Cursor CLI does not pass plugin/`mcp.json` `env` into the MCP child. Without env, detection walks config-dir markers: `agy` / `$HOME/.gemini/antigravity-cli` / `$HOME/.gemini/config/mcp_config.json` **before** `$HOME/.cursor`. This machine has those markers, so the default store was `$HOME/.gemini/context-mode` and doctor also warned "Antigravity CLI hooks incomplete". Claude Code does not need the env pin: it launches `node ${CLAUDE_PLUGIN_ROOT}/start.mjs` with Claude identity vars, so default is already `$HOME/.claude/context-mode`. Cursor plugin launch is `npx -y context-mode`. The fleet fix is a wrapper as `command` that exports `CONTEXT_MODE_DIR=$HOME/.claude/context-mode` then `exec`s the original argv. Plugin upgrades reset plugin.json to `npx`; Layer 6 re-wraps.

## Critical Files

| File | Purpose | Relevance |
|------|---------|-----------|
| `scripts/context-mode-mcp.sh` | Launch wrapper; hard-sets Claude store | MCP `command` must be this file |
| `scripts/install-context-mode-dir.sh` | Layer 6: copy wrapper, pin env, wrap commands | Idempotent; does not wrap agy mcp_config |
| `scripts/check-context-mode-dir.sh` | Fail-closed pin + wrapper command | agy is out of this gate |
| `scripts/test-context-mode-dir.sh` | Isolated HOME installer test | Must stay green |
| `scripts/deploy.sh` | Layer 6 calls the installer | Still blocked by Layer 0 `rulesBytes` |
| `.agents/rules/lessons.md` | Proposed lesson 2026-08-26 context-mode | Cursor ignores `mcpServers.env` |

## Key Patterns Discovered

- Cursor `ctx_doctor` `(default)` vs `via CONTEXT_MODE_DIR` is the live proof of whether the pin reached the MCP process. Disk JSON env is not that proof.
- `check-context-mode-dir.sh` only reads files. Green check + red doctor can coexist.
- Do not pin/wrap every `plugin.json` under `$HOME/.cursor/plugins` as if it were a new MCP server: `pin_json_mcp` invents `context-mode` when missing. Wrap only files that already have that server (current wrap helper already skips).
- agy workspace trust TUI is not covered by `--dangerously-skip-permissions`. Answer with `agent-tmux agy send --key enter` only after the user authorizes TRUST. `assign` will fail at `confirm-processing` / `permission_prompt` if start returns while that TUI is still up.
- `public-sensitive-literals` greps `.claude/handoffs` for absolute macOS home paths. Handoff `Project:` must be `~/git/agent-scripts`. `validate_handoff.py` PASS is not Layer 0 evidence.

## Work Completed

## Tasks Finished

- [x] Diagnosed why this Cursor session's `ctx_doctor` pointed at Gemini store (`(default)` + agy marker detection)
- [x] Installed launch wrapper; wrapped Cursor / Codex / Gemini CLI context-mode commands
- [x] Live Cursor doctor: Claude store `via CONTEXT_MODE_DIR`
- [x] One-shot agy worker: PASS on Claude store (CLI doctor; `CONTEXT_MODE_PLATFORM` unset)
- [x] Removed agy from installer wrap + check fail-closed gate
- [x] Pushed `9239c44` and `e9a7d25` to `origin/main`

## Files Modified

| File | Changes | Rationale |
|------|---------|-----------|
| `scripts/context-mode-mcp.sh` | New wrapper | DIR in-process because Cursor drops JSON env |
| `scripts/install-context-mode-dir.sh` | Install wrapper; wrap JSON/toml commands; skip agy | Fleet pin that survives ignored env |
| `scripts/check-context-mode-dir.sh` | Require wrapper command; skip agy | Poke-yoke matches the real launch path |
| `scripts/test-context-mode-dir.sh` | Isolated installer test | Double-wrap and command rewrite |
| `.agents/rules/lessons.md` | Proposed lesson | Cursor plugin MCP vs `mcp.json` env |

## Decisions Made

| Decision | Options Considered | Rationale |
|----------|-------------------|-----------|
| Wrapper as MCP `command` | Keep JSON env only; point Cursor at Claude plugin `start.mjs`; symlink leftover Gemini/Codex DBs | JSON env never reached the Cursor MCP child. Claude plugin cache needs `CLAUDE_PLUGIN_ROOT`. Leftover dirs stay archives. |
| Skip agy in Layer 6 gate | Keep wrapping `$HOME/.gemini/antigravity/mcp_config.json` | agy is not a fleet runtime; trust TUI is out of deploy. Gemini CLI `settings.json` still pinned. |
| One-shot agy then `stop` | Persistent teammate | Isolation check only; user did not ask to keep agy running |

## Pending Work

## Immediate Next Steps

1. Decide Layer 0 `rulesBytes` (still over baseline): shrink, or `--accept` with an approved review. Until green, `deploy.sh` aborts before mutating `~`.
2. Maintenance §1 approval to fix `agent-environment-provisioning.md` (still says kernel/HUD are not a deploy layer — false since Layer 7).
3. Optional: `scripts/check-cursor-runtime.sh` compares kernel body to `$HOME/.codex/AGENTS.md`, which can disagree with repo `global/AGENTS.md` on a trailing newline. Identity is `diff` vs repo, not that hash alone.

### Blockers/Open Questions

- [ ] `rulesBytes` over baseline — fleet deploy from `main` fails Layer 0
- [ ] `preToolUse` Task payload shape still UNCONFIRMED (from prior handoff; not re-probed)
- [ ] context-mode `ctx_doctor` on Cursor reports `preToolUse hook not configured` in `$HOME/.cursor/hooks.json` — that is context-mode's own hook check vs fleet hooks; not a store-path failure. Whether to ignore or register plugin hooks is undecided.

### Deferred Items

- `tmux-assign-host-gate` / `session-title-sentinel` on Cursor until payload fields exist
- Ponytail / tmux-dispatch lifecycle hooks (no Cursor plugin format)
- Semantic update of `agent-environment-provisioning.md` (needs maintenance §1)
- Do not merge leftover Codex/Gemini session DBs into Claude by symlink
- agy as a fleet pin target (explicitly removed this session)

## Context for Resuming Agent

## Important Context

Canonical store is `$HOME/.claude/context-mode`. Proof that a runtime is on it is that process's doctor line `via CONTEXT_MODE_DIR`, not the installer check. Cursor plugin.json `env` can look correct and still be ignored. After a context-mode plugin upgrade, Layer 6 must run again to restore the wrapper as `command`. This Cursor session already shows Claude store. Codex live process was not doctor'd after the wrap — if a Codex CLI was started before `9239c44`, restart it. Handoff `Project:` must stay `~/git/agent-scripts`.

## Assumptions Made

- Gemini CLI `settings.json` wrap is still wanted (user excluded agy, not Gemini).
- agy PASS via the `context-mode` CLI is enough for that engine; it has no MCP `ctx_doctor` in the worker session.
- Cursor `clientInfo.name` is not `cursor-vscode`, so clientInfo detection does not save Cursor CLI.

## Potential Gotchas

- `python3 - <<'PY'` plus a pipe: heredoc owns stdin (still true for the hook adapter).
- `deploy.sh` downloads origin `main` tarball — uncommitted local Layer 6 edits are invisible until pushed (this session did push).
- Wrapping every `plugin.json` with `pin_json_mcp` would invent a context-mode server on unrelated plugins.
- `assign` on agy in this repo hits the trust TUI; start with no prompt text, `send --key enter` after TRUST, then `send --from-file`.
- `check-cursor-runtime.sh` kernel md5 vs `$HOME/.codex/AGENTS.md` can FAIL while kernel body equals repo `global/AGENTS.md`.

## Environment State

### Tools/Services Used

- Cursor CLI: live `ctx_doctor` on Claude store (`via CONTEXT_MODE_DIR`)
- `agent-tmux agy`: one-shot `agy-ctx-store` started, trusted, result `success`, stopped
- tmux-agent-tools wrapper: `$HOME/.agents/skills/tmux-agent-tools/scripts/agent-tmux`

### Active Processes

- This Cursor CLI session (store pin already live)
- No fleet `deploy.sh` run (Layer 0 still red)
- No lingering agy worker (`stop` exit 0)

### Environment Variables

- `CONTEXT_MODE_DIR` (canonical: `$HOME/.claude/context-mode`)
- `CONTEXT_MODE_PLATFORM` (Cursor plugin may set `cursor`; agy worker had it unset)

## Related Resources

- Prior handoff: `.claude/handoffs/2026-08-26-134554-cursor-fleet-parity.md`
- Kernel chain start: `.claude/handoffs/2026-08-26-114552-cursor-cli-kernel-hud.md`
- context-mode detect order: agy markers before Cursor config dir (plugin `detect.ts`, not this repo)
- Lesson: `.agents/rules/lessons.md` entry 2026-08-26 scope context-mode

---

**Security Reminder**: `Project:` is `~/git/agent-scripts` on purpose. Do not write an absolute macOS home path into this file.
