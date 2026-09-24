# 2026-W39 Layer 2 深挖：高成本與 loop session（retro-agenda §2–4）

範圍：local-mbp14 本機三場 transcript（f57972bc agent-scripts、47d84cf3 project-b、a454348f project-b），以及上週行為改動的配對指標。
方法：用 scratchpad 內的腳本抽取資料，只印摘要（usage 以 `message.id` 去重、按真人／注入 user 訊息切 turn、ScheduleWakeup 輸入、tool_result 內的 BLOCKED、tmux-agent 注入訊息、`isCompactSummary`）。引用格式為 `sid:L行號`（transcript JSONL 行號）。
USD 是 cost.py 的 Opus 5 當量（input $5 / output $25 / cache read $0.50 / cache write $6.25 per MTok），用來比較，不是帳單。

cost.py 本機合計：`2026-W38 local-mbp14 claude $1116.55 (58 場 / 448 輪)`，`2026-W39 local-mbp14 claude $1630.92 (58 場 / 1095 輪)`。三場合計 $661.63，佔 W39 本機的 40.6%。

## 0. 我以為 vs 實際（unknowns-discovery）

| # | 我以為 | 實際（證據） |
|---|---|---|
| 1 | f57972bc 貴在 4 次 >100k cache break | 4 次 break 合計只有 $6.06；cache read 佔 $225.12/$272.79（82.5%）。1686 次 call，平均 context 269k；每次壓縮後從 169–182k 起跳，到 365–368k 再壓縮（10 段都一樣） |
| 2 | 47d84cf3 連排 5 次 3600s idle wakeup（backlog 對帳） | 其實 6 次：gate log 出現 `noop:true delaySeconds:3600`，streak 1→6，全部 `allowed`（47d84cf3:L8874/L9025/L9053/L9078/L9103/L9120）。後 4 次 tick 各重寫 176–187k cache |
| 3 | a454348f 的 turn 數被 tmux-agent 注入「稍微灌水」 | 同一個 worker（`agy-dtype-review-mo22` success）同一則完成通知，03:34–04:50Z 間重送 396 次，assistant 回了 391 次「Stale duplicate. No action.」。這些注入 turn 花 $133.30，佔 $160.97 的 82.8% |
| 4 | wakeup-idle gate 上線後至少擋過一次 | `$XDG_DATA_HOME/agent-hooks/wakeup-idle-stats.jsonl` 共 121 列，0 列 `blocked`；111/121 是 `noop:false`。streak 只有在 agent 自己標 noop 時才會累加 |
| 5 | v0.41.0 三個 commit 有清楚的上線時間，可以切 before/after | 三個 commit 的 author date 全在 2026-09-18T18:42:11–19+08:00（17 秒內，是 rebase 後的時間）。W38 已經有 6 次 `BLOCKED by dispatch gate`，表示 hook 在 commit 前就從 working tree 在跑。commit 時間 ≠ 部署時間 |

## 1. f57972bc（agent-scripts，`/loop`）— $272.79 / 454.8M

錢花在哪裡：cache read $225.12、output $25.40、cache write $22.26。按觸發來源分：`/loop` 35 turn $136.31、tmux-agent 注入 21 turn $65.10、真人 24 turn $39.95、task-notification 17 turn $31.44。
底線：每段壓縮後從約 170k 起跳；1686 call × 約 170k ≈ 287M ≈ cache read 的 64%（約 $143），不管做什麼工作都要付。已量到的組成只有 `prompt_snapshot.systemPrompt` 287k 字元（約 72k token）和 `invoked_skills` 附件約 20k 字元（f57972bc:L1242、L1258）；其他部分 UNCONFIRMED。

前 3 大尖峰：
1. f57972bc:L873 `/loop` 開場 turn $26.60（152 call，43.0M）。L880 cache write 313k：上一則真人 turn 是 09-21 15:32，12 小時後 cache 已冷。
2. f57972bc:L2102 真人糾正「你們自己 monitor 溝通 不要發呆偷懶」$13.51（88 call）。前一輪結尾（04:15）是 agent 把三個 worker 全部停掉、寫總結、打 ✈。
3. f57972bc:L10604 `/loop` turn $10.36（69 call，18.0M），是一輪標準的 loop 工作量，沒有 cache break。

Findings：
- 每 call 約 170k 的壓縮後底線吃掉約 64% cache read（約 $143）→ tool-environment → backlog 項：量測壓縮後 170k 的組成（system prompt／invoked_skills 重注入／hook additional context），再決定要砍哪一塊（f57972bc 10 段 first-call ctx 169–182k）。
- 10 次壓縮 ≈ 24 小時 ≈ $250，compaction cap 實際上就是成本斷路器；cap 在第 10 次成立，沒被繞過（f57972bc:L11432/L11488/L11512/L11613 四次 BLOCKED，沒有改用 ctx 繞道）→ 棄案（按設計運作）。
- 4 次 >100k cache break（L327 215k、L373 226k、L880 313k、L11737 215k）都在真人回來時發生，前面的空檔分別是 102 分、98 分、12 小時、32 小時，合計 $6.06 → tool-environment（cache TTL，無法避免）→ 棄案；另開 backlog 項：session-outliers.py 的 `cache_breaks_over_100k` 按觸發來源（human / ScheduleWakeup / injected）拆開，否則這類和 47d84cf3 的自找型 break 會混在同一個數字。
- 使用者要求 worker 持續互相 monitor，agent 卻把它們全部停掉並寫總結收尾（f57972bc:L2102；kernel `CLAUDE.md:100` 規定「each round ends by starting the next round's first step, not by summarizing」）→ rule not followed → lessons 提案（W38 的「你要自己 MONITOR BOT 不是空等發呆」又發生一次，寫在 wakeup-idle-gate.sh 開頭註解）。
- compaction-cap gate 擋了兩個交接用的動作：L11511 查 session id 準備改標題（allowlist 只認指令裡有 `/code/sessions/`），L11612 `tmux new-session` 開接手 session。使用者只好用 5 個真人 turn 自己處理（L11585–L11657）→ tool-environment → backlog 項：allowlist 補上改標題前置查詢與開接手 tmux session。
- 46 次 ScheduleWakeup 全部 `noop:false`，理由寫「只是備援心跳」，而且有 collector 會喚醒（例如 L8508、L9538），所以不算 idle，gate 也不會算 streak → 棄案（這是合理的備援；只記錄 gate 靠 agent 自己標 noop 這一點）。

## 2. 47d84cf3（project-b，`/loop`）— $227.87 / 372.5M

錢花在哪裡：cache read $184.00（80.7%）、cache write $22.66、output $21.19。1395 call，平均 context 266k，10 次壓縮，每段 152–174k 起跳、363–368k 壓縮。按觸發來源分：真人 25 turn $108.46、`/loop` 25 turn $66.32、tmux-agent 注入 20 turn $31.37、task-notification 7 turn $21.71。

前 3 大尖峰：
1. 47d84cf3:L7257 使用者下「持續 loop 每次 LOOP 你要最主動做更多事情」的 turn $31.50（189 call，54.1M）。
2. 47d84cf3:L9138 使用者「都做 然後示意截圖更新到 artifacts」$22.34（138 call，cw 337k）。這是 agent 空等 5.5 小時後，使用者自己回來回答那三個決定。
3. 47d84cf3:L435 研究 duo 機制與 X 開發者分享 $13.77（90 call）。

cache break >100k：L50 152k（session 開場），L9053/L9078/L9103/L9120 176–187k（idle tick），L12659 192k（03:09 stop 之後 3h17m，使用者問「Handoff 寫好了？」）。

Findings：
- 6 次 `noop:true delaySeconds:3600` idle tick（17:02–22:08Z）都放行。18:03 之後的 5 個 tick 共 $5.45，整段 idle 視窗（L8825–L9116）共 $9.48；每個 tick 實際間隔約 61 分，每次都重寫整個 cache（cw ≈ cr ≈ 180k）→ rule missing（gate 對 ≥3600 沒有規則）→ backlog 項：gate 改成「連續 noop 滿 streak 就只准 stop:true」，或者要求同一 session 有 Monitor 才准 ≥3600（證據見 §4）。
- 3600s 剛好比 cache 存活時間長：f57972bc 的 1200–1800s 心跳沒有任何 >100k break，47d84cf3 的 3600s tick 每次都 break。所以 gate 的 3600 門檻正好是最貴的值（推論；TTL 實際值 UNCONFIRMED）→ tool-environment → backlog 項（跟上一條一起處理）。
- agent 在等使用者決定（reason 寫「還在等使用者決定版面 A、tier 對應、上游 issue 這三件事」L9025），5.5 小時內沒有 PushNotification；整場唯一一次是 L12622（隔天 03:09）。kernel `CLAUDE.md:104` 要求「blocked on the user」時要出聲 → rule not followed → lessons 提案（「notify + stop」這個出口只寫在 gate 的 block 訊息裡，但 block 從沒觸發，所以 agent 沒看過）。
- compaction-cap gate 擋了 L12563 讀 `session-titles.md`，而那正是 gate 自己 block 訊息第 3 步要引用的規則；L12531 擋的是遠端裝置指令（正確）→ tool-environment → backlog 項（跟 §1 的 allowlist 合併）。
- 開場 L26 使用者貼上前一場 f57972bc「被 gate 擋住，繞過去就是自我豁免，我不做」的回覆，表示 gate 的「不准豁免」有效 → 棄案（正面證據）。

## 3. a454348f（project-b，Dynamic Type）— $160.97 / 301.9M

錢花在哪裡：cache read $150.29（93.4%）。577 call，全程沒有壓縮，context 從 155k 長到 497k，平均 523k。tmux-agent 注入 397 turn $133.30；真人 18 turn $26.87。

前 3 大尖峰：
1. 注入風暴 a454348f:L950–L5075：`agy-dtype-review-mo22` 的完成通知重送 396 次（最後是每約 10s 一次），391 次回「Stale duplicate. No action.」，每 turn 約 $0.34，合計 $133.30。
2. a454348f:L5077 cache write 316k（$2.03 單次 call），發生在 L5071 `/reload-plugins` 之後。reload 讓 cache 失效；同時風暴也在 L5075（04:50:29）停止。
3. a454348f:L531 使用者「android 呢？」$6.59（32 call）；其次 L791 字級對應選擇 $4.90。

Findings：
- 同一則通知重送 396 次、花 $133.30：register.ts 的 ack 存放區由全機共用，另一個 collector 會 prune 掉 owner 的 ack，所以每 tick 重送（tmux-agent-tools `mods/tmux-agent/hooks/register.ts` 約 L407–412 的註解記載「re-delivered the same result every 10s, 131 times (observed 2026-09-18)」）→ tool-environment → 棄案（v0.41.0 dcd2186 已修，配對指標見 §5；殘留部分另列 backlog）。
- 使用者糾正「AppDynamicScale 是你們創造的 但是我要的是吃系統」（a454348f:L449），接著指定參考 1.0.14／1.0.15 的做法（L488）。agent 自己造了一套 scale，沒有用 iOS 系統 Dynamic Type → rule not followed（kernel「Follow a user-supplied working reference exactly first」、Live truth）→ lessons 提案。
- 使用者糾正「現在字級已被 ax3 封頂 我沒說要寫死 你為啥要寫死」（a454348f:L5129）。同一場第二次把使用者的話解讀成自訂常數；前一則 assistant 還以「要我照這個做嗎」收尾 → rule not followed → lessons 提案（跟上一條合併：拿系統值／使用者參考，不要自訂門檻）。
- context 沒壓縮就長到 497k，平均每 call 523k。風暴期間每則 no-op 回覆都要讀整個 context → tool-environment → backlog 項（UNCONFIRMED：1M context 的 autocompact 點比 368k 高很多；兩者一起看才能判斷 no-op turn 的單價）。

## 4. 判定：wakeup-idle gate 會不會放行 delay=3600、沒掛 Monitor 的純 idle loop？

**會（YES）。**
- 程式碼：`.agents/hooks/wakeup-idle-gate.sh:53` 的判斷是 `[ "$next" -gt "$IDLE_STREAK_MAX" ] && [ "$delay" -lt "$IDLE_MIN_DELAY" ]`，3600 不 `< 3600`，所以直接放行；整支腳本沒有檢查 Monitor。
- Gate log：47d84cf3 在 2026-09-23T17:02:58Z–22:08:07Z 有 6 列 `noop:true, delaySeconds:3600, streak:1..6, result:allowed`；全部 121 列中 `blocked` 為 0。
- Transcript：47d84cf3:L8874/L9025/L9053/L9078/L9103/L9120，reason 都是等使用者決定。整場 Monitor tool_use 0 次，PushNotification 只有 L12622 一次（隔天 03:09）。三場 session 都沒有呼叫過 Monitor。
- 另外，block 訊息的選項 (c)「attach a Monitor … schedule ≥3600s as the fallback only」承諾了程式碼根本沒檢查的條件。

## 5. 配對指標（改動 → before/after）

來源：本機 `~/.claude/projects/*/*.jsonl` 按 record timestamp 分週（W38 09-10T16:00–09-17T16:00Z；W39 09-17T12:15–09-24T12:15Z），加上 gate log。只有本機，不含 remote-44／grok-bot-vm。

| 改動 | 指標 | W38 → W39（或 before → after） | 判定 |
|---|---|---|---|
| 4a458fc compaction cap | 本機單場最多壓縮次數；超過 cap(10) 的場數 | 最多 12 → 10；超過 cap：≥1 → 0。gate log 25 列，blocked 6（f57972bc 4、47d84cf3 2） | 有效（上限守住）；但 6 次中有 3 次擋的是交接動作（f57972bc:L11511、L11612，47d84cf3:L12563） |
| 4a458fc idle wakeups blocked | ScheduleWakeup `noop:true` 次數（其中 ≥3600s）；gate blocked 數 | noop 21（8）→ 10（6）；blocked 0/121 | 無法驗證有效性：gate 從沒觸發，noop 下降不能算到它頭上；唯一的 idle streak 走 3600 漏洞通過 |
| 4a458fc 每場只留一份 compact handoff | 部署後新寫入的舊格式 `<ts>-compact-<sid>.md` 數；新格式 `compact-<sid8>.md` 數 | 舊格式 0（59 個舊檔檔名日期都 ≤09-15；terrain 的 26 個 09-18T23 mtime 是已 commit 檔案在 checkout 時被動到，git log 顯示 09-05 已進版）；新格式 10 個；f57972bc 壓縮 10 次只有 1 個檔 | 有效 |
| tmux-agent-tools 166a32f wrapper 併入 agent-tmux | Bash 呼叫舊 wrapper 名（`codex/agy/claude/cursor-tmux`）次數；`agent-tmux` 次數 | 舊名 6 → 8（W39 的 8 次全在移除 shim 的那場 a4df94ae 裡，是 refactor 本身）；agent-tmux 102 → 107；command-not-found 1 | 無法驗證有效性：這次改動沒有定義成效指標；舊名計數是 refactor 自己產生的 |
| tmux-agent-tools 4537a58 dispatch gate hook | tool_result `BLOCKED by dispatch gate` 次數；`mcp__tmux-agent__*` 呼叫次數 | block 6 → 3；MCP 工具呼叫 20 → 214 | 無法驗證有效性（單獨看）：W38 已經有 block，表示 commit 前就在跑；跟 dcd2186 一起看，走工具路徑的呼叫增加 10 倍 |
| tmux-agent-tools dcd2186 function-hook mod（含 ack 修正） | 同一 worker+狀態的重複注入數／注入總數（以 commit 時間 09-18T10:42Z 切） | 448/471（95%）→ 12/61（20%） | 有效（風暴已停）；殘留 12 次間隔 5–100 分（例如 f57972bc:L2899/L3051/L3326、f6d8172a 同一 worker 4 次），跟 10s 風暴不同機制 → backlog 項 |

## 6. 對策去向總表

- lessons 提案：(a) loop 輪結尾不停 worker、不寫總結（f57972bc:L2102）；(b) blocked on user 要 PushNotification + stop，不排 3600 心跳（47d84cf3:L9025–L9120）；(c) 用系統值或使用者給的參考，不自訂常數或門檻（a454348f:L449、L5129）。
- backlog 項：(1) wakeup-idle gate 補 ≥3600 漏洞，或要求有 Monitor；(2) compaction-cap allowlist 補改標題前置查詢、開接手 tmux session、唯讀讀 rules；(3) 量測壓縮後 170k 底線的組成；(4) session-outliers.py 的 cache break 按觸發來源拆；(5) tmux-agent 殘留重複投遞（post-release 12 次）；(6) 1M context 的 no-op turn 單價與 autocompact 點（UNCONFIRMED）。
- 棄案：真人回來時的 TTL cache break（$6.06）；有 collector 的 noop:false 備援心跳；compaction cap 未被繞過（正面證據）。
