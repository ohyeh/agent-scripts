# W31 Codex-oriented change audit

Audit date: 2026-08-01 (Asia/Taipei)

Scope: every commit whose committer date is `2026-07-30 00:00:00` through
`2026-08-01 23:59:59` in the three requested repositories. Merge commits are
represented by their first-parent delta (`git diff <parent-1> <merge>`), so an
integrated merge is not silently treated as having no changed paths.

This is a read-only audit. No product/configuration file, issue, branch,
remote, deployment, or tmux session was changed or created.

## Status vocabulary

- `PASS`: the inspected source contract and the relevant bounded check agree.
- `FAIL`: a source/consumer/check contradiction was reproduced.
- `UNCONFIRMED`: evidence was intentionally not obtainable within the
  read-only/no-new-tmux-session boundary; it is not treated as passing.

## Full-read and scope evidence

The read-only blob reader enumerated the date-window commits, enumerated
changed paths, used the first-parent delta for merges, and executed
`git show <commit>:<path>` for every changed blob. It then consumed the full
blob text in the sandbox rather than sampling current files.

Command shape:

```text
git log --format=%H --since='2026-07-30 00:00:00' --until='2026-08-02 00:00:00'
git diff --name-only <first-parent> <merge-commit>       # merge commits
git diff-tree --no-commit-id --name-only -r <commit>    # non-merges
git show <commit>:<changed-path>
```

Result: `agent-scripts: 13 commits`, `tmux-agent-tools: 5 commits`,
`context-mode-local-insight: 2 commits`; `TOTAL_BLOBS_READ=69`,
`SOURCE_BLOBS_READ=31`, `CHANGED_PATHS_VISITED=69`, `FAILURES=0`.

## Commit-to-contract matrix

### `/Users/paul.yeh/github/agent-scripts`

| Commit (local time) | Changed paths | Intended contract | Evidence command(s) | Result |
|---|---|---|---|---|
| `9c0d9a167decd3583d6375d26145c54480372900` (08-01 16:54:52) | `evals/context-budget-baseline.json`; `global/AGENTS.md`; `global/CLAUDE.md` | Tool-chain narration is covered by duplicated global guidance and the accepted budget baseline. | `node scripts/check-rules-invariants.mjs`; `cmp -s global/AGENTS.md global/CLAUDE.md` | `PASS`; `24/24 passed`, source files byte-identical. |
| `38e25834151541955e883b0ab0e7b3c552205bd3` (08-01 16:27:50) | `.claude/handoffs/2026-08-01-162550-weekly-retro-w31-fixes.md`; `.workflow/202608011105-weekly-retro/{adhd-structural-fixes.md,adhd-unused-tools.md,drafts-issue2-issue3.md,findings-agy.md,findings-claude-local.md,findings-codex-local.md,findings-local-fullsweep.md,findings-own-tools.md,findings-remote-fullsweep.md,findings-remote.md,inventory-local.md,inventory-remote.md,next-week-backlog.md,plan.md,repo-map-synthesis.md,retro-report.md,review-verdict.md}` | Retro evidence and handoff artifacts are recorded without executable contract changes. | Full-read command; `git diff --check 38e25834^ 38e25834` | `PASS` as documentation/artifact scope; runtime claims in those documents remain `UNCONFIRMED`. |
| `a7f75a852c3d9f89e9f7937dc582a3975406cde9` (08-01 15:28:07) | `.agents/rules/judgment-rubrics.md`; `evals/context-budget-baseline.json` | Measurement claims must cover the full task surface. | `node scripts/check-rules-invariants.mjs` | `PASS` static invariant and budget gate. |
| `209c33f625a89093740b2a3d9167cc4bc206c413` (08-01 15:18:33, merge) | `.agents/hooks/bol-prompt-warn.sh`; `.agents/hooks/context-ledger.sh`; `scripts/check-bol-prompt.sh`; `scripts/deploy.sh`; `scripts/recipe-usage-stats.sh`; `skills/using-workflows/workflows/MOVED.md` | A2 bill-of-lading validation, A5 ledger, A3 recipe usage, and deploy wiring are operational under strict shell behavior. | `bash -n ...`; hook harness; recipe harness; `node scripts/check-rules-invariants.mjs` | `FAIL` F3: both JSONL emitters write pretty JSON, not one JSON object per line. Recipe behavior is fixed by `8e1b5275`. |
| `8e1b527573253cd4972fefd05c4c7a00d2542c5a` (08-01 15:18:06) | `scripts/recipe-usage-stats.sh`; `skills/using-workflows/workflows/MOVED.md` | Zero grep matches must not abort a `set -euo pipefail` usage scan. | Historical blob run: `bash <(git show 8e1b5275:scripts/recipe-usage-stats.sh) design-consensus <empty-dir> <stats>` | `PASS`; exit `0`, `uses=0`, `consecutive_zero_weeks=1`. |
| `6b1b3b57136675ddf0a357d2a9c9eb78b907c02d` (08-01 15:11:53) | `.agents/rules/model-dispatch.md`; `evals/context-budget-baseline.json` | Retire haiku dispatch and map former roles to sonnet effort-low. | `node scripts/check-rules-invariants.mjs` | `PASS` source/budget gate; live model availability is `UNCONFIRMED`. |
| `17c4a4b4596ca260e40bae011ef3d8976dfa03f6` (08-01 14:57:45) | `scripts/recipe-usage-stats.sh`; `skills/using-workflows/workflows/MOVED.md` | Introduce the A3 recipe attic tag and usage counter. | Historical blob run: `bash <(git show 17c4a4b4:scripts/recipe-usage-stats.sh) design-consensus <empty-dir> <stats>` | `FAIL` at this commit snapshot: exit `1` on zero matches under `set -euo pipefail`; repaired by `8e1b5275`. |
| `07cf8163a92b3fffdb738dc1ae5f5ca8cc55d7a1` (08-01 14:56:13) | `.agents/hooks/context-ledger.sh` | PostToolUse must append a minimal, greppable JSONL context ledger. | `bash .agents/hooks/context-ledger.sh` with isolated `HOME` and one Read event | `FAIL` F3; hook exits `0`, but the one record occupies six physical lines. |
| `92608e1ae1e5921f9f992eb37b00c2bb4e042fbd` (08-01 14:56:05) | `.agents/hooks/bol-prompt-warn.sh`; `scripts/check-bol-prompt.sh`; `scripts/deploy.sh` | Warn-only prompt validation and per-invocation JSONL stats, deployed with the hook layer. | `bash scripts/check-bol-prompt.sh`; isolated Agent-hook harness; `node scripts/check-rules-invariants.mjs` | `FAIL` F3; validator behavior and deploy parity pass, stats serialization does not satisfy its JSONL contract. |
| `1b52805c407689806433cc8dbb38f5c44daf1705` (07-31 19:52:15) | `.agents/rules/judgment-rubrics.md`; `global/AGENTS.md`; `global/CLAUDE.md`; `skills/using-workflows/workflows/plan-pipeline.workflow.js` | Task-embedded acceptance, task-specific gates, and loop sign-off must be represented consistently in rules and pipeline calls. | `node --check skills/using-workflows/workflows/plan-pipeline.workflow.js`; `node scripts/check-rules-invariants.mjs` | `PASS` static checks; external workflow execution is `UNCONFIRMED`. |
| `cf8a9112abc0d6a78d46a92cc10c22f8f8321a25` (07-30 12:49:09) | `.agents/hooks/claude-version-sentinel.sh`; `.agents/hooks/session-title-sentinel.sh`; `scripts/check-rules-invariants.mjs`; `scripts/deploy.sh`; `scripts/fleet-deploy.sh` | Sentinels, fleet invariants, pinned deploy resolution, and global guidance checks stay bounded and reproducible. | `bash -n ...`; `node scripts/check-rules-invariants.mjs`; source/deployed `cmp` | `PASS` for source and deployed parity; live external endpoint behavior is `UNCONFIRMED`. |
| `6832e8f1693bd79ce88e748963c36d5a4954de42` (07-30 10:46:38) | `.agents/rules/harness-diagnosis.md`; `evals/context-budget-baseline.json` | Separate documented harness interfaces from probed runtime surfaces. | `node scripts/check-rules-invariants.mjs` | `PASS` documentation/budget invariants; documented runtime snapshots are not independently re-probed here (`UNCONFIRMED`). |
| `4f404175967170e712b82c908e6391f0ddd00d51` (07-30 09:16:02) | `.agents/rules/session-titles.md` | Local/cloud session-title paths and stale-title gates are documented with explicit uncertainty. | `node scripts/check-rules-invariants.mjs` | `PASS` static rule gate; cloud endpoint behavior is `UNCONFIRMED`. |

### `/Users/paul.yeh/github/tmux-agent-tools`

| Commit (local time) | Changed paths | Intended contract | Evidence command(s) | Result |
|---|---|---|---|---|
| `e3a7040c8119fb1229e33c92c6bef839f1a89a35` (08-01 15:18:41, merge) | `scripts/test-brief-smoke`; `scripts/test-supervise-smoke`; `skills/tmux-agent-tools/scripts/agent-tmux`; `skills/tmux-agent-tools/scripts/profiles/agy.conf` | Integrated T1 brief compiler, #317 result terminal semantics, and #318 agy headless/effort profile mapping. | `test-brief-smoke`; suppressed wrapper result smokes; agy dry-run; source read | `PASS` brief/profile/result source contracts; `UNCONFIRMED` supervise runtime because its existing smoke creates tmux sessions; inherited F2 smoke regression remains. |
| `92a2d94438875102a23824f40d69d94377fc87e8` (08-01 15:12:29) | `scripts/test-brief-smoke`; `skills/tmux-agent-tools/scripts/agent-tmux` | `brief` must compile exactly GOAL/ACCEPTANCE/REPORT and feed `start --from-file`. | `zsh scripts/test-brief-smoke` | `PASS`; exit `0`, `10 passed, 0 failed`. |
| `8721c3c35e0b3ff20d326ca142e93a3e65cf291b` (08-01 15:08:15) | `skills/tmux-agent-tools/scripts/profiles/agy.conf` | agy 1.1.8 headless uses `--dangerously-skip-permissions -p`; effort expands to `--effort <value>`. | `zsh skills/tmux-agent-tools/scripts/agy-tmux start --exact --dry-run --headless --effort low agy-w31 <repo> audit` | `PASS`; exit `0`; invocation has `--dangerously-skip-permissions --effort low`, `exec_mode=oneshot`, `prompt_flag=-p`. |
| `d373305608be43221f90b24eba37c1e75b94f563` (08-01 15:05:24) | `scripts/test-supervise-smoke`; `skills/tmux-agent-tools/scripts/agent-tmux` | `result init` seeds non-terminal pending state; `supervise` requires terminal evidence and non-empty success summary. | `AGENT_TMUX_SUPPRESS_DEPRECATION=1 zsh scripts/test-result-contract-smoke`; source contract read | `PASS` canonical contract; result smoke exit `0`, `44 passed, 0 failed`; supervise end-to-end is `UNCONFIRMED` because `scripts/test-supervise-smoke:28-31,76-79` starts sessions and was not run. |
| `8af271ee54f4bbb0bf6884f4dd361e88b5254713` (07-30 12:49:19) | `.claude-plugin/plugin.json`; `CHANGELOG.md`; `hooks/tmux-dispatch-gate.sh` | v0.39 receipt validation must enforce dated, substantive receipts and parent/workflow gate paths. | `zsh scripts/test-dispatch-gate-hook-smoke`; default existing wrapper smokes | `FAIL` F1 and F2. Gate smoke exit `1` with four failures; the v0.39 deprecation stderr breaks three existing smoke consumers. |

### `/Users/paul.yeh/github/context-mode-local-insight`

| Commit (local time) | Changed paths | Intended contract | Evidence command(s) | Result |
|---|---|---|---|---|
| `53bdd6f15a9bf5771ef8312883b6cf0dc613b488` (08-01 15:18:52, merge) | `bin/agent-sessions.mjs`; `bin/cli.mjs`; `test/agent-sessions.test.mjs` | Integrated raw Claude/Codex/agy collector and `--help` exit-0 CLI surface. | `npm test`; `node bin/cli.mjs --help`; live JSON collector | `PASS` tests/CLI; `23 passed, 0 failed`, help exit `0`; F4/F5 remain contract gaps. |
| `05b56ff2a9059a3f0229e27719ca1f5cc06c4266` (08-01 14:57:29) | `bin/agent-sessions.mjs`; `bin/cli.mjs`; `test/agent-sessions.test.mjs` | Discover raw Claude/Codex/agy stores, apply time windows/deduping, and attach producing methods to metrics. | `npm test`; `node bin/cli.mjs agent-sessions --days 7 --json` | `PASS` fixture/runtime discovery checks; `UNCONFIRMED` shared Codex identity semantics; `FAIL` F5 metric-shape inconsistency. |

## Findings and contract traces

### F1 — FAIL: dispatch-gate smoke fixture no longer satisfies the enforced receipt contract

The hook requires a date and at least 40 bytes (`tmux-agent-tools/hooks/tmux-dispatch-gate.sh:49-53`), requires the exact parent receipt path (`tmux-agent-tools/hooks/tmux-dispatch-gate.sh:78-87`), and requires the exact workflow receipt path for the second review-shaped dispatch (`tmux-agent-tools/hooks/tmux-dispatch-gate.sh:55-68`). The existing smoke still writes `gate-receipt-dispatch` with an undated short body and writes `recipe=consensus-gate` to the workflow receipt (`tmux-agent-tools/scripts/test-dispatch-gate-hook-smoke:40-50`).

Verification:

```text
zsh scripts/test-dispatch-gate-hook-smoke
EXIT=1
FAIL [gate1-receipt-pass] exit=2 want=0
FAIL [review-1st-pass] exit=2 want=0
FAIL [gate2-receipt-pass] exit=2 want=0
FAIL [nonreview-start-pass] exit=2 want=0
SMOKE FAIL (4)
```

Root-cause repair plan: update the smoke fixture to write
`gate-receipt-parent-dispatch` and `gate-receipt-workflow` with the current date
and substantive rationale; retain explicit assertions that an undated/short
receipt is rejected. Do not weaken `valid_receipt`.

### F2 — FAIL: v0.39 deprecation stderr breaks unchanged smoke consumers

The plugin declares `0.39.0` (`tmux-agent-tools/.claude-plugin/plugin.json:2-4`),
while the retained shims emit an unconditional deprecation line on stderr
(`tmux-agent-tools/skills/tmux-agent-tools/scripts/codex-tmux:2-6`). Three
existing smoke tests still select those shims (`tmux-agent-tools/scripts/test-dry-run-smoke:9-10`,
`tmux-agent-tools/scripts/test-result-contract-smoke:12-13`,
`tmux-agent-tools/scripts/test-result-schema-smoke:13-14`) and merge stderr into
the JSON capture (`tmux-agent-tools/scripts/test-dry-run-smoke:52-58`,
`tmux-agent-tools/scripts/test-result-contract-smoke:55-60`).

Verification:

```text
zsh scripts/test-dry-run-smoke                    EXIT=5; summary: 81 passed, 5 failed
zsh scripts/test-result-contract-smoke            EXIT=1; summary: 32 passed, 12 failed
zsh scripts/test-result-schema-smoke               EXIT=1; summary: 17 passed, 16 failed
AGENT_TMUX_SUPPRESS_DEPRECATION=1 zsh scripts/test-dry-run-smoke         EXIT=0; 81 passed, 0 failed
AGENT_TMUX_SUPPRESS_DEPRECATION=1 zsh scripts/test-result-contract-smoke EXIT=0; 44 passed, 0 failed
AGENT_TMUX_SUPPRESS_DEPRECATION=1 zsh scripts/test-result-schema-smoke   EXIT=0; 33 passed, 0 failed
```

Root-cause repair plan: migrate these smoke consumers to canonical
`agent-tmux <cli>` paths, or set suppression only in the legacy-shim tests and
add a separate assertion for the warning. The canonical path is the durable
fix; suppressing stderr alone would hide future consumer mistakes.

### F3 — FAIL: A2/A5 files named `.jsonl` emit multi-line JSON objects

Both hooks document one JSONL record per invocation (`agent-scripts/.agents/hooks/bol-prompt-warn.sh:2-6`; `agent-scripts/.agents/hooks/context-ledger.sh:2-5`), but both use `jq -n` without compact mode (`agent-scripts/.agents/hooks/bol-prompt-warn.sh:41-42`; `agent-scripts/.agents/hooks/context-ledger.sh:24-25`).

Verification in isolated temporary homes:

```text
bash scripts/check-bol-prompt.sh                         EXIT=0; PASS: GOAL/ACCEPTANCE/REPORT all present
bash scripts/check-bol-prompt.sh                         EXIT=1; FAIL: missing sections: ACCEPTANCE,REPORT
two bol hook invocations                                    EXIT=0; bol_stats_lines=13
one context-ledger invocation                               EXIT=0; ledger_lines=6
```

The warn-only validator behavior is correct, but the persisted telemetry
cannot be consumed as line-oriented JSON without a pretty-JSON-aware parser.
Root-cause repair plan: use compact emission (`jq -cn` or `jq -n -c`) at both
append sites and add a narrow test that parses each physical line independently
and asserts exactly one record per invocation.

### F4 — UNCONFIRMED: Codex collector identity is not reconciled with the tmux consumer

The collector explicitly dedupes by `payload.session_id` and labels the result
as distinct `session_id` values (`context-mode-local-insight/bin/agent-sessions.mjs:128-170`); its fixtures only exercise that identity (`context-mode-local-insight/test/agent-sessions.test.mjs:36-45,82-89`). The existing tmux correlation code instead extracts the UUID from the `rollout-...-UUID.jsonl` filename and requires it to equal `payload.id` (`tmux-agent-tools/skills/tmux-agent-tools/scripts/agent-tmux:2221-2251`).

Read-only metadata aggregation of the live raw Codex stores found 1,632
`session_meta` files, 1,632 distinct `payload.id` values, 406 distinct
non-empty `payload.session_id` values, 505 files where both identifiers differ,
and 56 repeated `session_id` values. This proves the two consumers operate at
different identity/granularity boundaries; it does not prove which one the
retro contract intended.

Root-cause repair plan: explicitly define whether the collector measures
logical conversations (`session_id`) or rollout records (`id`), then either
provide a documented mapping and cross-repo fixture using both fields or align
the collector and tmux correlation on one identifier. Add a regression fixture
for archive duplicates, forks, and differing `id`/`session_id` values before
calling this contract `PASS`.

### F5 — FAIL: collector's stated metric shape exempts bare numeric rate fields

The collector promises every emitted number is `{ value, method }`
(`context-mode-local-insight/bin/agent-sessions.mjs:4-6`) and repeats that every
metric has `{value, method, tier}` (`context-mode-local-insight/bin/agent-sessions.mjs:214-215`), but `rate()` returns bare numeric `hits` and `total`
(`context-mode-local-insight/bin/agent-sessions.mjs:27-30`). The test walker
explicitly stops at any object containing `hits` without checking those numeric
fields (`context-mode-local-insight/test/agent-sessions.test.mjs:96-106`), so
`npm test` does not cover the stated invariant.

Root-cause repair plan: choose one contract. Prefer wrapping `hits` and `total`
as documented metrics and update rate consumers/tests, or explicitly classify
them as non-metric metadata and narrow the top-level contract plus test walker.

## Verification ledger

| Check | Exact command | Exit code / decisive output |
|---|---|---|
| Full source/blob read | `ctx_execute` JavaScript orchestration using the `git log`, first-parent `git diff`, and `git show` commands above | `TOTAL_BLOBS_READ=69 SOURCE_BLOBS_READ=31 CHANGED_PATHS_VISITED=69 FAILURES=0` |
| agent-scripts syntax/invariants | `bash -n .agents/hooks/... scripts/... && node --check scripts/check-rules-invariants.mjs && node --check skills/using-workflows/workflows/plan-pipeline.workflow.js && node scripts/check-rules-invariants.mjs` | `0`; `24/24 passed` |
| Duplicated guidance | `cmp -s global/AGENTS.md global/CLAUDE.md`; `cmp -s "$HOME/.codex/AGENTS.md" "$HOME/.claude/CLAUDE.md"` | both `0`; all four SHA-256 values equal `ffa478c1b29f5e5948fc907b267f87c232b94b5a1bccf6852862bf7139a0a81d` |
| recipe pipefail repair | `bash scripts/recipe-usage-stats.sh design-consensus <empty-workflow> <stats>` twice | both `0`; `uses=0`, `consecutive_zero_weeks=1` |
| brief compiler | `zsh scripts/test-brief-smoke` | `0`; `10 passed, 0 failed` |
| agy flags | `zsh skills/tmux-agent-tools/scripts/agy-tmux start --exact --dry-run --headless --effort low agy-w31 <repo> audit` | `0`; launch flags `--dangerously-skip-permissions --effort low`, prompt flag `-p` |
| result contract | `AGENT_TMUX_SUPPRESS_DEPRECATION=1 zsh scripts/test-result-contract-smoke` | `0`; `44 passed, 0 failed` |
| supervise smoke | `zsh scripts/test-supervise-smoke` | not run: existing script starts sessions at `tmux-agent-tools/scripts/test-supervise-smoke:28-31,76-79`; `UNCONFIRMED` by explicit boundary |
| CMLI tests | `npm test` | `0`; `23 passed, 0 failed` |
| CMLI help/collector | `node bin/cli.mjs --help`; `node bin/cli.mjs agent-sessions --days 7 --json` | help `0` and includes `agent-sessions`; collector `0`, schema `cmli.agent-sessions.v1`, `absent=0` |
| worktree snapshots | `git -C <repo> status --short --branch` for all three repos | before: only pre-existing untracked audit directory in agent-scripts; tmux/context clean. After artifact write: same scoped untracked directory only. |

## Prioritized findings and recommendation

| Priority | Finding | Status | Root-cause repair plan |
|---|---|---|---|
| P1 | F1 gate receipt fixture/path/content mismatch | `FAIL` | Align smoke receipts to the exact validated paths and dated substantive content; retain rejection coverage. |
| P1 | F2 v0.39 shim stderr contaminates JSON smoke captures | `FAIL` | Migrate smoke consumers to canonical `agent-tmux`; isolate any intentional deprecation-warning test. |
| P1 | F3 A2/A5 telemetry is not line-delimited JSON | `FAIL` | Compact both `jq` append operations and parse each line in a regression test. |
| P1 | F4 Codex `session_id` versus `payload.id` identity boundary is unspecified | `UNCONFIRMED` | Define the intended granularity and add cross-repo archive/fork identity fixtures. |
| P2 | F5 rate `hits`/`total` violate the collector's universal metric-shape claim | `FAIL` | Align implementation, consumer contract, and test walker on wrapped metrics or an explicit metadata exemption. |

Recommendation: root-cause repair plan required for F1-F5; this audit is not
`NO FIX REQUIRED`. The historical A3 failure in `17c4a4b4` is already repaired
by `8e1b5275`, but the four current failures/contract gaps above remain.
