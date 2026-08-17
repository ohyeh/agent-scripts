GOAL: Apply exactly the already user-approved protocol/deadline/design-roster diff in `/Users/paul.yeh/github/agent-scripts`, then write the required report and result. This is a retry after an external worker exited without changing the tree or producing any artifact.

FIRST ACTION: immediately create `/Users/paul.yeh/github/agent-scripts/.workflow/2026080121-protocol-deadline-design-roster/author-report.md` with a one-line progress header before reading or editing anything. If any tool or policy blocks you, replace it with the exact blocker and write a schema-v1 failed/blocked `result.json` at the injected literal path before exiting.

EXACT APPROVED EDITS:
1. In both byte-identical `global/AGENTS.md` and `global/CLAUDE.md`, change `Version: 4.14.0-reply-scope-tool-chain-narration` to `Version: 4.15.0-protocol-payload-result-deadline`. Add exactly one output rule: a machine-readable payload that must match an exact protocol—JSON/JSONL, a `::directive{...}`, a structured result schema, or a literal verdict—is a required format and must be emitted alone, without narration or `✈`.
2. In `skills/delegation-templates/SKILL.md`, after its tmux `result.json` completion addendum, add: if the dispatcher gives an overall deadline, write that valid result at least 120 seconds before it; an artifact without it remains UNCONFIRMED.
3. In `skills/using-design-skills/references/design-roles.md`, remove the `frontend-design` Role 1 table row and change the auto-fill default so light-touch uses `impeccable`. Remove every remaining `frontend-design` reference from `skills/using-design-skills/implementation-notes.md` and `skills/using-design-skills/evals/evals.json`; preserve their meaning with only installed Role 1 authorities.

ACCEPTANCE:
- No files outside the six approved guidance/skill files, the required baseline if `node scripts/check-rules-invariants.mjs --accept` changes it, and this run directory.
- `cmp -s global/AGENTS.md global/CLAUDE.md`; `rg -n 'frontend-design' skills/using-design-skills` finds no matches; `jq empty skills/using-design-skills/evals/evals.json` exits 0.
- Run `node scripts/check-rules-invariants.mjs --accept`, then `node scripts/check-rules-invariants.mjs`, plus `git diff --check`.
- Add exact commands, exit codes, changed files, and remaining limitations to `author-report.md`.
- Overall deadline: 900 seconds; valid result due by 780 seconds. Do not commit, push, deploy, use external state, spawn tmux sessions, or delegate further.

REPORT: return ONLY short conclusion bullets + `file:line` per claim + verification evidence. Hard cap 30 lines. Long artifacts → write to `/Users/paul.yeh/github/agent-scripts/.workflow/2026080121-protocol-deadline-design-roster/author-report.md` and return the path. Do not paste file contents or logs.
When done, write the structured completion (result.json contract, schema_version 1) to the literal result path injected into this prompt — do not rely on `$TMUX_AGENT_RESULT` inside tool sandboxes. Put the REPORT bullets in its `summary` field.
Do not spawn additional tmux sessions or delegate further.
