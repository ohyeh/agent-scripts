# Workflow executor clarity

Goal: remove two wording ambiguities without changing workflow behavior.

Acceptance:
- global AGENTS.md and CLAUDE.md stay byte-identical.
- global text distinguishes orchestration state from the selected executor.
- adapter text identifies \`claude-workflow-runner\` as a protocol label and \`claude-tmux\` as the executable path.
- exact diff is approved before any canonical guidance edit.
- after approval: invariant, canary, commit, push, and branch-SHA local deploy pass.

Status: awaiting exact-diff approval.
