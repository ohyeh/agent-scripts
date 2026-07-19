# Agent Environment Provisioning (Cross-Machine Rebuild)

Runbook for rebuilding the AI workflow environment (rules institution, skills,
plugins, workflow recipes) on another machine. Not needed during normal task
execution — only when provisioning a new machine or during disaster recovery.
Skill/plugin paths below were live-verified 2026-07-10; the canonical-home and
deploy model was updated 2026-07-19 (ADR-0001 now ACTIVE, see below).

## Fast path (clone-free, one command) — added 2026-07-19

Since ADR-0001 went ACTIVE, the whole environment deploys from the public
`agent-scripts` repo with no clone left behind:

```sh
curl -fsSL https://raw.githubusercontent.com/ohyeh/agent-scripts/main/scripts/deploy.sh | bash
```

It downloads the current `main` tarball to a scratch dir and deploys all four
runtime layers — global files → `~/.claude`/`~/.codex` (md5-verified), rules →
`~/.agents/rules/` (`rsync --delete --exclude lessons.md`), workflow recipes →
`~/.claude/workflows/` (install.sh --force), and the skill set (`skills-lock.json`
→ `npx skills experimental_install`) — each layer printing PASS/FAIL and aborting
fast on the first failure. This is the primary rebuild path; the per-layer manual
procedures below remain the reference for disaster recovery when the script itself
is unavailable. Live-used on the fleet at W15/W18 (mac-mini-m2, remote2).

## Agent Skills

- **Layout**: skills live in `~/.agents/skills/<name>/` (each with `SKILL.md`); `~/.claude/skills/<name>` symlinks → `../../.agents/skills/<name>`.
- **Provenance**: managed by `npx skills` (vercel-labs/skills CLI); lockfile `~/.agents/.skill-lock.json` records `source`/`sourceUrl`/`skillPath`. Check with `npx skills list -g` (global skills MUST use `-g`; without it, only project-level skills show).
- **Rebuild (preferred = the repo `skills-lock.json` restore)**: since 2026-07-19 the fleet converges on the repo-root `skills-lock.json` (98-skill union contract). Run from `$HOME` so the CLI installs globally (it restores into `.agents/skills/` relative to cwd): `cd ~ && curl -fsSL https://raw.githubusercontent.com/ohyeh/agent-scripts/main/skills-lock.json -o skills-lock.json && npx -y skills experimental_install && rm skills-lock.json`. This is Layer 4 of the Fast-path `deploy.sh` above and was live-used to converge all three machines (W17/W18). The earlier note that `experimental_install` "only reads project-level and is UNCONFIRMED for global restore" is superseded: with the lock file present in the cwd it performs the global restore. Two manual-only items stay excluded from the lock by design: `commit-commands` (a Claude Code plugin, not a skill) and hand-copied skills with no tool-resolvable source. Fallbacks: `npx skills add <repo> -g` repo by repo (installs under the repo's original name; local renames need manual renaming per the table below), or the offline tar below (preserves local renames exactly).
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
- **Rebuild (ADR-0001 ACTIVE since 2026-07-19)**: rules ARE now version-controlled — the public `agent-scripts` repo's `.agents/rules/` is canonical; machine copies are deployed, direction always repo → machine. Deploy = `rsync -a --delete --exclude lessons.md <repo>/.agents/rules/ ~/.agents/rules/` (the `--exclude lessons.md` is required — without it `--delete` erases the machine's local lessons file, which stays LOCAL-ONLY and never enters the public repo). The Fast-path `deploy.sh` does exactly this as its rules layer. Global files are canonical in the repo's `global/` directory, deployed byte-identical to `~/.claude/CLAUDE.md` and `~/.codex/AGENTS.md`.
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

- **Source of truth (canonical flipped 2026-07-19)**: the `using-workflows` skill bundle — `skills/using-workflows/workflows/*.workflow.js` (including `_lib/` and `README.md`) in the public `agent-scripts` repo, the sole canonical copy; `npx skills` lockfile source = `ohyeh/agent-scripts` (`https://github.com/ohyeh/agent-scripts.git`). The earlier `ohyeh/tmux-agent-tools.git` source and any `~/.agents/workflows/` git-repo claim are void — do not reference them.
- **Deployed / invocation**: recipes must live under `~/.claude/workflows/` (regular files) to be discovered by Claude Code and invokable via `/<name>` or `Workflow({name})`; a project-level `.claude/workflows/` shadows a same-named recipe → name new recipes to avoid collisions with names already used in a project. See `workflows/README.md` in the bundle for details.
- **Rebuild**: first restore skills per the Agent Skills flow above (preferred = offline tar) → then deploy `*.workflow.js` + `_lib/` to `~/.claude/workflows/` per the bundle's `workflows/README.md`.
- **Parameters**: run targets (repoPath/appId/deeplink/flavor/…) + flags + non-secret config → `args`. **Secrets never enter `args`/prompt/transcript** — pass a `args.credsFile` path and the env key name instead; machine-local values (Xcode/UDID/FVM path) → env/config.
