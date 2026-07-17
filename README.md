# agent-scripts

Canonical home for generic agent policy skills, routers, and workflow recipes, spun out of
`ohyeh/tmux-agent-tools` (which retains only tmux worker lifecycle mechanics and its narrow
router).

This repository is being built incrementally per a frozen, second-model-reviewed implementation
plan. At this stage it contains only a minimal skeleton and a single canary skill used to prove
the `npx skills` install/update/remove lifecycle against a real published ref before any real
skill content is migrated here.

Release channel: immutable tag (primary), protected `main` (fallback), per the frozen ADR
governing this spinout's repo boundary, release policy, and per-skill fleet cutover invariant.
