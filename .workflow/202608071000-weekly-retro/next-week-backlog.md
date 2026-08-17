# W33 backlog（2026-08-07 retro 產出；GitHub 對帳後修訂）

原則同前：每項有證據、落點、驗收。下週 retro 逐項對帳。

## agent-scripts
| # | 優先 | 項目 | 證據 | 驗收 |
|---|---|---|---|---|
| A6 | P1 | 撤 design-consensus attic 掛牌 | uses=5, consecutive_zero_weeks=0 | 掛牌標記移除、stats 續跑 |
| A7 | P1 | bol fail 大宗是 GOAL+ACCEPTANCE 同缺：warn 訊息內嵌 delegation-templates 三段骨架（拿來即填） | fail 19/37，其中 8 筆雙缺 | 下週 pass 率 > 70% 或有明確反證 |
| A8 | P1 | done-claim 無證據率 93.3%（惡化 vs W31 82%）：抽 14 筆真 session 複核 heuristic 是否高估；屬實則設計對策（Stop hook？） | collector [derived] 指標 | 複核結論兩行 + 對策提案或棄案 |
| A4 | P2（順延） | 做市商試跑 docs/design-vs-code-audit | 同 W31 | 兩行結論 |

## tmux-agent-tools
| # | 優先 | 項目 | 證據 | 驗收 |
|---|---|---|---|---|
| T4 | P2 | brief 子指令實戰導入：本週 worker 完結 0、派發全走 Agent tool，T1 合規曲線無樣本 | result.json 7d = 0 | 至少 3 筆真派發經 brief 產生，記入曲線 |
| T2 | P2（順延） | RMA schema 手動模擬 | 同 W31 | 一輪結論 |
| T3 | P3（降） | post-result ADR | worker 使用量 0，急迫性降 | 一頁 ADR 或明確棄案 |

## context-mode-local-insight
| # | 優先 | 項目 | 證據 | 驗收 |
|---|---|---|---|---|
| C3 | P3 | fleet.mjs 無 config 時印 usage 而非靜默退出 | `snapshot` 無輸出無錯誤 | 無 config 跑出可讀錯誤 |
| C4 | P2 | agent-sessions collector 補 tmux worker 與 bol-stats 兩個量測面（本次 retro 仍手排的兩條） | retro-report §2 尾兩列 | 下週 retro §2 全表出自 collector |
| C5 | P1 | collector 出**可疑名單**不只 rate：done-claim 無證據、canary 缺失、GAR 缺失、重試密集的 session 路徑清單；並補使用者糾正/agent 摩擦訊號（retro-agenda §2–4 漏斗的 Layer 1 輸出） | retro-agenda v1.1 Layer 1 覆蓋契約 | 下週 retro Layer 2 深挖直接吃名單，零手工翻找 |

## 跨 repo / 環境
- R2（前置已解除）：weekly-retro.workflow.js recipe 化——盤點→collector→bol/worker 統計→對帳表骨架；輸入含 `.workflow/retro/inbox.md`（§6.5 臨時動議＋隨手記）。驗收：下週 retro 以 recipe 起跑。
- E1（P1，需使用者確認）：100.64.190.44 拓撲釐清——遠端節點是否還存在、IP 是否重配（host key 已換、`uname -n` 回本機）。結果決定 fleet 跨機項目去留。
- R3（流程規則候選）：retro 對帳以 GitHub remote 為真相源，本地 clone 必先 fetch——本週 insight repo 落後差點誤判 P0。已提 lessons。

執行順序建議：A8 → A7 → C4 → R2，其餘按優先。
