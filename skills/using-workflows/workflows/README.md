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
- **Deriving the command name**: the official docs don't explicitly define how `<name>` is derived from the filename. A script's `meta.name` (e.g. `consensus-gate`) is its stable anchor. This file keeps the `.workflow.js` suffix to make its purpose explicit.
  Check the actual slash-command string by typing `/` in the CLI — don't guess it from this doc; invoking by the absolute `scriptPath` is independent of filename/naming derivation and always works.

## ⚠️ Which directories are NOT discovered

- `.workflow/`, `.workflow/recipes/` — these are conventions/artifacts belonging
  to the `codex-dynamic-workflows` **skill itself** (one-off run plan/orchestration/report
  archives); **Claude Code does not** discover them as saved workflows. To be
  invokable via `/name`, a recipe must live under `.claude/workflows/`.

## How to use

```text
# Shorthand (once this directory is discovered)
/consensus-gate

# With structured parameters (the script reads them via the global `args`)
> Run /consensus-gate on { repoPath: "...", proposalFile: "...", cli: "codex", layer: "L2" }

# Or an explicit absolute path (independent of discovery/naming)
Workflow({ scriptPath: "<abs path>/consensus-gate.workflow.js", args: {...} })
```

## Workflows currently in this directory

- **`consensus-gate.workflow.js`** — the minimal reusable primitive: one call
  is one round of one ladder layer (`args.layer` L1|L2 is required, `args.round`). The
  reviewer is `args.cli` (any agent-tmux profile), driven via agent-tmux; the
  call hashes a manifest (HEAD, `git diff HEAD`, `args.freeze` files) before and
  after the review and runs `args.l0` first. It returns `{ ok, verdict,
  consensus, notes, manifest_*, l0_* }` plus `passed`, which is true only for an
  L2 `agree` with L0 green and the manifest unchanged — an L1 agree is a
  pre-filter result. **Completion is signaled by polling an output file (one
  per round), never by pattern-matching the pane.** Smoke:
  `scripts/test-consensus-gate-ladder`. **See the file header for args examples.**

- **`spec-implement-dual-review-verify.workflow.js`** — the main feature-build
  pipeline: implement the spec → review the change through the ladder: L0
  `verifyCommands` + manifest → L1 `pr-review-toolkit:code-reviewer` on sonnet
  (+ Luna via `luna: true`) → TK one-pass `pr-review-toolkit` report (`toolkit`,
  default all four agents; findings fixed once) → L2
  `pr-review-toolkit:code-reviewer` on fable, opus if fable fails (always, ≤3);
  still blocking → stop and ask the user (no L3). The implementer model fixes every finding between rounds; the
  finalizer only runs the verify commands and the deviation gate, it never
  edits. A layer with no reviewer left aborts at review (P2-A5); a failed L1
  seat is a logged warning. Smoke: `scripts/test-review-gate-smoke.mjs`.
  **See the file header for args examples.**

- **`haiku-research-round.workflow.js`** — one round of a commander-driven
  research loop: N read-only scouts (default `haiku` effort `medium`, allowed
  as read-only data gathering under the MODEL FLOOR) answer the questions in
  `args.scouts` in parallel with sourced, structured findings (`args.fields`
  adds per-finding fields, e.g. `measured_gain`). The loop is NOT in the
  script: the commander reads the round, consults `advisor`, picks the next
  questions and calls it again with the next `round`. A failed scout comes
  back as `{key, failed: true}`. Browser rounds (`args.tools`) diff Chrome
  tabs before and after and return `tab_leaks`; codex-cu scouts run in
  sequence with namespaced REPL globals. Harvested from the 2026-10-10 haiku-decide
  experiment. **See the file header for args examples.**

- **`design-vs-code-audit.workflow.js`** — design-vs-code drift audit
  (domain-agnostic): it treats the design (Figma/mockup/frozen spec) as
  ground truth and current code as the audit target. Split into regions by `sections`, one finder per region
  (a seven-category drift taxonomy: MISSING/HALF_DONE/STATE_MACHINE/
  OVERLAP/ORDER/TEXT/STYLE) → each finding gets adversarially verified
  one by one (verdict real/refuted/unknown, isDesignWip, severity, fixHint). **Three-state design-WIP**
  (`wip: false/'partial'/true`): when the design itself is unfinished, a
  missing component doesn't count as a code bug — a dimension docs audits
  don't have. Fail-closed: a dead finder tags its region UNAUDITED (never
  "clean"), a dead or undecided (`unknown`) verifier puts that finding in the `unverified` bucket and
  surfaces it (never silently drops it). Audit-only (a scout); follow-up
  fixes go through the partitioned-fix pattern noted in the file header
  (mutually exclusive ownership, SKIP+report, never invent missing
  assets/fields) or feed into `spec-implement-dual-review-verify`. Harvested
  from the health-coin Figma five-recipe family on the remote2 machine.
  **See the file header for args examples.**

- **`findings-triage.workflow.js`** — closed-loop connector ①: automatically
  routes an audit recipe's confirmed findings into the next round's input.
  The routing table is the action semantics of `_lib/findings-schema.js`:
  `ask-user` escalates to a human (the machine never decides intent on the
  user's behalf), `no-op` just logs, `auto-fix` clusters **by root cause** —
  when a shared root cause has ≥ `clusterMin` (default 2) findings, they're
  written together into one mini-PRD (problem/why-now/scope/out-of-scope/
  done-criteria) and returned as briefs for you to turn into a plan; a singleton
  finding goes into the directFix list for a direct partitioned-fix. The
  fail-closed floor is "never drop a finding, never auto-fix an unknown": a
  dead clusterer returns everything in `unclassified` (re-run triage; nothing
  goes to directFix — judgment-rubrics §9.2); a
  dead brief writer puts the cluster into `unbriefedClusters`; overflow past
  `maxBriefs` goes to directFix. Closed-loop connector ② (the re-audit stop
  condition) lives on the caller's side: after fixes land, re-run the
  original audit with the **same args**; confirmed findings hitting zero =
  converged. **See the file header for args examples.**

Retired recipes are in `archive/` (never deployed; `install.sh` and `deploy.sh` skip it): `feature-plan-consensus`, `pr-review-triage-resolve`, `plan-pipeline`, `feature-lifecycle-auto`, `docs-vs-code-audit`, `root-cause-deep-dive-audit`, `project-direction-review`, `workflow-manifest`. None of them ran in the 14-day audit of 2026-11-06. To use one, run it by an absolute `scriptPath` into `archive/`.

## Scheduled or incremental runs

Keep a per-source bookmark of the last successful item. Move the bookmark only after the
batch succeeds. Dedupe on replay. "The last 24 hours" is not a substitute for a bookmark.

## Shared helper: `_lib/safe.js`

The **canonical repo source** of the three silent-failure guards
(`coalesceNull`/`nullIndices`/`failClosedRefutes`) lives in `_lib/safe.js`.
Because workflow scripts are self-contained (the runtime doesn't support
`import`), each recipe embeds the same code **verbatim**, marked with
`// ── SAFE_LIB ──`; after editing the canonical copy, run
`rg -l SAFE_LIB --glob '*.workflow.js' .` from this directory to find every
embedded copy that needs syncing before deployment.
Recipes currently embedding it: `design-vs-code-audit` (nullIndices) and
`findings-triage` (coalesceNull + nullIndices); the archived ones embed it too. See `.claude/memory/lessons.md` L1 for details.

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
