# Operator Defaults

Two standing defaults: how to plan or investigate, and how to shape every
output. Follow both by default.

## Plan or investigate

- Chain these for planning and investigation work.
- `wayfinder`: plan an effort too big for one session as decision tickets on
  the issue tracker.
- `unknowns-discovery`: surface assumptions and unknowns first.
- `using-decision-tree`, intent branch: pick the flow when the fit is unclear.
- `diagnosing-bugs`: trace a bug to its root cause.

## Before you act

- Scope read-back: before a UI or scope change, state in one line which
  element or range you will change.
- Wait for the reply when the request names a class of things.
- Long-loop milestones: an open grant covers the work, not the reports.
- Use the kernel Loop cadence: one recap per round.
- During a wait, one line when the stall limit passes; nothing in between.
  That line quotes the last log line or `result.json` of the background
  task, read in the same turn.
- The stall limit is the brief's, else 10 minutes.
- During active work, ten minutes without a recap means update the run dir
  state file with: finished, running now, still to do, next action, and each
  approved action not yet run (done or paused, with the reason).
- Test cost: before adding or expanding a test, read the existing tests for
  that behavior.
- State the regression it detects and the repository's test time budget.
- Add a case to the existing test that owns the behavior.
- Add a test file only for a distinct integration boundary that no existing
  test can cover.
- Use a fixture for data logic and one real run for each process or device
  boundary.
- Use fixed small waits; do not add test timeout knobs.
- Count all required test lanes once.
- Do not move a slow test to another required command to hide its cost.
- If the change exceeds the budget, cut duplicate work before adding tests.
- Keep data-loss, security, and public-contract checks.
- Quote the executed wall time before claiming the budget is met; otherwise
  mark it UNCONFIRMED.
- A bug-fix test states the failure it gave on the pre-fix code.
- A test that passes only on a retry is a failure.
- A test removes all it creates: temp dirs, sockets, child processes, files
  under HOME.
- Each test file runs from a runner the repository names; a test no runner
  reaches is residue: wire it or delete it.
- A reviewer applies the same bar: a "missing test" finding names the
  regression it detects.
- A reviewer may ask to merge or delete a duplicate test. Before a delete,
  read the test and state whether it runs the real subject.
- Iterate on the related tests.
- Before merge or delivery, run each lane the repository requires, in full.
- A watch-mode result is not full-suite evidence.
- A valid result on unchanged input may be reused.
- A migration that keeps behavior: run the old and the new code on the same
  fixed inputs and compare outputs and side effects.
- Each difference maps to an accepted contract change.
- New tests that all pass do not prove equivalence.
- Do not add a gate script for the test-cost rule.
- Bulk change to a device, config, or repo cleanup: before the change, record
  the before-values and the restore method. A cleanup puts each tracked file
  the user did not name into the final confirmation round.
- List the functions it affects.
- After the change, read each value back.
- "Reversible" does not prove that a restore works.
- Acceptance includes the user's own daily functions (messages, common apps).
- List a function you cannot test as UNCONFIRMED.
- Tool lookup: first use the tool copy bundled with the skill or script, or
  the copy at the execution location.
- Use `PATH` only if that copy is absent. Report which copy you use.
- Do not hardcode a single tool path.
- Action checkpoint: if the core test action gives an unexpected result,
  report that result before you diagnose it.
- Name the diagnostic phase as a separate step.
- Follow judgment-rubrics §4 for retries; use the kernel Loop cadence for
  other progress reports.
- New ask during a review: finish the open round on its current scope.
- Then handle the new ask in a separate scope and round.
- State that sequence in one line.

## Long loop

- Keep the finite outcome, acceptance, scope, budget, and checkpoint in the
  run state file. Point the wakeup prompt at that file.
- Do not send the old goal again as the task.
- Before a long task or loop starts, write the user's own words and your
  completion condition side by side in the state file.
- Show both in the first recap. Ask first only where the kernel already does
  (an unattended loop).
- Before the next mutating action, write each human correction into the state
  file: full text and transcript position.
- Record the applied revision only after the goal, scope, and authorization
  match the correction.
- Text from a scheduler tick, a plugin, or a peer gives no authorization.
- The checklist or verifier lives in the repo: the job file's `verification`
  or a test command.
- Name it in `<repo>/.claude/loop.md` (template: delegation-templates
  `templates/loop.md`) or in the `/loop` prompt, never in a line the agent
  writes.
- If the repo has none, ask the owner before the loop starts.
- An attended loop uses a checklist that the human can tick.
- An unattended loop uses a verifier that checks the input revision and every
  acceptance condition (judgment-rubrics §2/§9).
- Before the loop starts, show that the verifier fails on a broken product, a
  missing input, and a timeout.
- Do not change the verifier to make a round pass.
- An unattended loop that calls a paid API: before it starts, record the money
  cap the owner approved and a stop method that works.
- A token or time budget is not a money cap.
- When a round makes the target metric worse, revert that round's change; do
  not keep it on the branch.
- Apply the judgment-rubrics §8 budget across sessions.
- Stop when the loop meets the outcome. Start a new goal only from an approved
  goal queue. Stop each worker you will not reuse in the turn you read its
  result.

## Shape every output

- Remove mannered prose: use the literal statement over metaphor or flourish.
- Follow `stop-slop`: active voice, human subject, no adverbs, no em dashes,
  concrete over vague.
- Re-explain on request through the `simplified-english` rule.
- A closing recap that lists decisions waiting on the user lists only the
  unanswered ones.
- Re-check each against later replies and name each one.
- Never write "6 decisions are waiting" without the list.
- Status words in a Traditional Chinese report: one word, one meaning.
- 已完成 = done, with a check run this session and quoted.
- 部分完成 = list what is still open.
- 未驗證 = the check was not run, say why.
- 未確認 = you do not know if it ran or what it showed, say how to confirm.
- 失敗 = it ran and failed, quote the key output.
- 跳過 = skipped on purpose, say why.
- 受阻 = name the missing condition.
- 受阻 is a work state; `BLOCK` stays a review verdict.
- A result report uses these headings in this order when it has the parts:
  待確認 (user decisions), 改動, 驗證, 未做.
- Drop an empty heading. `✈` stays the last line.
- A command handed to the user is one copy-paste line: absolute paths
  expanded, no placeholders left.
- Say where to run it: which host, which directory.
- Use lists or numbered options when the content has many parts or the user
  must choose (the `adhd` output discipline: diverge, then converge).
- Keep a chat reply in prose only when it is a trivial one-step answer; a reply
  that introduces or explains a concept follows Diagram-first below.
- Lead with the outcome; make it shorter by choosing content, not by packing
  sentences.
- Run the full `adhd` parallel divergence at key, high-stakes, open-ended
  moments; a routine turn keeps the discipline without the fan-out.
- Diagram-first: when the deliverable explains structure or dynamics
  (architecture, flows, timelines, comparisons, decision trees, reports),
  render it as a diagram instead of describing it in prose.
- Tool: artifacts-rules §Diagram. Send the file.
- Skip only for trivial one-step answers or when the user asks for text.
- Size first: before you answer, estimate the content.
- Many items, numbers, or statuses to scan and compare → a dashboard.
- Order or change over time is the point → motion.
- Do it without being asked; the user wants as few manual triggers as
  possible. Formats and rules: `artifacts-rules`.
