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

Read-only is two layers, each measured 2026-09-04 under `claude -p`:
`disallowedTools: Edit, Write, NotebookEdit` removes the editors, and a
`hooks: PreToolUse` entry pointing at `.agents/hooks/bash-readonly-gate.sh`
denies write-shaped Bash (redirection, rm/mv/tee/sed -i, interpreters, git
mutations) while fd/rg/ast-grep/jq/yq pass. Grep/Glob are not exposed in this
configuration (probe subagents saw only Read/Bash), so Bash is the agent's only search path and the hook is its only
write barrier. `permissionMode: plan` did NOT stop Bash writes under `-p`
(interactive: UNCONFIRMED) and is not used. Regression table:
`scripts/test-bash-readonly-gate`. A referenced hook that is missing is a SILENT
ALLOW (measured), so deploy layer 8 fails closed unless every `command:` in a
definition is already executable on the host (layer 5 installs them first).

Why these exist (2026-09-04, after the 856M cache-read night): a definition
file is the only place a `model` and a `maxTurns` ceiling bind to a role.
`explore-bounded` is the read-only search lane for both delegation factions —
Agent tool `subagent_type` and workflow recipe `agentType`. See
`.agents/rules/model-dispatch.md`.

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
| 1 | Did commanders dispatch the new lane? | `rg -o '"subagent_type":"(explore-bounded\|Explore)"' $P/*/*.jsonl \| sort \| uniq -c` | bare `Explore` = 0 |
| 2 | Is the read-only lane on sonnet, rest on opus? | `rg -o '"model":"claude-[a-z]+-5"' $P/*/*/subagents/*.jsonl \| sort \| uniq -c` | sonnet count ≈ explore-bounded calls |
| 3 | Did `maxTurns` bite? | `rg -l 'stopped at its 60-turn limit' $P/*/*.jsonl` | rare; each hit = a GOAL that was too wide |
| 4 | Did the write gate fire? | `rg -c 'read-only agent:' $P/*/*/subagents/*.jsonl` | 0 ideally; any hit → false positive or an agent trying to write |
| 5 | Cost share moved? | `session-report` plugin `analyze-sessions.mjs --json --since 7d` → `by_subagent_type` | `workflow-subagent` share < 23.4% |

Still UNCONFIRMED and not observable from transcripts: whether `effort: high`
applies; whether `permissionMode: plan` gates Bash in interactive mode.
Close this section (delete it) once rows 1–5 have numbers and a retro has ruled.

History: the 2026-07-18 retirement (A4b) removed the tmux-delegate era defs
because auto-triggering was never used. These are not auto-triggers; they are
dispatch targets named explicitly by rules and recipes.
