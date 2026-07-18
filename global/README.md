# global/ — canonical runtime-main sources

This directory contains the **canonical repo copies** of the two runtime main
files. Deploy them byte-identically to each machine-side runtime path; never
reverse-sync a runtime copy into the repo. A `Version:` bump records a rules
release; after every bump, verify that each deployed file's md5 matches its
canonical repo file on all three machines.

| Canonical repo file | Deployed runtime path | What it is |
|---|---|---|
| `CLAUDE.md` | `~/.claude/CLAUDE.md` | Claude Code runtime main file (Lean Operating Rules) |
| `AGENTS.md` | `~/.codex/AGENTS.md` | Codex runtime main file — same rules, same `Version:` line by contract |
| `agents/` | — | sub-agent definitions: RETIRED, see `agents/README.md` |

Deliberately **not duplicated** here (single canonical copy elsewhere in this
repo — duplicate trees drift):

- **rules** → [`../.agents/rules/`](../.agents/rules/) (canonical per ADR-0001;
  deployed to `~/.agents/rules/` on each machine; `lessons.md` is
  machine-local only and never enters this repo).
- **workflows** → [`../skills/using-workflows/workflows/`](../skills/using-workflows/workflows/)
  (canonical recipe bundle; deployed to `~/.claude/workflows/` via the
  skill's `scripts/install.sh`).
- **skills** → [`../skills/`](../skills/) (installed on machines via
  `npx skills`).

Fleet manifests (Workflow / Skill inventory HTML) live under
[`../artifacts/manifests/`](../artifacts/manifests/).
