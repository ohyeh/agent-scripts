GOAL: Apply the approved protocol/deadline/design-roster update in `/Users/paul.yeh/github/agent-scripts`. Motivation: prevent the reply canary from corrupting exact machine payloads, prevent artifacts without timely structured completion from being treated as complete, and remove a design router path to the uninstalled `frontend-design` skill.

CONTEXT: Make the smallest complete change. `global/AGENTS.md` and `global/CLAUDE.md` must remain byte-identical and bump from `4.14.0-reply-scope-tool-chain-narration` to `4.15.0-protocol-payload-result-deadline`. Add one precise rule: an exact machine protocol payload (JSON/JSONL, `::directive{...}`, structured result schema, literal verdict) is emitted alone, without narration or `✈`. In `skills/delegation-templates/SKILL.md`, extend the tmux addendum: when the dispatcher specifies an overall deadline, the worker must write a valid `result.json` at least 120 seconds before it; an artifact alone remains UNCONFIRMED. Remove `frontend-design` as a Role 1 authority from `skills/using-design-skills/references/design-roles.md`, map light-touch work to `impeccable`, and remove corresponding stale references from `skills/using-design-skills/implementation-notes.md` and `skills/using-design-skills/evals/evals.json`. Do not change any other routing behavior.

ACCEPTANCE:
- Only the approved global files, delegation template, design-roster reference/note/eval, necessary baseline, and this run directory change.
- `global/AGENTS.md` and `global/CLAUDE.md` are byte-identical with the same version.
- `rg -n 'frontend-design' skills/using-design-skills` returns no matches.
- Run the narrowest existing checks, including `node scripts/check-rules-invariants.mjs --accept` when needed for the approved global-byte baseline, valid JSON parsing of the changed eval file, and a focused assertion that the deadline wording exists.
- Inspect `git diff --check` and `git status --short`; do not commit, push, deploy, edit external state, or spawn additional tmux sessions/delegate further.
- Overall deadline: 900 seconds. Write the required valid structured result by 780 seconds at the latest.

REPORT: return ONLY short conclusion bullets + `file:line` per claim + verification evidence. Hard cap 30 lines. Long artifacts → write to `/Users/paul.yeh/github/agent-scripts/.workflow/2026080121-protocol-deadline-design-roster/author-report.md` and return the path. Do not paste file contents or logs.
If you cannot meet an acceptance criterion, say which one and why — do not fake it.
Do not spawn additional tmux sessions or delegate further.
When done, write the structured completion (result.json contract, schema_version 1) to the literal result path injected into this prompt — do not rely on `$TMUX_AGENT_RESULT` inside tool sandboxes. Put the REPORT bullets in its `summary` field.
