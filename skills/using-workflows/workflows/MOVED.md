# design-consensus.workflow.js — tagged for attic removal

Tagged 2026-08-01. Scheduled removal: 2026-08-31 (30 days out), unless a
direct use appears before then.

**Rationale:** 2026-08-01 weekly retro — `design-consensus` has 0 direct
uses across every `.workflow/` run dir in this repo: `grep -rl
design-consensus .workflow` returns one hit
(`.workflow/202607261726-workflow-executor-clarity/exact-diff.md`), which is
a doc listing mention, not a run-dir invocation. No personal/project
`.claude/workflows/` deployment references it either. It is the only true
dead-code candidate identified in that retro; every other recipe has at
least one recent run.

Track its usage before deleting: `scripts/recipe-usage-stats.sh
design-consensus` (writes/updates `evals/recipe-usage-stats.json`,
including a `consecutive_zero_weeks` counter). If `consecutive_zero_weeks`
is still climbing with no new uses at the 30-day mark, delete
`design-consensus.workflow.js` and this file together.
