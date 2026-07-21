# Implementation notes

- 2026-07-22: User selected deterministic blocking supervision plus ownership transfer; adaptive LLM polling is fallback only.
- 2026-07-22: Defaulting to existing session ownership/result contracts and zero new dependencies.
- 2026-07-22: Added user correction: full gate receipts are audit evidence, not progress narration. Persist routine receipts; surface only material exceptions.
- 2026-07-22: Added deterministic `agent-tmux supervise`: one blocking call owns polling, stays silent while unchanged, validates terminal results, and detects process loss without pane capture.
- 2026-07-22: Added a normal-call budget and slim proxy context. Parent ownership ends after dispatch; diagnostic capture is exception-only.
- 2026-07-22: Replaced fixed heartbeat language with material-event-only reporting and moved routine gate receipts into workflow/dispatch artifacts.
- 2026-07-22: The full tmux smoke suite passed all 61 tests, including normal-result, silent-wait, lost-liveness, and supervision-stress coverage.
- 2026-07-22: Refreshed the two tmux skill lock entries after the first deploy exposed stale pinned hashes; this keeps future fleet restores on the new mandatory proxy policy.
- 2026-07-22: Fleet deploy completed and installed copies were compared against repo policy; both refreshed tmux skills contain the new supervision contract. PATH wrappers point to the tested checkout.

## Gate receipts

- `GATE: ~/.agents/rules/maintenance.md §1 — "Other rules/*.md ... Any semantic change — show the exact diff, wait for approval" | this task: user-approved attachment specifies model-dispatch ownership transfer and deterministic supervision.`
- `GATE: ~/.agents/rules/maintenance.md §1 — "Global files ... Everything (edit BOTH in the same change; Version lines must stay identical)" | this task: AGENTS.md and CLAUDE.md move together to 4.6.9.`
- `GATE: ~/.agents/skills/unknowns-discovery/SKILL.md §6 — "Write the plan to the project's planning convention and present it." | this task: this workflow records cross-repo plan, defaults, implementation, and verification.`
