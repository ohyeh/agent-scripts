# W38 retro plan（retro-agenda §1–§8）

run dir：本檔置於 `evals/retro-metrics/2026-W38/`，未依 agenda 開 `.workflow/<ts>-retro-w38/`（偏離；原因：產出全部進 repo 同目錄，避免兩處狀態）。

| # | 項 | 產出 | 驗證 |
|---|---|---|---|
| 1 | §1 backlog 對帳（W37 Y1–Y7＋2） | backlog-reconciliation.md | 每列有 file:line 或 grep 0-hit 註記 |
| 2 | §2–4 定額訊號 | retro-report.md §9；2026-W38.json outliers/paired_indicators | session-outliers.py 三機 turns0=0；對照組 2/23 漏抓 |
| 3 | §5 三機循環盤點 | loops-inventory.md；2026-W38.json lessons_fleet | lessons sha 三機列出，.47 分歧 |
| 4 | §6 死碼 | loops-inventory.md 末段；2026-W38.json zero_usage_skills（49） | 名單存檔供 W39 算 streak |
| 5 | §7 裁決表＋lessons 草稿 | retro-report.md §10 | 9 列皆有 file:line、建議、理由；不寫入 lessons.md |
| 6 | §8 機器層 probe 重建 | ../probe.py；2026-W38.json machine_layer；艦隊儀表板 republish | probe JSON 三機各一份；儀表板沿用值全換或標「本週未量測」 |
| 7 | 第二模型審閱 | opinions/agy.md | 每條 F 有同意/不同意/證據不足 |
| 8 | 回報 bridge | 新檔清單、commit hash、儀表板 URL、兩題 | — |

不動：worker 載 kernel、fleet-deploy、push（Paul 未決）。

## 第二模型審閱紀錄

- codex（`agent-tmux codex assign`，經 sonnet proxy）：exit 1，CLI 回「You've hit your usage limit … try again at Sep 19th, 2026 5:18 PM」，`assigned: false`。
- 改 agy（同 brief，`opinions/agy.md`）。
