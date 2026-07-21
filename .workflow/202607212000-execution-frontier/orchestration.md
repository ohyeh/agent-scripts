# Orchestration

1. Inspect existing scripts, eval fixtures, and result contracts.
2. Define the smallest stable fixture and observation schema.
3. Implement a dependency-free Node runner and self-test.
4. Run narrow checks, then existing repository smoke and scrub checks.
5. Request a fresh read-only review; repair only blocking findings.
6. Stage task-owned files and commit them.
7. Create a temporary clean worktree at the new commit, run `scripts/scrub.sh` there, then remove the temporary worktree.
8. Push the feature branch only after the clean-worktree scrub passes.

Stop rules:
- Do not modify or stage pre-existing workflow edits, `.claude/`, or the research report.
- Do not infer unavailable provider token or billing data.
- A failed validation or review blocks commit until resolved.
