# Handoff: PreCompact 指令 hook + session-handoff 自維護版上線

## Session Metadata
- Created: 2026-09-01 18:28:48
- Project: ~/git/agent-scripts
- Branch: main
- Session duration: [estimate how long you worked]

### Recent Commits (for context)
  - e68253f chore(skills): point session-handoff at the vendored copy
  - aa63378 feat(handoff): PreCompact instruction hook + vendored session-handoff skill
  - b021c80 lessons: the wait contract has an empirical basis — 4/9 delegated waits had no deadline in 24h
  - 93cc764 rules(waits): give the bounded-wait contract an owner; fix the lean edition
  - 1b1589e feat(deploy): retire the byte budget, check deployment drift by provenance

## Handoff Chain

- **Continues from**: [2026-08-30-205813-dispatch-forensics-kernel-simplicity.md](./2026-08-30-205813-dispatch-forensics-kernel-simplicity.md)
  - Previous title: agy dispatch forensics → typed proxy contract → kernel simplicity + gate debt
- **Supersedes**: [list any older handoffs this replaces, or "None"]


## Current State Summary

Shipped and deployed. Two commits on `main` (`aa63378`, `e68253f`), `deploy.sh`
returned `DEPLOY OK — all layers PASS`, exit 0, 27 PASS / 0 FAIL. Two things
landed: a PreCompact hook that steers Claude Code's auto-compaction summarizer,
and a vendored + slimmed `session-handoff` skill now sourced from this repo
instead of upstream. Both were reviewed twice, by advisor and by codex in a tmux
worker; the second round returned VERDICT: BLOCK with three real FAILs, all
fixed before commit. Nothing is in flight.

## Codebase Understanding

### Architecture Overview

`deploy.sh` installs in layers and is fail-closed: every layer prints PASS or
exits nonzero. Two deployment modes exist and they behave very differently —
`CLONE_TRACKED` is detected by `~/.agents/rules` being a symlink. On this host it
is a real directory, so `CLONE_TRACKED=0` and deploy downloads the remote `main`
tarball. Anything not yet pushed therefore cannot be deployed, and `set -e` will
abort at `hook_install` if the hook exists only in the working tree.

Skills are restored from `skills-lock.json` via `npx skills experimental_install`,
then reconciled: `deploy.sh:189-196` deletes any skill directory not listed in
the lock. The lock is therefore load-bearing — a wrong lock silently wipes
`~/.agents/skills/`.

Claude Code's `PreCompact` hook passes `customInstructions: null` on the auto
trigger, and appends a hook's exit-0 stdout as the summarizer's custom
instructions. Binary-confirmed in 2.1.252; not publicly documented.

### Critical Files

| File | Purpose | Relevance |
|------|---------|-----------|
| `.agents/hooks/precompact-instructions.sh` | The whole of change A: one executable, heredoc payload, 6000-byte guard | Edit here, not in a data file — the single-file shape was chosen to kill a cwd-dependent read |
| `scripts/deploy.sh` | Layered installer; four sites register the hook (`hook_install`, `--arg`, `ensure(...)`, verification loop) | All four must move together or verification fails closed |
| `scripts/check-rules-invariants.mjs` | `sensitivePaths` corpus for the public-literal scan | `skills` was added here; this is what caught a `.pyc` leaking a home path |
| `skills/session-handoff/scripts/validate_handoff.py` | The only script with real usage (376 calls) | Blocker-driven acceptance lives at `:167`; the placeholder regex at `:99` |
| `skills/session-handoff/references/handoff-template.md` | Content guidance the scaffold does NOT carry | Codex blocked its deletion — see Decisions |
| `skills-lock.json` | 69 entries; drives both install and deletion | Never overwrite wholesale — see Gotchas |

### Key Patterns Discovered

Usage was measured, not assumed: real `tool_use` command strings were parsed out
of session JSONL across claude + codex live + archived sessions. Counting with
`rg` gave a false picture because SKILL.md's own prose contains the command
strings it documents.

## Work Completed

### Tasks Finished

- PreCompact hook written, installed, registered, deployed, and readback-verified.
- `session-handoff` vendored into this repo, slimmed from 1832 to ~1100 lines.
- `validate_handoff.py`: quality score removed, acceptance made blocker-driven,
  three bugs fixed.
- Two independent review rounds (advisor + codex), all actionable findings closed.
- `skills-lock.json` repointed at `ohyeh/agent-scripts`, one entry only.
- Deployed; 69 skills intact.

### Files Modified

| File | Change |
|------|--------|
| `.agents/hooks/precompact-instructions.sh` | new, 675-byte payload |
| `scripts/deploy.sh` | 4 edits registering the hook |
| `scripts/check-rules-invariants.mjs` | `sensitivePaths` + `'skills'` |
| `skills/session-handoff/**` | vendored; 5 files deleted; SKILL.md and validator edited |
| `skills-lock.json` | session-handoff entry only |
| `.gitignore` | `__pycache__/`, `*.pyc` |

### Decisions Made

- **One hook file, not hook + markdown.** Codex's simplification: a second data
  file needs a cwd-relative read and a `-ef` same-file guard, and the clone-tracked
  layout breaks the naive `install`. A heredoc has neither problem.
- **Quality score deleted, not demoted.** It scored heading presence, so an empty
  but well-formed handoff scored 100. Nothing consumed it.
- **`handoff-template.md` kept.** I proposed deleting it on a section-NAME
  comparison. Codex read both files and found guidance only the template carries:
  data flow, a blocker's unblock need, a question's suggested resolution,
  line-number citations, the WHAT/WHY principle. Advisor had independently
  warned my evidence was heading-level only. Both reviewers, one conclusion.
- **Upstream MIT notice retained** in `skills/session-handoff/NOTICE`. The user
  framed the work as imitation and learning rather than a fork; the notice stays
  because upstream text is still present in the tree, and can go once
  `create_handoff.py` is rewritten.
- **Template sections not trimmed** despite `Recent Commits` and
  `Codebase Understanding` being filled 1/16 — user's call: 「我覺得可以留 沒所謂」.

## Pending Work

### Immediate Next Steps

1. Run `deploy.sh` on the other hosts so they pick up `e68253f`. Nothing else
   propagates the hook.
2. Consider the handoff-quality gap below — discussed, not acted on.
3. Delete `skills/session-handoff/NOTICE` if and when `create_handoff.py` is
   rewritten from scratch.

### Blockers/Open Questions

- **The real fidelity gap is unaddressed.** Across 16 stored handoffs, eight
  sections are filled 16/16 but `Recent Commits` and `Codebase Understanding`
  are filled 1/16. The validator blocks on secrets, remaining TODOs, and missing
  sections — it cannot detect a section that is filled but vacuous. Unblock
  needs: a decision on whether "filled but empty of content" should be
  detectable at all, and if so by what objective rule.
- **Nothing forces a resuming session to read the newest handoff.** SKILL.md
  documents a RESUME workflow; no hook enforces it. Unblock needs: a decision on
  whether a SessionStart hook should surface the newest handoff automatically.
- `create_handoff.py` still prints `python validate_handoff.py <path>` as its
  next-step hint — a bare path, same class of stale doc codex flagged in
  SKILL.md. One-line fix, not yet made.

### Deferred Items

- Rewriting `create_handoff.py` (385 lines, 0 changed so far).
- The probe worker `precompact-probe` may still be alive under agent-tmux; it was
  never needed, because readback was verified from this session's own record.

## Context for Resuming Agent

### Important Context

Readback of the PreCompact hook is **verified, not assumed**: record 1116 of this
session's JSONL is `isCompactSummary: true` and contains the hook payload
verbatim. That is first-hand evidence hook stdout reaches the summarizer.

Both reviews are on disk under
`.workflow/202609011200-precompact-review/` — `codex-review.md` is round one
(11 findings, VERDICT: BLOCK) and `codex-delta.md` is round two (5 items,
VERDICT: BLOCK). Read them before re-opening any decision above; every finding
in them is either fixed or recorded as an accepted trade-off.

### Assumptions Made

- That `computedHash` in `skills-lock.json` is CLI-internal. Verified negatively:
  it is not the sha256 of `SKILL.md` (checked against `using-skills`). So the
  hash must come from the CLI, never be hand-written.
- That the two permanently-BLOCKED files under
  `healthgo-mobile/.claude/handoffs/assets/` are runbooks, not handoffs. They are
  correctly rejected; do not "fix" the validator for them.

### Potential Gotchas

- **`npx skills add` writes `~/skills-lock.json`, a fresh lock with ONE entry.**
  Copying it over the repo's 69-entry lock deletes 68 skills, and deploy's
  reconciliation then `rm -rf`s them from `~/.agents/skills/`. Merge the single
  entry with `jq`, never `cp`.
- **`__pycache__` leaks.** A `.pyc` carried a home path and failed
  `public-sensitive-literals` on the first commit. Now gitignored; re-check after
  running any skill script from inside the repo.
- **Do not run `deploy.sh` with unpushed changes on a non-clone-tracked host.**
  It deploys the remote tarball and `set -e` aborts on anything missing there.
- The `agent-tmux` gates block parent-foreground `status|capture|probe|result`
  and parent-session `start|send|send-wait`; host the one blocking `assign` in a
  cheap subagent. Never pipe a harvest call — `| tail` masks the exit code.

## Environment State

### Tools/Services Used

- `agent-tmux codex assign` for the two review rounds (workers `precompact-review`,
  `precompact-delta`; both stopped).
- `npx skills add` / `npx skills experimental_install`.
- advisor for the inline second opinion.

### Active Processes

- Possibly `precompact-probe` under agent-tmux — never used, safe to stop.

### Environment Variables

None required beyond a normal shell. No secrets involved.

## Related Resources

- `.workflow/202609011200-precompact-review/codex-review.md` — round one.
- `.workflow/202609011200-precompact-review/codex-delta.md` — round two.
- Upstream: `softaworks/agent-toolkit`, `skills/session-handoff`.
- Deploy log: `~/.local/state/agent-scripts/deploy-log.jsonl`.
