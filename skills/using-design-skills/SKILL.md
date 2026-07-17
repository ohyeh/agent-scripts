---
name: using-design-skills
description: Meta-router and multi-agent conductor for design work that needs skill selection or a multi-stage pipeline — visual frontend (web pages, landing pages, product UI, mobile screens), data visualization, HTML deliverables (reports/diagrams/plans), artifacts, motion polish, and module/API interface design. The STABLE unified entry point — member skills churn underneath, this router discovers them live, picks one direction authority, delegates image-generation stages to Codex workers, and closes every pipeline with an evidence-first anti-slop quality loop. Do NOT invoke for a one-line CSS/copy tweak, for backend-only work, or when the user explicitly names a single member skill for a single-skill-sized task — those go direct.
---

# using-design-skills

Meta-router for the design skill fleet. You are not a design skill yourself —
you decide **which** skills a design task needs, in **what order**, and **who
executes each stage** (inline vs a delegated worker), then defer to them.

## The Rule

Before invoking any individual design skill: **discover the live fleet**,
compose the pipeline with the five ordered questions below, then execute
stage by stage — and do not declare the task done until the quality loop
returns PASS (or the task shape has no visual loop, per Pipeline D). Read
each selected skill's SKILL.md before its stage runs — never paraphrase a
member skill from memory.

## Discover live — the fleet churns, this file does not chase it

The member tables below are a PRIOR, not a registry. Skills get added,
removed, renamed, and re-sourced constantly; this router is the stable entry
point precisely so the fleet underneath can change freely. At invocation:

1. Discover candidates from the runtime's **active available-skills list**
   first. Directory scans (`~/.agents/skills`, `~/.claude/skills`, plugins)
   are fallback inventory only and must be deduplicated against the active
   list — a directory copy that isn't loaded is not invocable.
2. Descriptions are trigger copy, not capability contracts. Before selecting
   an unlisted skill for a pipeline role, read its full SKILL.md and classify
   it by capability flags — a skill may carry several:
   `sets_direction` / `reviews_render` / `implements` /
   `specialist_constraints` / `output_owner` / special runtime needs
   (e.g. image generation → Codex only).
3. An unknown skill is NEVER auto-promoted to direction authority. Default it
   to specialist-candidate until you have read it and confirmed fit; say so
   in the plan when you promote one.
4. A listed member that no longer exists → drop it and STATE the drop and the
   substitute (if any) in your plan. Never substitute silently — a swapped
   authority or a skipped mandatory stage changes the output's character.
5. If a role ends up empty (e.g. no imagegen skill installed), degrade the
   pipeline explicitly — say what was skipped — rather than faking the stage.

## The fleet — roles (prior, verify live)

**Role 1 · Direction authority.** For a visual pipeline that needs direction,
select exactly ONE; for non-visual work (Pipeline D), prototype runs, and
trivial tweaks, select ZERO. Never stack two — they fight.

| Skill | Reach for it when | Its audit rubric (used by the quality loop) |
|---|---|---|
| `design-taste-frontend` | Landing pages, portfolios, marketing sites, full redesigns | Its pre-flight check |
| `impeccable` | Product UI: dashboards, forms, settings, app shells; polish/critique of existing interfaces | Its "AI slop test" |
| `frontend-design` | Light-touch aesthetic guidance when the two above are too heavy | Its restraint/self-critique section |

If a selected authority ships no usable checklist, the reviewer falls back to
impeccable's AI slop test as the default rubric. A skill that cannot support
an evidence-backed PASS/BLOCK audit is not an authority for this loop.

Executor: the authority stage runs INLINE in the main session — read the
skill, set direction, persist it via `design-md`. It is judgment work, not a
delegable build; see the executor table under Multi-agent execution.

**Advisory database (not an authority):** `ui-ux-pro-max` — searchable
styles/palettes/fonts/charts/stacks. Any stage may QUERY it for facts; it
never owns direction. Let it lead style exploration only when the user
explicitly asks to survey many candidates.

**Role 2 · Specialist add-ons (constraint sets — stack freely, load inline).**

| Skill | Adds |
|---|---|
| `apple-design` | Springs, gestures, interruptible motion — any "make it feel fluid/physical" ask |
| `dataviz` | MANDATORY before writing any chart/graph/dashboard code, in any medium |
| `artifact-design` | MANDATORY before publishing any Artifact page (`artifact-capabilities` only if the page calls connectors) |

**Role 3 · Image-first pipeline (Codex delegation).**
`imagegen-frontend-web` / `imagegen-frontend-mobile` generate section-by-section
design reference images; `image-to-code` implements code to match them. All
three are written FOR Codex (image generation is unavailable inline) — these
stages always dispatch to a Codex worker pointed at the skill file.

**Role 4 · Interface/domain design (code, not pixels).**
`design-an-interface` (N module shapes via parallel sub-agents),
`codebase-design` (deep-module vocabulary), `domain-modeling` (terminology,
ADRs). No visual authority involved.

Executor: `design-an-interface`'s N shapes run as in-process Agent-tool
sub-agents, parallel — their own native contract, not tmux-governed (see
Multi-agent execution, gate 1). `codebase-design` and `domain-modeling` load
INLINE as judging/naming criteria applied to those shapes and to the
Pipeline D verifier (Q5) — see the executor table below.

**Role 5 · HTML deliverable trio (daily-driver output owners).**
Self-contained HTML files in the effective-html style. They own page
STRUCTURE; alone they run visually monotonous — that is by design: the trio
provides the skeleton, a Role-1 authority layers visual character on top.

| Skill | Owns |
|---|---|
| `html-diagram` | Architecture / flow / state diagrams as full-screen SVG. Keep its signature strengths: animated arrows (flow direction legible at a glance), light on prose |
| `html` | Reports, explainers, comparisons, decks |
| `html-plan` | Plan pages: pragmatic, close to the user's own wording |

Pairing rule: quick internal note → trio alone. Anything the user will look
at twice or show someone → trio + ONE authority visual layer (via DESIGN.md)
+ quality loop.

**Persistence & probes:** `design-md` persists direction/tokens to
`DESIGN.md`; `data-report` turns CSV/Excel/JSON into a report page;
`prototype` builds a throwaway to answer one design question (no loop — it
is disposable by contract).

## Composing the pipeline — five ordered questions

Answer in order; each answer constrains the next. This replaces any
first-match branch logic — combinations are expected, precedence is explicit.

**Q1 — Base deliverable: who owns the output?**
- Diagram → `html-diagram` · HTML report/explainer/deck → `html` ·
  Plan page → `html-plan`
- Web page/site → code in the target stack · Mobile screens → target stack
- Artifact page → the Artifact file (artifact-design governs it)
- Data file to report → `data-report`
- Module/API/domain design → documents/code interfaces (Pipeline D)
- Design-system/token work (create or revise a palette, type scale, tokens)
  → `DESIGN.md` itself is the deliverable: authority sets direction,
  ui-ux-pro-max supplies candidates, design-md persists. No build stage is
  required; a sample render is OPTIONAL (sanity-check the tokens look right)
  and, if produced, is in scope for the visual loop below — see Q5.
- Mockup-only delivery (user wants images, not code) → imagegen-* output IS
  the deliverable; stop after image review.
- Just answering "would this work?" → `prototype`, alone, no loop.

**Q2 — Variant: new vs existing, platform, ambition.**
- Existing interface (redesign/audit/polish) → audit-first: the authority
  critiques the CURRENT render before anything is rebuilt.
- New + visually ambitious + imagegen available → image-first: imagegen
  (web or mobile flavor) ⇒ image-to-code ⇒ loop. If the user hasn't asked
  for image-first and the task is ordinary (a dashboard, a settings page, a
  standard marketing page), default to direct build — imagegen costs a
  worker round-trip; say so if you skip it.
- New + ordinary → authority direction ⇒ build ⇒ loop.

**Q3 — Orthogonal specialists (additive, any number).**
Charts anywhere on the page → `dataviz`. Deliverable is an Artifact →
`artifact-design`. Fluid/gesture/motion ask → `apple-design`. Each is a
constraint set loaded inline before its build stage — not a separate worker.

**Q4 — Executor per stage** (see Multi-agent execution below).

**Q5 — Verifier: which loop closes this pipeline?**
- Visual output with a render in scope (Q1 = page/screens/HTML/Artifact/
  mockups, or design-system WITH a sample render) → the visual quality loop
  below, full Gate 0 screenshot evidence required.
- Design-system/token work with NO sample render (Q1 = `DESIGN.md` only) →
  document-only evidence: the reviewer audits the DESIGN.md file itself
  (hash/commit, token completeness, contrast/accessibility math, naming
  consistency) against the authority's rubric — no screenshot required,
  since nothing was rendered. See Gate 0's document-only exception below.
- Pipeline D (interface/domain) → non-visual loop: `design-an-interface`'s
  own comparison/evaluation step, judged against `codebase-design` depth
  criteria by a fresh reviewer; evidence = the written design comparison,
  verdict still PASS/BLOCK. "Good-looking" does not apply — do not pretend
  it does.
- `prototype` → none; report what the prototype answered.

## Cross-stage contract: DESIGN.md

Multi-stage pipelines hand context between stages (and between workers)
through the project's `DESIGN.md`, managed via the `design-md` skill. The
stage that establishes direction WRITES it; every later stage (and every
delegated worker prompt) READS it. Never let two stages carry direction in
chat memory only — workers have no chat memory.

## Multi-agent execution (per-stage dispatch)

Delegable stages are the heavy units of work: image generation, image-to-code
implementation, build stages beyond a small scope, and every review. Loading
a constraint skill (dataviz / artifact-design / apple-design) and small
scoped edits are NOT delegable stages — they run inline by definition. Gates:

1. **tmux dispatches route through `using-tmux-agent-tools`** (its decision
   tree picks the wrapper). In-process subagents (Agent tool) follow their
   own native contract — the tmux router does not govern them.
2. **Every worker prompt is shaped by `delegation-templates`** — GOAL /
   ACCEPTANCE / REPORT + common footer + the tmux addendum (no-cascade ban,
   literal result path).
3. **Model/tier choice follows `~/.agents/rules/model-dispatch.md`** §5;
   verification follows §7 (the author never verifies itself).
4. **Fanout/dialogue never run without the user's exact authorization** for
   count, tool, model, and effort.

Loop topology (fixed, per the tmux reuse law): the BUILDER is a persistent
interactive worker — BLOCK findings go back to the SAME builder via the
worker-reuse protocol (`result init` → `send-wait` → `result wait-required`),
never to a fresh fixer that lacks build context. Each REVIEWER is a fresh
headless one-shot — never the builder, never reused across rounds.

| Stage | Executor |
|---|---|
| Route, judge, integrate, talk to user | Main session (you) |
| Role 1 direction authority (`design-taste-frontend` / `impeccable` / `frontend-design`) | Inline, main session — sets direction, persists via `design-md` |
| `imagegen-frontend-web/mobile`, `image-to-code` | `codex-tmux` persistent worker (image stages + fixes) |
| Build / implement (non-trivial scope) | `claude-tmux` persistent worker; inline only for small scoped edits |
| Role 4 `design-an-interface` (N shapes) | In-process Agent-tool sub-agents, parallel — native contract, not tmux-governed |
| Role 4 `codebase-design` / `domain-modeling` (criteria, vocabulary) | Inline, main session — applied as judging criteria, not a separate dispatch |
| Every review round (incl. Pipeline D's non-visual verifier) | FRESH headless one-shot (tier per model-dispatch §5) |
| Constraint loading (Role 2), DESIGN.md upkeep | Inline |

Worker-prompt addendum for every design stage:

> DESIGN CONTEXT: read `{repo}/DESIGN.md` first; conform to its tokens and
> direction. If a needed token is missing, add it there — do not invent a
> parallel convention.
> SKILL: read and follow `{path-to-member-SKILL.md}` before starting.

## The quality loop — no pipeline ends at "built"

The point of this router is that output ships genuinely good-looking and
free of AI-slop smell — not merely functional. Every visual pipeline closes
with this loop:

**Gate 0 — evidence, fail-closed.** Before judging anything, the reviewer
must obtain and RECORD: the build identity (file hash or commit), the exact
artifact path/URL opened, screenshot path(s), viewport(s) used, and that
captures are full-page/uncropped. Review at desktop AND mobile viewport for
responsive deliverables. Missing, stale, or cropped evidence → the item is
UNCONFIRMED and the overall verdict is BLOCK — never PASS on code-only
review, no exceptions.

Document-only exception: a design-system/token deliverable with no sample
render in scope (Q1/Q5) records DESIGN.md's file hash/commit in place of a
screenshot — that is its complete evidence, not a shortcut. The instant any
render exists for that pipeline, it re-enters the full screenshot contract
above; this exception never extends to page/screen/HTML/Artifact/mockup
pipelines, which always require screenshot evidence.

**Then the rubric, in order:**
1. THE SLOP TEST — the #1 judgment. Run the selected authority's audit
   rubric (see Role 1 table). Generic gradient-hero, emoji-bullet,
   card-grid-of-three sameness = BLOCK regardless of correctness.
2. PROSE DISCIPLINE — no filler text, no boilerplate explanations, no
   padding paragraphs; every sentence earns its place. Layout scannable:
   clear hierarchy, breathing room, no walls of text.
3. DESIGN.md conformance — tokens, spacing, type scale actually used.
4. The stage's ACCEPTANCE criteria (frozen at stage start — the reviewer
   does not expand scope mid-loop).

**Report contract:** per-item PASS / FAIL / UNCONFIRMED with one-line reason,
each finding tagged `persistent` / `new` / `regression` / `evidence-gap`,
all observed blockers reported in ONE pass (no drip-feeding), final line
exactly `VERDICT: PASS` or `VERDICT: BLOCK`, quoted verbatim in your report.

**Rounds:** BLOCK → the persistent builder fixes the named findings →
fresh reviewer re-audits. Hard cap: two fix rounds. After the cap, route by
CAUSE, not round count:
- persistent same-root failures + wrong-direction signals (per
  `~/.agents/rules/judgment-rubrics.md` §4) → return to the direction stage
- evidence-gap findings → repair the evidence path and re-audit (cheap)
- new/regression findings → triage separately; the base may be sound
- otherwise → stop and ask the user, with the failure trail

PASS → persist tokens via design-md, report with the evidence bundle.
"Built and audited: PASS" is a completion claim; "built" alone is not.

## When NOT to route here

(The frontmatter description already excludes these at trigger time; this is
the in-body restatement for when you arrived anyway.)
- Backend-only or non-UI tasks.
- The user explicitly names ONE design skill for a single-skill-sized task.
- A one-line CSS fix or copy tweak — inline, at most consult DESIGN.md.
- Loop-shaped non-design work (audits, plan/build) — that's `using-workflows`.

## References (never paraphrase these from memory)

- Member skill contracts: each skill's own SKILL.md at invocation time.
- Worker mechanics & reuse protocol: the `tmux-agent-tools` skill.
- Delegation prompt shapes: the `delegation-templates` skill.
- Tier/verification law: `~/.agents/rules/model-dispatch.md`.
- Wrong-direction signals: `~/.agents/rules/judgment-rubrics.md`.
