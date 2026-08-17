# Dispatch record

- Gate: `independent-context`; the multi-repository read/test volume exceeds the commander context.
- Worker mode: sequential bounded `codex` CLI workers, model `gpt-5.6-luna`, requested maximum effort; upper bound three (audit, repair, independent review).
- Native proxies: one native proxy per external worker; each exclusively owns its wrapper interaction.
- Author/reviewer separation: a fresh reviewer is required after the repair evidence exists.
- Safety: local root-cause repairs for F1/F2/F3/F5 only; no commits, pushes, deployment, issue updates, or F4 identity-model changes.
