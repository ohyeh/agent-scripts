---
name: using-workflows
description: Meta-router for the workflow recipes in ~/.claude/workflows/ (personal layer) and the current repo's .claude/workflows/ (shadows personal on name collision). Invoke before any loop-shaped work — audits, consensus gates, plan→build lifecycles, findings triage. Even a 1% chance this applies means invoke it.
---

# using-workflows

You pick **which** recipe the situation needs, fill its args, run it, and keep
the closed loop moving. You are not a recipe.

## BYPASS — check FIRST

One bounded task, single context, no stages, no convergence condition → do it
directly (inline, or one worker via `using-tmux-agent-tools`). No recipe, no
run dir. When in doubt, bypass — recipes exist for loops, not ceremony.

Red flags that have actually burned us (naming one and proceeding anyway
requires a stated reason):
- 「我記得那支 recipe 內容」— recipes evolve; read the header comment (the
  args contract) before running. Never guess args.
- 「先做完再補 run record」— if it meets the run-dir bar below, open it first.
- 「這個小改不用 gate」— behavior-tier edits to any recipe DO need one
  consensus-gate round first.

Subagent exemption: delegated workers never enter this router — the
dispatcher already routed; workers follow their brief.

## TRIGGER

Loop-shaped work: stages plus a convergence condition. Audit chains,
consensus review, plan→build lifecycles, findings triage.

## SELECT

Discover live — never recite the recipe list from memory:

```bash
ls ~/.claude/workflows/*.workflow.js .claude/workflows/*.workflow.js 2>/dev/null
```

The inner loop (the ONLY loop — there is no scheduling outer ring; do not
invent one):

```
audit (docs-vs-code | design-vs-code | root-cause-deep-dive)
  → findings-triage        connector ①: askUser → human VERBATIM ·
  │                        briefs → lifecycle · directFix → partitioned run
  → feature-lifecycle-auto thin shell: feature-plan-consensus | plan-pipeline
  │                        → gate ✋ (autoBuild=false: human reads the plan)
  │                        → spec-implement-dual-review-verify
  → re-run the ORIGINATING audit, SAME args
  │                        connector ②: lives in YOU, not in code
  → confirmed == 0 → converged, report · else → back to findings-triage
```

Entry points off the loop:
- weird bug → `root-cause-deep-dive-audit` · docs/design drifted → the matching audit
- ONE artifact needs a second-model verdict → `consensus-gate` — ONE round,
  irreversible/behavior-tier changes only; NOT a default station
- N-angle generative design consensus → `design-consensus`
- "what should this project do next" → `project-direction-review`
- recipe fleet inventory / machine drift → `workflow-manifest`

Stage recipes (`feature-plan-consensus`, `plan-pipeline`,
`spec-implement-dual-review-verify`) are normally reached THROUGH
`feature-lifecycle-auto`; call one directly only when you want just that stage.
Args auto-fill: `cli` = user's words → repo CLAUDE.md → the COUNTERPART
engine (the second brain is always the OTHER engine relative to the current
commander: Claude commands → a codex profile; Codex commands → a claude
profile; never your own engine, never a hard-coded name) → ask once;
`context` = one line (repo abs path + stack + scope). Prefer name invocation
over scriptPath.

## Cross-runtime execution

Both runtimes RUN recipes through this router; only the execution vehicle
differs. Claude Code executes `.workflow.js` natively with `Workflow()`.
Codex executes via `ADAPTED: claude-workflow-runner` (one bounded Claude
runner capsule — mechanics in `references/codex-adapter.md`), under these
constraints (Codex-authored, gate-v2 2026-07-19):

- Codex MUST freeze recipe name, args, acceptance, author runtime, and reviewer profile before dispatching exactly one Claude runner.
- The runner MUST invoke exactly one native `Workflow(...)`, preserve its return under `recipe_result`, write schema-v1 `result.json`, then stop.
- Any later exception MUST cap nesting at 2, declare child profiles/round ceilings, use unique sessions plus wait-required results, and forbid children from spawning.
- Resolve `args.cli` by the substantive author under review: Codex for Claude-authored work; a non-Codex profile when Codex authored the target; fail closed if unclear.
- Human gates MUST return `status: paused` plus `next_action`, preserve `recipe_result`, stop the runner, and resume only via a new explicitly approved invocation.
- Evidence MUST say `recipe <name> executed natively on Claude runtime via runner (commanded by Codex)`; adapter or child failure is never recipe PASS.

Runtime matrix (Claude Code = `NATIVE` for all 12; Codex column):

| Recipe | Codex |
|---|---|
| 3 audits, `findings-triage`, `design-consensus`, `project-direction-review`, `workflow-manifest` (7, no tmux inside) | `ADAPTED: claude-workflow-runner` |
| `consensus-gate` (simple verdict outcome only) | `ADAPTED: direct-claude-review` — `references/codex-adapter.md` |
| `consensus-gate` (as recipe), lifecycle + its 3 stages (5, they launch agent-tmux inside) | `UNAVAILABLE-NATIVE` until nested-runner (depth-2) tests pass — stop and report; do not improvise |

## DEFER

- Chain recipes from the TOP level only — `workflow()` nesting cap is 1, and
  the lifecycle shell spends it.
- Run dir (`.workflow/<slug>/`, `codex-dynamic-workflows` conventions) ONLY
  when work spans days, has 2+ phases, or must survive interruption/handoff.
  Within-chat work: a single results file, or nothing.
- Recipe edits: behavior-tier → consensus-gate one round FIRST; wording →
  direct. Canonical = the agent-scripts repo bundle
  (`skills/using-workflows/workflows/`) → redeploy to `~/.claude/workflows/`;
  a live edit made machine-side must be folded back into the bundle in the
  same change.

## NOT-FOUND

No recipe fits → the work probably is not loop-shaped; bypass. A genuinely
new loop shape → propose a new recipe to the user; never improvise a
half-recipe inline. Per-recipe reference: `workflows/README.md` (canonical:
agent-scripts bundle `skills/using-workflows/workflows/README.md`; deployed
copy at `~/.claude/workflows/README.md`).
