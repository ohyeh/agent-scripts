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

If a selected authority ships no usable checklist, the reviewer falls back to
impeccable's AI slop test as the default rubric. A skill that cannot support
an evidence-backed PASS/BLOCK audit is not an authority for this loop.

**Vocabulary reference (web, not a skill):** https://namethatui.com/ — the
"what is this component called" dictionary. Consult it (via ctx_fetch, or
ask the user to look) when a spec, worker prompt, or imagegen prompt
describes a UI element vaguely: naming the component correctly upgrades
search results, member-skill routing, and generation quality in one move.
Advisory only: any stage may QUERY it; it never owns direction.

## Role 2 · Specialist add-ons (constraint sets — stack freely, load inline)

| Skill | Adds |
|---|---|
| `apple-design` | Springs, gestures, interruptible motion — any "make it feel fluid/physical" ask |
| `data-report` | A CSV, Excel, or JSON file into a visual report page. For charts written into a page by hand, `skills-lock.json` has no chart specialist: apply charting best practice inline and say you did, never fake a stage |
| `artifact-design` *(bundled skill)* | MANDATORY before publishing any Artifact page (`artifact-capabilities` only if the page calls connectors) |

## Role 3 · Image-first pipeline (Codex delegation)

`imagegen-frontend-web` / `imagegen-frontend-mobile` generate
section-by-section design reference images; `image-to-code` implements code
to match them. All three are written FOR Codex (image generation is
unavailable inline) — these stages always dispatch to a Codex worker pointed
at the skill file.

## Role 4 · Interface/domain design (code, not pixels)

`codebase-design` (deep-module vocabulary), `domain-modeling` (terminology,
ADRs), `prototype` (throwaway build that answers one design question). To
compare N module shapes, dispatch parallel sub-agents with
`delegation-templates` and judge them against the `codebase-design` depth
criteria; no dedicated interface-shaping skill is installed. No visual
authority involved.

## Role 5 · HTML deliverable owners (daily drivers)

Self-contained HTML files in the effective-html style. They own page
STRUCTURE; alone they run visually monotonous — by design: the trio provides
the skeleton, a Role-1 authority layers visual character on top.

| Skill | Owns |
|---|---|
| `diagram-design` | House-style diagrams: 27 typed forms, semantic patterns, connector/spacing hard rules, mermaid + draw.io import, PNG/SVG export. Default when the diagram must match a consistent visual system |
| `html-diagram` | One-off diagram forms outside that library, or when interaction/Canvas/WebGL carries the meaning. Keep its signature strengths: animated arrows (flow direction legible at a glance), light on prose |
| `html` | Reports, explainers, comparisons, decks |
| `html-plan` | Plan pages: pragmatic, close to the user's own wording |

Arbitration: `diagram-design` and `html-diagram` are mutually exclusive per
diagram — never load both. Select and invoke that owner here; do not enter
through `html` and follow its sibling handoff to `html-diagram`. When the source is a data FILE the owner stays
`data-report`; `diagram-design` may be loaded by it as the house-style layer,
never instead of it. `diagram-design` self-triggers (plugin-shipped,
trigger-rich description), so when this router picks another owner, say so
explicitly in the plan.

Pairing rule: quick internal note → trio alone. Anything the user will look
at twice or show someone → trio + ONE authority visual layer (via DESIGN.md)
+ quality loop.

**Rich explainer pages** (stat cards, SVG timelines, PR walkthroughs with risk
maps, slide decks, data tables) have no dedicated owner in
`skills-lock.json`. Build them with the HTML trio plus one Role-1 authority
for the visual layer, and say that is what you did.

## Persistence & probes

Direction/tokens persist to `DESIGN.md` via plain Read/Write (the `design-md`
helper skill was removed); `data-report` turns
CSV/Excel/JSON into a report page; `prototype` builds a throwaway to answer
one design question (no loop — disposable by contract).

## Executor table (per-stage dispatch)

Delegable stages are the heavy units: image generation, image-to-code,
build beyond a small scope, and every review. Constraint loading and small
scoped edits are NOT delegable — inline by definition.

| Stage | Executor |
|---|---|
| Route, judge, integrate, talk to user | Main session (you) |
| Role 1 direction authority | Inline, main session — sets direction, persists to DESIGN.md |
| `imagegen-frontend-web/mobile`, `image-to-code` | `agent-tmux codex` persistent worker (image stages + fixes) |
| Build / implement (non-trivial scope) | `agent-tmux claude` persistent worker; inline only for small scoped edits |
| Role 4 N-shape comparison | In-process Agent-tool sub-agents, parallel; native contract, not tmux-governed |
| Role 4 `codebase-design` / `domain-modeling` | Inline — applied as judging criteria, not a separate dispatch |
| Every review round (incl. Pipeline D's verifier) | FRESH headless one-shot (tier per model-dispatch §5) |
| Constraint loading (Role 2), DESIGN.md upkeep | Inline |

## Auto-fill defaults (ask only what's genuinely the user's call)

- Role 1 authority: landing/marketing/portfolio → `design-taste-frontend`;
  product UI/dashboard/redesign-critique → `impeccable`; light-touch →
  `impeccable`. Ask only when the task straddles two about equally.
- DESIGN.md path: `{repo}/DESIGN.md` unless a docs convention exists.
- Gate 0 viewports: desktop + mobile for any responsive deliverable.
- `cli` for delegated stages: `~/.agents/rules/model-dispatch.md` §5; don't
  ask if the repo's CLAUDE.md states a preference.
