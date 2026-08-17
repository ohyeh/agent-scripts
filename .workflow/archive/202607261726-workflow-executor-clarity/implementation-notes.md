# Implementation Notes

- Clarifies orchestration state versus executor ownership without changing runtime behavior.
- `claude-workflow-runner` remains an adapter protocol label; `claude-tmux` is the executable runner.
- The user approved the exact diff and declined router-specific wording because another domain router may select the executor.
