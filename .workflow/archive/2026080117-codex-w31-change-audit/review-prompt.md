GOAL: Independently and adversarially review the working-tree repairs for F1, F2, F3, and F5 documented in `/Users/paul.yeh/github/agent-scripts/.workflow/2026080117-codex-w31-change-audit/audit.md` and `repair.md`. Motivation: the repair worker failed to write a valid completion result, so do not trust its report; establish whether the actual files and tests satisfy the intended contracts.

CHECK:
- Read every changed source and test file in full in all three repositories. Compare the actual diff to F1/F2/F3/F5 acceptance, looking for hidden suppression, weakened validation, loss of negative coverage, non-JSONL serialization, metric-shape inconsistency, or untested consumer breakage.
- Run the relevant smoke/test commands yourself and record their exact exit codes and decisive output. Confirm F1 invalid receipt rejection is retained; F2 uses canonical `agent-tmux` consumers without suppression; F3 parses each physical JSONL line independently; F5 emits wrapped `hits`/`total` and preserves CLI output.
- Check `git diff --check` and `git status --short` in every repo. Separate task-owned files from pre-existing unrelated artifacts; do not edit, commit, push, deploy, change issues, or change F4 identity semantics.

ACCEPTANCE:
- Write `/Users/paul.yeh/github/agent-scripts/.workflow/2026080117-codex-w31-change-audit/review.md` with verdict per F1/F2/F3/F5: PASS, FAIL, or UNCONFIRMED; every claim has `file:line` and fresh command evidence.
- Explicitly state F4 remains an unresolved product/identity decision, not a PASS.
- End the artifact's final line exactly `VERDICT: PASS` only if all four implemented repairs pass, otherwise exactly `VERDICT: BLOCK`.
- Do not fix anything or spawn additional tmux sessions/delegate further.

REPORT: return ONLY short conclusion bullets + `file:line` per claim + verification evidence. Hard cap 30 lines. Long artifacts → write to `/Users/paul.yeh/github/agent-scripts/.workflow/2026080117-codex-w31-change-audit/review.md` and return the path. Do not paste file contents or logs.
If you cannot meet an acceptance criterion, say which one and why — do not fake it.
When done, write the structured completion (result.json contract, schema_version 1) to the literal result path injected into this prompt — do not rely on `$TMUX_AGENT_RESULT` inside tool sandboxes. Put the REPORT bullets in its `summary` field.
