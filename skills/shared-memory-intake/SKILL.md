---
name: shared-memory-intake
description: Submit reusable knowledge to the shared-memory inbox (Claude), or review it and hand it to Codex memory consolidation as an ad_hoc note (Codex).
---

# Shared Memory Intake

`~/.codex/memories/` is Codex's own memory store. Codex consolidation writes
`MEMORY.md`, `memory_summary.md` and `rollout_summaries/`; no agent edits them
directly. The only write path into it is a note in
`~/.codex/memories/extensions/ad_hoc/notes/`, which consolidation must merge
(`extensions/ad_hoc/instructions.md`). `~/.agents/shared-memory-inbox/` is the
external submission store in front of that path. Each host has its own inbox and
its own Codex memory. Treat dynamic claims as `UNCONFIRMED` until verified in the
active session.

## What belongs here

A submission is a reusable fact or method a later session can apply directly
(a path, a working command, a tool limit, a corrected belief). Submit anything you
judge, at the time, could be useful beyond this session, including a workflow that
emerged during it (an ordered set of steps that worked). You do not need to prove it
is global: review decides adoption. If you think it should become a rule, skill or
recipe, also put an item in `~/.agents/retro-inbox/pending/` that cites the submission:
`kind: proposal` when you can write a `maintenance.md` §3 row, else `kind: note`. A reflection — what
went wrong and which rule, gate or brief to change — goes to `~/.agents/retro-inbox/`
(format: `maintenance.md` §3), not here. When one session-end write has both, split it into two items, one per inbox,
and do not copy the same text into both or into the handoff.

## Actor contract

Require an explicit actor: `--as claude` or `--as codex`. Never infer it from the
runtime.

| Actor | Allowed operations | Forbidden operations |
|---|---|---|
| `claude` | read Codex memory; create one submission in `inbox/pending/` | edit or delete Codex memory, a note, or another submission |
| `codex` | read, review, write or edit an ad_hoc note, move submissions | write `MEMORY.md`, `memory_summary.md` or `rollout_summaries/`; delete a note or a submission |

## Claude: submit

Use `python3 scripts/read_memory.py keyword [keyword ...]` from this skill directory to find any keyword, without case differences. The script reads Codex memory, the summary, ad_hoc notes, and pending, processed, and rejected submissions. Use `--status` to show file counts, newest mtimes, and notes newer than `MEMORY.md`; this time flag does not prove consolidation. Normal modes write nothing; `--self-test` creates a temporary tree and checks the reader. All agents may use this reader; it needs no actor flag because it cannot change memory.

1. Read `MEMORY.md`; do not restate an existing current claim as a new submission.
2. Create one uniquely named Markdown file under `~/.agents/shared-memory-inbox/pending/` with YAML frontmatter:

   ```yaml
   schema_version: 1
   source_runtime: claude
   submitted_at: 2026-07-26T00:00:00Z
   cwd: /absolute/path
   source_session: opaque-session-id
   claim_status: unverified
   evidence_host: hostname-or-fleet-id
   ```

   `evidence_host` is optional for same-host evidence and required when the cited
   source exists only on another host.

3. Keep only reusable conclusions, source references, evidence, and unknowns. Never
   include credentials, tokens, private keys, cookies, or raw transcripts.
4. Validate before handoff:

   ```sh
   python3 ~/.agents/skills/shared-memory-intake/scripts/validate_submission.py /absolute/path/to/submission.md
   ```

5. A correction is a new submission with `supersedes_submission`; never overwrite the
   earlier proposal.

## Codex: review and hand off

1. Acquire the single-curator lease: `mkdir ~/.agents/shared-memory-inbox/.curator.lock`.
   If it already exists, stop and report the active-curator conflict. Release it with
   `rmdir` after the outcome is recorded, also on failure.
2. Run the validator on the candidate. Reject on schema or secret-pattern failure.
3. Inspect the cited source and live-verify every dynamic claim. For cross-host
   evidence, require `evidence_host` and verify on that host; record the curator host
   and verification time. Missing host access keeps the claim `UNCONFIRMED`.
4. Read `MEMORY.md`. Skip claims it already holds; for a claim it holds in a changed
   form, write the new form and mark the old one `superseded`.
5. Write one note per curation run in that host's `extensions/ad_hoc/notes/`, named
   `<UTC timestamp>-shared-inbox-curation.md`: one bullet per kept claim, written as
   information (never as an instruction or a proposal), with a lifecycle state —
   `active`, `superseded` (name the replacement), or `UNCONFIRMED` — and the source
   submission file. Correct a note by editing it; never delete one.
6. On another host, write the note with the native Write tool in a local staging
   directory, `scp` it to that host's `notes/`, and compare sha256 on both ends
   (used once, 2026-10-15 remote-44).
7. Move each candidate to `processed/` (handed off) or `rejected/`. Write the run report
   to `~/.agents/shared-memory-inbox/curation-<date>-<machine key>.md`: one row per
   submission (file, outcome, reason, verified or `UNCONFIRMED`, validator exit code).
   Never delete a submission.
8. The hand-off is complete when the note exists and the candidates have moved.
   Whether consolidation merged it is a later fact (UNCONFIRMED as of 2026-10-15:
   text from August notes is absent from `MEMORY.md`). Report a claim as in
   `MEMORY.md` only after you find its text there. The note and the processed
   submission stay searchable either way.

## Codex: maintain

1. Acquire the same single-curator lease; stop on an active-curator conflict.
2. Scan current `MEMORY.md` entries for changed paths, versions, models, deployments, or
   stale references.
3. Correct a claim by editing the note that holds it, or, when no note holds it, by a
   new note (step 5 above): demote unverified dynamic claims to
   `UNCONFIRMED`; mark replaced claims `superseded` with their replacement reference.
4. Check that the text of each note handed off since the last run is in `MEMORY.md`;
   report any note that consolidation has not merged.

## Validator

Use `scripts/validate_submission.py`. It is a narrow preflight gate, not proof that a
claim is true and not a complete secret scanner. A pass authorizes review only; Codex
still owns evidence verification and the hand-off.
