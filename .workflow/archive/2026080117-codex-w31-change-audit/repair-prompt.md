GOAL: Apply and verify root-cause repairs for findings F1, F2, F3, and F5 in `/Users/paul.yeh/github/tmux-agent-tools`, `/Users/paul.yeh/github/agent-scripts`, and `/Users/paul.yeh/github/context-mode-local-insight`. Motivation: the frozen author audit at `/Users/paul.yeh/github/agent-scripts/.workflow/2026080117-codex-w31-change-audit/audit.md` reproduced these current contract failures; repair the shared causes, not individual symptoms.

CONTEXT: Read the audit and every target source/test file in full before editing. F1 requires smoke fixtures to satisfy the current dispatch-gate receipt path/date/substantive-content contract while retaining a negative invalid-receipt assertion. F2 requires smoke consumers to use canonical `agent-tmux <cli>` paths; do not suppress or hide deprecation warnings as the production fix. F3 requires the two named JSONL appenders to produce exactly one valid JSON record per physical line, with a regression test that validates each line independently. F5 requires the collector implementation, stated metric contract, and test walker to agree; preserve the documented universal `{ value, method }` metric shape unless full consumer tracing proves a narrower contract is safer. Do not touch F4: choosing `payload.id` versus `session_id` changes cross-repository identity semantics and is intentionally deferred.

ACCEPTANCE:
- Repair only F1, F2, F3, and F5 and their necessary tests/docs; no unrelated refactor, no F4 identity-model change.
- Each repair has a narrow regression test that fails on the pre-repair behavior and passes afterward.
- Run each affected existing smoke/test suite plus the smallest relevant cross-repo integration checks; record exact commands, exit codes, and decisive output in `/Users/paul.yeh/github/agent-scripts/.workflow/2026080117-codex-w31-change-audit/repair.md`.
- Inspect `git status --short` and `git diff --check` in all three repositories before reporting; preserve all unrelated work.
- Do not commit, push, deploy, modify external state, or alter issues.
- Do not spawn additional tmux sessions or delegate further.

REPORT: return ONLY short conclusion bullets + `file:line` per claim + verification evidence. Hard cap 30 lines. Long artifacts → write to `/Users/paul.yeh/github/agent-scripts/.workflow/2026080117-codex-w31-change-audit/repair.md` and return the path. Do not paste file contents or logs.
If you cannot meet an acceptance criterion, say which one and why — do not fake it.
When done, write the structured completion (result.json contract, schema_version 1) to the literal result path injected into this prompt — do not rely on `$TMUX_AGENT_RESULT` inside tool sandboxes. Put the REPORT bullets in its `summary` field.
