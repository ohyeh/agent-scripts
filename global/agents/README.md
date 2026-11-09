# agents/ — sub-agent definitions (canonical)

One sub-directory per runtime; each file's format is that runtime's own.
`scripts/deploy.sh` layer 8 rsyncs every sub-directory that exists here to
its machine path (`--delete`, diff-verified). Sub-directories absent from the
repo are NOT touched, so a runtime's hand-managed agents survive until the
day they are collected here.

| repo path | machine path | format |
|---|---|---|
| `claude/*.md` | `~/.claude/agents/` | markdown + YAML frontmatter (`model`, `effort`, `maxTurns`, `tools`, `disallowedTools`, `hooks`) |
| `codex/*.toml` (not yet collected) | `~/.codex/agents/` | TOML (`model`, `model_reasoning_effort`, `developer_instructions`) |

Why these exist (2026-09-04, after the 856M cache-read night): a definition
file is the only place a `model` and a `maxTurns` ceiling bind to a role.
`impl-bounded` binds opus and 200K compaction to long implement work; read-only
search uses `general-purpose`. See `.agents/rules/model-dispatch.md`.

Definitions are read at session start. A running session (interactive or
`/loop`) does not see a newly deployed file until it is restarted; `claude -p`
and new sessions pick it up immediately (measured 2026-09-04).

## Observe after the first long run (TODO — open until each row has a number)

Baseline 2026-09-02/03 (17.5 h, two `/loop` sessions): 98 subagents, all opus,
856M cache read; `workflow-subagent` = 23.4% of 7-day tokens. Re-measure after
the first `/loop` night that runs on the merged branch. Window = that night;
`P=~/.claude/projects`.

| # | Question | Command | Expect |
|---|---|---|---|
| 1 | Did commanders avoid bare Explore? | `rg -o '"subagent_type":"(general-purpose\|Explore)"' $P/*/*.jsonl \| sort \| uniq -c` | bare `Explore` = 0 |
| 2 | Do subagent models follow model-dispatch §1? | `rg -o '"model":"claude-[a-z]+-[0-9-]+"' $P/*/*/subagents/*.jsonl \| sort \| uniq -c` | haiku/sonnet only on worker roles (gathering, implementation, extraction); planning, synthesis and verdict agents on opus/fable |
| 3 | Did `maxTurns` bite? | `rg -l 'stopped at its 60-turn limit' $P/*/*.jsonl` | rare; each hit = a GOAL that was too wide |
| 5 | Cost share moved? | `session-report` plugin `analyze-sessions.mjs --json --since 7d` → `by_subagent_type` | `workflow-subagent` share < 23.4% |

Still UNCONFIRMED and not observable from transcripts: whether `effort: high`
applies.
Close this section (delete it) once rows 1, 2, 3 and 5 have numbers and a retro has ruled.

History: the 2026-07-18 retirement (A4b) removed the tmux-delegate era defs
because auto-triggering was never used. These are not auto-triggers; they are
dispatch targets named explicitly by rules and recipes.
