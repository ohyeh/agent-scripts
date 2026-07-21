# Deterministic external-worker supervision

Goal: move external-worker waiting out of LLM turns into one deterministic blocking tool call.

Success criteria:
- Codex MUST assign each asynchronous external CLI worker to exactly one cheap native supervision proxy when native sub-agents are available.
- Parent performs zero wrapper polling after ownership transfer.
- `agent-tmux supervise` waits silently through unchanged state and emits one terminal JSON result.
- Gate receipts remain auditable but are not repeated as user-facing commentary; unchanged role/rubric follow-ups reuse the existing receipt.
- Normal completion needs no pane capture; abnormal termination remains diagnosable.
- Existing wrapper behavior and tests remain green; new routing and supervision regression checks pass.

Constraints:
- Preserve wrapper/result schema compatibility and use existing session resolution.
- No new dependency or second registry.
- Keep `global/AGENTS.md` and `global/CLAUDE.md` byte-identical with matching versions.

Verification:
- focused supervise regression tests, router evals, full repo tests/smokes, diff-check, scrub, runtime install hashes.
- gate-routing regression checks prove receipts are persisted and only surfaced for material deviations, approvals, blockers, or explicit requests.
