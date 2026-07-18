# Agent Environment Provisioning (Cross-Machine Rebuild)

Runbook for rebuilding the AI workflow environment (rules institution, skills,
plugins, workflow recipes) on another machine. Not needed during normal task
execution — only when provisioning a new machine or during disaster recovery.
This file is the single source of truth; all paths were live-verified on
2026-07-10.

## Agent Skills

- **Layout**: skills live in `~/.agents/skills/<name>/` (each with `SKILL.md`); `~/.claude/skills/<name>` symlinks → `../../.agents/skills/<name>`.
- **Provenance**: managed by `npx skills` (vercel-labs/skills CLI); lockfile `~/.agents/.skill-lock.json` records `source`/`sourceUrl`/`skillPath`. Check with `npx skills list -g` (global skills MUST use `-g`; without it, only project-level skills show).
- **Rebuild (preferred = the offline tar below)**: the only path live-verified to fully restore global skills (including local renames). Network alternative: `npx skills add <repo> -g` repo by repo (installs under the repo's original name; local renames need manual renaming per the table below). `npx skills experimental_install` was live-tested (2026-07-10) and only reads the project-level `skills-lock.json` (output: "No project skills found"); whether it supports a global lockfile is UNCONFIRMED — do not treat it as a global-restore method.
- **Offline tar (preferred)**:

  ```bash
  # source machine
  tar -czf agent-skills.tgz -C ~/.agents skills .skill-lock.json
  # target machine
  mkdir -p ~/.agents && tar -xzf agent-skills.tgz -C ~/.agents
  mkdir -p ~/.claude/skills
  for d in ~/.agents/skills/*/; do n=$(basename "$d"); ln -sfn "../../.agents/skills/$n" ~/.claude/skills/"$n"; done
  ```

- Other skills: `npx skills list -g`; process-type skills mostly from `vercel-labs/skills`; the lockfile is authoritative.

## Rules / Institution

- **Canonical**: routed rules live in `~/.agents/rules/` (both runtimes read them on demand per the global-file routing table); the two global files are native duplicates, `~/.claude/CLAUDE.md` and `~/.codex/AGENTS.md` (same content, maintained separately, no symlink). (The v5 install.sh/symlink scheme was deprecated and deleted on 2026-07-17 — do not reference it anymore.)
- **Rebuild**: rules are not currently version-controlled — copy the entire `~/.agents/rules/` directory plus both global files from an existing machine. Planned (ADR-0001): `.agents/rules/` in the public `agent-scripts` repo, at which point deploy = `rsync -a --delete repo/.agents/rules/ ~/.agents/rules/` (`lessons.md` stays local-only, never enters the public repo).
- **Verify**: the `~/.agents/rules/` manifest matches the global-file routing table, both global files have the same `Version:` line; a new session's first reply ending in `✈` is the final smoke test.

## Plugins / Marketplaces

From `~/.claude/plugins/known_marketplaces.json`; install: `/plugin marketplace add <repo>` → `/plugin install <name>@<marketplace>`:

| marketplace | GitHub repo |
| --- | --- |
| claude-plugins-official | `anthropics/claude-plugins-official` |
| context-mode | `mksglu/context-mode` |
| openai-codex (codex CLI integration) | `openai/codex-plugin-cc` |
| claude-hud | `jarrodwatts/claude-hud` |

## Skills used by the docs HTML-ification task (commit 6f5ed3b)

| skill | role | status per `~/.agents/.skill-lock.json` (live-checked 2026-07-10) |
| --- | --- | --- |
| `codex-dynamic-workflows` | workflow orchestration (plan/state/approval gate) | `dannymac180/skills` ✓ installed |
| `html` / `html-plan` / `html-diagram` | designed pages & interactive SVG | `plannotator/effective-html` ✓ installed |
| `design-taste-frontend` | visual taste | `nexu-io/open-design` (skillPath `skills/taste-skill` → renamed locally) ✓ installed |
| `impeccable` | detail-quality gatekeeping | `pbakaus/impeccable` ✓ installed |

> That task also used `high-end-visual-design` / `minimalist-ui` / `brandkit` at the time; they are no longer on this machine (no lockfile entry, no directory under `~/.agents/skills/`, live-checked 2026-07-10) — **no need** to restore them on rebuild. `design-taste-frontend` is a local rename (the repo's folder is `taste-skill`): a faithful restore = offline tar (preserves the rename); `npx skills add nexu-io/open-design -g` reinstalls under the repo's original name and needs manual renaming.

## Dynamic Workflow Recipes (live-verified 2026-07-10)

Reusable cross-project Workflow scripts. **The Workflow tool's per-run script copies under `~/.claude/projects/<slug>/<session-id>/workflows/` are run artifacts, never the source of truth.**

- **Source of truth**: the `using-workflows` skill bundle — `~/.agents/skills/using-workflows/workflows/*.workflow.js` (including `_lib/` and `README.md`), managed by `npx skills`, lockfile source = `https://github.com/ohyeh/tmux-agent-tools.git`. (An earlier doc claimed a `~/.agents/workflows/` git repo; it does not exist on this machine — that claim is void, do not reference it anymore.)
- **Deployed / invocation**: recipes must live under `~/.claude/workflows/` (regular files) to be discovered by Claude Code and invokable via `/<name>` or `Workflow({name})`; a project-level `.claude/workflows/` shadows a same-named recipe → name new recipes to avoid collisions with names already used in a project. See `workflows/README.md` in the bundle for details.
- **Rebuild**: first restore skills per the Agent Skills flow above (preferred = offline tar) → then deploy `*.workflow.js` + `_lib/` to `~/.claude/workflows/` per the bundle's `workflows/README.md`.
- **Parameters**: run targets (repoPath/appId/deeplink/flavor/…) + flags + non-secret config → `args`. **Secrets never enter `args`/prompt/transcript** — pass a `args.credsFile` path and the env key name instead; machine-local values (Xcode/UDID/FVM path) → env/config.
