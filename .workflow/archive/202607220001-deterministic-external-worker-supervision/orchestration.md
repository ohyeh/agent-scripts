# Orchestration

1. Trace existing session resolution, status, result validation, and wait commands.
2. Implement one deterministic `supervise` command at the shared wrapper boundary.
3. Make Codex proxy ownership mandatory and remove fixed heartbeat language.
4. Move routine gate receipts from commentary into workflow/dispatch artifacts and deduplicate unchanged follow-ups.
5. Add regression coverage for silent unchanged state, terminal result, process loss, routing, and receipt visibility.
6. Run focused then broad verification in both repositories.
7. Commit, push, install canonical sources, and verify runtime copies.

Stop rules: do not publish a release tag or touch production. Any incompatible result-schema change requires re-plan.
