# Design fleet — roles, roster, executors (reference for using-design-skills)

Prior, not registry — verify live per the router's SELECT section.
Capability flags when classifying an unlisted skill (may carry several):
`sets_direction` / `reviews_render` / `implements` / `specialist_constraints`
/ `output_owner` / special runtime needs (e.g. image generation → Codex only).

## Role 1 · Direction authority (exactly ONE per visual pipeline, ZERO for Pipeline D / prototypes / trivial tweaks)

| Skill | Reach for it when | Its audit rubric (used by the quality loop) |
|---|---|---|
| `design-taste-frontend` | Landing pages, portfolios, marketing sites, full redesigns | Its pre-flight check |
| `impeccable` | Product UI: dashboards, forms, settings, app shells; polish/critique of existing interfaces | Its "AI slop test" |
| `frontend-design` | Light-touch aesthetic guidance when the two above are too heavy | Its restraint/self-critique section |

If a selected authority ships no usable checklist, the reviewer falls back to
impeccable's AI slop test as the default rubric. A skill that cannot support
an evidence-backed PASS/BLOCK audit is not an authority for this loop.

**Advisory database (not an authority):** `ui-ux-pro-max` — searchable
styles/palettes/fonts/charts/stacks. Any stage may QUERY it for facts; it
never owns direction. Let it lead style exploration only when the user
explicitly asks to survey many candidates. If it doesn't resolve under
Discover live, say so and proceed without it — never fabricate style facts.

**Vocabulary reference (web, not a skill):** https://namethatui.com/ — the
"what is this component called" dictionary. Consult it (via ctx_fetch, or
ask the user to look) when a spec, worker prompt, or imagegen prompt
describes a UI element vaguely: naming the component correctly upgrades
search results, member-skill routing, and generation quality in one move.
Same standing as ui-ux-pro-max: any stage may QUERY it; it never owns
direction.

## Role 2 · Specialist add-ons (constraint sets — stack freely, load inline)

| Skill | Adds |
|---|---|
| `apple-design` | Springs, gestures, interruptible motion — any "make it feel fluid/physical" ask |
| `dataviz` *(if it resolves under SELECT)* | Load before writing chart/graph/dashboard code in any medium; if absent, apply charting best-practices inline — do not fake a stage |
| `artifact-design` *(bundled skill)* | MANDATORY before publishing any Artifact page (`artifact-capabilities` only if the page calls connectors) |

## Role 3 · Image-first pipeline (Codex delegation)

`imagegen-frontend-web` / `imagegen-frontend-mobile` generate
section-by-section design reference images; `image-to-code` implements code
to match them. All three are written FOR Codex (image generation is
unavailable inline) — these stages always dispatch to a Codex worker pointed
at the skill file.

## Role 4 · Interface/domain design (code, not pixels)

`design-an-interface` (N module shapes via parallel sub-agents),
`codebase-design` (deep-module vocabulary), `domain-modeling` (terminology,
ADRs). No visual authority involved.

## Role 5 · HTML deliverable trio + gated explainer (daily-driver output owners)

Self-contained HTML files in the effective-html style. They own page
STRUCTURE; alone they run visually monotonous — by design: the trio provides
the skeleton, a Role-1 authority layers visual character on top.

| Skill | Owns |
|---|---|
| `html-diagram` | Architecture / flow / state diagrams as full-screen SVG. Keep its signature strengths: animated arrows (flow direction legible at a glance), light on prose |
| `html` | Reports, explainers, comparisons, decks |
| `html-plan` | Plan pages: pragmatic, close to the user's own wording |
| `plannotator-visual-explainer` *(only if it resolves under SELECT — not in the base roster; when absent, fall back to the HTML trio + a Role-1 authority)* | Rich visual explainers: plan pages with stat cards/SVG timelines, PR walkthroughs with risk maps, slide decks, data tables. Gated `disable-model-invocation: true` — read its SKILL.md inline per the router's SELECT rule, never via `Skill()` |

Pairing rule: quick internal note → trio alone. Anything the user will look
at twice or show someone → trio + ONE authority visual layer (via DESIGN.md)
+ quality loop.

**Theme-layer exclusivity:** `plannotator-visual-explainer` ships its own
theme tokens and delegates its skeleton to `nicobailon/visual-explainer`
(auto-installs via npx skills if absent) — overriding ONLY the color/type
layer. That is the same one-authority rule in miniature: when it owns a
stage, its Plannotator theme IS the visual layer — do NOT stack a Role-1
authority on top. Want Role-1 character instead? Use the trio, not this.
**Delivery degrade:** its `plannotator annotate` UI requires the
`plannotator` CLI; when the CLI is absent, STATE the degrade and deliver
the same HTML as a plain file/Artifact instead — never fake the UI step.

## Persistence & probes

`design-md` persists direction/tokens to `DESIGN.md`; `data-report` turns
CSV/Excel/JSON into a report page; `prototype` builds a throwaway to answer
one design question (no loop — disposable by contract).

## Executor table (per-stage dispatch)

Delegable stages are the heavy units: image generation, image-to-code,
build beyond a small scope, and every review. Constraint loading and small
scoped edits are NOT delegable — inline by definition.

| Stage | Executor |
|---|---|
| Route, judge, integrate, talk to user | Main session (you) |
| Role 1 direction authority | Inline, main session — sets direction, persists via `design-md` |
| `imagegen-frontend-web/mobile`, `image-to-code` | `codex-tmux` persistent worker (image stages + fixes) |
| Build / implement (non-trivial scope) | `claude-tmux` persistent worker; inline only for small scoped edits |
| Role 4 `design-an-interface` (N shapes) | In-process Agent-tool sub-agents, parallel — native contract, not tmux-governed |
| Role 4 `codebase-design` / `domain-modeling` | Inline — applied as judging criteria, not a separate dispatch |
| Every review round (incl. Pipeline D's verifier) | FRESH headless one-shot (tier per model-dispatch §5) |
| Constraint loading (Role 2), DESIGN.md upkeep | Inline |

## Auto-fill defaults (ask only what's genuinely the user's call)

- Role 1 authority: landing/marketing/portfolio → `design-taste-frontend`;
  product UI/dashboard/redesign-critique → `impeccable`; light-touch →
  `frontend-design`. Ask only when the task straddles two about equally.
- DESIGN.md path: `{repo}/DESIGN.md` unless a docs convention exists.
- Gate 0 viewports: desktop + mobile for any responsive deliverable.
- `cli` for delegated stages: `~/.agents/rules/model-dispatch.md` §5; don't
  ask if the repo's CLAUDE.md states a preference.
