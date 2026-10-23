---
name: writing-artifacts
description: Turn a fuzzy subject — a problem description, an incident, a decision, a long-form idea — into a polished deliverable in the user's chosen format (md, html page, Artifact, image, or plain prose). Runs the writing production line (mine → structure → tighten) with stop-slop discipline, then hands rendering to the design branch of using-decision-tree. Invoke when the user wants something EXPLAINED WELL as a document/page, not when they just want code changed.
---

# writing-artifacts

A production line: raw thoughts in, publishable artifact out. Stages 1–2 run
from this file; every other station's method lives in its own SKILL.md — read
it at that stage, never work from memory of it.

## Stage 0 — frame (one question round, then move)

Pin three things before writing anything: the SUBJECT (one sentence), the
READER (who must understand it), and the OUTPUT FORMAT. Default format by
destination: quick share → `md` · something the user will look at twice or
show someone → `html` page or Artifact · visual metaphor / hero image needed →
add an image stage. If the user already said the format, don't ask.

**Size first:** estimate the content before you pick the format. The size
table (prose, dashboard, diagram, motion) and the quality bar live in rule
`artifacts-rules`; apply it unasked.

**Reader preset — ELI5:** "explain like I'm five", "dead simple", "完全外行"
pins READER = knows nothing about the domain and FORMAT = Artifact carried by
big pictures and few words. Simplify the language, never the facts: no jargon
without a grounded term, no "simply/just/obviously".

**Genre branch, decided here:** in-repo SOFTWARE documentation (README, API
docs, tutorials, how-to guides — anything living under the repo) swaps the
structure station: run `documentation-writing` (Eight Rules + Diataxis, docs/
location and linking rules) as Stage 2 instead of the default structure
stage, keeping Stage 1 mining and Stage 3 `stop-slop` discipline unchanged.
Everything else — problem writeups, incidents, decisions, long-form prose —
takes the default line below.

## Stage 1 — mine (diverge)

List everything known about the subject before any structure: evidence,
timeline, claims with a one-line reason, half-thoughts. Name each unknown
instead of writing around it. Push for a leading word: one compact coinage the
whole piece can hang on; it later shapes the structure, transitions and title.
For a genuinely fuzzy idea (not a known incident), run `adhd` first for
parallel divergence, then mine the survivors.

## Stage 2 — structure (converge)

1. Ground before you lean. Fix what the READER brings (prerequisites); every
   other concept must be introduced by an earlier section before a later one
   uses it. Keep a running grounded list. When a section needs an ungrounded
   concept, add a grounding section before it or make the concept a
   prerequisite.
2. Draft 2–3 openings, each a different angle; pick the one that fits the
   READER and name the pick in the Stage 5 report.
3. Order the rest by "what does the reader need next?". Cut a section that
   lands no new point; leftover material is fine.

Co-writing section by section (the user picks the opening and each block) runs
only when the user asks for it.

## Stage 3 — tighten

Tighten the draft inline, with `stop-slop` loaded as criteria for the
whole run (not just this stage): no filler, no hedging, no AI-slop cadence.

## Stage 4 — render (format branch)

- `md` / plain prose → deliver the tightened text directly; done.
- `html` page / Artifact / diagram / image → hand the FINISHED TEXT to
  `using-decision-tree` (design branch) as the content contract and let IT compose the
  pipeline (it owns authority selection, imagegen delegation, and the
  screenshot-evidence quality loop). Never style inline yourself; the text is
  frozen content by this point — design changes layout, not wording.

## Stage 5 — report the edit (in the turn, not in the artifact)

After delivering, add at most five lines naming what changed and why. One
line per edit class, not per sentence: the jargon you grounded, the
assumption you made explicit, the structure you reordered, what you cut.
Name the problem, not the prettier wording.

When the input was EXISTING text, each line is `before → after`, quoting the
shortest fragment that carries the problem. When the text is new, drop the
`before` half and report what you cut and why.

This report never enters the artifact.

## Boundaries

- Words first, pixels second: never enter Stage 4 with an untightened draft —
  redesigning slop produces well-dressed slop.
- One pass back is allowed: if rendering reveals a structural hole (a section
  that can't be visualized because it was never actually explained), return
  to Stage 2 for THAT section only, then re-render.
- This skill owns written deliverables about a subject — prose AND in-repo
  software docs (the genre branch in Stage 0 picks the structure station).
  A plan page from a discussion → build it directly under `artifacts-rules`
  (Plan page).
