# Handoff: agy dispatch forensics → typed proxy contract → kernel simplicity + gate debt

## Session Metadata
- Created: 2026-08-30 20:58:13
- Project: ~/github/agent-scripts
- Branch: main
- Session duration: ~9h (one compaction at ~11:35)

### Recent Commits (for context)
  - cb0c80b rules(dispatch): the ~600s reap binds the foreground call only — measured (#22)
  - 6b6e3dc rules(gates): retire the runnable-check heuristic — instructions cover it (#21)
  - 9185d96 rules(kernel): retire the lean char cap — terseness by review, not by a number (#20)
  - e5309d4 rules(kernel): ctx routing outranks a named tool; access path binds downward only (#19)
  - 4c3163c rules(kernel): requested access path binds; no unrequested UI automation (#18)

## Handoff Chain

- **Continues from**: [2026-08-28-113131-review-gate-and-cursor-metrics.md](./2026-08-28-113131-review-gate-and-cursor-metrics.md)
  - Previous title: Read-before-you-run review gate + Cursor added to session metrics
- **Supersedes**: None

> Review the previous handoff for full context before filling this one.

## Current State Summary

Everything opened this session is closed, landed on `main`, and deployed. The session began as a forensic attribution of a dispatch failure (session `c48c0d3a`, worker `agy`, 2026-08-30 density review) and ended having rewritten how supervision proxies are briefed, added two blocks of anti-over-engineering rules to the kernel, and cut the gate machinery those rules made indefensible. Both repos are clean: `agent-scripts` at `cb0c80b`, `tmux-agent-tools` at `3b15f01`. Last deploy `DEPLOY OK — all layers PASS` at `cb0c80b`, runtime `~/.claude/CLAUDE.md` ≡ `~/.codex/AGENTS.md` verified. Nothing is half-finished; the next session starts on new work, not on cleanup.

## Codebase Understanding

## Architecture Overview

Two repos, one deployment path. `ohyeh/agent-scripts` holds `global/` (the kernel, in two editions), `.agents/rules/` (routed rules), `.agents/hooks/` (14 hooks), `skills/`, and `scripts/`. `ohyeh/tmux-agent-tools` holds the `agent-tmux` wrapper and its skills. `scripts/deploy.sh` does NOT copy the local worktree — it resolves a pinned SHA from GitHub `refs/heads/main`, downloads that tarball, overwrites every runtime layer (`~/.claude/CLAUDE.md`, `~/.codex/AGENTS.md`, `~/.agents/rules/`, skills, hooks), self-checks each layer, and appends host + SHA to `~/.local/state/agent-scripts/deploy-log.jsonl`. So: merge to `main` first, deploy second. A deploy killed mid-flight can leave files written but nothing logged — check the log's last SHA, not just the file contents.

The kernel has two editions: the solid one (`global/CLAUDE.md` and `global/AGENTS.md`, which MUST stay byte-identical — `global-identical` invariant) and `global/kernel-lean.md`, fetched over HTTP by `WEB-AGENTS.md` for agents that cannot run deploy. As of #20 the lean edition has no hard character cap.

Kernel edits take effect at SESSION LOAD. A running session keeps the old text until restart; only new sessions see a change. Verify rule behaviour in a fresh session, never in the one that shipped it.

## Critical Files

| File | Why it matters | Notes |
|---|---|---|
| `global/CLAUDE.md` + `global/AGENTS.md` | The kernel, solid edition | Must stay byte-identical; edit both in the same change |
| `global/kernel-lean.md` | Kernel for network-only agents | Consumed by `WEB-AGENTS.md`; no hard cap since #20 |
| `scripts/check-rules-invariants.mjs` | 17 invariants incl. byte budgets | `--accept` records deliberate growth |
| `evals/context-budget-baseline.json` | The byte baselines | Only `--accept` what actually grew |
| `.agents/rules/model-dispatch.md` §4 | Supervision proxy contract | Holds the measured 600s/781s numbers |
| `skills/delegation-templates/SKILL.md` | Dispatch shapes A/B/C | Shape C is the proxy brief schema |
| `scripts/check-bol-prompt.sh` | Agent brief validator | Field checks only since #21 |
| `.agents/hooks/bol-prompt-gate.sh` | PreToolUse actuator for the above | Reads PreToolUse JSON, not raw text |
| `scripts/test-bol-prompt-proxy.sh` | 6 proxy-contract cases | D/E/F encode Codex's counterexamples |
| `scripts/test-jsonl-hooks-smoke` | Smoke for all JSONL hooks | Updated in #21 |
| `.workflow/202608301830-result-path-silence/` | This session's run dir | Findings, review, closing decisions, probe log |

## Key Patterns Discovered

The invariant runner distinguishes two kinds of limit: a BASELINE (`globalBytes`, `rulesBytes`, `skillDescBytes`) that ratchets with `--accept`, and a fixed CEILING (the former `kernel-lean-char-limit`) that never accepts. Also note the lean cap counted CHARACTERS, not bytes — CJK text made 5763 bytes read as 5702 chars. That cap is now gone.

`agent-tmux` is `#!/usr/bin/env zsh`; `bash -n` reports a false syntax error on a pre-existing glob qualifier `(N)`. Use `zsh -n`.

Hook validators resolve to the DEPLOYED copy (`~/.agents/hooks/...`), not the repo copy. A test that pipes into a hook is testing production until you make it do otherwise — this bit us once and the fix (an env override) was later cut as an unnecessary config surface.

## Work Completed

## Tasks Finished

- [x] Forensic attribution of the `agy` dispatch failure — 5/5 claims verified
- [x] `tmux-agent-tools` #322: sentinels bias to under-marking; `assign` warns on unconfirmed result-path delivery
- [x] `agent-scripts` #15: `pending` as terminating procedure, teardown order, no-verbatim-brief
- [x] #16: typed proxy contract (`PROXY_MODE` / `WORKER_ARTIFACT` / fixed REPORT), dispatch shape C
- [x] #17: kernel simplicity defaults + cut #16's extra surfaces
- [x] #18: access-path / no-unrequested-UI-automation clauses
- [x] #19: ctx routing outranks a named tool (user correction)
- [x] #20: retire the lean character cap
- [x] #21: retire the runnable-check heuristic
- [x] #22: measured background-task survival, closed Codex rec 5 and 6

## Files Modified

See the seven PRs above; the run dir carries the analysis artifacts.

## Decisions Made

| Decision | Rationale | Alternative rejected |
|---|---|---|
| Attribute the failure to the wrapper + parent, NOT to `agy` | `agy`'s own transcript shows the prompt arrived but the result path never did | Blaming the CLI or the sonnet proxy — both exonerated by evidence |
| Typed proxy contract instead of prose scanning | Codex `VERDICT: BLOCK` — prose scanning false-positives on runbook/review/debug briefs and is evaded by paraphrase | The originally proposed keyword hook |
| Unmarked briefs are never checked | Denying them resurrects the exact counterexample Codex blocked | A "safety net" for unmarked assign-briefs |
| Keep the field check, cut its extras (user chose option 2) | User ruling; the gate stays, its config surface and error taxonomy go | Deleting the gate entirely (option 1) — still open in principle |
| ctx routing outranks a named tool | User ruling "ctx 優先度高啊" | My earlier framing that Precedence let a named `curl` win — wrong |
| No exception clause reconciling new rules with existing gates | Writing an exception is opening a back door for yourself | Grandfathering the existing gate群 |
| Cut Codex rec 6 (sibling ledger) rather than build it | Dual bookkeeping against records we already keep | Building the ledger |
| Measure the 600s question once, write the number, no standing test | A permanent fixture asserting a harness detail we do not control | Codex rec 5's smoke test |

## Pending Work

## Immediate Next Steps

1. Nothing is outstanding from this session. Start from the user's next request.
2. If continuing the gate-debt thread: the remaining 13 hooks were audited and judged compliant (they measure state, not judgment). A stricter pass would revisit `bol-prompt-gate.sh`'s GOAL/ACCEPTANCE/REPORT presence check — the last prose-shape check left.
3. If the user revisits it: deleting the BOL field check entirely (option 1) remains an open design call they declined to make today.

## Blockers/Open Questions

- [ ] None blocking.
- [ ] Open by user choice: whether the BOL gate should exist at all.

## Deferred Items

- Nothing deferred. All three items carried into this session (background-task survival, Codex rec 5, Codex rec 6) were closed in #22, two of them by deciding not to build.

## Context for Resuming Agent

## Important Context

The single most useful thing to carry forward is the incident's mechanism, because it explains three rules that otherwise look arbitrary. `agent-tmux` prepends two instruction lines to a worker's first prompt (the result path and a scope guard) and confirms delivery by scraping the pane for the text. A TUI composer is a redraw region, so "the text was visible" is not "the CLI submitted it". During a 95-second boot, `agy` submitted from `# GOAL` onward and dropped both prefixes — one prefix produced a FALSE NEGATIVE (no sentinel, harmless re-send) and the other a FALSE POSITIVE (sentinel written for text never received, permanently suppressing re-injection). A worker that never learned its result path can never write `result.json`, so its `pending` is permanent, not slow. Hence: sentinels now bias to under-marking, `assign` warns when delivery is unconfirmed, and briefs embed the literal paths instead of trusting injection.

Second: a supervision proxy may not read the worker's output, so any brief telling it to "return the answer verbatim" orders something forbidden AND, when `result.json` is pending, impossible. Findings flow WORKER → `WORKER_ARTIFACT` → parent. That is what dispatch shape C encodes.

Third, and most transferable: the user's standard is anti-over-engineering, now in the kernel. Two rounds of my own work were cut under it in this session — a config surface I added to pin a test, and an error-code branch I added for tidiness. When the user says something is over-designed, cut it and do not write a paragraph defending it. Listing "what didn't violate the rule" is already defending.

## Assumptions Made

- The user's standing authorization to land this class of work on `main` across all related repos remains in force (given explicitly, twice, in strong terms).
- `advisor` confirmation before push is expected for rules/kernel changes; the advisor's own reply counts as that confirmation, no second round.
- Squash-merge + delete-branch is the house PR style.

## Potential Gotchas

- Never `git checkout <file>` to undo a scratch experiment — it silently discarded a completed edit once this session. Mutate a `mktemp` copy instead.
- The Bash tool's foreground timeout caps at 600000 ms regardless of a larger `timeout` argument; a longer wait must be a background task.
- `tmux-assign-host-gate.sh` blocks any Bash command whose TEXT contains an `agent-tmux … assign` call — including test fixtures. Put such fixtures in a script file, not on the command line.
- Deploy takes ~2 minutes and will be reaped in the foreground; always run it as a background task and confirm via `deploy-log.jsonl`.
- `evals/eval-dispatch-proxy.sh` needs a live model argument and was skipped, not run, in the #322/#15 verification.

## Environment State

## Tools/Services Used

- `gh` CLI for PRs (#15–#22 this session), `git` on `main` for both repos.
- `scripts/deploy.sh` — GitHub-pinned deploy; log at `~/.local/state/agent-scripts/deploy-log.jsonl`.
- `node scripts/check-rules-invariants.mjs [--accept]` — 17 invariants.
- `advisor` — consulted before each substantive push.

## Active Processes

- None. The 781s survival probe completed (exit 0) and its process is gone.

## Environment Variables

- None required. `BOL_VALIDATOR` existed briefly during this session and was deliberately removed.

## Related Resources

- Run dir: `.workflow/202608301830-result-path-silence/` — `findings-verified.md`, `review-item4.md`, `review-item4-findings.md` (Codex `VERDICT: BLOCK`), `kernel-block2-proposal.md`, `carried-items-close.md`, `bg-survival-probe.log`.
- Source of the simplicity rules: https://x.com/mylifcc/status/2093992615314149766
- `WEB-AGENTS.md` — the one-URL setup path for network-only agents.

---

**Security Reminder**: Before finalizing, run `validate_handoff.py` to check for accidental secret exposure.
