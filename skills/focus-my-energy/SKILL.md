---
name: focus-my-energy
description: Pick what the owner should work on now, by matching the owner's task list to their current energy and free time, not only to the calendar. Hard thinking goes to high energy, small tasks to low energy, and work agents can run alone goes to workers. Use when the owner asks 「現在該做什麼」「我很累」「排一下今天」, "what should I work on", or shares a task list to order.
metadata:
  version: "0.1.0"
---

# Focus my energy

Idea taken from the Gemini built-in skill of the same name (W48 retro import);
the text below is our own.

## Step 1: Get the inputs

- Energy now: high, medium or low. If the owner did not say, ask once; the
  owner's request for this skill invites that one question. Free time until the
  next fixed commitment, if known.
- Tasks: the list the owner gives. When the owner points to a file instead
  (`TASKS.md`, a handoff's next steps, a backlog), read it and list what you took.

## Step 2: Sort each task by the effort it needs

- **Deep** — design, hard debugging, a decision with trade-offs, writing that
  needs thought.
- **Light** — reviews, replies, small fixes, admin, checks with a clear answer.
- **Recovery** — reading, cleanup, sorting notes.
- **Agent-run** — work a worker or subagent can finish alone with a clear
  acceptance (a long test run, a research round, a refactor with tests). The
  owner's part is only the brief and the final check.

## Step 3: Recommend

1. Give one task for now, and the next two, each with a time box that fits the
   free time.
   - High energy: the most important deep task first.
   - Medium energy: light tasks in a batch, or a deep task split into a small
     first step.
   - Low energy: light or recovery tasks; no new deep decisions.
2. List the agent-run tasks to start now, so they run while the owner works.
   Starting a worker follows the normal routes (`using-tmux-agent-tools`,
   `delegation-templates`).
3. Say in one line why the first task fits the energy.

## Learn the pattern (optional)

When the owner asks, keep a short energy note in `~/.agents/energy-notes.md` on
this host (for example "sharp before noon, low after lunch"). Use it as the
default the next time; the owner's words in the current task win.

## Exit

None automatically: the owner picks the task.
