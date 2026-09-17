# Session Title Lifecycle

Use this rule for every non-trivial session. A simple answer, lookup, or
single-command task does not require a title change.

## Format

`<status> <subject> [<ticket?>] [<handoff sequence?>] — <outcome> · <host>-<sid8>`

The title is for humans to read. It is NOT the cross-session address — see
`## Cross-session addressing` below. Order is by discriminating power: listing
surfaces truncate from the right, and a sidebar measured 2026-08-20 showed ~30
characters, of which a leading `<host>-<sid8>-` head ate 12. Status leads at 2
characters; the marker goes last, needed least and carrying no delivery role.

Examples:

- `⏳ session-title — Define normalization rules · .44-96fb35ed`
- `🚨 ios-uat — Waiting for the device to reconnect · .44-3f2a91c4`
- `↗️ type1-voucher [SMCS-1902] [1] — Continued in [2] · .19-8b40d2e7`
- `✅ coin-rebrand [SMCS-1699] — Opened the develop PR · .44-1afc7a39`

Use exactly one status:

| Status | Meaning |
|---|---|
| `⏳` | Work is active. |
| `🚨` | Progress requires user or external intervention. |
| `↗️` | This session handed unfinished work to a successor. |
| `✅` | The outcome exists and has fresh completion evidence. |

## Fields

- Machine marker: `<host>-<sid8>`, placed last, assigned once and never
  rewritten — not on a status change, a subject change, a handoff, or
  compaction recovery. Discover `host` live as the last octet of
  `tailscale ip -4`, with a leading dot (`.44`); it routes a human and carries
  no uniqueness. Read `sid8` from `CLAUDE_CODE_SESSION_ID`, first 8 characters;
  it matches the directory under `~/.local/state/agent-hooks/`. Never reverse it
  out of a transcript filename.
  Those 8 hex characters are 32 bits with no collision check anywhere, so
  before reusing a marker confirm no live `ListAgents` row carries it, and
  extend to 12 characters if one does. No field of the title is the address.
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

## Cross-session addressing

The address is the peer's bridge id, not its title. It never changes with
status, outcome, or a rename, and unlike a ` [ref]` it is not single-use.
Resolve your own from the LIVE registry, keyed by this session's id:

```bash
jq -r 'select(.sessionId==env.CLAUDE_CODE_SESSION_ID) | .bridgeSessionId' \
  ~/.claude/sessions/*.json
```

Send with `to: "bridge:<bridgeSessionId>"`. An incoming message's `from`
attribute is already in exactly this form, so reply by copying it verbatim.

Delivery by name is a fallback and needs the EXACT full name from a current
`ListAgents` row; a trailing ` [ref]` is harmless but not required. A prefix
NEVER delivers, with or without a ref, so no leading segment of a title can
serve as an address (measured 2026-08-20 on two hosts, same result on both).
The `to` field is capped at 300 characters by the tool schema — a limit on the
recipient string, not on what a title may say.

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
what `/rename` does internally (verified against CLI 2.1.237):

1. Cloud title (what the claude.ai app shows). Resolve the `cse_…` id with the
   `## Cross-session addressing` query, replacing the `session_` prefix of its
   result with `cse_`. Read that registry ONLY from disk, never from a
   transcript: a resumed or compacted one quotes registry dumps from
   earlier sessions, so the id found there can belong to an archived session,
   and the write lands on it and still returns 200 (2026-08-20: an 8/14
   archived session was overwritten this way, its original title
   unrecoverable). If the query returns no row or more than one, stop and
   report — never guess from a session list. Then:

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
versions. A 200 is NOT success: it only means the request was accepted, and it
is returned for a write to the wrong session. Confirm with
`GET /v1/code/sessions/<cse_id>` and the SAME two `anthropic-*` headers as
above — the version header is required on both verbs — reading
`.response_shape.title` — NOT
`.title` or `.session.title`, which read `null` and turn a successful rename
into a reported failure. So a mismatch means the write missed OR the read path
is wrong; check the path first. If a hook intercepts `curl`, use another HTTP
client; never skip the read-back. On a missing credential, a non-200, or a
confirmed mismatch, report the failure, state the exact `/rename <title>` once
for the user, and leave the title unchanged.
