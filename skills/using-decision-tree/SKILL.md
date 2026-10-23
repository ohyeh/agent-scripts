---
name: using-decision-tree
description: "Which skill, in what order, for visual or interface work. Invoke BEFORE any visual output: web page, landing page, dashboard, product UI, mobile screen, HTML report, diagram, chart, plan page, artifact, motion, redesign, 「做個頁面」, 「畫圖」, 「報告做成網頁」, plus module or API interface design. Walks one decision table, binds one owner per role, closes with an evidence check."
---

# using-decision-tree

One tree picks the skills for a task. This file is the trunk: it names no
member and asks no domain question. Domain questions and the only list of
member names live in branch files under `references/`. A new domain is a new
branch file plus one index row; this file does not change for it.

## Walk

1. The kernel routing index names a skill for this trigger → open that skill
   and stop here. The kernel route wins.
2. Read `references/index.md`. Pick the row whose `when` fits the task. No row
   fits → this tree does not cover the task yet; use `using-skills`.
3. Read that branch file. Answer its questions top to bottom. Take member
   names only from its member table; cite the row id you used.
4. Bind each chosen member live:
   - `jq -r '.skills|keys[]' ~/.agents/.skill-lock.json` is the installed
     roster; cross-check it against this turn's skill listing. Installed but
     not listed = not callable this turn.
   - A member with `disable-model-invocation: true` (`head -8` of its
     `SKILL.md`) is read inline.
   - A member that is absent → say so in the plan, name the substitute or the
     skipped role, and never substitute in silence.
5. Read the chosen member's `SKILL.md`, then run the branch's contracts. Do
   not come back to this trunk mid-task.

A worker on one assigned task does not enter this tree; its brief already
binds the members.

## Changing the tree

Each member row carries `class`:

- `owner` — taste, cost, or an owner ruling. Change it only with the owner's
  approval of the exact diff (rule `maintenance` §1).
- `mechanical` — the choice is "the installed skill that still does this job".
  When its `recheck` fact is true and quoted (for example `jq` shows the member
  is gone from the lock), the agent may remove or flag the row after advisor
  and sol agree on the same exact diff, then report it (owner ruling
  2026-10-23). Naming a new member is never mechanical: it is an owner row.

The trunk, the index, and a branch's questions or contracts change only with
the owner's approval. Edit the repo source, never an installed copy.
