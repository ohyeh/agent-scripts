# Loops branch

Loop-shaped work: stages plus a convergence condition — audit chains,
consensus review, plan→build lifecycles, findings triage, research over
rounds. You pick **which** recipe the situation needs, fill its args, run it,
and keep the closed loop moving. You are not a recipe.

The RECIPE member is a recipe, not a skill, and is not in the skill lock.
For RECIPE, replace trunk steps 4–5 with this check: discover the live roster
with `ls ~/.claude/workflows/*.workflow.js .claude/workflows/*.workflow.js 2>/dev/null`,
read the chosen recipe's header comment for its args contract, then run this
branch's contracts. The WORKER member is a skill; use trunk steps 4–5 for it.

## Bypass — check FIRST

One bounded task, single context, no stages, no convergence condition → do it
directly (inline, or one worker: WORKER row). No recipe, no run dir. When in
doubt, bypass — recipes exist for loops, not ceremony.
Exception: research across several sources or rounds (find, compare prices,
gather sources) is NOT bypassed — go to `haiku-research-round`. A
one-tool-call fact stays inline; a small question takes one scout, not a
fanout. Either way, follow each claim to the primary source that owns it
(official docs, source code, specs). When the findings must be kept, write one
Markdown file with a source per claim, where the repo already keeps such notes.

Red flags that have actually burned us (naming one and proceeding anyway
requires a stated reason):
- 「我記得那支 recipe 內容」— recipes evolve; read the header comment (the
  args contract) before running. Never guess args.
- 「先做完再補 run record」— if it meets the run-dir bar below, open it first.
- 「這個小改不用 gate」— behavior-tier edits to any recipe DO need one
  consensus-gate round first.

Subagent exemption: delegated workers never enter this branch — the
dispatcher already routed; workers follow their brief.

## Questions

**Q1 Arrival — from the kernel loop-shaped route.**
1. Match the trigger word (audit / consensus verification / findings triage /
   root-cause deep-dive / plan→build / research) to a recipe via Q2.
2. Runtime: see Contracts §Cross-runtime — Claude runs the recipe natively
   with `Workflow`; Codex commands it through `references/codex-adapter.md`
   (`claude-workflow-runner`) at `opus` effort `high` (the floor); Cursor and
   agy run it by hand when the row has no `stop`. A missing Claude tool or
   model is not a stop by itself: replace it by role (§Cross-runtime).
3. Write-back duty: every recipe artifact/result lands in the CALLER's
   `.workflow/<YYYYMMDDHHMM>-<slug>/` run directory — never a detached
   location. One task = one run dir, shared by convention and recipe alike.

**Q2 Select — which recipe (RECIPE row).**
Discover live — never recite the recipe list from memory (the `ls` above).

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
  → confirmed == 0 AND no unverified/unaudited (§9.2) → converged, report · else → back to findings-triage / re-check
```

Entry points off the loop:
- weird bug → `root-cause-deep-dive-audit` · docs/design drifted → the matching audit
- ONE artifact needs a second-model verdict → `consensus-gate` — ONE round,
  irreversible/behavior-tier changes only; NOT a default station
- "what should this project do next" → `project-direction-review`
- recipe fleet inventory / machine drift → `workflow-manifest`
- research (facts, prices, sources; often several rounds) → `haiku-research-round`
  per round; you stay the commander: read each round, pick the next questions.
  When the user names the tool (e.g. codex-cu), run ONE target yourself to get a
  working recipe, then pass the tool + recipe in `args.tools`; do not browse the
  other targets yourself. A scout's blocker is a lead (judgment-rubrics §2).
  Report a direct tool error at once. Before you report "the target cannot do
  X", a scout checks one other path to X. When your tool steps cause the
  error, fix them. Then re-run the scout.

Stage recipes (`feature-plan-consensus`, `plan-pipeline`,
`spec-implement-dual-review-verify`) are normally reached THROUGH
`feature-lifecycle-auto`; call one directly only when you want just that stage.
Args auto-fill: `cli` is OPTIONAL (user ruling 2026-09-02: never depend on
codex). Any installed agent-tmux profile is a valid review gate — `codex`,
`claude-fable-opus` / `claude-fable-gate*`, `cursor` (grok), `agy*` — pick
one that differs from the substantive author; discover the list live with
`ls ~/.config/agent-tmux/profiles`. OMIT it and every stage runs a FRESH
Claude `opus` reviewer in an independent context. Never hard-code a name,
never block a run on an external CLI that is not installed. `context` = one line (repo abs path + stack +
scope). Prefer name invocation over scriptPath.
A workflow agent drives a CLI worker with the mod tools: `mcp__tmux-agent__assign`
(no worker yet) or `tell` (the worker an earlier call returned; consensus-gate
round 2+ must pass it as `worker`, else a new worker starts), then `mcp__tmux-agent__await` until a terminal
result, which comes back to that agent (live 2026-10-11, tmux-agent-tools ≥ a68ecd4).
The collector still sends the main session one notice for the same result. A
`runtime: tmux/<profile>` line inside `agent()` is not intercepted. The `cli`
recipes (`consensus-gate`, `plan-pipeline`, `feature-plan-consensus`) work this
way; launch or effort flags go in the agent-tmux profile `.conf` that `cli` names.

## Contracts

**Model floor (user ruling 2026-09-02).** Except for the worker, the L1/TK
review roles and mechanical seats (L0 runners and CLI conduits: `sonnet`
medium) below, every recipe agent runs at least `opus` effort `high`; the
default worker is `opus` effort `high`, reviewers `high`. Planning,
synthesis, revision, and verdicts NEVER run on `sonnet` or `haiku` — a plan
written by either is not a plan. `sonnet` 5.5+ may run the L1 pre-filter of
the review ladder (`model-dispatch.md` §Review ladder, user ruling
2026-10-09; `plan-pipeline` and `spec-implement-dual-review-verify` do this
in-script, the latter plus a one-pass `pr-review-toolkit` TK step); the
verdict stays with L2 (`fable`, else `opus`); no L3 — still blocking after L2
round 3, stop and ask the user.
Otherwise `sonnet`/`haiku` 5.5+ may run implementation and read-only data
gathering by commander's call (user ruling 2026-10-10); recipe args carry the
choice: `spec-implement…` `model`, `pr-review-triage-resolve` `fixModel`,
`feature-plan-consensus` `discoverModel`.

**Advisor gate (user ruling 2026-09-02; every runtime).** Recipes cannot call
tools; the gate lives in YOU, the commander. The verdict MUST be independent.
Use the `advisor` tool when you have it. Otherwise ask one reviewer on another
model through `using-tmux-agent-tools`. Pick the seat from the Tiers table in
`model-dispatch.md` §1: the `better` row, or an approved `best` row. Your own
rounds prepare the review; they are not the verdict. The gate is MANDATORY at
these points, and the verdict is recorded in the run dir before the next action:
1. BEFORE the first `Workflow` launch or by-hand round — brief, recipe, args
   (model floor, `cli` omitted or justified, round caps, hard time-box).
2. AT every human gate the recipe returns (`needsUser`, `autoBuild=false`,
   plan clean → build) — the plan itself, its size, and whether to build.
3. BEFORE any resume / relaunch after an abort (usage limit, exhausted
   ladder) — same run or narrower.
No independent verdict → do not launch, resume, or build. The 2026-09-02
quick-share run (32 plan agents, 182M input tokens, 64 KB plan, zero code
for 3.5 h) went uncaught because no gate sat between "plan rev N" and
"critic round N+1".

**Cross-runtime.** Claude Code executes `.workflow.js` natively with
`Workflow()`. Codex executes via `ADAPTED: claude-workflow-runner` (one
bounded Claude runner capsule — mechanics in `references/codex-adapter.md`),
under these constraints (Codex-authored, gate-v2 2026-07-19):

- Codex MUST freeze recipe name, args, acceptance, author runtime, and reviewer profile before dispatching exactly one Claude runner.
- The runner MUST invoke exactly one native `Workflow(...)`, preserve its return under `recipe_result`, write schema-v1 `result.json`, then stop.
- Any later exception MUST cap nesting at 2, declare child profiles/round ceilings, use unique sessions plus wait-required results, and forbid children from spawning.
- `args.cli` is optional: when set, resolve it by the substantive author under review (a non-Codex profile when Codex authored the target); when unclear, OMIT it — the recipe's fresh Claude `opus` reviewer is the default second brain.
- Human gates MUST return `status: paused` plus `next_action`, preserve `recipe_result`, stop the runner, and resume only via a new explicitly approved invocation.
- Evidence MUST say `recipe <name> executed natively on Claude runtime via runner (commanded by Codex)`; adapter or child failure is never recipe PASS.

Runtime matrix (Claude Code = `NATIVE` for all 13). Cursor and agy have no
`Workflow()` and no adapter: every recipe there is `UNAVAILABLE` natively.
`UNAVAILABLE` and `UNTESTED` name the native path only; they do not stop the
work. A row stops the work when any cell in it says `stop`. Every adapter
constraint, human gate, and kernel hard boundary still holds.

**By hand.** Read the recipe's header comment. Run its stages in order. Do a
stage yourself only when your model fits its role and tier. Otherwise give it
to one worker that does (`using-tmux-agent-tools`). Map each Claude-only seat
by role through the Tiers table in `model-dispatch.md` §1. Scouts and other
gathering use the `basic` row, or the `exec` row when `basic` has no model.
Planning, synthesis, revision, and verdicts use the `better` row, or an
approved `best` row. Write "by hand, not the recipe" in the report. These four
hold on every runtime:
- G1: the Advisor gate above, before the first round.
- G2: the brief names a round cap and a time-box (same approach ≤3 rounds,
  judgment-rubrics §8).
- G3: "done" quotes a check that ran this session (judgment-rubrics §2).
- G4: no worker starts a worker; every worker brief carries the no-cascade line.

If you cannot meet G1–G4, report the unmet guarantee. Do not launch or resume
the loop. Do not claim completion.

| Recipe | Codex | Cursor, agy |
|---|---|---|
| 3 audits, `findings-triage`, `project-direction-review`, `workflow-manifest` (6, no tmux inside) | `ADAPTED: claude-workflow-runner` | `UNAVAILABLE` |
| `haiku-research-round` (no tmux) | `UNTESTED` natively; by hand: ≤5 scouts a round, ≤3 rounds | `UNAVAILABLE` natively; by hand: ≤5 scouts a round, ≤3 rounds |
| `pr-review-triage-resolve` (no tmux; T3 rung = fresh Claude opus unless `externalAgentType` is set) | `UNTESTED` — only run natively on Claude so far; stop and report | `UNAVAILABLE` |
| `consensus-gate` (simple verdict outcome only) | `ADAPTED: direct-claude-review` — `references/codex-adapter.md` | `UNAVAILABLE` |
| `consensus-gate` (as recipe), lifecycle + its 3 stages when `cli` IS set (5, they drive tmux-agent mod workers inside) | `UNAVAILABLE-NATIVE` until nested-runner (depth-2) tests pass — stop and report; do not improvise | `UNAVAILABLE` |

**Defer.**
- Chain recipes from the TOP level only — `workflow()` nesting cap is 1, and
  the lifecycle shell spends it.
- Run dir (`.workflow/<slug>/`) ONLY when work spans days, has 2+ phases, or
  must survive interruption/handoff. Within-chat work: a single results file,
  or nothing.
- Recipe edits: behavior-tier → consensus-gate one round FIRST; wording →
  direct. Canonical = the agent-scripts repo bundle
  (`skills/using-workflows/workflows/`) → redeploy to `~/.claude/workflows/`;
  a live edit made machine-side must be folded back into the bundle in the
  same change.

**Not found.** No recipe fits → the work probably is not loop-shaped; bypass.
A genuinely new loop shape → propose a new recipe to the user; never
improvise a half-recipe inline. Per-recipe reference: `workflows/README.md`
(canonical: agent-scripts bundle `skills/using-workflows/workflows/README.md`;
deployed copy at `~/.claude/workflows/README.md`).

## Member table

The only place a loops member is chosen. Edit rules: trunk §Changing the
tree. `recheck` = the fact that makes the row stale, not a new winner.

| id | question | when | choice | evidence | date | recheck | class |
|---|---|---|---|---|---|---|---|
| RECIPE | Q2 | Any loop-shaped work | The recipe Q2 names from the live global and project-local listing above; a project-local recipe shadows the same global name | former `using-workflows` router, retired 2026-10-23 | 2026-10-23 | the named recipe is absent from both live listings | mechanical |
| WORKER | Bypass | One bounded task that should run off the main context | `using-tmux-agent-tools` | former `using-workflows` router | 2026-10-23 | absent from the lock | mechanical |
