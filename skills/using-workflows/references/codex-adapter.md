# Codex adapters — `claude-workflow-runner` & `direct-claude-review`

## `ADAPTED: claude-workflow-runner` — Codex runs a recipe for real

User ruling 2026-07-19: 「using-workflows skill 驅動，codex | claude 都可以跑起
workflow」. Codex-side gate opinion: RECOMMEND-WITH-CONSTRAINTS (gate-v2).

The recipe executes NATIVELY on Claude runtime; Codex commands and supervises.
Day-one eligible (no tmux inside): `design-consensus`, `design-vs-code-audit`,
`docs-vs-code-audit`, `findings-triage`, `project-direction-review`,
`root-cause-deep-dive-audit`, `workflow-manifest`. The five tmux-launching
recipes (`consensus-gate` as recipe, `feature-plan-consensus`, `plan-pipeline`,
`spec-implement-dual-review-verify`, `feature-lifecycle-auto`) stay
UNAVAILABLE until nested-runner depth-2 tests pass.

Sequence:

1. Freeze recipe name, args (incl. `args.cli` per the author rule below),
   acceptance, author runtime. No unfrozen dispatch.
2. `claude-tmux result path <run-name>` → start ONE bounded headless Claude
   runner whose whole brief is: invoke exactly one native
   `Workflow({name: '<recipe>', args: {...}})`, preserve its full return
   under `recipe_result` in schema-v1 `result.json` at the literal result
   path, then stop. The runner prompt forbids any other delegation.
3. `claude-tmux result wait-required <run-name> --fields status,summary
   --wait <recipe-appropriate> --json` → `stop`.
4. `args.cli` resolves by the SUBSTANTIVE AUTHOR under review: codex profile
   for Claude-authored work; a non-Codex profile when Codex authored the
   target; fail closed when heterogeneity cannot be established.
5. Human gates: the runner returns `status: paused` + `next_action` +
   preserved `recipe_result` and stops; resume ONLY via a new explicitly
   approved invocation. Never auto-resume past a ✋.
6. Evidence label, verbatim shape: `recipe <name> executed natively on
   Claude runtime via runner (commanded by Codex)`. Adapter or child
   failure is never recipe PASS.

## `ADAPTED: direct-claude-review`

The lighter route for a simple consensus OUTCOME. It reproduces the
OUTCOME of `consensus-gate` (an independent second-model verdict on one
frozen artifact) for a Codex main agent. This is the counterpart-review
principle mirrored: the reviewer is always the OTHER brain relative to the
commander — Claude commands → codex reviews; Codex commands → Claude
reviews (below). It does NOT execute the recipe —
label all evidence `ADAPTED direct Claude review`; never report
`consensus-gate.workflow.js: PASS`.

Scope: simple consensus outcomes only. Audits, triage, and multi-stage
recipes have no adapter — they stop as `UNAVAILABLE-NATIVE`.

## Sequence (verified live against `claude-tmux` usage, 2026-07-18)

1. Freeze the artifact path, acceptance criteria, and verdict schema; run
   local checks first.
2. Resolve the literal result path, start ONE bounded headless Claude
   reviewer with a full GOAL / ACCEPTANCE / REPORT prompt
   (delegation-templates REVIEW shape), collect, stop:

```bash
claude-tmux result path <gate-name>
claude-tmux start --exact --headless <gate-name> <repo-dir> '<GOAL: independently review <artifact>. ACCEPTANCE: read the artifact and live cited sources; return agree | agree_with_changes | disagree | unclear with concrete evidence; do not edit reviewed files or spawn workers. REPORT: write only schema_version 1 JSON with status, summary, artifacts, errors, and verdict to <result-path>.>'
claude-tmux result wait-required <gate-name> --fields status,summary --wait 600 --json
claude-tmux stop <gate-name>
```

3. Accept only an explicit `agree`; anything else → stop and report the
   objections. One round — do NOT auto-loop.
4. No cascade: the reviewer prompt forbids spawning workers; asking an
   outer Claude worker to invoke the recipe itself is also forbidden (the
   recipe would spawn its own reviewer — unsupervisable fan-out).
