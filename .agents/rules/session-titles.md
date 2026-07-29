# Session Title Lifecycle

Use this rule for every non-trivial session. A simple answer, lookup, or
single-command task does not require a title change.

## Format

`<status> [<ticket?>] <stable subject> [<handoff sequence?>] — <outcome>`

Examples:

- `⏳ Session title — Define normalization rules`
- `🚨 iOS UAT — Waiting for the device to reconnect`
- `↗️ [SMCS-1902] Type 1 voucher [1] — Continued in [2]`
- `✅ [SMCS-1699] Health Coin rebrand — Opened the develop PR`

Use exactly one status:

| Status | Meaning |
|---|---|
| `⏳` | Work is active. |
| `🚨` | Progress requires user or external intervention. |
| `↗️` | This session handed unfinished work to a successor. |
| `✅` | The outcome exists and has fresh completion evidence. |

## Fields

- Ticket: copy an identifier only from the user's message, branch, issue, or
  inspected evidence. Preserve its casing. Never infer one.
- Stable subject: use a short noun phrase that survives retries, compaction,
  and handoff. It describes the work, not necessarily a project. Exclude model
  names, commands, filenames, chat phrasing, and generic `task` or `work`.
- Handoff sequence: count session boundaries, not turns or agents. Add `[1]`
  when the first handoff occurs, then increment it for each successor. Keep the
  ticket and stable subject unchanged across the chain.
- Outcome: state the current target, exact unblock needed, successor, or
  verified result. Put the identifying words first and keep it to one line.

## State transitions

1. When a non-trivial goal becomes clear, set `⏳`.
2. When progress needs user or external action, set `🚨` and name that action.
   A transient error that the agent can still repair remains `⏳`.
3. When work resumes, return to `⏳`.
4. Before handoff, rename the predecessor to `↗️`, add or retain `[n]`, and
   name `[n+1]` as the successor. Start the successor as `⏳` with `[n+1]`.
5. Set `✅` only when `judgment-rubrics.md` permits a completion claim. Rewrite
   the outcome as the achieved result, not the activity that produced it.

Do not rewrite a `✅` title for follow-up work. Start a new active session and
continue the handoff sequence when the work is part of the same chain.

## Rename gate

Rename only when one of these changes:

- the non-trivial goal first becomes clear;
- status;
- stable subject or material outcome;
- handoff sequence;
- verified completion result.

Do not rename for a tool call, minor progress, a retry, or a repairable failure.
Normalize whitespace and the ` — ` separator before comparing. If the normalized
title is unchanged, do nothing. If evidence does not support a ticket, sequence,
status, or outcome change, keep the existing title.

## Runtime control

Codex uses its native title control. Claude uses `/rename` when its SlashCommand
tool is available; otherwise it states the exact `/rename <title>` once for the
user. If the native control fails, report the failure and leave the title
unchanged. Never claim success or simulate a rename through a file, hook, or
chat message.
