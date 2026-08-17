# Weekly Agent Usage Retro — 2026-08-01

## Destination
七日內（2026-07-25 起）codex / claude / agy 全部 session（含封存）之使用行為 retro 報告：
行為模式、摩擦點、規則違反/改進提案，格式延續 202607241500-weekly-retro/retro-report.md。

## 指揮模式
Orchestrator-only：本 session 只盤點決策派發復驗，不親寫產品 code。
分級（定案）：調查=Explore(haiku/低成本)；收斂實作=Sonnet；fresh review=Sonnet；
最終大範圍驗收才考慮 Opus；Haiku 不做取捨判斷。

## 機器
- 本機 (darwin)
- 100.64.190.44 (ssh)

## Phases
1. 盤點：兩台機器 session store 位置/數量/封存機制（Explore, 並行）
2. 派發分析：依盤點結果分片給 Sonnet workers
3. fresh review：Sonnet 復驗 findings
4. 綜合報告 retro-report.md；最終驗收視規模決定是否 Opus
5. 指揮者終審（使用者要求，2026-08-01）：worker 模型有研究不透徹前科，
   fresh review PASS 後仍由指揮者親讀報告全文、對承重結論逐一核對 findings
   與必要時原始 session，終審通過才定案。

## Fog / Not yet specified
- agy session 存放格式未知
- 遠端機各 CLI 是否有使用
- 分析分片方式待盤點後定
