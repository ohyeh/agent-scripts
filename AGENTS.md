# AGENTS.MD — agent-scripts

This repository publishes reusable agent skills (routers, workflow recipes, generic policy
skills) for install via `npx skills`. Treat `skills/*/SKILL.md` and `skills-lock.json` as the
live roster; prose summaries must not hard-code a count that drifts from those sources.

## Scope

- Generic, cross-project agent policy skills (e.g. delegation templates, unknowns discovery).
- Workflow router and its canonical recipes.
- Router contribution standard (template, gate, publish contract) for future routers.

Out of scope: tmux worker lifecycle mechanics — that stays in `ohyeh/tmux-agent-tools`.

## Ecosystem view

This repo is one layer of a maintained ecosystem, not the whole of it. The ecosystem is exactly
three repos: this one, `ohyeh/tmux-agent-tools` (worker lifecycle) and
`ohyeh/context-mode-local-insight` — plus the deployment surface it feeds
(`~/.claude/CLAUDE.md` + `~/.codex/AGENTS.md`, `~/.agents/rules/`). Projects that merely install
skills at a pinned version are consumers, not members.

Rules for any discussion or change here:

- "Out of scope for this repo" does not mean out of our hands. When a topic belongs to a
  sibling, align across repos; never write a second, conflicting version here.
- State the blast radius first. A kernel edit changes both runtime files at once; a roster edit
  reaches every consumer that pinned a release. The release policy below protects those
  consumers — it is not local tidiness.
- Ask which layer owns the change (kernel / routed rule / skill / sibling repo / deployment)
  before asking how to implement it. The wrong layer costs more than the wrong code.

## Release policy

Skills are consumed via a pinned CLI version (`npx --yes skills@<version>`) against a gated
release ref (an immutable tag by default, or a protected `main` branch if the tag channel is
unavailable). Consumers should never install from a moving, unreviewed HEAD.
