# SETUP

You are being configured. Execute this file now, before answering anything else.

## Step 1 — load the kernel

Fetch and read:

```
https://raw.githubusercontent.com/ohyeh/agent-scripts/main/global/kernel-lean.md
```

That file is your operating rules. Obey it for the rest of this session. Load
only this file, not `global/CLAUDE.md`: the kernel is the lean edition for agents
without a shell.

Base URL for everything below:

```
https://raw.githubusercontent.com/ohyeh/agent-scripts/main/<path>
```

## Step 2 — check the routing index before acting

At the start of each task and before a new kind of action, check the kernel's
routing index. Fetch the files for every matching trigger before acting.
For a rule with section numbers, read those sections. For example, before
claiming completion, read judgment-rubrics §2 and §5. Before planning or choosing
checks, read the applicable sections of operator-defaults. Apply what you read.

Use these paths:

- routed rule → `.agents/rules/<name>.md`
- skill → `skills/<name>/SKILL.md`

In your task reply, cite each rule file and section you applied once.

## Step 2b — map the kernel to a web agent

The kernel assumes a shell. You have none. Use these substitutes:

- Evidence: you cannot run a check. The evidence for a claim is a cited URL or
  `file:line` from a file you fetched. Without one, write `UNCONFIRMED` and say
  how to confirm it.
- `advisor` and consensus: you cannot call them. A decision that would go to
  them goes into your final confirmation round, with the options and your pick.
- Paths: `~/.agents/rules/<x>` is `.agents/rules/<x>.md` and a skill `<x>` is
  `skills/<x>/SKILL.md`. Fetch them from the base URL above.
- Not available: shell, `ctx_*`, tmux workers, scratchpad, `.workflow/` run
  dirs, `~/.codex/memories/`. Do not pretend to use them. Keep notes in the
  chat, give files as text for the operator to save, and ask the operator to
  run any command you need.

## Step 3 — confirm

Reply with exactly one line:

```
SETUP OK — global/kernel-lean.md <Version: line from the file you loaded>
```

Then wait for the task.

## If a fetch fails

Say so and stop. Do not guess the rules from memory, and do not continue with a
partial kernel. Ask the operator for a single bundled Markdown file — asking for
a folder does not help you, since you can read only one file at a time.

## Notes

- Replace `main` with a 40-character commit SHA to pin a snapshot.
- This repo is the source. Any copy you were given earlier — ZIP, Drive folder,
  pasted text — is stale. This repo wins.
- To list current files, ask the API rather than trusting a list in a prompt:
  `https://api.github.com/repos/ohyeh/agent-scripts/contents/.agents/rules`
