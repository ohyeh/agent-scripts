GOAL: Independently and adversarially review the approved protocol/deadline/design-roster changes in `/Users/paul.yeh/github/agent-scripts`. Do not trust the author report; read the actual diff and source in full.

CHECK:
- `global/AGENTS.md` and `global/CLAUDE.md` are byte-identical at `4.15.0-protocol-payload-result-deadline`. Verify the new exact-protocol exemption is limited to payloads that must be emitted exactly and does not weaken ordinary narration/canary requirements.
- The delegation template's 120-second deadline rule is attached to the tmux result contract and says artifacts without valid completion are not done.
- `skills/using-design-skills` has no `frontend-design` reference anywhere; light-touch direction resolves to installed `impeccable` without changing Role 1's one-authority rule.
- Check the required baseline change was produced by the invariant checker, not manually fabricated. Run fresh invariant/eval/JSON checks and `git diff --check`.

ACCEPTANCE:
- Write `/Users/paul.yeh/github/agent-scripts/.workflow/2026080121-protocol-deadline-design-roster/review.md` with PASS/FAIL/UNCONFIRMED per three approved items; cite `file:line` and exact commands/exit codes.
- Confirm only task-owned files changed; no commit, push, deploy, external state, or further code changes.
- Final line exactly `VERDICT: PASS` only if all approved changes and checks pass; otherwise `VERDICT: BLOCK`.
- Overall deadline 900 seconds; valid result due by 780 seconds. Do not fix anything, spawn tmux sessions, or delegate further.

REPORT: return ONLY short conclusion bullets + `file:line` per claim + verification evidence. Hard cap 30 lines. Long artifacts → write to `/Users/paul.yeh/github/agent-scripts/.workflow/2026080121-protocol-deadline-design-roster/review.md` and return the path. Do not paste file contents or logs.
When done, write the structured completion (result.json contract, schema_version 1) to the literal result path injected into this prompt — do not rely on `$TMUX_AGENT_RESULT` inside tool sandboxes. Put the REPORT bullets in its `summary` field.
Do not spawn additional tmux sessions or delegate further.
