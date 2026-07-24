# Findings — 本機使用痕跡（W3 retro-usage 回傳，commander 代為落檔）

## lessons.md（~/.agents/rules/lessons.md，60 行，15 條）
- Status 分布：1 retired / 14 proposed / 0 adopted。本週新增 11 條（2026-07-17 之後）。Observed。
- 落差：累積速度快但沒有跑 review-and-fold-in；14 條 proposed 零轉化。Inferred。

## .workflow/ 使用（agent-scripts）
- 4 個 run：202607210351-model-dispatch-efficiency、202607212000-execution-frontier、202607220001-deterministic-external-worker-supervision（三者必備檔齊全），加本次 retro。
- 衛生問題：execution-frontier 內有雜檔「deep-research-report (1).md」（37KB，瀏覽器下載式重複命名）。
- 其他 repo 本週零 .workflow 使用（fd 全掃負結果）。Observed。

## Handoffs（.claude/handoffs/）
- 2 份，與 model-dispatch-efficiency、deterministic-worker-supervision 兩 run 一一對應；execution-frontier 無對應 handoff（是否刻意 UNCONFIRMED）。

## Skills
- 本週（07-17 後、stop-slop 安裝前）無新 skill。Observed。
- 「裝了但沒用」交叉檢查未做（UNCONFIRMED，讀取預算限制）。

## Proposed improvements（Status: proposed）
1. 排程 lessons.md review：14 proposed / 0 adopted 的積壓要消化。
2. 清掉 execution-frontier 的「deep-research-report (1).md」雜檔。
3. 確認 execution-frontier 是否需要補 handoff。
4. 檢查其他活躍 repo 是否有非平凡工作未走 .workflow 慣例。
5. 下次 retro 加「skills 實際被 invoke」檢查，抓 install-vs-usage 漂移。

註：W3 subagent harness 封鎖 findings 類檔名寫入，本檔由 commander 代寫。
