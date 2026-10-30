# Artifacts Rules

Visual deliverables: HTML pages, diagrams, motion, charts, and Claude Artifacts.
This file holds only what an agent does not do by default (measured
2026-10-13, `.workflow/202610131110-skill-eval`). Generic craft — choose the
diagram form by the reader's question, legible labels, `prefers-reduced-motion`
— is not repeated here. The pipeline and the quality loop live in skill
`using-decision-tree` (design branch).

## Pick the format by size

- One thread the reader takes top to bottom → prose or `md`.
- Many items, numbers, or statuses the reader scans and compares (for example
  more than five rows of metrics, or several parallel sections) → a dashboard.
- Structure, flow, or relationships that prose describes poorly → a diagram.
- Order of steps or change over time IS the point → motion. Motion that does
  not carry order or change is decoration: leave it out.
- Do this without being asked. The user should not have to request the page.

## Claude Artifact types (Claude Code only)

- Discover the types live: Artifact `list scope:"types"`. Start one with
  `quickstart`, then follow the type's own instructions.
- `Dashboard` → metrics, KPIs, status, comparisons. Every number shows its
  source. When a tracked row changes status (commit, release, user ruling),
  update the dashboard dataset in the same turn; a page that cites the old
  status is a defect (W44-6).
  Read and update static page notes and the backlog source in that turn too;
  a new dataset does not refresh static prose.
- `Motion` → animated explainer, walkthrough, demo video, motion graphic;
  exports MP4. Verify it with frames at the start, middle, and end.
- Load `artifact-design` before you publish; load `dataviz` before any chart.
- On Codex, Cursor, or agy there is no Artifact tool: write one
  self-contained HTML file under the rules below, and say that you did.

## HTML page

- Design authority, in this order: the user's explicit instructions → the
  project's design system and conventions → the subject and audience → your
  own judgment.
- One self-contained file: inline CSS and JS, no external services, every
  control keyboard-operable.
- Originality check before delivery: swap the subject for a neighboring
  topic. If the same visual still fits just as well, it is generic — revise
  the composition, type, color, or interaction.
- Open it at a wide and a narrow width, exercise the controls, read the
  console, and fix clipping, overlap, and overflow.
- Return the absolute path and one line on the visual and interaction choices.
- Plan page: keep the source's commitments recognizable; separate decisions,
  assumptions, and open questions; add no timeline, progress percentage,
  status badge, or summary that the source does not support; show sequence
  only where a dependency is real; list each structural interpretation you
  introduced.

## Diagram

- Owner: the diagram rows of skill `using-decision-tree` (design branch).
- More than about nine nodes → split into an overview and a detail diagram.
- Which diagrams animate, and how: skill `using-decision-tree`, design branch §Contracts.
- Static first: with JS off, in reduced motion, in print, and in every
  export, the complete labeled figure is visible, except where a member row of
  the design branch states an exception.

## Motion in an interface

- For a UI or motion decision, attach an image or a readable, slowed video. Caption the video with what changes and the frame time; prose alone is not a visual choice.
- Use skill `apple-design`. Respond on pointer-down, not on release.
- Start every animation from the current on-screen value, never the target
  value. Every animation can be grabbed and reversed mid-flight.

## Charts

- Chart.js: wrap each `<canvas>` in a parent with a fixed height
  (`position:relative;height:NNNpx`). With `responsive:true` and
  `maintainAspectRatio:false` and no parent height, ResizeObserver grows the
  chart until the browser hangs.
- Plot only the user's real data. Never invent a number to fill a chart.

## Quality

An ugly or generic visual is a BLOCK, not a finished stage. Run the quality
loop in `using-decision-tree`, design branch (screenshot evidence, desktop and mobile).
