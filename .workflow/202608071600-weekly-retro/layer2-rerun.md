# Layer 2 重跑（D-3 補作，2026-08-08）

方法：三個 general-purpose agent 平行深挖（各自先做 unknowns-discovery 假設對照，
jq/grep 抽取不讀原檔），加上指揮者親查 .44 短 session 群。
覆蓋：報告 §1c 點名的重量級 5 筆（842a6043 / cbc898bf / c26d3bd2 / fd7e9719 /
短 session 群 8 筆）。be456e92 為本 retro session 自身、6bc15b50 上輪已深挖，不重做。
§1c 未具名的其餘 flagged 條目無名單可循——collector 出名單（C5）落地前無法補齊，明寫為缺口。

## 逐筆結論（現象 → 根因類別 → 對策去向）

### 842a6043（healthgo-mobile，20.3MB，very-long + retry-dense(13)）
跨三天指揮模式 .fig pipeline，部分完成有證據。retry-dense 主體是刻意驗證探針（非盲目重試）。
1. agy worker 帶 `--prompt-file` 啟動空轉，lessons 2026-07-28 已載的坑三天內重踩 ≥2 次，agent 自承「memory 早有記錄」 → **規則存在但沒執行** → 併入 M5（wrapper 強制序列），升 P0
2. agy 在 tmux pane 反覆卡「Verifying your account」×4 波，Channel 頁工作全卡死 → ~~工具/環境：headless 認證~~ **（2026-08-08 使用者更正根因）**：`start --prompt-file` 舊寫法任務根本沒送達，pane 停在 CLI 初始畫面被誤讀成卡認證；agy 登入正常。真解＝M5 wrapper 收編使用者六步序列 → 併入 1
3. session-handoff validator regex 只認 `#`/`##`，範本用 `###` 必然假 FAIL ×4（本 session 2026-08-07 也踩同一坑，兩獨立事證）→ **工具/環境** → 修 `validate_handoff.py` regex（diff 見報告尾）

### cbc898bf（agent-scripts 自身，7.7MB，very-long + retry-dense(8)）
14.5h 馬拉松（W31 retro→砍伐季→封存），結尾 done-claim 是模範等級。
1. 全量審查被偷換成抽樣，使用者兩度打回「在這抽樣沒意義」 → **規則存在但沒執行** → 已折入 judgment-rubrics §5（2026-08-01 adopted lesson），棄案（勿重提）
2. Artifact 多 session 並發編輯 → 409 ×3＋早期 SVG 遭覆蓋誤刪需救回 → **工具/環境** → backlog 新項：artifact publish 前先讀最新版 merge
3. `tailscale status` offline 被當可達性證據 → 已由 L6 lessons 覆蓋，棄案

### c26d3bd2（healthgo-mobile，7.9MB，very-long + retry-dense(6)）
1. H1 worker 卡 2.5h，指揮者固定間隔 polling ×10 且使用者看不到進度，爆點「過了半天我啥都沒看到」，收場一次停掉 18 個 background agents → **規則存在但沒執行**（event-driven waits）→ lessons 提案 N1
2. dispatch gate 誤擋＋profile 已存在卻沒用 → **工具/環境** → 併入 agy/tmux-agent-tools issue（同 842 對策）

### fd7e9719（healthgo-mobile，5.5MB，retry-dense(5)）
結尾使用者滿意（「v6 到 v8 進步很多」「你們幹得漂亮」——本輪唯一正面收場的 flagged session）。
1. agy 卡關根因由**使用者自己**翻 lessons.md 貼出來，agent 沒先查 → **規則存在但沒執行**（P0 search memory first）→ lessons 提案 N2
2. handoff 接續後首要目標認錯＋worktree 沒切 → **規則缺失** → backlog 新項：session-handoff resume 段補 acceptance-echo checklist

### .44 短 session 群（19d5d8e5 等 7 筆＋f21d54b8，17–22 行）
全部開頭同句 "Review this change for security vulnerabilities"——**自動觸發的 security-review
session，非人為互動**。天生無 canary／無 done-evidence，一直污染兩個核心指標的分母。
→ **量測問題（E-5 就地結案）** → C5 加判準：collector 依首則 user message 模板辨識自動
session 並分桶，rate 計算排除。W32 的 canary 53.3%／done 無證據 96.9% 需在下輪以排除後口徑重算。

## 跨 session 收斂訊號（≥2 筆獨立出現）
1. **agy/tmux 啟動老坑**（842×2、c26d、fd7e、inbox 隨手記）——單一最高頻摩擦，且 lessons 記了沒用 → 唯一有效對策是 M5 wrapper 強制序列，**升 P0**
2. **指揮模式長 session 的收場模式**：使用者手動停掉 18～23 個 background agents ×2 —— fan-out 無節制（inbox 訴求「sub-agent 開太多」的實錘）
3. **validator/hook 自傷**：handoff validator 假 FAIL ×2 session、dispatch gate 誤擋、context-mode redirect 摩擦——自家工具鏈的 false positive 是 agent 體驗的主要摩擦源之一

## unknowns-discovery 總對照（我以為 vs 實際）
- 以為 retry-dense = 盲目重試 → 三筆中兩筆主體是刻意驗證探針/監督迴圈；真正的重複犯錯是「跨 session 重踩已記錄的坑」，flag 抓的位置不對
- 以為 very-long = 失控 → 全部是刻意的多 worker 編排馬拉松；very-long 本身不是病，病是其中的靜默 polling 與 fan-out 無度
- 以為 flagged = 失敗 → fd7e9719 正面收場；名單是「值得看」不是「有罪」
