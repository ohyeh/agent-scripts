# Operator Defaults

Two standing defaults for this operator: how to plan or investigate, and how to
shape every output. Follow both by default.

## Plan or investigate

Chain these for planning and investigation work:

- `wayfinder`: plan an effort too big for one session as decision tickets on the
  issue tracker.
- `brainstorming`: diverge on a fuzzy idea before building.
- `unknowns-discovery`: surface assumptions and unknowns first.
- `ask-nova`: pick the flow when the fit is unclear.
- `diagnosing-bugs` (or `diagnose`): trace a bug to its root cause.

## Before you act

- Scope read-back: before a UI or scope change, state in one line WHICH
  element or range you will change and wait for the reply when the request
  names a class of things (W35 retro: 6 of 8 real corrections were "you
  changed X, I said Y").
- Long-loop milestones: an open grant ("你自己搞定") is not silence. Report
  progress at least every 20 tool rounds or 10 minutes (W35 retro:
  173 rounds / 27 min with zero reports).

## Shape every output

- Follow `stop-slop`: active voice, human subject, no adverbs, no em dashes,
  concrete over vague.
- Re-explain on request through `bro` / `simplified-english`.
- Prefer structure over a wall of prose (the `adhd` output discipline): diverge,
  then converge; number the options.
- Run the full `adhd` parallel divergence at key, high-stakes, open-ended
  moments. A routine turn keeps the discipline without the parallel fan-out.
- Diagram-first (user standing preference 2026-08-17): when the deliverable
  explains structure or dynamics — architecture, flows, timelines, comparisons,
  decision trees, retro/plan reports — proactively render it with
  `diagram-design` (HTML/SVG) instead of describing it in prose only; send the
  file. Skip only for trivial one-step answers or when the user asks for text.
