# AGENTS.MD — agent-scripts

This repository publishes reusable agent skills (routers, workflow recipes, generic policy
skills) for install via `npx skills`. It is currently a minimal skeleton plus one canary skill
used to validate the install/update/remove lifecycle against a real published ref.

## Scope

- Generic, cross-project agent policy skills (e.g. delegation templates, unknowns discovery).
- Workflow router and its canonical recipes.
- Router contribution standard (template, gate, publish contract) for future routers.

Out of scope: tmux worker lifecycle mechanics — that stays in `ohyeh/tmux-agent-tools`.

## Release policy

Skills are consumed via a pinned CLI version (`npx --yes skills@<version>`) against a gated
release ref (an immutable tag by default, or a protected `main` branch if the tag channel is
unavailable). Consumers should never install from a moving, unreviewed HEAD.
