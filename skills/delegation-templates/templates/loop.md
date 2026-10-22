<!-- Template: copy to <repo>/.claude/loop.md and fill the <...> parts.
     Claude Code reads <repo>/.claude/loop.md for a /loop with no prompt
     (it wins over ~/.claude/loop.md). A /loop <prompt> does not read it: name this file in the prompt. -->
# /loop in <repo>

The exit condition is this repo's verification, never a line you write yourself.

- Verification: `<.claude/workflows/feature-lifecycle-auto.job.json>`, field `verification`
  (see the delegation-templates Verification contract). Each round run every `verifyCommands`
  entry and every `negativeCases` command, and quote the exit codes. A negative case passes only
  when it returns its `expectedExit`.
- Done = every `acceptance` line holds on the current tree, proven by that run.
- Missing or unreadable verification: stop and report it. Do not invent a substitute check.
- Goal, scope, budget and corrections live in the run state file `<.workflow/<run>/state.json>`.
- <repo-specific limits: paths not to touch, budget per round, who to ask>
