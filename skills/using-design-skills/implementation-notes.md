# using-design-skills — implementation notes

2026-07-16, initial draft session.

## Decisions not in the original brief
- User decisions (AskUserQuestion): full multi-agent orchestration; include the
  interface-design trio (design-an-interface / codebase-design / domain-modeling)
  as Role 4; name `using-design-skills` (matches using-workflows /
  using-tmux-agent-tools naming convention).
- Mid-turn user directives folded in:
  1. Router = stable unified entry; member fleet churns → "Discover live" section,
     fleet table demoted to a prior.
  2. Closed quality loop is the point → "The quality loop" section: build ⇒ fresh
     reviewer ⇒ PASS/BLOCK, max 2 fix rounds, rendered-evidence review only.
- Direction-authority mutual exclusion (impeccable / design-taste-frontend /
  frontend-design / ui-ux-pro-max): stacking them produces conflicting direction;
  ui-ux-pro-max demoted to queryable database rather than default authority.
- imagegen-frontend-web/mobile + image-to-code are Codex-authored skills
  (image generation unavailable inline in Claude Code) → those stages always
  dispatch to codex-tmux workers.
- Placement: ~/.agents/skills/using-design-skills — consistent with sibling
  using-* routers. CAVEAT: manually placed, NOT managed by ~/.agents/.skill-lock.json
  (same class as the "手動放入" entries in the Skill Manifest artifact). Add to the
  other two machines manually or via repo sync.
- Delegation law is referenced, not restated: using-tmux-agent-tools (dispatch),
  delegation-templates (prompt shape), model-dispatch.md (tiers §5, verification §7).

## Mid-session hard requirements (2026-07-16, folded in after first draft)
- HTML deliverable trio (html / html-diagram / html-plan) added as Role 5 —
  the user's daily drivers, absent from the original 17-skill brief.
- html-diagram: keep animated arrows (proven satisfier, flow legibility).
- Trio = structure/skeleton owner; visually monotonous BY DESIGN → pairing rule:
  deliverables get trio + ONE authority visual layer via DESIGN.md + quality loop;
  quick internal notes may ship trio-alone.
- Anti-AI-slop elevated to the #1 gate of the quality loop (before conformance
  and acceptance): authority slop test first, then prose discipline (no filler
  text, no walls of text, scannable layout).
- NOTE: the running consensus-gate (udsgate1) reviewed the PRE-edit version;
  treat its verdict accordingly — structural findings still apply, but Role 5 /
  slop-gate sections were added after review started.

## Consensus gate round 1 (udsgate1, codex gpt-5.6-sol high) — VERDICT: DISAGREE
Reviewed post-edit snapshot (SHA-256 0b3dcfec…, 230 lines). 4 HIGH + 4 MEDIUM, all
accepted and folded into the v2 rewrite:
- E(HIGH): trigger exclusions moved INTO frontmatter; "even 1% chance" rule removed
  (body exemptions load after triggering — they can't prevent invocation).
- B(HIGH): discovery now = active available-skills list first, dir scan fallback with
  dedupe; classify by multi-label capability flags after reading full SKILL.md;
  unknowns never auto-promoted to authority; drops/substitutions always stated.
- C(HIGH): first-match decision tree replaced by five ordered composition questions
  (base owner → variant → orthogonal specialists → executor → verifier); added routes
  for design-system/tokens, mockup-only, ordinary new UI; Pipeline D gets a non-visual
  loop; prototype explicitly loop-free.
- D(HIGH): evidence is now Gate 0 and fail-closed (build hash, artifact path,
  screenshot paths, viewports, uncropped; missing/stale ⇒ UNCONFIRMED ⇒ BLOCK).
- A(MED): "exactly one authority" narrowed to visual-pipelines-needing-direction;
  ui-ux-pro-max moved out of Role 1 to advisory; per-authority audit rubric mapped,
  impeccable slop test as fallback rubric.
- Breaker(MED): 2-round cap kept, but post-cap routing by finding cause
  (persistent/new/regression/evidence-gap tags), aligned with judgment-rubrics §4.
- tmux drift(MED): tmux router scoped to tmux dispatches only; fixed loop topology =
  persistent builder + fresh one-shot reviewers (worker-reuse protocol); "delegable
  stage" defined, constraint-loading and small edits are inline by definition.
- Evals(MED): routing eval matrix required before 3-machine deploy → evals/evals.json.

## Open items
- dataviz / artifact-design / artifact-capabilities are Claude Code built-ins —
  invocable via Skill tool but absent from disk scans; discovery step must use the
  available-skills list, not only directory scans (already worded that way).
- Codex-side consensus review: pending (this session, consensus-gate cli=codex).
- Eval/test prompts: pending user decision on whether to run skill-creator evals.
