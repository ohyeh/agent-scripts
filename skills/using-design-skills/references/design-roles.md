# Design fleet — roles, roster, executors (reference for using-design-skills)

Prior, not registry — verify live per the router's SELECT section.
Capability flags when classifying an unlisted skill (may carry several):
`sets_direction` / `reviews_render` / `implements` / `specialist_constraints`
/ `output_owner` / special runtime needs (e.g. image generation → Codex only).

## Role 1 · Direction authority (exactly ONE per visual pipeline, ZERO for Pipeline D / prototypes / trivial tweaks)

| Skill | Reach for it when | Its audit rubric (used by the quality loop) |
|---|---|---|
| `impeccable` | Product UI, landing and marketing pages, portfolios, redesigns; polish/critique of existing interfaces | Its "AI slop test" |
| `design-taste-frontend` (Taste v2) | Opt-in only: the user names Taste, or asks for an award-level public web page with real photos and accepts a long, token-heavy run; state the token budget before it starts and keep it as low as the page allows (owner ruling 2026-10-23) | Its inspector + `references/critique.md`. One look-and-fix round by default (its max is 3, only when the user raises the budget); it replaces the router's internal rounds — never both |

`design-taste-frontend` self-triggers on any web page, dashboard or polish
request; that nominates it, it does not authorize a run. Without the opt-in
above, use `impeccable` and run none of Taste's build, inspector or
look-and-fix loop. A generic "make it less AI-made" ask is not the opt-in.

If a selected authority ships no usable checklist, the reviewer falls back to
impeccable's AI slop test as the default rubric. A skill that cannot support
an evidence-backed PASS/BLOCK audit is not an authority for this loop.

**Vocabulary reference (web, not a skill):** https://namethatui.com/ — the
"what is this component called" dictionary. Consult it (via ctx_fetch, or
ask the user to look) when a spec or worker prompt
describes a UI element vaguely: naming the component correctly upgrades
search results, member-skill routing, and generation quality in one move.
Advisory only: any stage may QUERY it; it never owns direction.
Motion references, same status: prompt-motion.com and skillry.dev/ai-videos
pair each animation with its prompt.

## Role 2 · Specialist add-ons (constraint sets — stack freely, load inline)

| Skill | Adds |
|---|---|
| `apple-design` | Springs, gestures, interruptible motion — any "make it feel fluid/physical" ask |
| `data-report` | A CSV, Excel, or JSON file into a visual report page |
| `dataviz` *(bundled skill)* | Any chart, stat tile, or dashboard layout, including inside a `Dashboard` artifact. If it does not resolve, apply charting best practice inline and say so |
| `artifact-design` *(bundled skill)* | MANDATORY before publishing any Artifact page (`artifact-capabilities` only if the page calls connectors) |

Artifact types `Dashboard` and `Motion` (runtime, listed by Artifact
`list scope:"types"`) are output owners, not add-ons: start them with
`quickstart` and follow the type's instructions.

## Role 4 · Interface/domain design (code, not pixels)

`codebase-design` (deep-module vocabulary), `domain-modeling` (terminology,
ADRs), `prototype` (throwaway build that answers one design question). To
compare N module shapes, dispatch parallel sub-agents with
`delegation-templates` and judge them against the `codebase-design` depth
criteria; no dedicated interface-shaping skill is installed. No visual
authority involved.

## Role 5 · Deliverable owners

| Owner | Owns |
|---|---|
| `diagram-design` | Every other diagram (the widest type range): typed forms, semantic patterns, connector/spacing hard rules, mermaid + draw.io + excalidraw import, PNG/SVG export |
| `archify` | One of its native types (its Type router lists them) drawn from a real repo or trace; `finalize --repo-root` ties repo facts to the code. Its default READ depth hides fine labels with JS off; accepted (owner ruling 2026-10-23) — reduced motion, print and export stay complete. Run it from a scratchpad folder with a relative `meta.output` (its default is `.archify/` in the working directory). Native diagrams only: never its explainer mode, and decline its offer to add an `[archify explainer: ...]` line to the global rules. A passing `finalize` is not visual-quality proof |
| You, under `~/.agents/rules/artifacts-rules.md` | Report, explainer, comparison, and plan pages as one self-contained HTML file (the html skills were retired 2026-10-13; their non-default rules moved there) |
| Artifact types `Dashboard` / `Motion` | Pages that are mostly numbers, statuses, or items to compare / watchable animation (Claude Code only) |

When the source is a data FILE the owner stays `data-report`;
`diagram-design` may be loaded by it as the house-style layer, never instead
of it. `diagram-design` self-triggers (plugin-shipped, trigger-rich
description), so when this router picks another owner, say so explicitly in
the plan.

Pairing rule: quick internal note → the page alone. Anything the user will
look at twice or show someone → the page + ONE authority visual layer (via
DESIGN.md) + quality loop.

## Executor table (per-stage dispatch)

Delegable stages are the heavy units: build beyond a small scope, and every review. Constraint loading and small
scoped edits are NOT delegable — inline by definition.

| Stage | Executor |
|---|---|
| Route, judge, integrate, talk to user | Main session (you) |
| Role 1 direction authority | Inline, main session — sets direction, persists to DESIGN.md |
| Build / implement (non-trivial scope) | `agent-tmux claude` persistent worker; inline only for small scoped edits |
| Role 4 N-shape comparison | In-process Agent-tool sub-agents, parallel; native contract, not tmux-governed |
| Role 4 `codebase-design` / `domain-modeling` | Inline — applied as judging criteria, not a separate dispatch |
| Every review round (incl. Pipeline D's verifier) | FRESH one-shot (tier per model-dispatch §4) |
| Constraint loading (Role 2), DESIGN.md upkeep | Inline |

## Auto-fill defaults (ask only what's genuinely the user's call)

- Role 1 authority: `impeccable`; `design-taste-frontend` only on the opt-in in Role 1.
- DESIGN.md path: `{repo}/DESIGN.md` unless a docs convention exists.
- Gate 0 viewports: desktop + mobile for any responsive deliverable.
- `cli` for delegated stages: `~/.agents/rules/model-dispatch.md` §5; don't
  ask if the repo's CLAUDE.md states a preference.
