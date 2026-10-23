# Intent branch

Use this branch when the kernel routing index names no skill other than this
tree for the task and no single skill obviously owns it. Answer the questions in order. Each answer
is a row id from the member table at the end; that table is the only place a
member is chosen.

## Bypass

- One skill clearly owns the task → read that skill and go direct.
- The deliverable is visual or interface-shaped → back to
  `references/index.md`, design row.

## Questions

**Q1 Shape — what kind of work is it?**
- Loop-shaped: audit, consensus, triage, plan→build, research over rounds →
  LOOPS.
- One bounded job in one domain: a PDF, a test plan, a browser task, docs →
  MAP.
- Fuzzy, cross-domain, or the start of a new project → Q2.

**Q2 Flow — fuzzy or cross-domain work.**
Read LOOPS, MAP and `references/design.md` live before you ask anything. Look
up what the environment can answer. Ask only for a decision that is the
user's, and only when `unknowns-discovery` §STOP allows it. Then give exactly
ONE flow: the named stations in order, one line on what you skipped and why,
and one line on where the first command starts. Two flows tie → state the one
tie-breaker question. Nothing fits → say so; never improvise a half-flow.
The idea itself is unsettled and the user asks to be grilled → INTERVIEW.

## Member table

The only place an intent member is chosen. Edit rules: trunk §Changing the
tree. `recheck` = the fact that makes the row stale, not a new winner.

| id | question | when | choice | evidence | date | recheck | class |
|---|---|---|---|---|---|---|---|
| LOOPS | Q1 | Loop-shaped work | `using-workflows` (its router part and recipe roster) | dt-synthesis.md consensus 2, 2026-10-23 | 2026-10-23 | absent from the lock, or a loops branch takes its router part | mechanical |
| MAP | Q1 | One bounded job in one domain | `using-skills` (its intent tables) | dt-synthesis.md consensus 2, 2026-10-23 | 2026-10-23 | absent from the lock, or its tables move into branch files | mechanical |
| INTERVIEW | Q2 | The user asks to stress-test an unsettled idea | `grilling`, frontier rounds; never a default step | Owner ruling 2026-10-23 (the old flow picker retired); sol-hybrid.md:115 | 2026-10-23 | absent from the lock | owner |
