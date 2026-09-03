---
name: using-design-skills
description: Router and conductor for design work that needs skill selection or a multi-stage pipeline: web pages, product UI, mobile screens, HTML reports, diagrams, plan pages, charts, artifacts, motion, plus module and API interface design. It picks one direction authority from the installed roster, assigns an executor per stage, and closes every pipeline with an evidence-first quality loop. Do not invoke for a one-line CSS or copy tweak, for backend-only work, or when the user names one member skill for a single-skill task; those go direct.
---

# using-design-skills

You decide **which** design skills a task needs, in **what order**, and **who
executes each stage**, then defer to them. Member roster, role tables, and
executor details live in `references/design-roles.md` — read it at pipeline
composition time; never route from memory of it.

## BYPASS

- Backend-only / non-UI work · one-line CSS or copy tweak (inline; at most
  consult DESIGN.md) · the user names ONE member skill for a
  single-skill-sized task → go direct.
- Loop-shaped non-design work (audits, plan→build) → `using-workflows`.

## TRIGGER

Any deliverable whose value is visual or interface-shaped: pages, screens,
HTML reports/diagrams/plans, artifacts, dashboards, motion, mockups,
module/API interface design.

## QUESTIONS — compose the pipeline (answer in order)

Q1 **Base deliverable — who owns the output?** Diagram → `diagram-design` for
house-style consistency / mermaid / draw.io / PNG-SVG export, else the HTML
trio · report page → `html` · plan page → `html-plan` ·
web/mobile → target stack ·
Artifact → artifact file · data file → `data-report` · module/API/domain →
Pipeline D · token work → DESIGN.md itself · mockup-only → imagegen output ·
"would this work?" → `prototype`, alone, no loop.

Q2 **Variant.** Existing interface → audit-first (authority critiques the
CURRENT render before rebuild). New + ambitious + imagegen available →
image-first (imagegen ⇒ image-to-code ⇒ loop); ordinary task → direct build,
say so when skipping imagegen.

Q3 **Orthogonal specialists (additive).** Charts from a data file →
`data-report`; charts inside a page → apply charting best practice inline, since
`skills-lock.json` holds no dedicated chart skill. Artifact →
`artifact-design`, a skill bundled with the runtime rather than the lock;
mandatory before publishing, and skipped explicitly if it does not resolve this
turn. Motion or gesture → `apple-design`. Agency-grade type, spacing, and shadow
detail → `high-end-visual-design`. Constraint sets load inline.

Q4 **Executor per stage** — the executor table in
`references/design-roles.md`. Direction runs INLINE; imagegen/image-to-code →
agent-tmux codex persistent worker; non-trivial build → agent-tmux claude persistent
worker; every review → FRESH headless one-shot, never the author.

Q5 **Verifier.** Render in scope → the visual quality loop below (full Gate 0
screenshot evidence). DESIGN.md-only → document-only evidence (file
hash/commit, token completeness, contrast math). Pipeline D → non-visual
loop: design comparison judged against `codebase-design` depth criteria by a
fresh reviewer, verdict still PASS/BLOCK. `prototype` → none.

## SELECT — discover live, then bind roles

1. `jq -r '.skills|keys[]' ~/.agents/.skill-lock.json` is the
   installed roster; cross-check against THIS turn's active available-skills
   listing, because an installed directory that is not loaded is not
   invocable. A member gated `disable-model-invocation: true` (check
   `head -8`) is reached by reading its SKILL.md inline, never via `Skill()`.
2. Exactly ONE direction authority for a visual pipeline (ZERO for Pipeline
   D / prototypes / trivial tweaks). Never stack two — they fight. An unknown
   skill is never auto-promoted to authority.
3. A prior member that is absent or uncallable → STATE the absence and the
   substitute in your plan; an empty role → degrade explicitly. Never
   substitute silently.
4. Read each selected skill's SKILL.md before its stage runs.

## DEFER — cross-stage contracts

- **DESIGN.md**: the direction stage WRITES it (plain Read/Write — the
  `design-md` helper skill was removed); every later stage and every worker
  prompt READS it. Workers have no chat memory — never carry direction in chat only.
- **Dispatch**: tmux dispatches route through `using-tmux-agent-tools`;
  worker prompts from `delegation-templates`; tiers per
  `~/.agents/rules/model-dispatch.md` §5, verification §7. Fanout/dialogue
  need the user's exact authorization.
- **Loop topology (fixed)**: the BUILDER is a persistent worker — BLOCK
  findings return to the SAME builder (worker-reuse protocol). Each REVIEWER
  is a fresh headless one-shot, never the builder, never reused.
- Worker-prompt addendum: "DESIGN CONTEXT: read `{repo}/DESIGN.md` first;
  conform to its tokens. SKILL: read and follow `{member-SKILL.md}` first."
- **Diagram house defaults** (these override a member's opt-in gate, never its
  mechanism): a diagram whose story IS direction — data flow, architecture,
  dependency, deployment — ships motion by default. Request `diagram-design`
  mode `loop` with the Flow-token primitive (one `aria-hidden` token, cycle
  ≥3s, no playback controls); escalate to `reveal` + Path draw only when the
  ORDER of hops carries meaning, and to `step` only for teaching. Every other
  diagram type (ER, quadrant, bar, Venn) defaults to `none` — no flow to
  point at means motion is decoration. The static-first contract is NOT
  relaxed: with JS off, and in reduced-motion, print, and every export, the
  complete labeled figure is visible.
- **Format: HTML first.** Every diagram and visual deliverable is a
  self-contained `.html`; `svg`/`png` are EXPORTED from it, never
  hand-authored. Markdown (a mermaid fence) requires the user asking for it
  or a text-only consuming tool — never the agent's own guess that "the
  reader probably cannot see images".

## The quality loop — no pipeline ends at "built"

**Gate 0, fail-closed:** the reviewer RECORDS build identity (hash/commit),
artifact path/URL, screenshot path(s), viewport(s), full-page/uncropped.
Desktop AND mobile for responsive deliverables. Missing/stale/cropped
evidence → UNCONFIRMED → overall BLOCK; never PASS on code-only review.
(Document-only exception: DESIGN.md-only deliverables record file
hash/commit instead — the instant any render exists, full contract resumes.)

**Rubric, in order:** 1. THE SLOP TEST — the authority's audit rubric;
generic gradient-hero / emoji-bullet / card-grid sameness = BLOCK regardless
of correctness. 2. Prose discipline — no filler, scannable hierarchy.
3. DESIGN.md conformance. 4. The stage's frozen ACCEPTANCE criteria.

**What counts as BLOCK:** only a rubric item above or a frozen ACCEPTANCE
criterion. Accessibility polish (hit-area, contrast, aria names, focus ring,
skip link) that no ACCEPTANCE line names is a NOTE — list it, do not BLOCK
on it, do not open a fix round for it. A reviewer that returns only NOTEs
returns `VERDICT: PASS`.

**Report contract:** per-item PASS / FAIL / UNCONFIRMED + one-line reason,
findings tagged persistent/new/regression/evidence-gap, all blockers in ONE
pass, final line exactly `VERDICT: PASS` or `VERDICT: BLOCK`, quoted
verbatim in your report. A report missing the `VERDICT:` line is a format
defect of that reviewer: re-ask the SAME reviewer for the one line — never
spawn another reviewer to obtain it.

**Rounds:** BLOCK → same persistent builder fixes → fresh reviewer
re-audits. Hard cap two fix rounds, then route by CAUSE: same-root failures
+ wrong-direction signals (`judgment-rubrics.md` §4) → back to direction ·
evidence-gap → repair evidence path, re-audit · new/regression → triage
separately · otherwise → stop and ask the user with the failure trail.
PASS → write the final tokens into DESIGN.md, report with the evidence bundle.
"Built and audited: PASS" is a completion claim; "built" alone is not.

**Polish/`Operate` mode — human checkpoint first:** the first rendered
build goes to the USER (URL/screenshot, desktop + mobile) BEFORE any
reviewer is spawned. Direction is the user's call; the reviewer only
checks the direction the user accepted. One reviewer round, not a loop.

## NOT-FOUND

A needed role has no installed member → degrade the pipeline explicitly and
say what was skipped — never fake a stage. Member contracts: each skill's
own SKILL.md · roster/roles/executors: `references/design-roles.md` ·
worker mechanics: `tmux-agent-tools` · prompts: `delegation-templates`.
