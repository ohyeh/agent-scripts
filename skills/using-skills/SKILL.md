---
name: using-skills
description: Top-level map of the skill fleet, for "which skill does this need?" when the answer is not obvious. Invoke when a task's ownership is UNCLEAR or it spans MULTIPLE domains. It routes intent → the right router / skill / recipe and names how to invoke each. When the primary goal already names a domain, enter that domain router or member directly instead. Lists curated stations + family pointers only; the full roster is discovered live.
---

# using-skills

The map, not the territory. Route by INTENT, not by remembering ~100 names.
This file curates the high-signal first hops; the long tail is discovered live
(see Freshness). When the owner is already obvious, skip this map and enter the
domain router or member directly.

Legend — **type**: `ROUTER` (meta-router skill) · `SKILL` (direct member) ·
`RECIPE` (a `~/.claude/workflows/` recipe, entered THROUGH `using-workflows`) ·
`RULE` (a `~/.agents/rules/` file, not a skill). **mode**: `Skill()`
model-invocable · `manual` (`disable-model-invocation` — read its SKILL.md
inline or use its slash command) · `via-router` · `inline` (just do it).

Two-hop max: `using-skills` → domain router → member. Never deeper, and never
route back here from inside a domain router.

## Intent table — "I need to…" → target

| I need to… | Target | Type · mode |
|---|---|---|
| run loop-shaped work (audit / plan→build / consensus / triage) | `using-workflows` | ROUTER · Skill() |
| build/critique anything visual (page, screen, HTML, chart, artifact, motion, module/API design) | `using-design-skills` | ROUTER · Skill() |
| run/supervise a CLI as a tmux worker, or decide inline-vs-worker | `using-tmux-agent-tools` | ROUTER · Skill() |
| shape a fuzzy idea before building | `brainstorming` | SKILL · Skill() |
| check "is it actually done?" | `verification-before-completion` | SKILL · Skill() |
| dig a weird bug to root cause | `root-cause-deep-dive-audit` | RECIPE · via `using-workflows` |
| reconcile docs/design vs code drift | `docs-vs-code-audit` / `design-vs-code-audit` | RECIPE · via `using-workflows` |
| sort a pile of audit findings | `findings-triage` | RECIPE · via `using-workflows` |
| get a second-model verdict on ONE artifact | `consensus-gate` | RECIPE · via `using-workflows` |
| diagnose a bug inline | `diagnosing-bugs` | SKILL · Skill() |
| review code | `code-review` | SKILL · Skill() |
| refactor / simplify / plan a refactor | `refactor` · `simplify` · `request-refactor-plan` | SKILL · Skill() |
| design a module/interface/domain (code, not pixels) | `design-an-interface` · `codebase-design` · `domain-modeling` | SKILL · Skill() (or via `using-design-skills` Pipeline D) |
| investigate a question / make a hard reasoning call | `research` · `oracle` | SKILL · Skill() |
| write tests / plan test coverage | `tdd` · `qa-test-planner` | SKILL · Skill() |
| hand off to a fresh session | `session-handoff` · `claude-handoff` | SKILL · Skill()/manual |
| write docs / prose | `documentation-writing` + the writing family | SKILL · manual |
| commit / release | `git-commit` · `release-plannotator` | SKILL · Skill()/manual |
| just implement something straightforward | — | inline (no skill; the domain is obvious) |

Vocabulary loaded as criteria, not stations: `delegation-templates` (SKILL —
every delegated worker prompt), `unknowns-discovery` (SKILL — surface
assumptions first), `~/.agents/rules/judgment-rubrics.md` (RULE — decision
scoring / wrong-direction signals / done-criteria), `~/.claude/CLAUDE.md`
Simplicity + Code Discipline.

## Long-tail families — one line each, discovered live

Not enumerated here (they churn); confirm members against the live roster:
- **Animation** → the `gsap-*` family (core/react/scrolltrigger/timeline/…).
- **Writing** → the `writing-*` family + `edit-article` (mostly `manual`).
- **Learning / grilling** → `grill-*` family, `teach`, `scaffold-exercises` (`manual`).
- **Ingest / docs** → `defuddle`, `pdf`, `obsidian-vault`, `data-report`.
- **Device / browser / lib-docs** → `agent-device`, `agent-browser`, `context7-cli`.
- **Setup / meta** → `skill-creator`, `find-skills`, `update-deps`,
  `self-improving-agent`, `setup-*`.

Design members (`html`/`html-*`, `imagegen-*`, `image-to-code`,
`design-taste-frontend`, `impeccable`, `ui-ux-pro-max`, `apple-design`, …) are
reached THROUGH `using-design-skills` — do not route them from here.

## Secondary view — the idea→ship lifecycle

A journey, not the primary index (most tasks enter mid-stream via the table):
`brainstorming` → plan (via `using-workflows`: plan-pipeline / feature-plan-consensus)
→ build (via `using-workflows` lifecycle, or `using-design-skills` for visual)
→ `verification-before-completion`. Keep brainstorm→plan→ticket-split in ONE
context window; use `session-handoff` at a session seam, not a `/compact`.

## Curated map vs live availability

This file is CURATED first-hop navigation, deliberately short. It is NOT the
inventory of what is installed. For "does skill X exist on this machine / which
runtime sees it / is it manual-only", consult the generated skill manifest and
the live directories — never assume from this map.

## Red flags — rationalizations that have burned us

Naming one and proceeding anyway requires a stated reason:
- 「這只是小問題，不用 skill」— if the domain is obvious, go direct; if ownership
  is unclear, let this map decide. Don't skip routing on substantial work — but
  don't force the map when the owner is already plain.
- 「我記得那支 skill / recipe 的內容」— members evolve; read the live SKILL.md or
  recipe header before acting. Never route from memory of an old inventory.
- 「先做完再回頭套流程」— for loop-shaped or visual work the router picks the RIGHT
  process first; retrofitting it is how half-done work ships.

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

No intent fits and it is not loop-shaped or visual → likely a direct member
skill (check the active available-skills listing this turn) or plain inline
work. A genuinely new recurring intent → propose a new skill/recipe to the user;
never improvise a half-router inline.
