# agent-scripts

Canonical home for generic agent policy skills, routers, and workflow recipes, spun out of
`ohyeh/tmux-agent-tools` (which retains only tmux worker lifecycle mechanics and its narrow
router).

This repository is being built incrementally per a frozen, second-model-reviewed implementation
plan. It currently contains the canary skill plus this wave's **staged, unpublished** migration
content (local branch only — nothing below has been pushed):

- `skills/using-design-skills/` — the Gate R2 `CLEAN`-reviewed design router (repaired, 16
  regression cases in `evals/evals.json`).
- `skills/using-workflows/` — the workflow meta-router and its 12 canonical recipes
  (`skills/using-workflows/workflows/`), migrated from `ohyeh/tmux-agent-tools`. This bundle is
  the single canonical copy; machines deploy it to `~/.claude/workflows/` via the install script.
- `skills/delegation-templates/`, `skills/unknowns-discovery/` — the two generic policy skills
  (W4.1), migrated byte-identical from `ohyeh/tmux-agent-tools/skills/`. These are the canonical
  skill directories; the `.agents/rules/` exclusion below covers only the same-named *rule*
  Markdown files, not these skills.
- `.agents/rules/` — the shared routed-rule files (`model-dispatch.md`, `judgment-rubrics.md`,
  `maintenance.md`, `harness-diagnosis.md`, `agent-environment-provisioning.md`,
  `LETTER-TO-FUTURE-SESSIONS.md`). `delegation-templates.md` and `unknowns-discovery.md` are
  deliberately not carried over as rule files — their skills above are canonical instead.
  `lessons.md` stays machine-local and is git-ignored; it is never committed here.
- `scripts/scrub.sh` — the pre-push secret/path/hostname/Tailscale-IP/commit-metadata scrub that
  must PASS before any push to this repo's remote.

Release channel: immutable tag (primary), protected `main` (fallback), per the frozen ADR
governing this spinout's repo boundary, release policy, and per-skill fleet cutover invariant.

## Fleet skill restore (`skills-lock.json`)

`skills-lock.json` at the repo root is the fleet's canonical skill set (82 entries, snapshot
2026-07-19): every skill installed on the fleet that the `npx skills` CLI manages, merged from
the machines' `~/.agents/.skill-lock.json` files. Two manual-only items are deliberately
excluded: `commit-commands` (a Claude Code plugin, not a skill) and `note` (hand-copied, no
tool-resolvable source).

To restore all skills on a (new) machine — the CLI restores into `.agents/skills/` **relative
to the cwd**, so run it from `$HOME` for a global install:

```sh
cd ~
curl -fsSL https://raw.githubusercontent.com/ohyeh/agent-scripts/main/skills-lock.json -o skills-lock.json
npx -y skills experimental_install
rm skills-lock.json
```

Format verified against the CLI (one-entry restore, exit 0). The `$HOME`-cwd global-install
path is inferred from the CLI's cwd-relative behavior — UNCONFIRMED on a fresh machine until
first used. Before running `npx skills update/upgrade -g` afterwards, clear ghost lock records
(entries whose folder no longer exists) or deleted skills resurrect.
