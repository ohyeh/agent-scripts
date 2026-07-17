# Maintenance Protocol for the Rules System

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
| Global files (`~/.claude/CLAUDE.md`, `~/.codex/AGENTS.md`) | Nothing | Everything (edit BOTH in the same change; `Version:` lines must stay identical) |
| Installed skills (`~/.agents/skills/*`, `~/.claude/skills/*`, plugin skills) | Nothing | Everything — never edit a skill without an approved diff |
| `~/.claude/settings.json`, plugins, hooks | Nothing | Everything (user decided 2026-07-10 to keep current plugin set) |
| `.workflow/*` task artifacts (per project) | Free | — |

"Show the exact diff" means: print the proposed old→new text and the triggering
incident, then STOP until the user approves. Never apply-then-ask.

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
- `~/.claude/CLAUDE.md`: ≤150 lines, index + hard rules only. Overflow → move content
  to a rules/ file and leave one routing line.
- Each `rules/*.md`: ≤150 lines. Overflow → split by section, update the routing table
  in CLAUDE.md.
- `rules/lessons.md`: at 40 entries, propose a consolidation pass to the user (fold
  adopted lessons into their target rules file, delete retired ones).
- Periodic review — ~monthly or every ~50 sessions: run `/insights` and `/doctor`
  (where the runtime provides them), process every `proposed` lesson with the user,
  fold confirmed frictions into rules, prune rules that stopped earning their place,
  and bump the `Version:` line in CLAUDE.md — all as a PROPOSED diff, per §1.
- Quarterly (first session of each quarter) at minimum: re-verify model-dispatch §1
  and run the periodic review above if it hasn't happened this quarter.

## §5 Canonical home & multi-device discipline
- Canonical source = `~/.agents/rules/` on each machine, read on demand by both
  runtimes per the routing table in the global files. NOT yet version-controlled.
- Planned git home (ADR-0001, agent-scripts spinout): the public `agent-scripts`
  repo, mirrored at `.agents/rules/`; deploy = `rsync -a --delete
  <repo>/.agents/rules/ ~/.agents/rules/`. `lessons.md` stays LOCAL-ONLY — it is
  never published to the public repo.
- Until that repo exists: cross-machine transfer = copy the directory. Diverged
  `lessons.md` merges by concatenating entries, then consolidating per §4.
- The two global files are native per-runtime copies — edited together, kept
  content-identical (same `Version:` line), never symlinked, never stored under
  `~/.agents/rules/`.
- Machine verification: `~/.agents/rules/` manifest matches the routing table,
  both global files show the same `Version:`, and a new session's first reply
  ends with the `✈` canary (see `rules/agent-environment-provisioning.md`).
