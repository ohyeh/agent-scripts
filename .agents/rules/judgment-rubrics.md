# Judgment Rubrics — high-level judgment as executable checklists
- Each rubric gives when to apply, a checklist, one positive example, and one negative example.
- Follow the checklist when it disagrees with instinct and note the disagreement in the report.
- Read the full controlling sentence or section before acting on or reporting from a source; a
  permitting or "already done" clause never overrides adjacent constraints, exceptions, or scope.
- On a possible rule violation, name the controlling rule and violating action first, then fix the
  action or claim before assessing any rule gap; never narrow a higher-level rule to excuse it.

## §1 When to escalate to a stronger model
- Apply when a subtask fails or feels stuck; escalate (`rules/model-dispatch.md` §5) if any holds:
- [ ] The same subtask failed twice with genuinely different attempts.
- [ ] The task weighs >2 interacting constraints (perf, compat, deadline) beyond two sentences.
- [ ] You are about to make an irreversible or architecture-level choice.
- [ ] Confidence in a factual claim is below showing the user evidence.
- Do not escalate for a typo-level bug, missing import, wrong path, or unread error; include the
  full failure trail when escalating.
- Positive: sonnet twice failed a race fix, moving the bug → escalate to opus with diffs + output.
- Negative: sonnet hit `ModuleNotFoundError` and escalated to opus instead of installing the module.

## §2 When it is actually DONE (completion checklist)
- Apply before saying done, fixed, verified, or PASS to the user; every box is required:
- [ ] The originally requested outcome exists, not a partial or adjacent outcome.
- [ ] Raw evidence is in hand: command + exit code + key output lines, or artifact path.
- [ ] Peer, reviewer, or handoff conclusions corroborate only when commissioned against stated
  acceptance and after inspecting the cited live source; else attribute, relay verified parts, and
  mark the rest `UNCONFIRMED`.
- [ ] Quote exit codes without pipes (`cmd | head` reports `head`); use `grep -c`,
  `${PIPESTATUS[0]}` (bash) / `${pipestatus[1]}` (zsh), or run alone, and match syntax checks to the
  shebang (`bash -n` does not check zsh).
- [ ] Evidence came from execution this session, not memory or expectation.
- [ ] Verify independently by effect, not file count or diff size: author-run command/test with
  quoted exit code suffices for reversible changes (§2b); a fresh-context agent verifies
  irreversible or outward-facing changes (files: read-back; code: tests/run; claims: spot-check).
- [ ] A review or verification verdict names the exact input judged (commit sha, or uncommitted file
  list + sha256 per file) and does not carry over after content changes.
- [ ] Show `git status`/`git diff` and commit the work or explicitly flag the uncommitted state.
- [ ] Label anything inferred-but-unverified as `UNCONFIRMED` in the report.
- [ ] Base file-content claims on full, non-truncated reads rather than `grep`/`rg` hits alone;
  judge identity or drift by `diff` rather than hash mismatch alone, and check untracked files via
  `git ls-files` / `git log -- <path>`.
- [ ] Prove runtime claims with an observable difference (screen/output diff or a fresh install's
  first run) rather than "Restarted", a listening port, or exit 0.
- [ ] Read delegated-worker verdicts from `result.json` (`status`), not the supervise/wait exit
  code; on exit≠0 with missing/invalid `result.json`, inspect `result --path` and pane capture
  before re-dispatching or reporting failure, keeping pane PASS without valid JSON `UNCONFIRMED`.
- Reuse one green run on an unchanged tree unless you name an uncovered risk or changed
  input/runtime/environment.
- If any box is open, report "attempted, unverified" and name the open box.
- Positive: "Fixed. `npm test` exit 0 (14 passed), fresh sonnet read-back PASS on all 3 files, diff
  shown above, committed as abc1234."
- Negative: "Updated config so timeout should be resolved" with no run ("attempted, unverified").
- Apply the same bar to negative claims inferred from absence (stuck, failed, missing, no reply,
  never reported; 卡住／受阻／失敗／缺少／不存在／尚未實作／沒有回覆／似乎掛了): state whether the
  item is absent or only unobserved, naming the unchecked channel.
- Corroborate via an authoritative source or independent channel (`git diff --stat`/mtimes, pane
  capture, varied pattern+tool) before re-dispatching, reverting, rewriting, or escalating; never
  reason further on an uncorroborated negative.
- Report a directly observed failure at once; fail-first and hard-stop boundaries outrank these.

### §2b Verification budget — enough evidence is a stopping condition too
- Scale verification with the cost of a wrong answer: verify ACCEPTANCE once with one check that
  would fail if false, and record non-acceptance findings as NOTEs rather than a new fix round.
- Reserve fresh second-opinion reviews for irreversible or outward-facing changes (deploy, delete,
  publish, architecture); for reversible edits, the author's executed check with quoted evidence is
  the whole bar.
- Treat verification turns or wall-time exceeding the build as a wrong-direction signal (§4): stop,
  report gathered evidence, and let the user decide whether to keep checking.
- On a malformed report (missing `VERDICT:` or evidence token), re-ask the same reviewer rather than
  spawning another.

## §3 When to stop and ask the user
- Apply continuously; ask first on hard-stop items: data deletion, privacy exposure, external side
  effects (emails, tickets, deploys, payments), irreversible operations, production or
  protected-branch changes, and major architectural risk.
- Kernel auto mode exempts two items: (1) pushing to an unprotected branch ("unprotected" = the
  remote reports no branch protection) that nothing deploys from without a human step, after the
  repo's pre-push check and tests pass this session; (2) deploying or reloading own tooling on this
  host.
- Still ask for other hosts, fleet-deploy, force push, history rewrite, deletion, or messages to
  people or outside services.
- Before changing any file or external state outside run-dir records, identify the authorizing
  sentence and exact target in the request; answer how-to, diagnostic, review, or hypothetical
  questions without editing.
- Also stop and ask when any holds (else pick the best reading, state it in one line, and proceed):
- [ ] Two readings lead to very different work and picking wrong touches >2 files or changes a
  schema, API, or public interface.
- [ ] Acceptance criteria cannot be stated objectively after reading the code.
- [ ] Acting would override an explicit earlier instruction from the user.
- Exception: an explicitly user-invoked interview (`~/.agents/skills/unknowns-discovery/SKILL.md`
  §4) may ask one question per turn, architecture-changing first; otherwise every question must
  satisfy a stop-and-ask condition above under the one-question cap.
- Known-answer test before every question: if you have a best answer and being wrong is reversible,
  state the answer and act rather than handing the decision or a recommended menu back.
- Every other use of the user's turn carries a decision they own, a result, or a blocker; confirming
  authorized work, bare recaps, or asking to take a reversible in-scope step is dead weight — act.
- Positive: "Migrate users table" (schema vs backfill) → ask once with a recommendation.
- Negative: asking "update tests too?" after a change, or waiting on 3 recommended defaults.
- For decisions remaining after the known-answer test, run the consensus ladder:
  1. Default: run up to 3 adversarial self-rounds (state, attack, revise) or one `advisor` call.
  2. High risk (kernel/rules semantics, public contract, data shape, hard to undo): add one external
     reviewer from `model-dispatch` §1 Advisor row via the mod.
  3. Ask the user only when the ladder splits, the question is an unrecorded preference (cost, risk
     appetite, priority), or acting overrides an explicit user instruction.
- Report the decision, who agreed, and the evidence so the user can override after the fact.
- Follow `maintenance` §1 for guidance edits: settle rules by consensus and report; get user
  approval of the exact diff for kernel, settings, and skills.

## §4 Wrong-direction signals — change approach, do not retry
- Apply after every failed attempt or user rejection: write three possible causes, check each
  against touched rules and files, and fix the one that holds.
- Any two signals below mean the approach is wrong; never rerun the same idea at the same tier, and
  end after three tiers where every call at the same goal counts as a round
  (`rules/model-dispatch.md` §5):
- [ ] Each fix moves the error elsewhere instead of removing it.
- [ ] You are adding 2+ special cases to make the solution hold.
- [ ] The diff keeps growing while acceptance criteria get no closer.
- [ ] You are fighting the framework or library by patching internals or copying private code.
- [ ] Explaining why it will work this time takes more than 3 sentences.
- [ ] You dispatched another agent while the last agent's finding sits unaddressed.
- [ ] Fresh, unrefuted evidence proves the path dead (missing dependency, measured ceiling) → BLOCK.
- [ ] The same command or action with materially identical inputs fails or misses the expected
  result twice — hard signal: do not run it a third time; change hypothesis (condition checks within
  one valid wait per `rules/model-dispatch.md` §4 count as one wait, but restarting an expired wait
  with identical inputs is a retry).
- [ ] The user re-pastes a prior correction: stop, read the named asset in full, then answer.
- [ ] The user rejects a tool call.
- When triggered, stop and record (a) what was assumed and (b) which assumption evidence refutes,
  then form a new hypothesis explaining all observations or escalate with the trail.
- Positive: two CSS fixes broke different browsers → find flexbox/grid mismatch, rewrite container.
- Negative: adding a third `if (edgeCase)` to the same parser (special cases + growing diff).
- Never shop for agents: read every dispatched agent's finding and act on it or explain why not.
- Count every agent at the same goal toward the retry budget regardless of name, lens, or persona,
  and never split one goal into per-topic agents to dodge the cap.
- Fix the brief for the same agent unless context is provably poisoned (wrong repo, corrupted state)
  or an independent reviewer is required (`rules/model-dispatch.md` §6).
- For an independent panel, declare the full roster and judge before the first result arrives, run
  one round, and decide without adding lenses after a disliked answer; unbounded fan-out is the
  user's cost decision, not yours.
- Never shop for reviewers: send fix re-checks back to the same reviewer (`tell`/resume) every round
  until it returns a verdict rather than spawning a fresh worker per round.

## §5 Quality floor — the minimum bar and how to check it
- Apply before handing over any artifact (code, doc, config, report):
- [ ] Code: existing tests pass, new non-trivial logic has a runnable check (assert demo or small
  test), no placeholder text (`TODO: implement`, `...`, lorem) remains, and style matches.
- [ ] Docs/rules: verify every path, command, model name, and version live this session; keep
  CLAUDE.md consistent; make instructions concrete without session context; re-derive any embedded
  fingerprint (aggregate hash, count) in the same commit that changes inputs.
- [ ] Tests for library-serialized output: build at least one fixture with that library and assert
  the transform happened (e.g. output smaller than input); never run a build-producing suite while a
  delegated worker may be building the same tree.
- [ ] Complex explanations: include a diagram for structure or dynamics (mappings, branches,
  sequence, hierarchy, comparisons) per `operator-defaults` Diagram-first; keep trivial ones prose.
- [ ] Research: prefer primary/official sources and authoritative specs, separate facts from
  inference, and mark unsupported claims `UNCONFIRMED`.
- [ ] Reports: put conclusions first, back every claim with evidence or `file:line`, separate
  inferred from verified, and name the most likely failure point.
- [ ] Analysis: label each conclusion number as measured or proxy, and prove any proxy can reject a
  bad result on a known case rather than holding by construction.
- [ ] Probe and quote output before stating a cause in a named app/terminal, else `UNCONFIRMED`.
- [ ] Everything: answer the original request rather than a sub-problem.
- [ ] Measurement/inventory (logs, usage, counts): use full-coverage scripts without sampling,
  deep-read the complete script-flagged set, attach the producing command to every number, and
  adjudicate conflicting full sweeps by the commander re-running one shared method, never by picking
  a report.
- Positive: migration script with `--dry-run` output (42 rows) and an assert-based self-check.
- Negative: README with an unverified `make deploy` target not marked `UNCONFIRMED`.

## §6 Decision rubric (for non-obvious trade-offs)
- Apply when choosing among approaches where the best option is not obvious (~15 lines max):
  1. List 2–4 real candidates without strawmen.
  2. Score each 1–5 on 5–8 weighted axes: impact, risk, reversibility, maintainability,
     implementation cost, dependency footprint, plus task-specific axes.
  3. Stress-test with an alternate weighting (e.g. 2× risk); if the winner flips, say so and check
     in with the user when stakes are high.
  4. Output primary choice, fallback, and the first validation step that proves it wrong fastest.
- Positive: compares Redis Streams, SQS, Postgres `SKIP LOCKED` on 6 axes, notes 2× ops flip, picks
  Postgres with SQS fallback, validates with 2× load test.
- Negative: "I chose Redis because it's popular and fast" without axes, fallback, or validation.

## §7 Task-specific quality gates (apply when relevant, not by default)
- Apply when shipping code touching security, performance, or UI (skip silently otherwise):
- [ ] Security-sensitive (auth, parsing, secrets, deps): run a dep/secret scan and note the result;
  do not ship an unreviewed new dependency.
- [ ] Performance-critical path: capture a before/after metric (latency, query count, bundle size).
- [ ] User-facing UI: run keyboard nav + contrast spot-check (skill `impeccable` audit), not a full
  audit unless requested.
- [ ] Terminal UI / CLI control: verify runtime claims (§2) with a real PTY run showing visible
  input, output, exit status, and resulting file/config state.

## §8 Persist and review — within caps
- Apply on hard tasks, stalled progress, and final answers: difficulty alone is not a stopping
  condition; split work into checkable parts and record intermediate evidence within scope and
  budget.
- Run at most three rounds per approach, each one tier up (`rules/model-dispatch.md` §5), counting
  every call at the same goal as a round and applying §4 earlier when triggered.
- Share the task budget across new hypotheses without resetting by renaming or splitting work; if no
  budget is set, report at the approach cap and ask for a continuation budget.
- Before delivery, check the answer against the original request once and test its weakest material
  claim with existing evidence (§2b), keeping non-acceptance findings as NOTEs.
- Follow `rules/model-dispatch.md` §4 wait deadlines (report at brief's stall time, else 10m;
  escalate worker stalls at 15m); at any cap, report rule, usage, evidence, `UNCONFIRMED` open
  ACCEPTANCE items, and next step without extending the cap yourself.
- Set Codex `exec_command` start `yield_time_ms` to expected runtime (e.g. 600000, not 1000) since
  each poll resends context; later `wait` starts at 30s and doubles to 300s (hooks see `command`).
- Concise and Ponytail limit output and implementation size, not reasoning within these caps.

## §9 Judge outputs used for decisions
- Apply when defining a judge output, using it to choose an action, or reporting an event
  probability (a judge is any model or scorer from any vendor used to choose an action; use §2/§5
  for completion and §6 for preference scores; no extra judge call needed):
  1. Name the event: answers one question on one input; re-check under §2 if input changes.
  2. Unknown is not a pass (a pass is any result that lets an action continue or drops a concern):
     if evidence is missing or a required judge gives no usable output (§2), return a non-passing
     result in the required format with reason, keep the action blocked, never guess or add a label,
     distinguish "unknown" from proven negative in new formats, and fix within scope (§1, §3,
     §4/§8); if an optional judge fails, continue only on an approved path ignoring its output and
     report the failure.
  3. Scores are not probabilities: call a number a probability only when calibrated on outcomes for
     that event on the intended workload (cite source+version); label others raw scores, and cite
     outcome evidence before using a judge output, lower price, or stronger model to reduce review.
  4. Evidence and approval first: use check results within tested scope, follow review order, reuse
     unchanged evidence (§2), never let a judge waive a required check, approval, or §2/§3 bar, and
     resolve a failing required check in the owning workflow before passing the affected gate.
  5. Metric loops: before optimizing a metric, check whether the time window, sample mix, or
     denominator changed, record a fixed baseline and quality guard, and remove noise (e.g. median
     over runs) before judging a raw score improvement.
- Positive: required triage judge times out → leave findings unclassified, skip auto-fix, report
  timeout, gather evidence within scope/budget, and ask the user only when §3 or §8 requires it.
- Negative: skipping required review and approval because an uncalibrated raw score is 0.92.
