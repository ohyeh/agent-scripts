## 批次 2 第一刀：model-dispatch.md 縮行
GATE: ~/.agents/rules/maintenance.md §1 — "Other rules/*.md … Any semantic change — show the exact diff, wait for approval"（never apply-then-ask）| this task: 提案檔 + diff 呈核，未核准前不改原檔、不部署。
GATE: ~/.agents/rules/model-dispatch.md §5 — "Review / judgment | fresh `gpt-5.6-sol` | start `medium` | Reviewer is not the author" | this task: Codex 審查 model-dispatch 縮行提案是否語意流失（我是作者，依規則不得自審），one-shot read-only。
Codex review (session 019f97d3): VERDICT: BLOCK — 5 non-equivalent changes (1 LOW + 4 MED). All 5 fixed with Codex's suggested wording; file re-verified at 150 lines; two extra prose-only compressions (intro line, Raschka citation) to stay in budget. Applied to .agents/rules/model-dispatch.md.
Batch 2 H (tool-economy dedupe): assessed, no edit — global Tools 與 model-dispatch §2 僅重疊兩個短子句（>20 lines→ctx、web→ctx_fetch），各自服務 boot 與 delegation-gate 兩個讀取時機，砍任一邊都會產生 gap。決策：保留現狀。
Batch 3 done: C outcome ledger (evals/outcomes.jsonl + README), D delegation REFERENCES field, F deploy.sh SHA output, Codex#10 opt-in eval interview (unknowns-discovery §7.1). Deep Thariq comparison of unknowns-discovery deferred to backlog.
