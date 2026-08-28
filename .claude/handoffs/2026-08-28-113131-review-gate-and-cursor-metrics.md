# Handoff: Read-before-you-run review gate + Cursor added to session metrics

## Session Metadata
- Created: 2026-08-28 11:31:31
- Project: /Users/paul.yeh/github/agent-scripts
- Branch: feat/review-agent-in-repo
- Session duration: ~2h15m (09:16–11:31 CST), session `fc159339`

### Recent Commits (for context)
  - 4a7f774 feat(skills): repo-owned defect-first-review with a read-before-you-run gate; retro Layer1 covers cursor
  - 9f6ca2e chore(hooks): mark sentinel hooks executable
  - 014b4bc fix(bol-gate): accept bare section headers
  - 5cd445e feat(context-mode): one Claude store for every runtime — codex/gemini symlink like cursor
  - 99d5fbf feat(deploy): deploy kernel to ~/.gemini/GEMINI.md when ~/.gemini exists

## Handoff Chain

- **Continues from**: [2026-08-27-014357-cursor-fleet-wrap.md](./2026-08-27-014357-cursor-fleet-wrap.md)
  - Previous title: Cursor fleet wrap (PRs open; Claude store only)
- **Supersedes**: None

> Review the previous handoff for full context before filling this one.

## Current State Summary

Started as a post-mortem of Codex thread `01a045ef`, where a delegated `review-agent` run
burned the user's quota without finishing the review it was asked for. The post-mortem
produced three verified root causes, and the user approved fixing two of them. Both fixes
are committed on branches in two repos and are **not yet pushed**. A third finding — waiting
is done wrong across the whole Codex fleet, not just in that one thread — is recorded as a
proposed lesson. The remaining work is mechanical: push, open PRs, and (only after the skill
lands on `main`) add the `skills-lock.json` entry that makes the new skill survive a deploy.

## Codebase Understanding

## Architecture Overview

Three layers matter here and they are easy to confuse.

**Skill durability.** `~/.agents/skills/` is a *managed* directory: `scripts/deploy.sh:153`
runs `rm -rf` on any subdirectory absent from `skills-lock.json`. `~/.codex/skills/.system/`
is Codex-owned (marker file `.codex-system-skills.marker`) and is replaced on every Codex
update. Therefore **the only durable home for a skill is the repo plus a lock entry**. Lock
entries carry a `skillFolderHash` computed by `npx skills` from a GitHub clone, which is why
a repo-owned skill must be pushed to the default branch *before* its lock entry can exist.
Eight skills already follow this pattern (`source: ohyeh/agent-scripts`).

**Waiting.** Codex `exec_command` has yield semantics: the call returns a cell id when the
command outlives `yield_time_ms`, and the model must re-enter via `wait` to see the result.
Every re-entry re-sends the whole context. Claude Code instead re-invokes the model when a
background task completes — measured across 392 transcripts: 153 background launches, **0**
`BashOutput` polls. The gap is harness architecture, not model discipline, and Codex exposes
no hook that can re-invoke a yielded model (9 hook events exist; all fire on the model's own
turn boundaries).

**Measurement.** `context-mode-local-insight/bin/agent-sessions.mjs` is the retro Layer 1
collector. Every emitted number is a `{value, method, tier}` triple where `method` is the
literal expression that produced it — preserve that contract in any new collector.

## Critical Files

| File | Why it matters |
|---|---|
| `skills/defect-first-review/SKILL.md` | New repo-owned skill; carries the read-before-you-run gate |
| `.agents/rules/retro-agenda.md` | Retro SOP; §Layer1 now names four CLIs (v1.7.0) |
| `.agents/rules/lessons.md` | 23 proposed entries; newest is the wait/yield lesson |
| `evals/context-budget-baseline.json` | Byte ratchet; `deploy.sh` refuses to ship while red |
| `scripts/deploy.sh:133-160` | Layer 4 — the code that deletes unlocked skills |
| `skills-lock.json` | 67 entries; **`defect-first-review` is not in it yet** |
| `../context-mode-local-insight/bin/agent-sessions.mjs` | Collector; `collectCursor` added |
| `../context-mode-local-insight/test/agent-sessions.test.mjs` | 25 tests, all passing |

## Key Patterns Discovered

Byte-budget growth is deliberate and recorded in the same diff: run
`node scripts/check-rules-invariants.mjs --accept` and let the new baseline land in the
commit. Do not edit `evals/context-budget-baseline.json` by hand.

Rules deploy by `rsync -a --delete .agents/rules/ ~/.agents/rules/` followed by a
`diff -rq` that must come back empty. Canonical is the repo; the home directory is a mirror.

Lessons are append-only and always `Status: proposed`. Graduation *deletes* the entry rather
than flipping it to `adopted`, which is why the file shows `adopted: 0` — see Gotchas.

## Work Completed

### Tasks Finished

- [x] Post-mortem of Codex thread `01a045ef` — three root causes, each backed by a re-runnable assertion
- [x] 36-hour usage survey across codex / claude / cursor / agy
- [x] Compared the Warp self-improving-agents article against the existing RETRO loop
- [x] Forked `review-agent` into the repo as `defect-first-review` with the read-before-you-run gate
- [x] Added `collectCursor` to the agent-sessions collector, with a test and a live run
- [x] Updated `retro-agenda.md` to v1.7.0 (four CLIs)
- [x] Appended the wait/yield lesson to `lessons.md`
- [x] Re-accepted both byte baselines and deployed the rules layer

## Files Modified

**agent-scripts** (branch `feat/review-agent-in-repo`, commit `4a7f774` + uncommitted lesson):
- `skills/defect-first-review/SKILL.md` (new)
- `.agents/rules/retro-agenda.md`
- `.agents/rules/lessons.md` (uncommitted at handoff time)
- `evals/context-budget-baseline.json`

**context-mode-local-insight** (branch `feat/agent-sessions-cursor`, commit `90e6001`):
- `../context-mode-local-insight/bin/agent-sessions.mjs`
- `../context-mode-local-insight/test/agent-sessions.test.mjs`

## Decisions Made

| Decision | Rationale |
|---|---|
| Fork the skill under a new name rather than edit in place | User's call: two skills named `review-agent` are indistinguishable at the call site, and the Codex copy is overwritten on update |
| Name it `defect-first-review` | Matches the skill's own language; no collision anywhere on disk (verified) |
| Window Cursor on `meta.json` `updatedAtMs`, falling back to `store.db` mtime | 6 of 17 chat dirs have a populated `store.db` and no `meta.json`; a meta-only walk silently drops 289 messages |
| Surface the fallback as `withoutMeta` rather than folding it into `unreadable` | The retro contract forbids silent measurement gaps; `unreadable` now means only "sqlite threw" |
| Bump collector schema v2 → v3 | Additive `cursor` key, but cross-CLI totals stop being comparable across the bump |
| Record the wait/yield finding as a lesson, not a hook | maintenance §1 requires two verified incidents before a mechanism is eligible; this is the first |
| Keep RETRO manually triggered | User decided explicitly; the collector fix is independent of scheduling |

## Pending Work

## Immediate Next Steps

1. Commit the `lessons.md` append on `feat/review-agent-in-repo` (invariants already pass, rules already deployed), then push both branches: `feat/review-agent-in-repo` in agent-scripts, `feat/agent-sessions-cursor` in context-mode-local-insight. Open a PR for each. **User has authorized the push; PR-vs-direct-merge was still unanswered at handoff.**
2. After `defect-first-review` reaches `main`, add its `skills-lock.json` entry — copy the repo's lock to `~/skills-lock.json`, run `npx -y skills add ohyeh/agent-scripts` and select it, copy the lock back, commit. Until this exists the skill is deleted by the next `deploy.sh` run.
3. Verify durability end to end: run `bash scripts/deploy.sh` and confirm `~/.agents/skills/defect-first-review/` still exists afterwards and that Layer 4 reports `removed 0 stale skill(s)`.

### Blockers/Open Questions

- [ ] PR or direct merge to `main`? Asked twice, not yet answered.
- [ ] Should the wait/yield lesson be folded into the kernel now, or wait for RETRO? Kernel §Execution already says "Delegated long waits: blocking/event-driven, never fixed polling" but that clause does not reach `exec_command` launch parameters — verified: the kernel contains no mention of `exec_command`, `yield_time_ms`, or launch yield.

### Deferred Items

- Scheduling RETRO Layer 1 — user explicitly chose to keep RETRO manual. The fleet argument (Layer 1 cost scales with machine count, Layer 2 adjudication does not) is recorded but not acted on.
- Making lesson graduation visible without `git log -S` — identified, not designed.
- W35 RETRO itself. Last full retro was W33 (08-14); last metrics file is `evals/retro-metrics/2026-W34.json`. The 36h of usage measured this session has never been through any retro.

## Context for Resuming Agent

## Important Context

**The skill is not safe yet.** `skills/defect-first-review/SKILL.md` exists in the repo but has
no `skills-lock.json` entry. `scripts/deploy.sh:153` deletes any directory under
`~/.agents/skills/` that the lock does not name, and the layer then hard-fails if anything
unexpected remains. Running a deploy before step 2 is done will remove the deployed copy.
This is exactly the trap that made the original `review-agent` un-editable, so do not
re-create it.

**Token numbers need their basis stated.** Codex rollouts record `total_token_usage` as a
running sum of each turn's *entire* context, ~95–97% of which is cache reads. Quoting the
total as "tokens burned" overstates real consumption by roughly 20×. Always give both: for
thread `01a045ef`, total 9.99M vs 480k uncached input + 29k output. The user caught this
error once already.

**The user maintains many machines.** Everything measured this session covers only this host
(`.62`). `retro-agenda.md` §5 requires per-machine collection; nothing here has been checked
on the other hosts.

## Assumptions Made

- `npx -y skills add ohyeh/agent-scripts` can add a single skill to an existing lock without
  disturbing the other 67 entries — **not verified**; check the resulting diff before committing.
- The Cursor blob prefix `{"role":` is stable across Cursor versions. It held for all 17 chat
  DBs on this host, but it is a heuristic over an undocumented store.
- `retro-agenda.md` §Layer1 says Layer 1 runs `node bin/cli.mjs agent-sessions --days 7`; the
  cursor collector was exercised with `--days 2` and by unit test, not with the full 7-day run.

## Potential Gotchas

`lessons.md` shows `Status: adopted` zero times. That does **not** mean nothing was ever
adopted — graduated entries are deleted outright (see commit `cf4d724`, which removed an
adopted entry whose gate had shipped). Judging the loop's health from the file alone gives
the wrong answer; use `git log -S 'Status: adopted' -- .agents/rules/lessons.md`.

Codex rollout JSONL uses two different envelopes for tool calls: most tools appear as
`custom_tool_call`, but `wait` appears as `function_call`. A counter that matches only the
first silently returns 0. This produced a false "0 waits" result in this session and a false
PASS on a one-sided time-delta assertion — treat a zero count from a new parser as suspect
until proven.

The `find` order over the two `01a045ef` rollout files is not chronological. Deriving a
session start time from "the first file's first record" gives a negative elapsed time.

### Environment State

### Tools/Services Used

- `context-mode` MCP (`ctx_execute`, `ctx_batch_execute`, `ctx_fetch_and_index`, `ctx_search`) — all bulk transcript analysis ran in the sandbox; raw bytes never entered context
- `node --test` for the collector suite; `node scripts/check-rules-invariants.mjs` for the repo gates
- Claude Code session-title API (`PUT /v1/code/sessions/<cse_id>`) — intercepted for `curl`, so it must be called through `ctx_execute`
- Stop hooks `claim-evidence-gate.sh` and `session-title-sentinel.sh` fired repeatedly and were satisfied by re-running assertions; expect the same

### Active Processes

- None. No servers, workers, or tmux sessions were started.

### Environment Variables

- `CLAUDE_CODE_SESSION_ID` — used to resolve this session's registry row
- No secrets were read or written; the OAuth token is fetched from the macOS keychain at call time and never persisted

## Related Resources

- Codex thread under post-mortem: `~/.codex/sessions/2026/08/28/rollout-2026-08-28T09-*-01a045ef-*.jsonl` (two files, one session)
- Warp article compared against RETRO: https://claude.com/blog/how-warp-builds-self-improving-agents-on-claude
- `~/.agents/rules/retro-agenda.md` — the outer-improver SOP this session mapped to Warp's loop
- `~/.agents/rules/maintenance.md` §1 — the edit-permission matrix that governs every file touched here
- Last full retro artifacts: `.workflow/202608141609-weekly-retro/` (note `approval-diffs.md` — the repo's equivalent of Warp's improver PR)

---

**Security Reminder**: Before finalizing, run `validate_handoff.py` to check for accidental secret exposure.
