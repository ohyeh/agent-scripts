# W39 retro plan（retro-agenda §1–§8）

窗口：2026-09-17 → 2026-09-24（7d）。run dir 沿用 W38 做法，放 `evals/retro-metrics/2026-W39/`，不另開 `.workflow/`。
機器鍵沿用 W38：`remote-44`、`local-mbp14`（本機，本次 retro 執行處）、`grok-bot-vm`。三機 SSH 09-24 實測可達。
公開 repo：產物只寫機器鍵，不寫 IP、hostname、SSH user（check-rules-invariants public-sensitive-literals）。

| # | 項 | 產出 | 執行 | 驗證 |
|---|---|---|---|---|
| 1 | §2–4 Layer 1 三機採集 | ../2026-W39.json（W38 同 schema） | subagent A | usage-dedupe 每機兩次差 0；每欄有 method 或「本週未量測」 |
| 2 | §1 W38 backlog Z1–Z12 對帳 | backlog-reconciliation.md | subagent B | 每列有 commit/issue/file:line 或 0-hit 註記；做了 vs 有效分開 |
| 3 | §5 三機循環盤點＋§6 死碼 | loops-inventory.md；zero_usage streak | subagent C | lessons sha 三機列出；零用量 = 安裝 − 呼叫 − 提及 |
| 4 | §2–4 Layer 2 深挖 | layer2.json；report §Layer 2 | 主 session | 每筆一行：現象 → 根因類別 → 去向 |
| 5 | 改動配對指標 | report §配對 | 主 session | W38 每項行為改動有前後指標或標「無法驗證」 |
| 6 | §6.5 inbox 倒空＋臨時動議 | report §6.5 | 主 session＋使用者 | inbox 三條各有去向 |
| 7 | §7 裁決表＋lessons 草稿＋W40 backlog | retro-report.md、next-week-backlog.md | 主 session | 每條 finding 有證據、落點、驗收 |
| 8 | 第二模型審閱 | opinions/ | tmux worker | 每條 F 有同意/不同意/證據不足 |
| 9 | §8 艦隊儀表板 | 同 URL republish | 主 session | 數字全為本輪現測 |

本週新增觀察點（本 session 帶入）：Opus 5.5 上線（09-24 成預設）、kernel 4.31.0 已 commit 未 push、`modelSettings.claude-opus-5-5` effort 生效待驗。
不動：push、fleet-deploy（使用者未授權）。
