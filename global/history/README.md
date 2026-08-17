# global/history — pre-repo snapshots of the global rules file

Snapshots of `AGENTS.md`/`CLAUDE.md` from BEFORE the repo became canonical
(repo tracking starts at `5a14363`, 2026-07-19). Kept as evolution memory —
read-only, never deployed.

| File | Deployed ~ | Architecture | ✈ canary |
|---|---|---|---|
| `AGENTS-4.5.1.md` | 2026-07-12 | all rules inline (eager) | none |
| `AGENTS-4.6.1.md` | 2026-07-13 | routed to `~/.agents/rules/` (on-demand) | none |
| `AGENTS-4.6.2.md` | 2026-07-14 | routed | **every reply** (original wording) |

Incident anchor: `6e11d5d` (2026-07-21) weakened the canary to
first-reply-only under a noise-reduction packet, killing the only live
rule-compliance signal (per-reply ✈ rate cliffed 65%→7% Codex, 22%→1%
Claude). Restored to every-reply in `e260cc5` (v4.6.12, 2026-07-23).
Lesson: the canary is a single-token observability instrument, not noise —
do not cut it again.
