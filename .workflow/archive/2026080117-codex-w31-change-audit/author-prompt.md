GOAL: Perform a complete, read-only Codex-oriented audit of every commit from 2026-07-30 through 2026-08-01 in these repositories: `/Users/paul.yeh/github/agent-scripts`, `/Users/paul.yeh/github/tmux-agent-tools`, and `/Users/paul.yeh/github/context-mode-local-insight`. Motivation: establish whether the W31 retro remediation commits actually satisfy their cross-repository contracts, not merely whether their commit messages sound plausible.

CONTEXT: Review the full files changed by every in-scope commit. Trace consumers across repositories when a command, hook, result schema, workflow rule, profile, or collector interface changed. Treat the following as high-risk contracts: `result init` versus `supervise`, agy headless/effort flags, brief prompt compiler output, hook behavior under `set -euo pipefail`, duplicated global guidance invariants, and raw Claude/Codex/agy session-store discovery. This is a read-only audit: do not edit, commit, push, deploy, change issues, or alter configuration.

ACCEPTANCE:
- Produce `audit.md` in `/Users/paul.yeh/github/agent-scripts/.workflow/2026080117-codex-w31-change-audit/`, mapping every in-scope commit to changed paths, intended contract, evidence command, and result.
- Read each changed source file in full and cite every finding as `file:line`; distinguish PASS, FAIL, and UNCONFIRMED.
- Run the narrowest relevant existing checks for each changed behavior. Include exact command, exit code, and decisive output in `audit.md`.
- Inspect dirty worktrees before and after; do not disturb unrelated work.
- End `audit.md` with a prioritized findings table and a clear recommendation: `NO FIX REQUIRED` or a root-cause repair plan per finding.
- Do not spawn additional tmux sessions or delegate further.

REPORT: return ONLY short conclusion bullets + `file:line` per claim + verification evidence. Hard cap 30 lines. Long artifacts → write to `/Users/paul.yeh/github/agent-scripts/.workflow/2026080117-codex-w31-change-audit/audit.md` and return the path. Do not paste file contents or logs.
If you cannot meet an acceptance criterion, say which one and why — do not fake it.
When done, write the structured completion (result.json contract, schema_version 1) to the literal result path injected into this prompt — do not rely on `$TMUX_AGENT_RESULT` inside tool sandboxes. Put the REPORT bullets in its `summary` field.
