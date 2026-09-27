---
name: using-skills
description: "Which skill owns this task. Invoke BEFORE doing by hand any of: .pdf read or fill, test plan or QA cases, architecture improvement, second-model review, docs writing, greenfield page, prose cleanup, 「有沒有 skill」, 「用哪個」 — or any task not named in the kernel routing index. Even a 1% chance a skill covers it means invoke this first; it costs one read."
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
| `using-workflows` | Loop-shaped work: audit, consensus, triage, plan→build, lifecycle. Owns the recipes in `~/.claude/workflows/`; this file does not list them | Skill() |
| `using-tmux-agent-tools` | Running a CLI as a tmux worker, or deciding inline versus worker | Skill() |

## Flows: situation → handoff → artifact → loop

Conditional handoffs, not a pipeline. Use only the stages the task needs,
inside the scope the user authorized. A domain router that owns a pipeline
keeps it. Loop-shaped work or a named recipe goes to `using-workflows`, which
picks or bypasses; a fresh reviewer alone does not make a recipe. Not every
skill is a link: tools, generators and constraint sets come from the map.

| Situation | Handoff | Artifact per step | Loop closes when |
|---|---|---|---|
| New feature, acceptance unclear | `unknowns-discovery` (when its trigger holds) → `prototype` for a design question, or `wayfinder` when too big for one session → implement (`tdd` when the user wants test-first) → `verification-before-completion` before any done claim → `defect-first-review` when risk or the user asks | stated defaults → design answer or decision tickets → diff and tests → quoted check output → findings | findings fixed and re-verified; a repeated finding → `lessons.md`, `Status: proposed` |
| Bug or regression | `diagnosing-bugs` (many competing hypotheses → enter `using-workflows` instead) → `verification-before-completion` → `defect-first-review` on the fix diff when risk warrants | repro and failing signal → fix and regression test → original scenario re-run → findings | regression test stays in the repo |
| Test plan, skill named by the user | `qa-test-planner` → only when execution is authorized: `agent-browser` (web) or `agent-device` (app) → a bug → Bug row; tracker issues → `triage` | cases → execution evidence → bug report | a missed case goes back into the plan |
| Pause or hand off | `session-handoff`; reusable knowledge for Codex → `shared-memory-intake` (inbox only) | handoff doc → inbox entry | the next session starts from the doc |

Owner pointers (their chains stay with them): codebase-wide deepening →
`improve-codebase-architecture`; interface, domain or visual design →
`using-design-skills`; writing for people → `writing-artifacts`; tmux workers →
`using-tmux-agent-tools`; loops and recipes → `using-workflows`; a skill edit →
`skill-creator` (draft, eval), then rule `maintenance` §1 (exact diff, approval)
before any install or deploy.

## Shape an idea before building

| I need to… | Skill | Mode |
|---|---|---|
| diverge in parallel under different cognitive frames | `adhd` | Skill() |
| stress-test a plan or decision in frontier rounds | `grilling` | Skill() |
| pick a flow when the situation is fuzzy or cross-domain | `ask-nova` | manual |
| surface the map/territory gap in unfamiliar territory | `unknowns-discovery` | Skill() |
| build a throwaway prototype to answer a design question | `prototype` | Skill() |
| chart work too big for one session as decision tickets | `wayfinder` | manual |

## Write and change code

| I need to… | Skill | Mode |
|---|---|---|
| find deepening opportunities across a whole codebase | `improve-codebase-architecture` | manual |
| design a deep module interface | `codebase-design` | Skill() |
| build or sharpen the domain model, CONTEXT.md, an ADR | `domain-modeling` | Skill() |
| build features test-first | `tdd` | Skill() |
| plan test coverage, manual cases, regression suites | `qa-test-planner` | Skill() |

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
| `impeccable` | Direction authority: product UI, landing and marketing pages, redesigns, polish, critique |
| `apple-design` | Springs, gestures, interruptible motion |
| `hallmark` | Anti-slop greenfield pages, audits, design extraction from a URL or screenshot |
| `html` | Self-contained HTML reports, explainers, comparisons, decks |
| `html-diagram` | One-off or interactive diagrams where motion carries meaning |
| `html-plan` | Plan pages close to the user's own wording |
| `diagram-design` | House-style typed diagrams, mermaid and draw.io, PNG/SVG export |
| `data-report` | CSV, Excel, or JSON into a visual report page |

## Session and fleet upkeep

| I need to… | Skill | Mode |
|---|---|---|
| hand off to a fresh session | `session-handoff` | Skill() |
| curate shared Codex memory, or submit findings to it | `shared-memory-intake` | Skill() |
| create, edit, or eval a skill | `skill-creator` | Skill() |
| move issues and external PRs through triage roles | `triage` | manual |
| generate a bash wizard for steps only a human can do | `wizard` | Skill() |

## Plugin and bundled skills the fleet relies on

Not in `skills-lock.json`. Listed only when the plugin is enabled in
`~/.claude/settings.json` and the skill shows in the available-skills listing;
a disabled plugin's skills do not belong here. Mode `plugin:<name>` = lives in
that plugin's cache; `bundled` = ships with Claude Code.

| Skill | Source | Mode |
|---|---|---|
| `context-mode` | context-mode | plugin:context-mode |
| `ctx-doctor` | context-mode | plugin:context-mode |
| `ctx-index` | context-mode | plugin:context-mode |
| `ctx-insight` | context-mode | plugin:context-mode |
| `ctx-purge` | context-mode | plugin:context-mode |
| `ctx-search` | context-mode | plugin:context-mode |
| `ctx-stats` | context-mode | plugin:context-mode |
| `ctx-upgrade` | context-mode | plugin:context-mode |
| `ponytail` | ponytail | plugin:ponytail |
| `ponytail-audit` | ponytail | plugin:ponytail |
| `ponytail-debt` | ponytail | plugin:ponytail |
| `ponytail-gain` | ponytail | plugin:ponytail |
| `ponytail-help` | ponytail | plugin:ponytail |
| `ponytail-review` | ponytail | plugin:ponytail |
| `artifact-design` | Claude Code | bundled |
| `artifact-capabilities` | Claude Code | bundled |
| `artifact-diagramming` | Claude Code | bundled |
| `workflow-authoring` | Claude Code | bundled |
| `loop` | Claude Code | bundled |
| `claude-api` | Claude Code | bundled |

Other enabled plugins (`code-review`, `commit-commands`, `pr-review-toolkit`,
`session-report`, `frontend-design`, `security-guidance`) show in the listing
with their own descriptions. Rules files (`~/.agents/rules/*.md`) are not
skills; the kernel routes them.

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

Names in the left column only are the plugin/bundled section, mode words, rule
names, or stale references; check the ones outside that section. Names in the right
column only are installed skills this map has not placed yet.

## Nothing fits

Not loop-shaped, not visual, no intent above: check the active available-skills
listing, then work inline. A new recurring intent goes to the user as a proposal
for a skill or recipe. Never improvise a router inline.
