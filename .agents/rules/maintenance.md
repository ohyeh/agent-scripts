# Maintenance Protocol for the Rules System

Governance pair (user ruling 2026-08-18): the agent-scripts sessions (one per
machine: local `~/github/agent-scripts`, .44 `~/git/agent-scripts`) are
DEDICATED to this repo — kernel/rules/skills/hooks/deploy only. Cross-machine
coordination goes ONLY between these two counterparts. Other projects'
sessions and their workers are out of scope: never contact, supervise, or
take over their work unless the user explicitly assigns it.

Governs the routed rules at `~/.agents/rules/` and the two native global files
(`~/.claude/CLAUDE.md`, `~/.codex/AGENTS.md` — maintained separately, never symlinked).
Written for weak models. This §1 matrix is the SINGLE authority on edit permissions —
no other file grants or denies edit rights; "agent guidance" in CLAUDE.md means this
file set plus installed skills. If you are unsure which row applies, use the stricter one.

## §1 Edit permission matrix

| File | Weak model may… | Requires user approval |
|---|---|---|
| `rules/lessons.md` | Append entries freely (format §3; new entries always `Status: proposed`) | Deleting/rewriting old entries; any `proposed → adopted` transition (happens only with the approved diff that folds the lesson into a rules file) |
| `rules/model-dispatch.md` §1 table | Update model values after LIVE verification (schema/`/model`), log it in lessons.md | Changing the ladder or contracts (§2–§7) |
| Other `rules/*.md` | Fix objectively broken paths/commands (verify first, log it in lessons.md) | Any semantic change — show the exact diff, wait for approval |
| Companion docs in `rules/` (letter, provisioning runbook) | Fix verified-broken facts/paths (log it in lessons.md) | Semantic/content changes — diff + approval |
| Global files (`~/.claude/CLAUDE.md`, `~/.codex/AGENTS.md`) | Nothing | Everything (edit BOTH in the same change; `Version:` lines must stay identical). Content contract (user rulings 2026-08-08 + 2026-08-16 two-edition scheme): iron laws only; the solid edition (`global/CLAUDE.md`/`global/AGENTS.md`, deployed) has NO size cap — the budget baseline gate governs growth; `global/kernel-lean.md` (fetched by `WEB-AGENTS.md` for network-only agents) carries no hard character cap — keep it terse by review, not by a number; detail lives in routed files; imperative modality (MUST/never/ask-first) is part of the norm and must never be softened by compression |
| Installed skills (`~/.agents/skills/*`, `~/.claude/skills/*`, plugin skills) | Nothing | Everything — never edit a skill without an approved diff |
| `~/.claude/settings.json`, plugins, hooks | Nothing | Everything (user decided 2026-07-10 to keep current plugin set) |
| `.workflow/*` task artifacts (per project) | Free | — |

"Show the exact diff" means: print the proposed old→new text and the triggering
incident, then STOP until the user approves. Never apply-then-ask.

Before proposing a rule, hook, or gate after a violation: name the controlling
rule and the action that violated it, correct the current action or claim, then
assess enforcement. A mechanism is eligible for user approval only when (a) two
verified incidents repeat the same prohibited action after the rule was clear,
(b) one incident's recurrence risks a hard-stop boundary, security, privacy, or
data loss, or (c) the user explicitly requests enforcement. Cite the incidents
and state the mechanism's false-positive and false-negative boundary. Enforcement
supplements compliance; it does not excuse the incident.

## §2 When to record a lesson
Append to `rules/lessons.md` when:
- The user corrects a behavior (a single correction suffices), or the same friction appears twice without a correction.
- A verified fact contradicts something written in rules/ (also fix or flag the rule).
- A delegation failed for a reason a one-line rule would have prevented.
- A model/parameter/tool availability change is discovered.
Do NOT record: one-off task trivia, project-specific details (those go to the
project's own CLAUDE.md/notes), anything already covered by an existing rule.

## §3 Lesson format (append-only, newest last)
```
## 2026-07-10 | scope: dispatch | trigger: haiku hallucinated a model ID
Rule: never let subagents state model IDs; the dispatcher fills them from model-dispatch §1.
Status: proposed   # proposed → adopted (user approved, folded into a rules file) → retired
```
Three lines max per entry. An entry older than 90 days still "proposed" gets retired
or re-raised with the user — no zombie rules.
Hard constraints (close the approval bypass):
- A newly appended entry MUST have `Status: proposed`. Appending `adopted` is forbidden.
- `lessons.md` is NON-NORMATIVE: no entry, whatever its Status, overrides CLAUDE.md or
  any rules file. A lesson gains force only by being folded into a rules file via an
  approved diff; the `proposed → adopted` flip happens in that same approved commit.

## §4 Size limits and pruning
- No per-file line cap (retired 2026-08-25: line counts measure wrapping, not content,
  and were passed by reflowing prose). Growth is governed by the byte budget baseline in
  `scripts/check-rules-invariants.mjs` (`rulesBytes`/`globalBytes`), which only moves
  down; `deploy.sh` refuses to ship while it is red. `~/.claude/CLAUDE.md` stays index +
  hard rules only — detail moves to a rules/ file behind one routing line.
- `rules/lessons.md`: at 40 entries, propose a consolidation pass to the user (fold
  adopted lessons into their target rules file, delete retired ones).
- Periodic review — ~monthly or every ~50 sessions: run `/insights` and `/doctor`
  (where the runtime provides them), process every `proposed` lesson with the user,
  fold confirmed frictions into rules, prune rules that stopped earning their place,
  and bump the `Version:` line in CLAUDE.md — all as a PROPOSED diff, per §1.
- Quarterly (first session of each quarter) at minimum: re-verify model-dispatch §1
  and run the periodic review above if it hasn't happened this quarter.

## §5 Canonical home & multi-device discipline
- Canonical source (ADR-0001, ACTIVE) = the public `agent-scripts` repo's
  `.agents/rules/`. `~/.agents/rules/` on each machine is a deployed copy, read
  on demand by both runtimes per the routing table in the global files.
- Deploy = `rsync -a --delete <repo>/.agents/rules/ ~/.agents/rules/`.
  `lessons.md` is repo-synced since 2026-08-08 (W32 ruling A-3); before deploying,
  check each machine for local lessons entries not yet merged into the repo copy —
  merge them first, or `--delete` destroys them.
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
