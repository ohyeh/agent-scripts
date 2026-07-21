# Implementation Notes

- Defaulted to a standalone Node CLI because the repository has no package manifest and already uses `.mjs` scripts.
- The first version treats fixture commands as trusted repository inputs; it is not a service boundary.
- Measurements are deliberately limited to observable local facts. Missing provider metrics remain absent rather than estimated.
- Profile metadata is passed to commands through explicit environment variables; the bundled smoke fixture validates plumbing rather than claiming a model benchmark.
- Fresh review blocked the first draft on pre-execution timeout validation, degenerate comparisons, and insufficient error-path coverage; all three became explicit validator rules and self-tests.
- Later reviews tightened error semantics (`FAIL`, never `PASS 0/N`), exact workload pairing, full profile environment plumbing, mathematical median, and clean-worktree scrub verification.
- Closeout review added topology invariants so parallelism, roles, and graph edges cannot describe an impossible execution.
