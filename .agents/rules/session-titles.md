# Session Title Lifecycle

- Apply this rule to every non-trivial session; skip title changes for simple answers, lookups, or
  single-command tasks.

## Format
- Format: `<status> <subject> [<ticket?>] [<handoff sequence?>] — <outcome> · <host>-<sid8>`.
- Keep titles human-readable (not cross-session addresses, see `## Cross-session addressing`); place
  the 2-char status first and the marker last because narrow sidebars (~30 chars) truncate from the
  right.
- Examples:
  - `⏳ session-title — Define normalization rules · .44-96fb35ed`
  - `🚨 ios-uat — Waiting for the device to reconnect · .44-3f2a91c4`
  - `↗️ type1-voucher [SMCS-1902] [1] — Continued in [2] · .19-8b40d2e7`
  - `✅ coin-rebrand [SMCS-1699] — Opened the develop PR · .44-1afc7a39`
- Use one status:

| Status | Meaning |
|---|---|
| `⏳` | Work is active. |
| `🚨` | Progress requires user or external intervention. |
| `↗️` | This session handed unfinished work to a successor. |
| `✅` | The outcome exists and has fresh completion evidence. |

## Fields
- Machine marker (`<host>-<sid8>`): place last, assign once, and keep fixed across status, subject,
  handoff, or compaction changes.
- Discover `host` live as the last octet of `tailscale ip -4` with a leading dot (`.44`), and read
  `sid8` from the first 8 chars of `CLAUDE_CODE_SESSION_ID` (matching
  `~/.local/state/agent-hooks/`, never parsed from a transcript filename).
- Confirm no live `ListAgents` row carries the marker before reuse, extending to 12 chars on a
  collision; no field of the title is the address.
- Ticket: copy verbatim (preserving case) from the user's message, branch, issue, or inspected
  evidence; never infer one.
- Stable subject: use a short noun phrase describing the work that survives retries, compaction, and
  handoff; exclude model names, commands, filenames, chat phrasing, and generic `task` or `work`.
- Handoff sequence: count session boundaries (not turns or agents), adding `[1]` on the first
  handoff and incrementing per successor while keeping ticket and subject unchanged.
- Outcome: state the current target, exact unblock needed, successor, or verified result in one line
  with identifying words first.

## Cross-session addressing
- Address peers by `bridgeSessionId` rather than title; resolve your own from the live disk
  registry:

```bash
jq -r 'select(.sessionId==env.CLAUDE_CODE_SESSION_ID) | .bridgeSessionId' \
  ~/.claude/sessions/*.json
```

- Send with `to: "bridge:<bridgeSessionId>"`, or reply by copying an incoming message's `from`
  value verbatim.
- Name delivery is a fallback requiring the exact full name from a current `ListAgents` row
  (optional trailing ` [ref]`; prefixes never deliver, and `to` is capped at 300 chars by the tool
  schema).
- Never test a beta build of a mod or skill (unreleased: no version bump pushed, or still under
  test) through the user's working session (no peer message asking it to reload, try, or report);
  only a released version (bump pushed, plugin or skills updated) may ask a session to reload.

## State transitions
1. When a non-trivial goal becomes clear, set `⏳`.
2. When progress needs user or external action, set `🚨` and name that exact action (keep `⏳` for
   transient errors the agent can repair).
3. When work resumes, return to `⏳`.
4. Before handoff, rename the predecessor to `↗️`, add or retain `[n]`, name `[n+1]` as the
   successor, and start the successor as `⏳` with `[n+1]`.
5. Set `✅` only when `judgment-rubrics.md` permits a completion claim, stating the achieved result
   rather than the activity.
- Never rewrite a `✅` title for follow-up work; start a new active session and increment the
  handoff sequence if continuing the chain.
- Re-check title state at every turn end where work started, stalled, blocked, handed off, or
  completed; on resume or compaction recovery, re-derive status from live evidence and rename if
  stale.

## Rename gate
- Rename only when the non-trivial goal first becomes clear, or when status, stable subject,
  material outcome, handoff sequence, or verified completion result changes.
- Skip renames for tool calls, minor progress, retries, or repairable failures; normalize whitespace
  and ` — ` before comparing, and keep the existing title if unchanged or unsupported by evidence.

## Runtime control
- Codex uses its native title control; Claude Code runs `ctx_execute` (`language: "shell"`) to match
  `/rename`:
1. Cloud title (`claude.ai` app): resolve `cse_…` via the `## Cross-session addressing` query on the
   on-disk registry (never from a transcript dump, which can overwrite an archived session),
   replace `session_` with `cse_`, stop and report if 0 or >1 rows match, and run via `ctx_execute`:

   ```bash
   TOKEN=$(security find-generic-password -s "Claude Code-credentials" -w \
     | jq -r .claudeAiOauth.accessToken)
   curl -sf -X PUT "https://api.anthropic.com/v1/code/sessions/<cse_id>" \
     -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
     -H "anthropic-version: 2023-06-01" -H "anthropic-beta: oauth-2025-04-20" \
     -d '{"title":"<title>"}'
   ```

2. Local title (`claude --resume` list): when `claude-agent-sdk` (pip) is installed, call
   `rename_session('<session-uuid>', '<title>', '<cwd>')`; skip silently if absent.
- Because the undocumented endpoint returns 200 even on a wrong-session write, always confirm via
  `ctx_execute` with `GET /v1/code/sessions/<cse_id>` using the same `anthropic-*` headers and read
  `.response_shape.title` (not `.title` or `.session.title`, which return `null`).
- On a missing credential, non-200 response, or confirmed mismatch after checking the read path,
  report the failure, give the exact `/rename <title>` command once, and leave the title unchanged.
