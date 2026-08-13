---
name: using-skills
description: Top-level map of the skill fleet, for "which skill does this need?" when the answer is not obvious. Invoke when a task's ownership is UNCLEAR or it spans MULTIPLE domains. It routes intent → the right router / skill / recipe and names how to invoke each. When the primary goal already names a domain, enter that domain router or member directly instead. Curates the ADOPTED surface only; the full installed roster lives in the skill manifest.
---

# using-skills

The map, not the territory — and the map projects the ADOPTED surface, not the
installed one. Install granularity is per-repo (`npx skills` pulls whole
packs); usage granularity is per-skill. The gap between them is bloat, and it
stays OUT of this file: `~/.agents/.skill-lock.json` records what is installed
(L0), the generated skill manifest shows the full roster with the gap made
visible (L1), and this file routes only what is actually in use (L2). Route by
INTENT, not by remembering ~100 names. When the owner is already obvious, skip
this map and enter the domain router or member directly.

Legend — **type**: `ROUTER` (meta-router skill) · `SKILL` (direct member) ·
`RECIPE` (a `~/.claude/workflows/` recipe, entered THROUGH `using-workflows`) ·
`RULE` (a `~/.agents/rules/` file, not a skill). **mode**: `Skill()`
model-invocable · `manual` (`disable-model-invocation` — read its SKILL.md
inline or use its slash command) · `via-router` · `inline` (just do it).

Two-hop max: `using-skills` → domain router → member. Never deeper, and never
route back here from inside a domain router. Visual work always enters
`using-design-skills`; `html` does not provide a route around its owner selection.

## Intent table — "I need to…" → target

| I need to… | Target | Type · mode |
|---|---|---|
| run loop-shaped work (audit / plan→build / consensus / triage) | `using-workflows` | ROUTER · Skill() |
| build/critique anything visual (page, screen, HTML deliverable, chart, artifact, motion, module/API design) | `using-design-skills` | ROUTER · Skill() |
| run/supervise a CLI as a tmux worker, or decide inline-vs-worker | `using-tmux-agent-tools` | ROUTER · Skill() |
| shape a fuzzy idea before building (parallel divergence: `adhd`) | `brainstorming` | SKILL · Skill() |
| stress-test a plan/decision/idea (frontier rounds; `grill-with-docs` when ADRs/glossary should be written as you go) | `grilling` | SKILL · Skill() |
| plan an effort too big for one session — chart it as decision tickets on the issue tracker, resolved one at a time | `wayfinder` | SKILL · manual |
| not sure which flow fits (kickoff, cross-domain, fuzzy situation) | `ask-nova` | SKILL · manual |
| check "is it actually done?" | `verification-before-completion` | SKILL · Skill() |
| dig a weird bug to root cause (loop version) | `root-cause-deep-dive-audit` | RECIPE · via `using-workflows` |
| reconcile docs/design vs code drift | `docs-vs-code-audit` / `design-vs-code-audit` | RECIPE · via `using-workflows` |
| sort a pile of audit findings | `findings-triage` | RECIPE · via `using-workflows` |
| get a second-model verdict on ONE artifact | `consensus-gate` (preferred; `oracle` for a one-off deep review) | RECIPE · via `using-workflows` |
| diagnose a bug inline | `diagnosing-bugs` | SKILL · Skill() |
| tidy or restructure code | `simplify` (just-written, behavior-preserving) · `refactor` (structural) | SKILL · Skill() |
| design a module/interface/domain (code, not pixels) | `design-an-interface` · `codebase-design` · `domain-modeling` | SKILL · Skill() (or via `using-design-skills` Pipeline D) |
| investigate a question / gather evidence | `research` | SKILL · Skill() |
| write tests / plan test coverage | `tdd` · `qa-test-planner` | SKILL · Skill() |
| drive a browser, test a web app, fill forms, screenshot / drive a device or TV app | `agent-browser` · `agent-device` | SKILL · Skill() |
| read a pasted URL (article, docs page) | `defuddle` (WebFetch replacement; not for `.md` URLs) | SKILL · Skill() |
| read or produce a PDF | `pdf` | SKILL · Skill() |
| hand off to a fresh session | `session-handoff` | SKILL · Skill() |
| write anything meant to be read (in-repo docs, problem writeup, long-form piece → md / html / Artifact / image) | `writing-artifacts` (unified writing entry: Stage 0 genre branch → `documentation-writing` for in-repo software docs, `writing-beats`/`writing-shape` for prose; `stop-slop` throughout, renders via `using-design-skills`) | SKILL · Skill() |
| commit / release | `git-commit` · `release-plannotator` (that repo only) | SKILL · Skill() |
| just implement something straightforward | — | inline (no skill; the domain is obvious) |

Vocabulary loaded as criteria, not stations: `delegation-templates` (SKILL —
every delegated worker prompt), `unknowns-discovery` (SKILL — surface
assumptions first), `karpathy-guidelines` + `full-output-enforcement` (SKILL —
coding discipline), `~/.agents/rules/judgment-rubrics.md` (RULE — decision
scoring / wrong-direction signals / done-criteria).

## Adopted families beyond the table — one line each

- **Meta-routers (backbone)** → this map + `using-design-skills`, `using-workflows`, `using-tmux-agent-tools`; enter a domain router directly when the goal names it.
- **Design-visual** → `html`/`html-*`, `diagram-design`, `impeccable`, `design-taste-frontend`, `high-end-visual-design`, `apple-design`, `imagegen-*`, `image-to-code`, `data-report` — ALWAYS through `using-design-skills`, the sole arbiter among overlapping anti-slop members (default `impeccable`; new landing pages → `design-taste-frontend`; Apple-grade polish → `apple-design`; house-style diagrams → `diagram-design`, one-off/interactive diagrams → `html-diagram`).
- **Ideation** → `brainstorming` (mandatory gate before creative work), `adhd` (parallel divergence), `prototype` (throwaway prototype answers a design question).
- **Grilling** → `grilling` (the implementation — asks each frontier of questions in one round, numbered, each with a recommended answer; dispatches sub-agents for facts). `grill-me` / `grill-with-docs` are manual slash entries into it; the latter runs `domain-modeling` alongside for ADRs/glossary.
- **Workflow orchestration** → `codex-dynamic-workflows`, via `using-workflows` (approved designs only).
- **Delegation** → `tmux-agent-tools` + `delegation-templates` via `using-tmux-agent-tools`; in-session parallel dispatch: `dispatching-parallel-agents`, `subagent-driven-development` (direct).
- **Git ops** → `git-commit`, `resolving-merge-conflicts`; `review-renovate` (supply-chain review, direct).
- **Ingest** → `defuddle`, `pdf`, `arc-artifact-fetcher` (NOT in the skill lock — unmanaged), `context7-cli` (library docs only; skill discovery belongs to `find-skills`).
- **Continuity / memory** → `session-handoff`, `shared-memory-intake` (curate shared Codex memory / submit external findings).
- **Fleet meta** → `skill-creator` owns the create/optimize/eval PROCESS, with `writing-great-skills` loaded as drafting criteria at every write/edit step (the stop-slop pattern); `find-skills` (discovery/install).
- **Project-specific (Plannotator)** → `pierre-guard`, `release-plannotator` — only inside that repo.

## Dormant — installed, not routed

Whole packs or chains that are installed (in the lock, listed in the skill
manifest) but currently unused. They cost nothing while dormant; wake one by
reading its SKILL.md and, if it sticks, promote it into the table above:

- matt planning/tracker: `triage` · `wizard`
- niche code-craft: `improve-codebase-architecture`, `migrate-to-shoehorn`, `request-refactor-plan`, `qa`
- misc singles: `update-deps`

## Secondary view — the idea→ship lifecycle

A journey, not the primary index (most tasks enter mid-stream via the table):
`brainstorming` → `grilling` → plan (via `using-workflows`:
plan-pipeline / feature-plan-consensus, tracked in a `.workflow/` run dir) →
build (via `using-workflows` lifecycle, or `using-design-skills` for visual) →
`verification-before-completion`. Keep brainstorm→plan in ONE context window;
use `session-handoff` at a session seam, not a `/compact`.

## Curated map vs live availability

This file is CURATED first-hop navigation over the ADOPTED surface. It is NOT
the inventory of what is installed. For "does skill X exist on this machine /
which runtime sees it / is it manual-only / how bloated is a source repo",
consult the generated skill manifest (per-repo roster with the
installed-vs-adopted gap visible) and the live directories — never assume from
this map.

## Red flags — rationalizations that have burned us

Naming one and proceeding anyway requires a stated reason:
- 「這只是小問題，不用 skill」— if the domain is obvious, go direct; if ownership
  is unclear, let this map decide. Don't skip routing on substantial work — but
  don't force the map when the owner is already plain.
- 「我記得那支 skill / recipe 的內容」— members evolve; read the live SKILL.md or
  recipe header before acting. Never route from memory of an old inventory.
- 「先做完再回頭套流程」— for loop-shaped or visual work the router picks the RIGHT
  process first; retrofitting it is how half-done work ships.
- 「裝了就該路由」— installed ≠ adopted. A dormant pack stays dormant until a
  real task wakes it; never widen the table to mirror the lock.

## Subagent exemption

A delegated worker executing one assigned task does NOT enter this router — the
dispatcher already routed; the worker follows its brief.

## Freshness self-check (this map WILL drift)

It lists intents and paths, not a registry. When routing feels off, confirm the
map still matches the machine — check the SKILL fleet (not workflow-manifest,
which inventories recipes), across BOTH runtime dirs:

```bash
installed=$(ls ~/.claude/skills ~/.agents/skills 2>/dev/null | grep -v '^$' | grep -v ':$' | sort -u | wc -l | tr -d ' ')
locked=$(node -e 'const j=require(process.env.HOME+"/.agents/.skill-lock.json");console.log(Object.keys(j.skills||{}).length)' 2>/dev/null)
echo "installed(union)=$installed locked=$locked"
```

A large mismatch, a station skill that no longer resolves, or a member the
active available-skills listing does not show → the map is stale: regenerate the
skill manifest before trusting a name here.

## NOT-FOUND

No intent fits and it is not loop-shaped or visual → check the Dormant list
above (installed but unrouted — wake it), then the active available-skills
listing, then plain inline work. A genuinely new recurring intent → propose a
new skill/recipe to the user; never improvise a half-router inline.
