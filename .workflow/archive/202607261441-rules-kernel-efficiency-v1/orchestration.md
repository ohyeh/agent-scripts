# Orchestration

1. Fix and verify the deploy trust chain.
2. Fix and verify zero-match router adoption.
3. Draft paired global files and routed-rule changes outside canonical paths.
4. Generate exact old-to-new diffs and stop at the maintenance approval gate.
5. After approval, apply the semantic diffs, add two-gate fixtures, and run the
   full rules verification set.

Branching rule: any semantic rule/global edit without exact-diff approval is
invalid and must not be applied.

## Review dispatch receipt

GATE: ~/.agents/rules/model-dispatch.md §5 — "| Review / judgment | fresh `gpt-5.6-sol` | start `medium` | Reviewer is not the author; raise effort only when risk or contradictory evidence requires it |" | this task: a fresh Sol medium reviewer verifies the multi-file script patch plus the unapplied global/dispatch proposals.

GATE: ~/.agents/skills/delegation-templates/SKILL.md §5 — "GOAL: Adversarially review {diff/files/claim}. Assume it is broken until proven otherwise." | this task: read-only review with file:line evidence and a final PASS/BLOCK; no edits.

## Completion receipt

GATE: ~/.agents/rules/judgment-rubrics.md §2 — "Raw evidence in hand: command + exit code + key output lines, or artifact path, or fresh-agent read-back PASS, or reviewer verdict quoted verbatim." | this task: fresh bounded checks pass and the independent rereview ended `VERDICT: PASS`; canonical global/rule proposals remain pending exact-diff approval and are not reported as applied.
