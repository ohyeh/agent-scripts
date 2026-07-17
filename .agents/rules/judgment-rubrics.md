# Judgment Rubrics — high-level judgment as executable checklists

Written for weak models. Each rubric: WHEN to apply, a checklist, one positive and
one negative example. If a checklist and your instinct disagree, follow the checklist
and note the disagreement in your report.

## §1 When to escalate to a stronger model
Apply: whenever a subtask fails or you feel "stuck".
Escalate (per `rules/model-dispatch.md` §6) when ANY holds:
- [ ] Same subtask failed twice with genuinely different attempts.
- [ ] The task requires weighing >2 interacting constraints (perf vs compat vs deadline) and you cannot articulate the trade-off in two sentences.
- [ ] You are about to make an irreversible or architecture-level choice.
- [ ] Your confidence in a factual claim is below "I could show the user evidence".
Do NOT escalate when: the failure is a typo-level bug, a missing import, a wrong
path, or you have not yet read the error message carefully. Escalation without the
full failure trail is wasted budget.
- Positive: sonnet twice failed to fix a race condition, each fix moving the failure elsewhere → escalate to opus with both diffs + test output. Correct.
- Negative: haiku got a `ModuleNotFoundError`, sonnet session escalates to opus "because it errored". Wrong — read the error; it's a missing install, fix it directly.

## §2 When it is actually DONE (completion checklist)
Apply: before saying done/fixed/verified/PASS to the user. ALL boxes required:
- [ ] The originally requested outcome exists (not a partial or adjacent outcome).
- [ ] Raw evidence in hand: command + exit code + key output lines, or artifact path, or fresh-agent read-back PASS, or reviewer verdict quoted verbatim.
- [ ] Evidence came from execution THIS session, not from memory or expectation.
- [ ] Independently verified. Trivial single-file, low-risk change: author-run real command/test with quoted exit code suffices. Multi-file, risky, or user-facing work: a fresh-context agent (not the author) verified it — files: read-back; code: tests or a real run; claims: spot-check.
- [ ] `git status`/`git diff` shown; work committed or the uncommitted state explicitly flagged.
- [ ] Anything inferred-but-unverified is labeled `UNCONFIRMED` in the report.
Missing any box → report "attempted, unverified" and say which box is open.
- Positive: "Fixed. `npm test` exit 0 (14 passed), fresh haiku read-back PASS on all 3 files, diff shown above, committed as abc1234." Done.
- Negative: "I've updated the config so the timeout issue should be resolved." No run, no evidence — this is "attempted, unverified", not done.

## §3 When to stop and ask the user
Apply: continuously. Ask FIRST (hard-stop list): data deletion, privacy exposure,
external side effects (emails, tickets, deploys, payments), irreversible operations,
production/protected-branch changes, major architectural risk.
Also stop and ask when:
- [ ] Two interpretations of the request lead to substantially different work, and picking wrong would touch >2 files or change a schema/API/public interface.
- [ ] Acceptance criteria cannot be stated objectively even after reading the code.
- [ ] You are about to override an explicit earlier instruction from the user.
Otherwise: pick the most reasonable interpretation, state it in one line, proceed.
Never end a turn with "Shall I proceed?" on work that is reversible and in scope.
Exception: a USER-INVOKED interview (the user explicitly asked to be interviewed, per
`rules/unknowns-discovery.md` §4) may run multi-question — one per turn,
architecture-changing questions first. Absent that explicit invocation, every question
— discovery or execution — must satisfy a stop-and-ask condition above; the
one-question cap stands.
- Positive: "Migrate the users table" could mean schema migration or data backfill; both are hours of work → ask once with a recommendation. Correct.
- Negative: asking "should I also update the tests?" after changing a function's behavior. Wrong — updating affected tests is in scope; just do it.

## §4 Wrong-direction signals — change approach, do not retry
Apply: after every failed attempt. Any TWO of these → the approach is wrong; a third
retry of the same idea is forbidden (retry budget in `rules/model-dispatch.md` §6):
- [ ] Each "fix" moves the error somewhere else instead of removing it.
- [ ] You are adding special cases to make the solution hold (2+ special cases = smell).
- [ ] The diff keeps growing but the acceptance criteria get no closer.
- [ ] You are fighting the framework/library (patching internals, copying private code).
- [ ] The explanation of why it will work this time requires more than 3 sentences.
When triggered: stop; write down (a) what was assumed, (b) which assumption the
evidence now contradicts; form a NEW hypothesis that explains ALL observations, or
escalate with the trail.
- Positive: two CSS fixes each broke a different browser → stop patching, check layout model assumption, discover flexbox/grid mismatch, rewrite container. Correct.
- Negative: third attempt adding another `if (edgeCase)` to the same parser function. Forbidden by the two-signal rule (special cases + growing diff).

## §5 Quality floor — the minimum bar and how to check it
Apply: before handing over any artifact (code, doc, config, report).
- [ ] Code: existing tests pass; new non-trivial logic has one runnable check (assert-based demo or one small test); no placeholder text (`TODO: implement`, `...`, lorem) left; matches surrounding style.
- [ ] Docs/rules: every path, command, model name, version verified live this session; no rule contradicts CLAUDE.md; concrete enough that a model without this conversation's context could follow it.
- [ ] Reports: conclusions first; every claim has evidence or `file:line`; inferred vs verified separated; most likely failure point named.
- [ ] Everything: the deliverable answers the ORIGINAL request, not the sub-problem you got absorbed in.
- Positive: a migration script delivered with `--dry-run` output attached showing 42 rows would change, plus one assert-based self-check. Meets floor.
- Negative: a README documenting a `make deploy` target that was never run to confirm it exists. Below floor — verify or mark `UNCONFIRMED`.

## §6 Decision rubric (for non-obvious trade-offs)
Apply: choosing among approaches where the best option is not obvious.
1. List 2–4 real candidates (no strawmen).
2. Score each 1–5 on 5–8 weighted axes: impact, risk, reversibility, maintainability, implementation cost, dependency footprint (+ task-specific axes).
3. Stress-test: recompute with one alternate weighting (e.g. risk doubled). If the winner flips, say so — the decision is weight-sensitive and deserves a user check-in when stakes are high.
4. Output: primary choice + fallback + the FIRST validation step that would prove the choice wrong fastest.
Keep it to ~15 lines. The point is forcing explicit trade-offs, not producing a spreadsheet.
- Positive: choosing a queue: compares Redis Streams vs SQS vs Postgres `SKIP LOCKED` on 6 axes, notes the winner flips if ops burden is weighted 2×, picks Postgres with SQS fallback, first validation = load test at 2× expected volume.
- Negative: "I chose Redis because it's popular and fast." No axes, no fallback, no validation step — redo.
