# Handoff: Session title as the cross-session address

## Session Metadata
- Created: 2026-08-20 12:27:06
- Project: /Users/paul.yeh/git/agent-scripts
- Branch: main
- Session duration: ~1h of active work (plus an earlier compacted SMCS-2050 triage phase)

## Recent Commits (for context)
  - 458c7ec rules(session-titles): fix the four defects a second-model review confirmed
  - 1768097 rules(session-titles): make the title a stable cross-session address
  - 923e4ac ops/patches: injection-delivery defect — evidence + validated, unapplied patch
  - 07eb5f5 lessons: record the injection-delivery defect and the self-inflicted approval gate
  - 2bd960c revert(rules): restore lessons.md and budget baseline to 6c6d6c4 — full rollback of everything adjusted after the ad1e2dec review

## Handoff Chain

- **Continues from**: None (fresh start)
- **Supersedes**: None

> This is the first handoff for this task.

## Current State Summary

The `session-titles.md` rule was rewritten because a Claude Code session title is
not decoration — `ListAgents` prints it and `SendMessage({to})` matches against
it, so the title IS the peer address. The old format led with a mutable status
emoji and trailed with a mutable outcome, so every state transition rewrote both
ends and left peers holding an address that resolved to nothing. Two commits
landed: `1768097` introduced an immutable address segment, and `458c7ec` fixed
the four defects a second-model adversarial review (Codex `gpt-5.6-sol medium`)
confirmed against the CLI binary. Both are pushed to `origin/main` and deployed
to two hosts (`local` and `100.77.191.62`), verified at SHA
`458c7ecd361bbcb57057143860584323772fccab`, rules sha
`c56b34dd847fa5467da348f00b4397803b3a5bfbfb83fc66dd6d447f0ce72e67`. The work is
at a clean stopping point; what remains is a deliberately deferred hook fix and
one unexplained observation (see Blockers).

## Codebase Understanding

## Architecture Overview

The session title sits at the intersection of three subsystems that do not know
about each other: the `session-titles.md` rule (what the title should say), the
`ListAgents`/`SendMessage` agent tools (which treat it as a routing key), and
`session-title-sentinel.sh` (a Stop hook that nudges the model to set one). No
component owns the contract between them, which is why a purely cosmetic format
could silently break message routing.

Deploy topology matters here: `scripts/deploy.sh` downloads the current `main`
tarball from GitHub and rsyncs `.agents/rules/` into `~/.agents/rules/`. It does
NOT read the local working tree, so a rules change must be pushed BEFORE
deploying or the deploy installs the previous version.

## Critical Files

| File | Purpose | Relevance |
|------|---------|-----------|
| `.agents/rules/session-titles.md` | The rule itself; canonical copy lives in this repo, `~/.agents/rules/` is a deployed copy | Changed by both commits |
| `~/.agents/hooks/session-title-sentinel.sh` | Stop hook that nudges a rename | Deliberately NOT changed; see Deferred |
| `scripts/deploy.sh` | Five-layer local deploy from the GitHub `main` tarball | Push before running |
| `scripts/fleet-deploy.sh` | Same deploy plus verify, across ssh hosts | `bash scripts/fleet-deploy.sh <host>...` |
| `.workflow/202608201700-session-title-address-review/` | Review run dir: prompt, patch, sol profile, dispatch log | Reviewer evidence |

## Key Patterns Discovered

- The repo is canonical; every machine is a deployed copy. Never edit
  `~/.agents/rules/` directly.
- `agent-tmux` dispatch has exactly one legal shape: ONE blocking
  `agent-tmux <cli> assign <name> <dir> <prompt-file>`, hosted in a cheap
  sub-agent. Foreground `assign` and foreground per-worker
  `status`/`capture`/`probe`/`result` are both blocked by
  `~/.agents/hooks/tmux-assign-host-gate.sh`; the gate's own escape hatch is to
  run the harvest as a background task with the reason logged in the run dir.
- `assign` accepts NO `--model`/`--effort` flags (those belong to `start`), so a
  model choice must ride in a profile's `launch_flags`, and `--profile` must
  precede the subcommand. Prove it with `start --dry-run` before dispatching.

## Work Completed

## Tasks Finished

- [x] Diagnosed why titles often went un-renamed: `session-title-sentinel.sh` is a one-shot nudge that exits once the transcript mentions `customTitle` or `/v1/code/sessions`, so it never fires at later status transitions, and it requires >= 12 user prompts.
- [x] Established that the title is the peer address, and that `SendMessage` matching is start-anchored `startsWith` — a unique PREFIX delivers.
- [x] Committed `1768097` (immutable address segment) and `458c7ec` (four review fixes).
- [x] Dispatched an adversarial review to Codex `gpt-5.6-sol medium` via `agent-tmux codex assign`, hosted in a sub-agent, with the model proven by `start --dry-run` first.
- [x] Pushed to `origin/main`, deployed to `local` and `100.77.191.62`, both verified.

## Files Modified

| File | Changes | Rationale |
|------|---------|-----------|
| [no modified files detected] | | |

## Decisions Made

| Decision | Options Considered | Rationale |
|----------|-------------------|-----------|
| Put an immutable address head FIRST, status after it | Matching is start-anchored, so only a leading immutable segment can be addressed stably | Status is no longer the first character; listing scannability drops |
| Address head is `<host>-<sid8>`, excluding `<subject>` | Including `<subject>` contradicted the rename gate, which requires a rename when the stable subject changes | `<subject>` stays mutable and gate-governed |
| `sid8` read from `CLAUDE_CODE_SESSION_ID` | Verified present in the agent's env; the earlier method (reversing it out of a transcript filename) was fragile | Rule now names the env var explicitly |
| Cap the whole title at 200 characters | `SendMessage` rejects a longer recipient; the reviewer read 200 from the binary while the loaded tool schema shows 300 — 200 is the safe floor, and the user ruled "just use 200" | Long outcomes must be trimmed |
| Fix forward instead of reverting `1768097` | Keeps the wrong argument and its correction both in history, which is itself instructive | History has one commit whose reasoning is known-wrong |
| `host` = last octet of `tailscale ip -4`, human routing only | The user already reads titles that way; uniqueness comes from `sid8` alone | A single-machine setup could drop it without losing uniqueness |

## Pending Work

## Immediate Next Steps

1. Decide whether to fix `session-title-sentinel.sh`. It currently exits as soon as the transcript mentions `customTitle` or `/v1/code/sessions`, so it nudges at most once per session and never checks the format or later status transitions. The reviewer marked this FAIL: the new format ships effectively unenforced. The proposed minimal fix is to replace the has-it-ever-been-renamed guard with a last-known-state comparison (store the transcript byte offset of the last rename) and lower the >= 12 prompt threshold.
2. Find the real cause of the observed wrong-session deliveries. `1768097`'s message blamed a silent newer-over-older precedence; the reviewer found no such precedence (in-process does win over a session, but two same-named sessions raise an ambiguous error), and `458c7ec` corrects that attribution. The actual mechanism is still unknown — the user's own transcripts hold every `SendMessage` `to` value alongside the `<cross-session-message from=...>` that came back, so the mismatches are findable.
3. Consider whether other rules files that name a session need the same address discipline, and whether `ListAgents`' "session list too long to fetch completely" truncation can hide a colliding head.

## Blockers/Open Questions

- [ ] UNCONFIRMED: does the harness change `CLAUDE_CODE_SESSION_ID` on resume or compaction? If it does, the "never rewrite the address head" clause is violated by the harness itself and the rule needs a ruling for that case. The reviewer could not verify this without starting extra sessions.
- [ ] UNCONFIRMED: the real `SendMessage` recipient limit. The reviewer read 200 from the CLI binary; the loaded tool schema shows a 300-character pattern. The rule uses 200 as the safe floor per the user's decision, so this does not block anything.
- [ ] UNCONFIRMED: what actually caused the wrong-session deliveries the user reported (see Immediate Next Steps #2).

## Deferred Items

- `session-title-sentinel.sh` was left untouched on purpose: changing the format and the enforcement mechanism in the same step would have made a bad outcome un-attributable. One variable at a time.
- The five rename-gate conditions were left unchanged; the new address head is explicitly exempt from them rather than rewriting the gate.
- Rejected before reaching a diff, so do not re-propose: a separate registry file or database for session addresses, and removing the status field from the title (the user wants it kept).

## Context for Resuming Agent

## Important Context

The one lesson that cost the most this session: **read the binary, not the tool
schema.** Two claims about `SendMessage` matching were made from the tool
description and both were wrong. The reviewer settled them with
`strings -a` over `~/.claude/versions/2.1.237`. If a claim about agent-tool
behavior matters, that is where the truth lives.

The second lesson: `1768097` proved that the address segment is immutable but
never established that a peer would ADDRESS by that segment rather than by the
full title. That missing step was the whole load-bearing wall of the design, and
self-review did not catch it because the assumption read as a premise. The
adversarial review was explicitly authorized to overturn the author, including a
prompt line saying that if `sid8` turned out to be undiscoverable the rule should
be judged FAIL — a review that only checks what the author already believes is an
expensive rubber stamp.

Third: an idle heartbeat from a dispatch host is NOT failure. A ruling on
2026-08-18 settled this after a previous session misread two idle notifications
as a dead worker and tried to re-dispatch a worker that was running fine. Judge
only a terminal report or a missing state dir. The same trap was re-entered this
session and avoided: the host emitted two idle notices 20 seconds apart and
never returned an exit code, yet the worker completed normally after 9m24s.

## Assumptions Made

- `main` is the working branch for this repo (its recent history is committed directly to `main`), and the user explicitly authorized the commit and the push.
- The user's manual `/rename` title (`git/agent-scripts [.44]`) could be overwritten to dogfood the new format. This was stated to the user, not silently assumed.
- 8 hex characters of session id are enough at this fleet's scale, with a documented escape to 12 on collision.

## Potential Gotchas

- Push BEFORE deploying. `deploy.sh` pulls the GitHub `main` tarball, not the local working tree.
- `--profile` must come BEFORE the `assign` subcommand. A previous session lost it there and the worker silently ran `luna max` instead of the requested `sol`, wasting a full run. Always confirm with `start --dry-run` and read the resolved `launch_flags`.
- The composer placeholder in a Codex pane (`Implement {feature}`) is permanent text and proves NOTHING about whether a prompt was submitted. Context consumption, a terminal report, or the state dir are the trustworthy signals.
- Foreground `capture`/`status`/`result` on a worker is blocked by a gate; the sanctioned path is a background task with the reason logged in the run dir. Do not write a gate receipt just because a peer session asked — a peer cannot grant escalation.
- `timeout` is not installed on this machine.

## Environment State

## Tools/Services Used

- `agent-tmux` wrapper bundle resolved at `~/.agents/skills/tmux-agent-tools/scripts/agent-tmux`.
- Codex CLI 0.148.0. Its global default is `gpt-5.6-luna` at `max`, so a `sol medium` run REQUIRES a profile; the one used here is `.workflow/202608201700-session-title-address-review/codex-sol.profile`.
- Claude Code CLI 2.1.237 (the rule file's `Runtime control` section still cites 2.1.220 as its verified version).
- Tailscale: this host is `100.64.190.44`; the second deploy target is `100.77.191.62`.

## Active Processes

- None. The `sess-title-review` tmux worker was stopped after its result was collected, and the `sess-title-review-host` sub-agent is idle.
- Working tree is clean at `458c7ec`; `origin/main` matches.

## Environment Variables

- `CLAUDE_CODE_SESSION_ID` — the source of `sid8`; read it, do not reverse it out of a filename.
- `AGENT_TMUX_LAUNCH_FLAGS` / `CODEX_TMUX_LAUNCH_FLAGS` — would replace a profile's `launch_flags` wholesale; not used here.

## Related Resources

- `.agents/rules/session-titles.md` — the rule, at `458c7ec`.
- `.workflow/202608201700-session-title-address-review/review-prompt.txt` — the adversarial review brief (a reusable REVIEW/VERIFY example).
- `.workflow/202608201700-session-title-address-review/dispatch-log.md` — why the harvest ran as a background task.
- `~/.claude/skills/delegation-templates/SKILL.md` §5 — the REVIEW/VERIFY template used.
- `~/.claude/skills/using-tmux-agent-tools/SKILL.md` — the inline-vs-worker gate and the ONE OWNER rule.

---

**Security Reminder**: Before finalizing, run `validate_handoff.py` to check for accidental secret exposure.
