# global/ — personal global-layer snapshot

This directory is a **published snapshot** of the per-machine global layer
(the files that live OUTSIDE any repo on each machine). For these two files
the canonical copies are machine-side; this snapshot is refreshed whenever
their `Version:` line bumps (deterministic sync rule, gate 2026-07-19).

| Here | Canonical (machine-side) | What it is |
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
