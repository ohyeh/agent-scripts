# Weekly Retro — 2026-07-17 → 2026-07-24

Commander mode: main context decides/dispatches/integrates only; all analysis by sonnet workers.

## Gate receipts
GATE: ~/.agents/rules/model-dispatch.md §5 — "Implement, refactor, or research | `sonnet` | acceptance includes tests or cited sources" — 三個 retro 分析 worker 均為 research 型任務 → sonnet；本任務 acceptance = 每項 claim 附 file:line 或 commit hash 引用。
GATE: ~/.agents/skills/delegation-templates/SKILL.md — RESEARCH template 使用；prompts 含 GOAL/ACCEPTANCE/REPORT + common footer。
GATE: ~/.agents/skills/unknowns-discovery/SKILL.md — 未讀（deviation note: retro 的 acceptance 已在本 plan 明訂為「引用齊備的 findings 檔 + proposals 分級」，非開放式；scope 限兩 repo 一週歷史 + 本機使用痕跡，無 material default 需選）。

## Workers
- W1 sonnet: agent-scripts repo 週回顧 → findings-agent-scripts.md
- W2 sonnet: tmux-agent-tools repo 週回顧 → findings-tmux-agent-tools.md
- W3 sonnet: 本機使用痕跡（.workflow artifacts、handoffs、lessons.md）→ findings-usage.md

## Acceptance (整體)
- 每個 findings 檔：本週變更清單（commit 引用）、事故/摩擦點、與規則體系的落差、≤5 條 proposed improvements（capture-first，不改任何規則/skill）。
- 最終由 commander 整合成 retro-report.md + 向使用者提案，任何規則修改走 approved-diff 流程。
