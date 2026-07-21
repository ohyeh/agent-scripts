# Final report

## Outcome

- Codex asynchronous external workers now require one cheap native supervision proxy.
- Wrapper ownership transfers to that proxy; parent double-polling is prohibited.
- `agent-tmux supervise` blocks deterministically, emits nothing while unchanged,
  validates terminal results, and reports process loss without routine capture.
- Fixed heartbeat and repeated routine gate-receipt narration were removed.

## Verification

- `tmux-agent-tools/scripts/run-all-smokes`: 61 tests PASS, 0 FAIL.
- `scripts/test-supervise-smoke`: 7 PASS, 0 FAIL.
- `scripts/test-help-smoke`: 54 PASS, 0 FAIL.
- `agent-scripts/scripts/test-execution-frontier.mjs`: 23 PASS, 0 FAIL.
- `agent-scripts/scripts/test-review-gate-smoke.mjs`: 8 PASS, 0 FAIL.
- Fleet deploy: global files matched MD5, routed rules had zero diff, workflow
  aggregate hash matched, and 99 locked skills restored.
- Installed runtime checks found the mandatory proxy wording and working
  `codex-tmux help supervise` output.

## Release

- `tmux-agent-tools`: `72e4cf1` pushed to `origin/main`.
- `agent-scripts`: policy `9c64c93` and refreshed locks `15b063a` pushed to
  `origin/main`; final workflow closeout follows in the next commit.
