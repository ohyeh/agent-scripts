# Claude Code Dynamic Workflows (this directory's guide)

This directory is **where Claude Code natively discovers saved dynamic
workflows**. Workflow scripts placed here can be invoked directly with
`/<name>` by anyone who clones this repo.

> This file is the reference manual for each recipe.

> Requirement: Claude Code **v2.1.154 or later**. Dynamic workflows need to be
> enabled via `/config` on Pro; Max/Team/Enterprise and API have them on by
> default.

## Discovery rules (official)

| Location | Scope | Visibility |
| --- | --- | --- |
| `.claude/workflows/` (this directory, project-level) | Shared with the repo, version-controlled | Everyone who clones it |
| `~/.claude/workflows/` (home directory, personal-level) | Available in every project | Only you |

- Both locations are invoked with `/<name>`; **on a name collision, project-level wins** (it shadows the personal-level one).
- **Deriving the command name**: the official docs don't explicitly define how `<name>` is derived from the filename. This script's `meta.name = feature-plan-consensus` (stable anchor). This file keeps the `.workflow.js` suffix to make its purpose explicit.
  Check the actual slash-command string by typing `/` in the CLI — don't guess it from this doc; invoking by the absolute `scriptPath` is independent of filename/naming derivation and always works.

## ⚠️ Which directories are NOT discovered

- `.workflow/`, `.workflow/recipes/` — these are conventions/artifacts belonging
  to the `codex-dynamic-workflows` **skill itself** (one-off run plan/orchestration/report
  archives); **Claude Code does not** discover them as saved workflows. To be
  invokable via `/name`, a recipe must live under `.claude/workflows/`.

## How to use

```text
# Shorthand (once this directory is discovered)
/feature-plan-consensus

# With structured parameters (the script reads them via the global `args`)
> Run /feature-plan-consensus on { repoPath: "...", featureBrief: "...", slug: "..." }

# Or an explicit absolute path (independent of discovery/naming)
Workflow({ scriptPath: "<abs path>/feature-plan-consensus.workflow.js", args: {...} })
```

## Workflows currently in this directory

- **`feature-plan-consensus.workflow.js`** — supervised orchestration: turns a
  "new feature brief" into a v1 implementation plan. Escalation ladder (sonnet →
  orchestrator self → second brain (`args.cli`) → escalate to user), evidence
  doctrine (trust code/logs/actual output, never memory or stale .md/.html),
  internal critic consensus loop followed by external adversarial review from
  the second brain — the plan is only written and committed once both gates
  reach consensus and are authorized.
  Design converged to AGREE after multiple rounds of adversarial review by the
  counterpart reviewer at the time.

- **`pr-review-triage-resolve`** (⚠️ design archive — **the file has not been
  landed yet**: not found in git history, personal-level, or the 3-machine
  harvest; this entry is a high-completeness design spec, not invokable via
  `/name` before it lands)
  — a one-shot PR review handling flow: ⓪ the brain first independently reads
  the diff + ledger to establish code ground truth → ① calls
  `scripts/pr/trigger-codex-review.sh` to summon the review bot and
  detached-polls for its reply (hard-waits `minGrace` first, then diffs
  against a baseline thread-id snapshot to detect new comments) → ② only
  ingests the bot's own new, unresolved threads (never touches human
  comments) → ③ TRIAGE: cross-checks every thread against code ground truth
  and rules accept / already-fixed / reject (the bot's own severity label is
  never taken at face value; low-confidence or high-severity findings escalate
  to a T2 worker review panel, then T3 internal adversarial review + external
  consensus via the second brain (`args.cli`)) → ④ only fixes accepted items
  (worker/self escalation ladder, verify each fix as it lands) → ⑤ after
  pushing, **first confirms the ledger is readable, then** resolves the three
  thread categories (no comment left behind). **Does not run the built-in
  closed loop** — the next round means manually re-running the whole recipe;
  cross-round dedupe relies on filtering `isResolved=false` plus a ledger
  audit. Design converged through adversarial review by the counterpart
  reviewer at the time (including live PR API verification).
  Paired script: **`scripts/pr/trigger-codex-review.sh`** (account gatekeeping
  + a strict review rubric; callable from the workflow or run standalone from
  the CLI). **See the file header for args examples runnable directly in this
  repo.**

- **`plan-pipeline.workflow.js`** — a planning-only pipeline (deliberately
  **excludes build**): ① direction (`goal_doc`) → ② frozen plan
  (`plan-<slug>.md`) → ③ ADRs — each artifact is drafted by the second brain
  (`args.cli`) and only frozen once its own adversarial review reaches CLEAN
  (0 Critical/0 Major) → then the docs are committed/pushed. Fully
  parameterized (slug/brief/output paths/review rounds), completion is always
  signaled by polling output files. Complements `project-direction-review`
  (that one answers "which direction"; this one freezes "how"); the
  subsequent build is handed off to `spec-implement-dual-review-verify`.
  **See the file header for args examples.**

- **`feature-lifecycle-auto.workflow.js`** — a thin top-level shell (zero
  business logic): PLAN (explore = feature-plan-consensus | frozen =
  plan-pipeline) → gate (stops if the plan doesn't reach consensus/freeze) →
  BUILD (optional, spec-implement-dual-review-verify). `autoBuild` defaults to
  false — it stops at the gate so a human reads the plan first. It already
  uses the one allowed layer of `workflow()` nesting at the top level and must
  not be nested further. The file header documents the harness bug where
  top-level args get dropped, and the JOB FILE fallback channel.
  **See the file header for args examples.**

- **`consensus-gate.workflow.js`** — the minimal reusable primitive: collapses
  "hand over a proposal → drive a second model to a high-effort consensus →
  return a structured verdict" into a single call. The reviewer is specified
  by `args.cli` (codex/claude/agy/any entry under
  `~/.config/agent-tmux/profiles` — heterogeneous reviewers are a config
  concern, not a recipe concern), driven via agent-tmux, and returns
  `{ ok, verdict, consensus(agree/agree_with_changes/disagree/unclear), notes }`
  plus a `passed` flag. **Completion is signaled by polling an output file
  (with a marker), never by pattern-matching the pane** — this avoids the
  marker being echoed back in the submitted prompt and misread as done (a
  pitfall this project hit twice in practice). **See the file header for args
  examples.**

- **`spec-implement-dual-review-verify.workflow.js`** — the main feature-build
  pipeline: implement the spec → **parallel dual review** by a second model
  (`args.cli`, REQUIRED) and claude → only accept fixes that are real and
  in-spec → run `verifyCommands` and paste the output. Three phases
  (Implement/Review/Finalize); the implementation agent returning null exits
  early. The second model is driven via agent-tmux (completion detected by
  polling an output file). Both reviewers degrade symmetrically: either
  returning null logs a downgrade and the return carries
  `external_available`/`claude_available`; if both are down it aborts before
  Finalize; the finalize agent returning null also aborts (never reports an
  unverified implementation as done). The second model gets up to 2 more
  review rounds to reach AGREE. **See the file header for args examples.**

- **`docs-vs-code-audit.workflow.js`** — docs maintenance: checks every
  document in `docs/` against **code ground truth** line by line (a read-only
  auditor returns FINDINGS_SCHEMA) → an in-scope patcher fixes issues in place
  (re-verifies right before each fix, skips anything it can rebut,
  delete-candidates are only logged, never deleted) → a single agent runs a
  cross-file consistency sweep over all of `docs/` (link integrity,
  cross-file contradictions, banned residue, index accuracy). Scope is split
  by `groups`, each group flows in parallel via `pipeline`. The group key is
  bound into the return value inside the pipeline itself (not attached
  after the fact by index, which would misalign labels if any group returns
  null). Aligned with the "truth = code, never stale docs" doctrine.
  **See the file header for args examples.**

- **`root-cause-deep-dive-audit.workflow.js`** — debugging investigation:
  given a bug symptom, ① one agent diverges into N candidate root causes
  (MECE) → ②③ each hypothesis flows independently via `pipeline`: gather
  evidence (file:line) → supported ones get `VOTES` **adversarial
  verifiers** (each tries hard to refute; weak evidence gets refuted) → ④
  converge, rank, explain the causal chain, and give the minimal root-cause
  fix. A survivor = refute votes < majority. `N`/`VOTES` are floored with
  `Math.max(1,…)` to prevent degeneration; **fail-closed vote counting**: a
  failed verifier counts as a refute vote, so missing verification can't carry
  a hypothesis through (prevents a silent pass with zero verification); a
  failed evidence agent is tagged `unevaluated`, partial verification is
  tagged `verify_incomplete`, both are surfaced rather than silently dropped.
  2 rounds of codex review to reach AGREE. **See the file header for args
  examples.**

- **`design-consensus.workflow.js`** — a domain-agnostic design consensus
  judge panel: N independent designers each propose from an assigned angle →
  mutual adversarial cross-attack (find real-world failure points and call
  out the parts worth keeping) → a judge synthesizes one consensus spec that
  would actually ship (explicitly lists what was rejected and why). All
  domain detail lives in `args.context` (required: background + task + hard
  constraints); `angles`/`outputLanguage`/`synthesisSpec` are overridable. A
  dead proposer degrades gracefully (aborts if fewer than 2 survive), a dead
  attacker gets that proposal flagged "unreviewed" so the judge weighs it
  with more suspicion, a dead synthesis step aborts rather than shipping a
  half-finished result. Harvested from a one-off
  aurora-reader-homepage-consensus run. **See the file header for args
  examples.**

- **`project-direction-review.workflow.js`** — domain-agnostic project
  direction review: Understand (5 parallel readers scan plans/pending
  decisions/runtime health/constraints-lessons/consumer-gaps, using an
  exploratory prompt by default, swappable for a project-specific one via
  `args.readers`) → Design (each lens proposes one direction, defaulting to
  quality-first/consumer-first/automation-first) → Synthesize (merges into a
  single prioritized roadmap: P0/P1/P2, gate annotations, risks and
  milestones). A dead reader is tagged "evidence PARTIAL" and fed into
  downstream prompts (never treated as if nothing happened); it only aborts
  if all readers die. Complements `plan-pipeline` (frozen plan): this one
  produces "which direction," that one produces "how." Harvested from a
  one-off aurora-future-direction-plan run. **See the file header for args
  examples.**

- **`design-vs-code-audit.workflow.js`** — design-vs-code drift audit
  (domain-agnostic): the sibling of `docs-vs-code-audit` — that one treats
  code as ground truth and docs as the audit target; this one treats the
  design (Figma/mockup/frozen spec) as ground truth and current code as the
  audit target. Split into regions by `sections`, one finder per region
  (a seven-category drift taxonomy: MISSING/HALF_DONE/STATE_MACHINE/
  OVERLAP/ORDER/TEXT/STYLE) → each finding gets adversarially verified
  one by one (isReal/isDesignWip/severity/fixHint). **Three-state design-WIP**
  (`wip: false/'partial'/true`): when the design itself is unfinished, a
  missing component doesn't count as a code bug — a dimension docs audits
  don't have. Fail-closed: a dead finder tags its region UNAUDITED (never
  "clean"), a dead verifier puts that finding in the `unverified` bucket and
  surfaces it (never silently drops it). Audit-only (a scout); follow-up
  fixes go through the partitioned-fix pattern noted in the file header
  (mutually exclusive ownership, SKIP+report, never invent missing
  assets/fields) or feed into `spec-implement-dual-review-verify`. Harvested
  from the health-coin Figma five-recipe family on the remote2 machine.
  **See the file header for args examples.**

- **`workflow-manifest.workflow.js`** — fleet workflow snapshot generator
  (Phase 7 "regeneration"): Scan (one agent per machine, remote ones go over
  SSH BatchMode: recipes + `_lib` + agents + exhausted base names) → Classify
  (a Q1–Q5 five-way decision tree **inlined in the recipe**, the same ruler
  applied on every re-run; `priorJudgments` prevents already-settled labels
  from flip-flopping) → Render (reads `templatePath` and inherits the design
  token system verbatim, writes a six-section Workflow Manifest HTML to
  `outPath`). Fail-closed: a dead scan tags a machine `unscanned` (never
  "clean"), a dead classification renders that machine UNTAGGED (never
  hidden), a dead render aborts with the full payload attached.
  **Publishing happens outside the recipe**: the script has no Artifact tool,
  it returns a `publishHint` for the main loop to act on in one line.
  Harvested from this repo's manual manifest-generation process. **See the
  file header for args examples.**

- **`findings-triage.workflow.js`** — closed-loop connector ①: automatically
  routes an audit recipe's confirmed findings into the next round's input.
  The routing table is the action semantics of `_lib/findings-schema.js`:
  `ask-user` escalates to a human (the machine never decides intent on the
  user's behalf), `no-op` just logs, `auto-fix` clusters **by root cause** —
  when a shared root cause has ≥ `clusterMin` (default 2) findings, they're
  written together into one mini-PRD (problem/why-now/scope/out-of-scope/
  done-criteria) and fed straight into `feature-lifecycle-auto`; a singleton
  finding goes into the directFix list for a direct partitioned-fix. The
  fail-closed floor is "never drop a finding": a dead clusterer degrades
  everything to directFix (loses routing precision, never loses data); a
  dead brief writer puts the cluster into `unbriefedClusters`; overflow past
  `maxBriefs` goes to directFix. Closed-loop connector ② (the re-audit stop
  condition) lives on the caller's side: after fixes land, re-run the
  original audit with the **same args**; confirmed findings hitting zero =
  converged. **See the file header for args examples.**

## Shared helper: `_lib/safe.js`

The **canonical repo source** of the three silent-failure guards
(`coalesceNull`/`nullIndices`/`failClosedRefutes`) lives in `_lib/safe.js`.
Because workflow scripts are self-contained (the runtime doesn't support
`import`), each recipe embeds the same code **verbatim**, marked with
`// ── SAFE_LIB ──`; after editing the canonical copy, run
`rg -l SAFE_LIB --glob '*.workflow.js' .` from this directory to find every
embedded copy that needs syncing before deployment.
Recipes currently embedding it: `root-cause-deep-dive-audit`
(failClosedRefutes), `docs-vs-code-audit` (coalesceNull + nullIndices),
`design-consensus`/`project-direction-review`/`design-vs-code-audit`
(nullIndices), `workflow-manifest`/`findings-triage`
(coalesceNull + nullIndices). See `.claude/memory/lessons.md` L1 for details.

There is also **`_lib/worker-doctrine.md`**: the canonical source for the
COMMON preamble used by multi-agent implementation workflows (anchoring/hard
tool mapping/language traps/scope fence/report contract including the
`DECISIONS-NOT-IN-SPEC` schema/verify wrap-up). Prompt fragments are copied,
not imported; harvested from real runs of the room-* family.

And **`_lib/findings-schema.js`**: the standard finding/verdict shape for
**new** audit/review recipes (severity: error/warning/info + action:
no-op/auto-fix/ask-user + risk_level, shape borrowed from the no-mistakes
review step; `ask-user` is reserved for findings that "challenge the
author's intent"). Existing recipes keep whatever schema already passed
review and are not retrofitted retroactively — a retrofit has to clear the
review gate first.

## Canonical copy and sync

This directory is the **single canonical source** of the workflow scripts in
the `agent-scripts` repo. Edit recipes here, review and commit the change, then
deploy that committed copy to each machine's `~/.claude/workflows/` with
`scripts/install.sh`. Runtime copies are deployment targets only; never edit
them as a source or manually copy them back into this directory.

## Sources

- Claude Code Docs — Orchestrate subagents at scale with dynamic workflows:
  https://code.claude.com/docs/en/workflows
- Anthropic — Introducing dynamic workflows in Claude Code:
  https://claude.com/blog/introducing-dynamic-workflows-in-claude-code
