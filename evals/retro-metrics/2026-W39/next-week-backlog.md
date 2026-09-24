# Next-week backlog — from 2026-W39 retro

編號用 `W39-n`（依 W38 編號說明，不再接舊字母）。每條對應 `retro-report.md` 的 F。
狀態：`open` | `decision`（待使用者）| `done`。下次 retro 逐條評「做了沒」與「有效沒」。

| # | 項目 | 對應 | 落點 | 驗收 | 狀態 |
|---|---|---|---|---|---|
| W39-1 | **collector 改用行內時間戳切窗口**：cmli agent-sessions、usage-dedupe.py、session-outliers.py、codex-tokens.py 都接受明確的起訖時間，不再用檔案 mtime 或「執行當下 −7d」 | F1、F8 | cmli；agent-scripts `evals/retro-metrics/` | 對 grok-bot-vm 重跑 W39 窗口：claude 2 場 / 0 token、agy 5 對話、cursor 0 chat；另造兩個反例檔（窗口外 timestamp 但 mtime 在窗口內、窗口內 timestamp 但 mtime 在窗口外），四支工具逐支都判對 | open |
| W39-2 | **codex-tokens.py 讀封存並取窗口差額** | F8 | agent-scripts | local-mbp14 W39 重跑得窗口內新開 22 場、含續用 23 場、窗口差額 37,655,442（精確相等）；窗口前的 122,531 token 不得計入 | open |
| W39-3 | **sqlite 讀取含 WAL**：去掉 `immutable=1`，改 `mode=ro` | F8 | cmli | remote-44 W39 codex 的唯一 thread 可見 | open |
| W39-4 | **Grok Bot app collector**：只計對話數與訊息數，標為 VM 副本，不加進全隊總數 | F8、F9 | cmli | 兩台 Mac 各出 W39 對話數與訊息數：local 15 / ≥852、remote-44 15 / ≥552，並標 lower bound；全隊總數不含這兩個副本 | open |
| W39-5 | **議程修訂：正例對照**：Layer 1 每個值要有行內時間戳窗口，每個 0 要有正例對照；重跑差 0 只算可重現 | F1 | retro-agenda.md 不變式 | 議程加一條；W40 每支 Layer 1 collector 都用 W39-1 的兩個反例檔跑過並判對，結果記進 method；W40 每個 0 值附正例對照指令與其 >0 結果；任一欄缺這兩項即標 UNCONFIRMED，不得進成本表 | decision（D4） |
| W39-6 | **wakeup-idle gate 補洞**：idle streak 超限時，不論 delay 都擋，除非同 session 有 Monitor | F4 | agent-scripts `.agents/hooks/wakeup-idle-gate.sh` | smoke：idle 3600 ×3 無 Monitor 被擋；有 Monitor 放行 | open |
| W39-7 | **compaction cap 放行交接步驟**：查 session ID、開接手 session、讀 session-titles 不計入 | F5 | agent-scripts `.agents/hooks/compaction-cap-gate.sh` | 對 W39 的 3 筆誤擋重放，皆放行；另 3 筆仍擋 | open |
| W39-8 | **tmux-agent 殘餘重送與收養 opt-in**：12/61 殘餘重送找根因；0.7.0 的 opt-in 做反要改回 | F3、M1、M2 | tmux-agent-tools #323 | 同 launch_id 投遞恰好 1 次（不是 0 次）；owner 正常完成時收到 1 次；非派工 session 預設不收；明示 opt-in 的 session 收養成功 1 次 | open |
| W39-9 | **evidence matcher 擴充（W38 Z1，第三週）** | F7 | cmli；`claim-evidence-gate.sh` | 先人工標註 W39 42 筆 done-claim；重跑後誤判 ≤ 5 筆且漏判 ≤ 2 筆（對標註集） | open |
| W39-10 | **糾正句粗篩修正**：排除續接摘要與注入文字；補辱罵字；建標註集 | F7 | agent-scripts `layer2-extract.py`；cmli | 以 W39 兩場人工 33 筆為標註集（3 筆正當請示標為非糾正），逐筆比對 precision ≥ 0.8、recall ≥ 0.8 | open |
| W39-11 | **compaction 摘要保留常駐授權** | F6 R2 | agent-scripts `.agents/hooks/precompact-instructions.sh` | 摘要模板有固定欄位；e4fe0066 型案例重放時不再改寫成「需核准」 | in progress：09-24 precompact 加「Standing Authorizations」固定標題；postcompact 在缺段時標示，並記錄 CLI、model、effort、advisor、雲端 session、git sha。smoke 32/32；重放未做 |
| W39-12 | **grok bot VM 錯誤洪流**：查 244,787 行 CDP 錯誤的來源與影響 | F10 | grok bot | 說明錯誤來源；log 加逐行時間戳後，以 7 天為基線，每日錯誤行數下降 ≥ 90%；或在 7 天觀測期內證明無害：seat 任務成功率不低於前 7 天，且錯誤行出現的時段內沒有 seat 失敗 | open |
| W39-13 | **retro 工具修正**：recipe-usage-stats.sh 改按週計；ctx-usage-report.py 處理 WAL 與查詢錯誤；probe.py 本機路徑不寫死 `~/git/` | F11 | agent-scripts `scripts/`、`evals/retro-metrics/` | recipe-usage-stats.sh 對「本週 0、上週 >0」的 recipe 回報 0；ctx-usage-report.py 在 WAL DB 上成功，且一個 DB 打不開時其餘照常輸出並記錯誤類別；probe.py 在本機 clone 路徑回報非 null | open |
| W39-14 | **Opus 5.5 effort 驗證與比較**：新 session 看 effort 是否為 medium；review 角色做一次 low/medium 比較 | F13 | agent-scripts `model-dispatch.md` §8 | 新 session 記錄 effort 顯示值；review 角色用同一組 5 個 diff、同一模型分別跑 low 與 medium，比較抓到的 bug 數、誤報數與成本 | open |
| W39-15 | **量 context 組成**：每次呼叫重讀 ~170k，system prompt 約 72k，其餘來源拆出來 | F2 | 量測 | 三大 session 各一張 context 組成表 | open |

W38 續留（見 `backlog-reconciliation.md`）：Z2 worker 載 kernel、Z4 fleet-deploy、Z6 lessons 裁決、Z7 fixture、Z12 probe 加 mods 段。

W39 補列（F14、D7；2026-09-24 追加）：

| # | 項目 | 對應 | 落點 | 驗收 | 狀態 |
|---|---|---|---|---|---|
| W39-16 | **遠端模式工作型態**：訊息以 queued 到達、或使用者回覆 p50 超過 10 分鐘時，每輪先做完所有不依賴使用者的工作，問題集中在最後一次問；完成或卡住時發推播 | F14 | agent-scripts routed rule（operator-defaults） | 下次遠端期間以 F14 方法重算：agent 每則訊息後工作 p50 ≥ 5 分（W39 為 2.7）；每則真人訊息 token 不高於在家期間 +20% | open |
| W39-17 | **長 loop session 的 context 上限**：`/loop` 指揮 session 每次呼叫的 context 中位數約 266k；讀檔等雜務交給 worker，或在門檻處交接新 session | F14、F2 | agent-scripts；tmux-agent-tools | `/loop` session 每次呼叫的 context 中位數 ≤ 150k；每則真人訊息 token ≤ 5M | open |
| W39-18 | **agentflow 採用挑選**：研究結果見 `agentflow-research.md` §3、§5，由使用者挑選 | D7 | 依挑選項目 | 使用者逐項標「採用／不採用」；採用項各開一條有驗收的 backlog | decision |
| W39-19 | **證據綁 commit sha**（使用者 09-24 選定，取代 mtime 與時間戳）：worker 的 result.json 帶產出所在的完整 commit sha，collector 收到後以 `git cat-file -e` 驗證存在且在該 worker 分支上，才算完成 | D7、F1 | tmux-agent-tools collector | 造兩個反例：sha 不存在、sha 不在 worker 分支，collector 都判未完成；正常案例判完成 1 次 | open |
| W39-20 | **stall 通知要有證據**：只陳述「pane N 分鐘未變、尚未確認卡住」並附 pane 尾行；只有尾行命中已知失敗字樣才標 stalled | D7 agentflow | tmux-agent-tools mod | 安靜但仍在工作的 worker 不標 stalled；卡在額度的 worker 會標 | in progress（09-24） |
| W39-21 | **launch 失敗「任務沒送到 CLI」**：7 次送出後 90 秒無處理動作，跨 claude、codex、fable、astra profile | F15 | tmux-agent-tools assign | 逐次查 pane 截圖或 log 找根因；W40 同類失敗 ≤ 1 次 | open |
| W39-22 | **mod 工具參數錯誤 17%**：工具說明寫清楚必填格式（brief 三段、keys 白名單、名稱規則） | F15 | tmux-agent-tools mod tool schema | W40 被退回比例 < 5% | open |
| W39-23 | **長任務重複撞同一個 gate**：同一場第二次被同一 gate 擋，要先讀它的說明再改做法；agent-device 預設帶 --device | F16 | agent-scripts skill agent-device；gate 訊息 | W40 每場同一 gate 被擋 ≤ 2 次 | open |
| W39-24 | **mod 長期行為驗證**：從 72 小時級 session 的 collector 紀錄，驗證 10 秒 tick 連續、hot reload 後 session.start 重觸發 | F15 | tmux-agent-tools | 兩項各有一筆實測證據，README 移除 UNCONFIRMED | open |
| W39-25 | **長任務為何不用 workflow**：查 Workflow 與 using-workflows 在長任務沒被採用的原因 | F16 | agent-scripts using-workflows | 列出原因並對應一條改動或明確不改 | open |
