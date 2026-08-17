# Handoff: Deterministic external-worker supervision closeout

## Session Metadata
- Created: 2026-07-22 01:04:01
- Project: /Users/paul.yeh/github/agent-scripts
- Related project: /Users/paul.yeh/github/tmux-agent-tools
- Branch: main
- Session duration: multi-turn implementation and verification session

### Recent Commits (for context)
- `agent-scripts` `434e62a` — fix(workflow): close supervision review findings
- `agent-scripts` `f1743cb` — docs(workflow): close supervision rollout
- `agent-scripts` `15b063a` — chore(skills): refresh tmux supervision locks
- `agent-scripts` `9c64c93` — feat(rules): require deterministic proxy supervision
- `tmux-agent-tools` `3ec0666` — fix(supervision): remove ambiguous liveness output
- `tmux-agent-tools` `72e4cf1` — feat(supervision): add silent blocking supervisor

## Handoff Chain

- **Continues from**: [2026-07-21-041710-model-dispatch-efficiency-closeout.md](./2026-07-21-041710-model-dispatch-efficiency-closeout.md)
  - Previous title: Model dispatch efficiency closeout
- **Supersedes**: None

## Current State Summary

The external-worker supervision optimization is complete, pushed, reviewed, and
installed globally as skills and shared rules. Long-running asynchronous external
workers now use exactly one cheap native Codex proxy; the deterministic wrapper owns
the wait loop and stays silent while state is unchanged. A mistaken `install-bin`
step was corrected: all 16 repo-backed symlinks were removed from `~/.local/bin`;
the supported PATH-missing fallback is the bundled script inside the global skill.

## Codebase Understanding

## Architecture Overview

- `agent-scripts` owns shared policy, global runtime files, routed rules, workflow
  artifacts, and the pinned skill roster.
- `tmux-agent-tools` owns wrapper lifecycle mechanics and the deterministic
  `supervise` implementation.
- Global installation copies skills to `~/.agents/skills`; it does not require or
  imply installing wrapper commands into `~/.local/bin`.

## Critical Files

| File | Purpose | Relevance |
|------|---------|-----------|
| `global/AGENTS.md` and `global/CLAUDE.md` | Shared runtime policy pair | Version 4.6.9; silent unchanged waits and mandatory proxy ownership |
| `.agents/rules/model-dispatch.md` | Model and role routing | Requires cheap native proxy for asynchronous external workers |
| `skills-lock.json` | Fleet skill restore roster | Refreshed hashes for both tmux skills |
| `.workflow/202607220001-deterministic-external-worker-supervision/` | Plan, evidence, and closeout | Canonical implementation record |
| `/Users/paul.yeh/github/tmux-agent-tools/skills/tmux-agent-tools/scripts/agent-tmux` | Wrapper engine | Implements deterministic `supervise` |
| `/Users/paul.yeh/github/tmux-agent-tools/skills/using-tmux-agent-tools/SKILL.md` | Routing policy | Defines ownership transfer and normal-call budget |

## Key Patterns Discovered

- The parent transfers all wrapper interaction to one native proxy and does not
  double-poll.
- `supervise --result-required --silent-while-unchanged --json` returns only on a
  valid terminal result, lost liveness, or deadline.
- Routine gate receipts belong in workflow/dispatch artifacts, not commentary.
- Skill fallback resolves `~/.agents/skills/tmux-agent-tools/scripts/*` when PATH
  wrappers are absent.

## Work Completed

## Tasks Finished

- [x] Replaced fixed heartbeat narration with material-event-only reporting.
- [x] Added deterministic single-call supervision and regression tests.
- [x] Made the cheap native proxy mandatory for Codex asynchronous external workers.
- [x] Prevented parent/proxy concurrent ownership.
- [x] Moved routine gate receipts out of user-facing progress messages.
- [x] Pushed both repositories and deployed global rules and skills.
- [x] Removed the unrequested `~/.local/bin` wrapper symlinks.

## Files Modified

| File group | Changes | Rationale |
|-----------|---------|-----------|
| `global/AGENTS.md`, `global/CLAUDE.md` | Version 4.6.9 supervision and quiet-output policy | Keep Codex and Claude shared policy identical |
| `.agents/rules/model-dispatch.md` | Mandatory cheap proxy and receipt reuse | Prevent optional proxy bypass and repetitive narration |
| `skills-lock.json` | Refreshed tmux skill hashes | Preserve the rollout in future restores |
| `tmux-agent-tools` wrapper/docs/tests | Added `supervise`, help, tests, routing contract | Move waiting from LLM turns to deterministic tooling |

## Decisions Made

| Decision | Options Considered | Rationale |
|----------|-------------------|-----------|
| Deterministic blocking supervisor | Longer heartbeat, adaptive LLM polling, tool-layer loop | Tool-layer loop consumes no model turns while unchanged |
| Exclusive proxy ownership | Parent plus proxy polling, proxy only | Prevent duplicate wrapper calls and repeated status output |
| No terminal `worker_alive` guess | Infer from tmux session, hard-code false, omit field | A terminal task result does not prove interactive process liveness |
| Skill-only global install | PATH symlinks, bundled fallback | Existing skill contract already provides PATH-missing fallback |

## Pending Work

## Immediate Next Steps

1. No implementation work is pending.
2. Test behavior on the next real long-running external worker session.
3. If it regresses, inspect the proxy dispatch prompt and wrapper result contract first.

## Blockers/Open Questions

- [x] No known blocker. Fresh independent review returned `VERDICT: PASS`.

## Deferred Items

- No additional automation or abstractions; current deterministic command fully
  covers the requested behavior.

## Context for Resuming Agent

## Important Context

Do not run `skills/tmux-agent-tools/scripts/install-bin` unless the user explicitly
requests PATH-level binaries. The expected global state is copied skills under
`~/.agents/skills`, with bundled-script fallback. Existing sessions do not inherit
new runtime instructions retroactively; validate using a new session.

## Assumptions Made

- Native sub-agents are available in Codex; otherwise report `UNAVAILABLE-NATIVE`
  and run the wrapper directly.
- One-shot work returning its terminal result in the original bounded call remains
  exempt from proxy supervision.

## Potential Gotchas

- `npx skills experimental_install` may reuse an older installed copy; after fleet
  restore, compare installed skills against the repo and run an explicit global
  skill update if they differ.
- A tmux session can outlive a terminal task result, so session existence is not a
  safe proxy for `worker_alive`.
- Do not emit routine `GATE:` receipts or unchanged `running`/`waiting` updates.

## Environment State

## Tools/Services Used

- `scripts/deploy.sh` for global files, routed rules, workflows, and skill restore.
- `npx skills update ... -g -y` to refresh the two tmux global skills.
- `session-handoff` scripts for this document.

## Active Processes

- No task-related worker or test process is intentionally left running.

## Environment Variables

- `TMUX_AGENT_DIR` is used by wrapper tests; no persistent value is required.

## Related Resources

- [Workflow final report](../../.workflow/202607220001-deterministic-external-worker-supervision/final-report.md)
- [Workflow implementation notes](../../.workflow/202607220001-deterministic-external-worker-supervision/implementation-notes.md)
- [Previous model-dispatch handoff](./2026-07-21-041710-model-dispatch-efficiency-closeout.md)

---

**Security Reminder**: Validated with the session-handoff validator; no secrets are intentionally included.
