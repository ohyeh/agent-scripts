# Maintenance Protocol for the Rules System

Governance pair (user ruling 2026-08-18): the agent-scripts sessions (one per
machine: local `~/github/agent-scripts`, .44 `~/git/agent-scripts`) are
DEDICATED to this repo — kernel/rules/skills/hooks/deploy only. Cross-machine
coordination goes ONLY between these two counterparts. Other projects'
sessions and their workers are out of scope: never contact, supervise, or
take over their work unless the user explicitly assigns it.

Governs the routed rules at `~/.agents/rules/` and the two native global files
(`~/.claude/CLAUDE.md`, `~/.codex/AGENTS.md` — maintained separately, never symlinked).
This §1 matrix is the SINGLE authority on edit permissions for every agent —
no other file grants or denies edit rights; "agent guidance" in CLAUDE.md means this
file set plus installed skills. If you are unsure which row applies, use the stricter one.

## §1 Edit permission matrix

| File | Agent may (no approval)… | Requires user approval |
|---|---|---|
| `rules/model-dispatch.md` §1 table | Update model values after LIVE verification (schema/`/model`), quote the check in the commit message | Changing the ladder or contracts (§2–§7) |
| Other `rules/*.md` | Fix objectively broken paths/commands (verify first, quote the check in the commit message) | Any semantic change — show the exact diff, wait for approval |
| Companion docs in `rules/` (letter, provisioning runbook) | Fix verified-broken facts/paths (quote the check in the commit message) | Semantic/content changes — diff + approval |
| Backlog rows (§3) | Add rows freely | Closing a row as dropped |
| Global files (`~/.claude/CLAUDE.md`, `~/.codex/AGENTS.md`) | Nothing | Everything (edit BOTH in the same change; `Version:` lines must stay identical). Content contract (user rulings 2026-08-08 + 2026-08-16 two-edition scheme): iron laws only; the solid edition (`global/CLAUDE.md`/`global/AGENTS.md`, deployed) has NO size cap — the budget baseline gate governs growth; `global/kernel-lean.md` (fetched by `WEB-AGENTS.md` for network-only agents) carries no hard character cap — keep it terse by review, not by a number; detail lives in routed files; imperative modality (MUST/never/ask-first) is part of the norm and must never be softened by compression |
| Installed skills (`~/.agents/skills/*`, `~/.claude/skills/*`, plugin skills) | Nothing | Everything — never edit a skill without an approved diff |
| `~/.claude/settings.json`, plugins, hooks | Nothing | Everything (user decided 2026-07-10 to keep current plugin set) |
| `.workflow/*` task artifacts (per project) | Free | — |

"Show the exact diff" means: print the proposed old→new text and the triggering
incident, then STOP until the user approves. Never apply-then-ask. Quote the old text
from the saved file at proposal time; if the pre-edit text is unavailable, say so rather
than treating HEAD as the original. Before changing a rule whose text cites a lesson,
ops/evidence note, or commit as its trigger, read that source first and confirm the change
cannot reopen the failure.

Before proposing a rule, hook, or gate after a violation: name the controlling
rule and the action that violated it, correct the current action or claim, then
assess enforcement. A mechanism is eligible for user approval only when (a) two
verified incidents repeat the same prohibited action after the rule was clear,
(b) one incident's recurrence risks a hard-stop boundary, security, privacy, or
data loss, or (c) the user explicitly requests enforcement. Cite the incidents
and state the mechanism's false-positive and false-negative boundary. Enforcement
supplements compliance; it does not excuse the incident.

## §2 Friction → a gate, a backlog row, or nothing
There is no free-text lesson list (`lessons.md` retired 2026-10, option B; old entries:
`git show a3992bd:.agents/rules/lessons.md`). Triggers: the user corrects a behavior
(one correction suffices); the same friction appears twice; a verified fact contradicts
rules/; a delegation failed for a reason a check would have caught; a model/tool
availability change. In the same turn, pick exactly one outcome:
- Gate: a hook or check under `.agents/hooks/` or `scripts/` that fails on the bad
  case. It follows the eligibility test above and the §1 row of each file it touches.
- Rule fix: the rule text is wrong or missing → exact diff to that file (§1).
- Backlog row (§3): worth enforcing, but no gate yet.
- Nothing: one-off trivia, project-specific detail (goes to that project's notes), or
  already covered — cite the covering `file:line` and stop.

## §3 Backlog row format
One line in `evals/retro-metrics/inbox.md` under 待討論議題:
`YYYY-MM-DD | friction (evidence) | file to change | acceptance + one negative case`.
A row with no file name, or with no case that must FAIL before the fix, is not a row.
Retro §6.5 drains the inbox into `next-week-backlog.md`; a row closes as a gate or a
rule fix (commit sha), or as dropped (user approval, §1).

## §4 Size limits and pruning
- No size cap and no byte budget. The line cap went 2026-08-25 (line counts measure
  wrapping, not content, and were passed by reflowing prose); the byte budget went
  2026-09-01 for the same class of reason — bytes were a proxy for context cost the
  runtime already reports directly (`/context`, statusline), and `rulesBytes` counted
  routed files that are read on demand and cost nothing per session. Growth is governed
  by review. Never trim unrelated rules to make room for an addition — that is the
  reflow trick again. `~/.claude/CLAUDE.md` stays index +
  hard rules only — detail moves to a rules/ file behind one routing line.
- `Version:` is a policy EDITION label bumped by the periodic review below,
  NOT a drift signal: it held at `4.24.0-ironlaws` across 8 commits while a
  host ran 3-day-old kernels (session 76409ec8). Provenance drift →
  `scripts/check-deploy-drift.sh` vs `deploy-log.jsonl`; content drift stays
  with the full-file comparison. Neither replaces the other.
- Periodic review — ~monthly or every ~50 sessions: run `/insights` and `/doctor`
  (where the runtime provides them), close every open backlog row with the user,
  turn confirmed frictions into gates or rule fixes, prune rules that stopped earning their place,
  and bump the `Version:` line in CLAUDE.md — all as a PROPOSED diff, per §1.
- Quarterly (first session of each quarter) at minimum: re-verify model-dispatch §1
  and run the periodic review above if it hasn't happened this quarter.

## §5 Canonical home & multi-device discipline
- Canonical source (ADR-0001, ACTIVE) = the public `agent-scripts` repo's
  `.agents/rules/`. `~/.agents/rules/` on each machine is a deployed copy, read
  on demand by both runtimes per the routing table in the global files.
- Deploy = `rsync -a --delete <repo>/.agents/rules/ ~/.agents/rules/`. Nothing
  under `~/.agents/rules/` is machine-local: `--delete` removes any file the repo
  does not carry.
- Deploy hygiene (each learned from a real drift incident): after any institution
  pivot, grep every rules/global file for the old mechanism's tokens and fix them
  in one pass; periodically diff native `~/.claude/CLAUDE.md`/`~/.codex/AGENTS.md`
  against repo `global/` in FULL (not just Version + touched lines); every skill
  named in the global files or routed rules must have a fleet `skills-lock.json`
  entry; treat any `skills update`-family subcommand as mutating (never pass it
  `--help`).
- The two global files are canonical in the repo's `global/` directory,
  deployed to their runtime paths (`~/.claude/CLAUDE.md`, `~/.codex/AGENTS.md`)
  byte-identical, kept content-identical (same `Version:` line), never
  symlinked, never stored under `~/.agents/rules/`.
- Machine verification: each machine's runtime `~/.agents/rules/` and global
  files match the repo's md5 for the same paths, and both global files show
  the same `Version:`. Before deployment, `scripts/check-canary.sh` must pass;
  after deployment, a new session reply must end with `✈` unless its required
  format fixes the final line (see `rules/agent-environment-provisioning.md`).
