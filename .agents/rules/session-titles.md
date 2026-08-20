# Session Title Lifecycle

Use this rule for every non-trivial session. A simple answer, lookup, or
single-command task does not require a title change.

## Format

`<host>-<sid8>-<subject> · <status> [<ticket?>] [<handoff sequence?>] — <outcome>`

The title is also the cross-session address: `ListAgents` prints it and
`SendMessage({to})` matches it. The leading `<host>-<sid8>-<subject>` segment is
the address and never changes, so a peer holding an older title still matches as
a prefix and gets a disambiguation error instead of a silent misdelivery. Use no
brackets in the address — `ListAgents` appends its own ` [ref]`.

Examples:

- `.44-96fb35ed-session-title · ⏳ — Define normalization rules`
- `.44-3f2a91c4-ios-uat · 🚨 — Waiting for the device to reconnect`
- `.19-8b40d2e7-type1-voucher · ↗️ [SMCS-1902] [1] — Continued in [2]`
- `.44-1afc7a39-coin-rebrand · ✅ [SMCS-1699] — Opened the develop PR`

Use exactly one status:

| Status | Meaning |
|---|---|
| `⏳` | Work is active. |
| `🚨` | Progress requires user or external intervention. |
| `↗️` | This session handed unfinished work to a successor. |
| `✅` | The outcome exists and has fresh completion evidence. |

## Fields

- Address segment: `<host>-<sid8>-<subject>`. Discover `host` live as the last
  octet of `tailscale ip -4`, written with a leading dot (`.44`); it routes a
  human to the right machine and carries no uniqueness. `sid8` is the first 8
  characters of the hook `session_id` — the same value that names
  `~/.local/state/agent-hooks/<session_id>/` — and is what makes the bare name
  unique, so `SendMessage` never falls through to its silent latest-wins or
  in-process precedence. `subject` is the stable subject slug, lowercase and
  hyphenated. Assign the whole segment once and never rewrite it — not on a
  status change, a handoff, or compaction recovery.
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

A title that describes a previous state is a defect. Re-check the gate at
every turn end where work started, stalled, blocked, handed off, or
completed — not only when first setting the title. On resume or compaction
recovery, re-derive status from current evidence and rename if stale. A `🚨`
outcome names the exact user or external action needed, not just "blocked".

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

Codex uses its native title control. Claude Code renames via Bash, reproducing
what `/rename` does internally (verified against CLI 2.1.220):

1. Cloud title (what the claude.ai app shows). Find the session's `cse_…` id
   inside its own transcript under `~/.claude/projects/<encoded-cwd>/`, then:

   ```bash
   TOKEN=$(security find-generic-password -s "Claude Code-credentials" -w \
     | jq -r .claudeAiOauth.accessToken)
   curl -sf -X PUT "https://api.anthropic.com/v1/code/sessions/<cse_id>" \
     -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
     -H "anthropic-version: 2023-06-01" -H "anthropic-beta: oauth-2025-04-20" \
     -d '{"title":"<title>"}'
   ```

2. Local title (the `claude --resume` list), when `claude-agent-sdk` (pip) is
   available: `rename_session('<session-uuid>', '<title>', '<cwd>')`. Skip
   without comment when the package is absent; the cloud title is primary.

This endpoint is internal and undocumented; it may change between CLI
versions. On any non-200 or missing credential, report the failure, state the
exact `/rename <title>` once for the user, and leave the title unchanged.
Never claim success or simulate a rename through a file, hook, or chat
message.
