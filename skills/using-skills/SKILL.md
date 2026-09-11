---
name: using-skills
description: "Which skill owns this task. Invoke BEFORE doing by hand any of: merge or rebase conflict, .pdf read or fill, Renovate or dependabot PR, release notes or changelog, test plan or QA cases, dependency upgrade, architecture improvement, second-model review, docs writing, commit message, greenfield page, prose cleanup, 「有沒有 skill」, 「用哪個」 — or any task not named in the kernel routing index. Even a 1% chance a skill covers it means invoke this first; it costs one read."
---

# using-skills

Route by intent. Every name below is an entry in `skills-lock.json`, the
installed roster, so a name here always resolves on this machine.

The kernel routing index in `~/.claude/CLAUDE.md` binds first. When the kernel
names a trigger — delegation, done/stuck claims, unclear acceptance, retries,
loop-shaped work, code changes, output shape — its route wins. A few of those
skills still get a row below so that every lock name resolves in one place; the
row is a lookup, not a second opinion.

Two hops maximum: `using-skills` → domain router → member. Never route back
here from inside a domain router. Read the live `SKILL.md` before acting;
never act from memory of an old roster.

**Mode column**: `Skill()` = model-invocable · `manual` = read its `SKILL.md`
inline or use its slash command · `via-router` = enter through the router named.

## Hop 1: domain routers

| Router | Enter it when | Mode |
|---|---|---|
| `using-design-skills` | Anything visual: web page, app screen, HTML deliverable, chart, artifact, motion, plus module and API interface design | Skill() |
| `using-workflows` | Loop-shaped work: audit, consensus, triage, plan→build, lifecycle. Owns the 13 recipes in `~/.claude/workflows/`; this file does not list them | Skill() |
| `using-tmux-agent-tools` | Running a CLI as a tmux worker, or deciding inline versus worker | Skill() |

## Shape an idea before building

| I need to… | Skill | Mode |
|---|---|---|
| explore intent before any creative work (mandatory gate) | `brainstorming` | Skill() |
| diverge in parallel under different cognitive frames | `adhd` | Skill() |
| stress-test a plan or decision in frontier rounds | `grilling` | Skill() |
| pick a flow when the situation is fuzzy or cross-domain | `ask-nova` | manual |
| surface the map/territory gap in unfamiliar territory | `unknowns-discovery` | Skill() |
| build a throwaway prototype to answer a design question | `prototype` | Skill() |
| chart work too big for one session as decision tickets | `wayfinder` | manual |
| re-pitch a message that did not land | `wait-what` | manual |

## Write and change code

| I need to… | Skill | Mode |
|---|---|---|
| keep coding discipline: surgical diffs, stated assumptions | `karpathy-guidelines` | Skill() |
| tidy just-written code without changing behavior | `simplify` | Skill() |
| restructure code: extract, rename, break up a god function | `refactor` | Skill() |
| find deepening opportunities across a whole codebase | `improve-codebase-architecture` | manual |
| design a deep module interface | `codebase-design` | Skill() |
| build or sharpen the domain model, CONTEXT.md, an ADR | `domain-modeling` | Skill() |
| build features test-first | `tdd` | Skill() |
| plan test coverage, manual cases, regression suites | `qa-test-planner` | Skill() |
| replace `as` assertions with shoehorn in tests | `migrate-to-shoehorn` | Skill() |

## Diagnose and verify

| I need to… | Skill | Mode |
|---|---|---|
| diagnose a hard bug or performance regression inline | `diagnosing-bugs` | Skill() |
| review a diff defect-first, read-only, every finding | `defect-first-review` | Skill() |
| check that work is actually done before claiming it | `verification-before-completion` | Skill() |
| review UI code against Web Interface Guidelines | `web-design-guidelines` | Skill() |

## Delegate and orchestrate

| I need to… | Skill | Mode |
|---|---|---|
| write any worker brief (GOAL/ACCEPTANCE/REPORT) | `delegation-templates` | Skill() |
| drive tmux workers: mechanics and wrappers | `tmux-agent-tools` | via-router |
| plan and run an explicitly orchestrated agent workflow | `codex-dynamic-workflows` | via-router |

## Read the outside world

| I need to… | Skill | Mode |
|---|---|---|
| read a pasted URL as clean markdown | `defuddle` | Skill() |
| read, fill, merge, or produce a PDF | `pdf` | Skill() |
| investigate a question against primary sources, write it up | `research` | Skill() |
| drive a browser: navigate, fill forms, screenshot | `agent-browser` | Skill() |
| drive an iOS, Android, macOS, or TV app | `agent-device` | Skill() |
| read or drive the Grok Bot macOS app (bots, folders, transcripts) | `using-grok-bot-app` | Skill() |

## Write for people to read

| I need to… | Skill | Mode |
|---|---|---|
| turn a fuzzy subject into a finished deliverable (entry point) | `writing-artifacts` | Skill() |
| write in-repo software docs: README, API, tutorial | `documentation-writing` | Skill() |
| mine raw fragments before any structure | `writing-fragments` | manual |
| shape raw material into an article paragraph by paragraph | `writing-shape` | manual |
| assemble material into a journey of beats | `writing-beats` | manual |
| remove AI writing patterns from any prose | `stop-slop` | Skill() |

## Visual and HTML output (all through `using-design-skills`)

Listed so a name resolves, not as a bypass. The router picks the owner.

| Skill | Owns |
|---|---|
| `impeccable` | Default authority for product UI: dashboards, forms, app shells, polish, critique |
| `design-taste-frontend` | Landing pages, portfolios, marketing sites, full redesigns |
| `high-end-visual-design` | Agency-grade type, spacing, shadow, animation specifics |
| `apple-design` | Springs, gestures, interruptible motion |
| `hallmark` | Anti-slop greenfield pages, audits, design extraction from a URL or screenshot |
| `html` | Self-contained HTML reports, explainers, comparisons, decks |
| `html-diagram` | One-off or interactive diagrams where motion carries meaning |
| `html-plan` | Plan pages close to the user's own wording |
| `diagram-design` | House-style typed diagrams, mermaid and draw.io, PNG/SVG export |
| `data-report` | CSV, Excel, or JSON into a visual report page |
| `imagegen-frontend-web` | Website design references, one image per concept |
| `imagegen-frontend-mobile` | App-native mobile screen concepts and flows |
| `image-to-code` | Generate the design image first, then build to it |

## Git, releases, dependencies

| I need to… | Skill | Mode |
|---|---|---|
| commit with a conventional message and staging | `git-commit` | Skill() |
| resolve an in-progress merge or rebase conflict | `resolving-merge-conflicts` | Skill() |
| audit and update npm or Bun dependencies | `update-deps` | manual |
| review a Renovate PR for supply-chain integrity | `review-renovate` | Skill() |

## Session and fleet upkeep

| I need to… | Skill | Mode |
|---|---|---|
| hand off to a fresh session | `session-handoff` | Skill() |
| curate shared Codex memory, or submit findings to it | `shared-memory-intake` | Skill() |
| create, edit, or eval a skill | `skill-creator` | Skill() |
| move issues and external PRs through triage roles | `triage` | manual |
| generate a bash wizard for steps only a human can do | `wizard` | Skill() |

## Repo-specific

`pierre-guard` (guards the @pierre/diffs integration) and
`release-plannotator` (release notes, version bumps) apply inside the
Plannotator repo only.

## Plugin and bundled skills (present only where the plugin is installed)

Mode `plugin:<name>` = lives in that plugin's cache, not in skills-lock; `bundled` = ships with Claude Code. Check the SKILL.md exists on this host before citing it.

| Skill | Source | Mode |
|---|---|---|
| `access` | discord | plugin:discord |
| `capture-tasks-from-meeting-notes` | atlassian | plugin:atlassian |
| `codex-cli-runtime` | codex | plugin:codex |
| `codex-result-handling` | codex | plugin:codex |
| `configure` | discord | plugin:discord |
| `context-mode` | context-mode | plugin:context-mode |
| `ctx-doctor` | context-mode | plugin:context-mode |
| `ctx-index` | context-mode | plugin:context-mode |
| `ctx-insight` | context-mode | plugin:context-mode |
| `ctx-purge` | context-mode | plugin:context-mode |
| `ctx-search` | context-mode | plugin:context-mode |
| `ctx-stats` | context-mode | plugin:context-mode |
| `ctx-upgrade` | context-mode | plugin:context-mode |
| `dispatching-parallel-agents` | superpowers | plugin:superpowers |
| `executing-plans` | superpowers | plugin:superpowers |
| `finishing-a-development-branch` | superpowers | plugin:superpowers |
| `generate-status-report` | atlassian | plugin:atlassian |
| `gpt-5-4-prompting` | codex | plugin:codex |
| `jira-sprint-dashboard` | atlassian | plugin:atlassian |
| `jira-sprint-dashboard-canvas` | atlassian | plugin:atlassian |
| `ponytail` | ponytail | plugin:ponytail |
| `ponytail-audit` | ponytail | plugin:ponytail |
| `ponytail-debt` | ponytail | plugin:ponytail |
| `ponytail-gain` | ponytail | plugin:ponytail |
| `ponytail-help` | ponytail | plugin:ponytail |
| `ponytail-review` | ponytail | plugin:ponytail |
| `receiving-code-review` | superpowers | plugin:superpowers |
| `requesting-code-review` | superpowers | plugin:superpowers |
| `search-company-knowledge` | atlassian | plugin:atlassian |
| `spec-to-backlog` | atlassian | plugin:atlassian |
| `subagent-driven-development` | superpowers | plugin:superpowers |
| `systematic-debugging` | superpowers | plugin:superpowers |
| `test-driven-development` | superpowers | plugin:superpowers |
| `triage-issue` | atlassian | plugin:atlassian |
| `using-git-worktrees` | superpowers | plugin:superpowers |
| `using-superpowers` | superpowers | plugin:superpowers |
| `writing-plans` | superpowers | plugin:superpowers |
| `writing-skills` | superpowers | plugin:superpowers |
| `artifact-design` | Claude Code | bundled |
| `artifact-capabilities` | Claude Code | bundled |
| `artifact-diagramming` | Claude Code | bundled |
| `workflow-authoring` | Claude Code | bundled |
| `loop` | Claude Code | bundled |
| `claude-api` | Claude Code | bundled |
| `stop-slop` | Claude Code | bundled |
| `skill-doctor` | Claude Code | bundled |

## Not in this map

Plugin skills live with their plugins, not in `skills-lock.json`: `code-review`,
`code-simplifier`, `commit-commands`, `frontend-design`, `figma`,
`session-report`, `security-guidance`, and the rest under
`~/.claude/plugins/cache/`. The active available-skills listing shows them.
Rules files (`~/.agents/rules/*.md`) are not skills; the kernel routes them.

## Subagent exemption

A worker executing one assigned task does not enter this router. The dispatcher
already routed; the worker follows its brief.

## Red flags

Naming one and proceeding anyway needs a stated reason.

- 「這只是小問題，不用 skill」: go direct when the domain is obvious, but do not
  skip routing on substantial work.
- 「我記得那支 skill 的內容」: members change. Read the live `SKILL.md` first.
- 「先做完再回頭套流程」: for loop-shaped or visual work the router picks the
  process first. Retrofitting ships half-done work.

## Freshness self-check

This map matches `skills-lock.json` at its last edit. When a name here does not
resolve, or the listing shows a skill this map omits, confirm before trusting it:

```bash
diff <(rg -o '`[a-z][a-z0-9-]+`' ~/.agents/skills/using-skills/SKILL.md | tr -d '`' | sort -u) \
     <(jq -r '.skills|keys[]' ~/.agents/.skill-lock.json | sort)
```

Names in the left column only are stale references or prose. Names in the right
column only are installed skills this map has not placed yet.

## Nothing fits

Not loop-shaped, not visual, no intent above: check the active available-skills
listing, then work inline. A new recurring intent goes to the user as a proposal
for a skill or recipe. Never improvise a router inline.
