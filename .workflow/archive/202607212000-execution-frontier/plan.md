# Execution Frontier

Goal: add a local, dependency-free harness that records reproducible execution evidence.

Success criteria:
- A fixture defines runnable cases and an explicit execution profile.
- The runner writes JSONL observations and a JSON summary.
- Invalid fixtures fail before executing commands.
- Local checks cover success, failure, profile separation, and existing smoke tests.
- Only task-owned files are committed and pushed from `codex/execution-frontier`.

Scope:
- `scripts/execution-frontier.mjs`
- `evals/execution-frontier/`
- README usage documentation
- `scripts/scrub.sh` exact identity allowlist repair required by canonical GitHub merge history
- This workflow run directory

Non-goals:
- Automatic model invocation or provider billing integration.
- Estimating unavailable reasoning tokens.
- Changing model-dispatch policy.
- Adding a dashboard before repeatable data exists.

Risks:
- Shell commands are fixture-controlled and therefore trusted repo input, not an untrusted-input API.
- Wall-clock measurements include local machine noise; summaries report observations, not universal benchmarks.
- Existing dirty worktree files must not enter the commit.

Verification:
- Run the harness against the valid fixture.
- Run fixture validation against an invalid fixture and require non-zero exit.
- Run the harness self-test.
- Run `scripts/test-review-gate-smoke.mjs` and `scripts/scrub.sh`.
