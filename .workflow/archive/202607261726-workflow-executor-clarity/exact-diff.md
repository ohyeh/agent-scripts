# Exact proposed wording

Triggering incident: the global text made \`codex-dynamic-workflows\` sound like the executor, and \`claude-workflow-runner\` sound like an installed executable.

## global/AGENTS.md and global/CLAUDE.md

\`\`\`diff
- \`brainstorming\` writes its plan under \`.workflow/<YYYYMMDDHHMM>-<slug>/\`, not
- \`docs/superpowers/specs/\`. \`writing-plans\` is not installed. Approved designs route
- to \`codex-dynamic-workflows\`; writing-heavy work loads \`stop-slop\`.
+ \`brainstorming\` writes its plan under \`.workflow/<YYYYMMDDHHMM>-<slug>/\`, not
+ \`docs/superpowers/specs/\`. \`writing-plans\` is not installed. Approved designs use
+ \`codex-dynamic-workflows\` for orchestration state; the selected executor runs the work.
+ Writing-heavy work loads \`stop-slop\`.
\`\`\`

## skills/using-workflows/references/codex-adapter.md

\`\`\`diff
 The recipe executes NATIVELY on Claude runtime; Codex commands and supervises.
+\`claude-workflow-runner\` is this adapter protocol label, not an installed command;
+the executable runner path is \`claude-tmux\`.
 Day-one eligible (no tmux inside): \`design-consensus\`, \`design-vs-code-audit\`,
\`\`\`
