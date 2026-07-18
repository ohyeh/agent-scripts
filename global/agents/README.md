# agents/ — sub-agent definitions (retired)

As of A4b (2026-07-18) all standalone sub-agent definition files
(`~/.claude/agents/*.md`: tmux-delegate, codex-oneshot, claude-oneshot, …)
are **retired fleet-wide** — no machine ships them and the old copies were
removed from `ohyeh/tmux-agent-tools` (commit `6129fb5`, BREAKING).

Why: two weeks of usage evidence showed every real delegation was driven by
SKILL.md prose, not by agent-def auto-triggering (16/16 triggers were
repo-local discovery; global defs 0). The decision gate that lived in
`tmux-delegate` moved verbatim into the `using-tmux-agent-tools` router
skill (`Inline-vs-worker gate`).

If sub-agent defs ever come back, they land here as snapshots with their
canonical machine path named in this README.
