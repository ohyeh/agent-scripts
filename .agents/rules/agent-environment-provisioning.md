# Agent Environment Provisioning (Cross-Machine Rebuild)

- Use this runbook only for a new machine or disaster recovery.

## Fast path (clone-free, one command)

- Use the primary rebuild command:
  `curl -fsSL https://raw.githubusercontent.com/ohyeh/agent-scripts/main/scripts/deploy.sh | bash`
- The script downloads `main` to scratch without a retained clone and runs its header's layers.
- Expect PASS/FAIL per layer and a stop at the first failure.
- Use the manual procedures below only when the script is unavailable.

## Agent Skills

- Keep skills at `~/.agents/skills/<name>/SKILL.md`.
- Use one directory symlink, `~/.claude/skills` → `../.agents/skills`, without per-skill links.
  `deploy.sh` converges this layout.
- Use vercel-labs/skills `npx skills`; provenance lives in `~/.agents/.skill-lock.json` fields
  `source`, `sourceUrl`, and `skillPath`.
- List global skills with `npx skills list -g`; without `-g`, it lists project skills only.
- Prefer repo-root `skills-lock.json` as the fleet union contract and restore from `$HOME`:
  `cd ~`
  `curl -fsSL -O https://raw.githubusercontent.com/ohyeh/agent-scripts/main/skills-lock.json`
  `npx -y skills experimental_install`
  `rm skills-lock.json`
- Keep the lock in the current directory; restore installs `.agents/skills/` relative to it.
  Fast-path layer 4 performs this restore.
- Exclude `commit-commands` (a plugin) and hand-copied skills without a resolvable source.
- For manual fallback, use `npx skills add <repo> -g` per repo; rename local skill names manually.
- For offline fallback that preserves names, archive on the source machine:
  `tar -czf agent-skills.tgz -C ~/.agents skills .skill-lock.json`
- On the target, restore the archive and directory symlink:
  `mkdir -p ~/.agents && tar -xzf agent-skills.tgz -C ~/.agents`
  `rm -rf ~/.claude/skills && ln -s ../.agents/skills ~/.claude/skills`
- If deploy reports `[skills] content differs from the pin`, treat the pin as stale:
  `experimental_install` installs upstream HEAD, not the pinned hash.
- For a stale pin, do not ask or delete the folder; run
  `GITHUB_TOKEN="$(gh auth token --hostname github.com)" npx --yes skills upgrade -g -y`,
  then `scripts/sync-skills-lock.sh`, commit the lock, push, and deploy again.
- Use the lock as authority for other skills; process skills mostly come from vercel-labs/skills.

## Rules / Institution

- Follow `rules/maintenance.md` §5 for the canonical home, the rules and `global/` deploy, the
  pre-deploy invariants check, and the `✈` check; deploy only repo → machine.
- The fast-path rules layer runs the rules `rsync`.
- Check that the rules manifest matches the routing table.

## Plugins / Marketplaces

- Read `~/.claude/plugins/known_marketplaces.json` for marketplace state.
- Install with `/plugin marketplace add <repo>`, then `/plugin install <name>@<marketplace>`.
- `claude-plugins-official`: `anthropics/claude-plugins-official`.
- `context-mode`: `mksglu/context-mode`.
- `openai-codex` (Codex CLI integration): `openai/codex-plugin-cc`.
- `claude-hud`: `jarrodwatts/claude-hud`.
- Use `scripts/claude-hud-statusline.sh` and `scripts/cursor-plan-usage.py` for both CLIs' HUD.
- Let deploy layer 7 install them and merge both `statusLine` settings through
  `scripts/install-cursor-hud.sh`.
- For manual install, copy both scripts to `~/.claude/` and make both executable.
- Set Claude `settings.json` `statusLine.command` to `bash -c '~/.claude/claude-hud-statusline.sh'`.
- Set Cursor `cli-config.json` `statusLine.command` to `~/.claude/claude-hud-statusline.sh`,
  `timeoutMs` to 5000, and `updateIntervalMs` to 1000.
- Never copy a whole `cli-config.json`; it contains auth.
- Use `scripts/install-cursor-kernel.sh` for `~/.cursor/rules/kernel.mdc` with `alwaysApply: true`
  and the same body as `global/AGENTS.md`; deploy layer 7 runs it.
- Restart Cursor CLI after deploy; do not put the kernel in a project's `AGENTS.md`.

## Skills used by the docs HTML-ification task

- Restore `codex-dynamic-workflows` from `dannymac180/skills` for workflow orchestration.
- Restore `impeccable` from `pbakaus/impeccable` for detail review.
> Do not restore `high-end-visual-design`, `minimalist-ui`, or `brandkit` on rebuild.
- Restore `design-taste-frontend` through the skills layer; use the lock as authority.

## Dynamic Workflow Recipes

- Use public agent-scripts `skills/using-workflows/workflows/` as the sole recipe source,
  including `*.workflow.js`, `_lib/`, and `README.md`.
- Keep the npx skills source `ohyeh/agent-scripts` (`https://github.com/ohyeh/agent-scripts.git`).
- Treat `~/.claude/projects/<slug>/<session-id>/workflows/` copies as run artifacts only.
- Deploy regular recipe files to `~/.claude/workflows/` for `/<name>` or `Workflow({name})`.
- Avoid recipe name collisions: a project's `.claude/workflows/` shadows global recipes.
- Restore skills first, preferably from `skills-lock.json`; then deploy recipes and `_lib/`
  as the bundle's `workflows/README.md` specifies.
- Pass targets, flags, and non-secret config through `args`.
- Keep secrets out of `args`, prompts, and transcripts; pass `args.credsFile` and the env key name.
- Put machine-local values, such as Xcode, UDID, and FVM paths, in env or config.
