# W31 F1/F2/F3/F5 root-cause repair

Date: 2026-08-01
Scope: F1, F2, F3, F5 only. F4 (`payload.id` vs `session_id`) was not changed.

## Repairs

- F1: `tmux-agent-tools/scripts/test-dispatch-gate-hook-smoke:40-52` now uses the exact `gate-receipt-parent-dispatch` and `gate-receipt-workflow` paths, current UTC dates, and substantive rationale. `gate1-invalid-receipt` retains rejection coverage for a short receipt. The validator at `tmux-agent-tools/hooks/tmux-dispatch-gate.sh:49-53,60-68,78-87` was not weakened.
- F2: `tmux-agent-tools/scripts/test-dry-run-smoke:9-11,53-281`, `test-result-contract-smoke:12-14,58-111`, and `test-result-schema-smoke:13-15,64-116` now invoke the canonical `agent-tmux <cli>` engine. No deprecation suppression was added.
- F3: `.agents/hooks/bol-prompt-warn.sh:41-42` and `.agents/hooks/context-ledger.sh:24-25` now use compact `jq -cn` emission. `scripts/test-jsonl-hooks-smoke:1-42` invokes each hook twice, parses each physical line independently, and asserts two records per file.
- F5: `context-mode-local-insight/bin/agent-sessions.mjs:28-34,232-233` wraps rate `hits`/`total` with `m()` and renders their `.value`; `test/agent-sessions.test.mjs:75-110` checks the wrapped fields and walks them instead of exempting rate objects.

## Regression and affected-suite verification

All commands below exited `0` unless stated otherwise.

| Finding | Exact command | Decisive output |
|---|---|---|
| F1 | `cd /Users/paul.yeh/github/tmux-agent-tools && zsh scripts/test-dispatch-gate-hook-smoke` | `SMOKE OK — all checks passed`; includes `PASS [gate1-invalid-receipt]`. |
| F2 | `cd /Users/paul.yeh/github/tmux-agent-tools && zsh scripts/test-dry-run-smoke` | `summary: 81 passed, 0 failed`; all cases show the `agent-tmux` path. |
| F2 | `cd /Users/paul.yeh/github/tmux-agent-tools && zsh scripts/test-result-contract-smoke` | `summary: 44 passed, 0 failed`. |
| F2 | `cd /Users/paul.yeh/github/tmux-agent-tools && zsh scripts/test-result-schema-smoke` | `summary: 33 passed, 0 failed`. |
| F3 | `cd /Users/paul.yeh/github/agent-scripts && bash scripts/test-jsonl-hooks-smoke` | `JSONL hooks smoke: 2 files, 4 records, each line independently valid`. |
| F5 | `cd /Users/paul.yeh/github/context-mode-local-insight && npm test` | exit `0`; six `✔` tests, including `every emitted number carries a producing method string`. |

The regressions fail on the audited pre-repair shapes: F1's old receipt path/body is rejected by the unchanged validator; F2's old shims add stderr to the captured JSON; F3's old `jq -n` output occupies multiple physical lines; F5's old numeric `hits`/`total` make the new `.value` assertions and metric-object walker fail.

## Cross-repo and syntax checks

- `cd /Users/paul.yeh/github/tmux-agent-tools && zsh scripts/test-brief-smoke` -> exit `0`; `summary: 10 passed, 0 failed`.
- `cd /Users/paul.yeh/github/tmux-agent-tools && zsh -n scripts/test-dispatch-gate-hook-smoke scripts/test-dry-run-smoke scripts/test-result-contract-smoke scripts/test-result-schema-smoke` -> exit `0`.
- `cd /Users/paul.yeh/github/agent-scripts && bash -n .agents/hooks/bol-prompt-warn.sh .agents/hooks/context-ledger.sh scripts/test-jsonl-hooks-smoke` -> exit `0`.
- `cd /Users/paul.yeh/github/agent-scripts && node scripts/check-rules-invariants.mjs` -> exit `0`; `24/24 passed`.
- `printf 'GOAL: x ACCEPTANCE: y REPORT: z' | bash scripts/check-bol-prompt.sh` -> exit `0`; all sections present. `printf 'GOAL: x' | bash scripts/check-bol-prompt.sh` -> exit `1`; `missing sections: ACCEPTANCE,REPORT`.
- `cd /Users/paul.yeh/github/context-mode-local-insight && node --check bin/agent-sessions.mjs && node --check test/agent-sessions.test.mjs` -> exit `0`.
- `cd /Users/paul.yeh/github/context-mode-local-insight && node bin/cli.mjs --help >/dev/null` -> exit `0`.
- `cd /Users/paul.yeh/github/context-mode-local-insight && node bin/cli.mjs agent-sessions --days 7 --json | jq -e '{schema,windowDays,clis:(.clis|keys),rate_hits_type:(.clis.claude.canaryRate.hits|type),rate_total_type:(.clis.claude.canaryRate.total|type)}'` -> exit `0`; `cmli.agent-sessions.v1`, CLI keys `agy/claude/codex`, both rate field types `object`.

## Final repository boundary checks

- `git diff --check` exited `0` in all three repositories.
- `git status --short` showed only the four tmux smoke files, the two agent-scripts hooks plus the new JSONL smoke, the two CMLI collector/test files, and existing/unrelated workflow or manifest artifacts. No unrelated artifact was edited or reverted.
- No commit, push, deploy, tmux session creation, external issue change, or F4 identity-model change was performed.
