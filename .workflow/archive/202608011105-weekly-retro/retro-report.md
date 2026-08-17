# Weekly Retro — 2026-07-25 → 08-01（commander 綜合）

輸入：inventory-local.md / inventory-remote.md / findings-claude-local.md / findings-codex-local.md / findings-remote.md / review-verdict.md（三個 Sonnet workers 分片分析，Sonnet fresh review PASS，指揮者終審逐項核對 findings 與關鍵原始 session）。

## 一週全貌

- **兩機三 CLI 量能**：本機 Claude 175 個 7 日內 .jsonl（~124MB）、本機 Codex 137 unique session_id（749→105 in-window + 859→367 archived 交集去重，UNCONFIRMED 見文末）；遠端（100.64.190.44）Codex 37 in-window、Claude 169 in-window（含大量 subagent transcript）。
- **主力專案**：本機以 **photo-gallery 系為壓倒性主力**——Codex 側 106/137（77%）落在 paul-photo-gallery + ppg-* 衛星 worktree；Claude 側 top 專案 paul-photo-gallery 81、agent_workspace 35、agent-scripts 25。遠端則以 **healthgo-mobile 為主力真實專案**——Codex 29/37（78%，CONFIRMED）。
- **07-28 worktree fanout**：本機 Codex 單日暴增至 91 個 session（占週量 66%），成因是 codex-tui 對 paul-photo-gallery 開出 35 + ppg-* 衛星 worktree 48 個平行 session——一次多分支 fanout 而非多個獨立任務。深讀未覆蓋（見「未覆蓋」）。
- **07-31 遠端爆量**：遠端 Claude 單日 88 個 in-window 檔，目錄以 subagents（103，疑為 workflow 產物，未確認）、healthgo-mobile（38）、wf_*（17）為主。

## 摩擦 Top（合併兩機，附 session_id + 時間）

1. **done-claim 一分鐘內被打回**（本機 Codex）：`019f9db8`，2026-07-26T12:57Z——使用者回「你先讀懂」「不做事」；同 session 也是本週最長（5634 行 / 38 turns / ~21.8 小時）。review-verdict 已核實引句與時戳。
2. **「老問題」重犯被點名**（本機 Codex）：`019fb10d`，2026-07-30T09:46Z。
3. **「不要那麼多廢話」明確糾正**（遠端）：`0bd86b0e`，2026-07-31T06:11Z——要求嚴格遵守 /adhd /stop-slop；經 review-verdict 核實。
4. **35 分鐘內 4 次中斷**（遠端）：`db9613b7`，2026-07-30 08:32–09:05Z。
5. **context 耗盡後重啟**：遠端抽樣 6 個 session 中 5 個出現 continuation-from-summary；本機 Codex 另有 context_compacted 16 例、turn_aborted 3、thread_rolled_back 4——代表案例 `019fa8e5`（07-28T14:28Z，worktree 放錯位置＋尖銳糾正＋rolled_back）、`019fad99`（07-29，PR-review loop 反覆糾正＋turn_aborted）。
6. **cross-agent crosstalk**（遠端）：`cc654ee4`，07-27——無關隊友訊息撞入＋hold-off 指令；同 session 61 個 error 關鍵字 / 5145 行，本週最吵。

本機 Claude 側較輕摩擦：16/175（~9%）含 `[Request interrupted]`，抽讀多屬 scope 糾正或主動打斷去跑 /session-handoff、/recap、/compact（例 `e0394a98` 07-25T04:42Z 偏題糾正），非錯誤復原；permission denial（啟發式）10 個 session，集中 paul-photo-gallery 與 agent-scripts。

## 規則遵循

- **✈ canary**：口徑不一，**不可跨機直接比較**（作者與 review-verdict 皆自標）——本機 Claude 50/159（~31%，分母含 subagent 檔被稀釋）；遠端 45/161（28%，substring 粗略下界）；本機 Codex 未單測。
- **Delegation GOAL/ACCEPTANCE/REPORT**：本機 Codex 使用者端 prompt 僅 15/133（**11%**）含結構化欄位；agent 端下游套用 UNCONFIRMED。遠端抽樣 40 個 subagent transcript：GOAL 42%、ACCEPTANCE 35%、REPORT 38%（抽樣，不代表全體）。
- **done-claim 證據缺口**：本機 Claude 啟發式 67/175（regex 未看相鄰 tool_result，**可能高估**）；遠端未測（UNCONFIRMED）。搭配 `019f9db8` 實例，此缺口有具體踩雷紀錄，非純統計噪音。

## 系統性觀察

- **Haiku 盤點計數再度出錯**：盤點 worker（Haiku）回報 claude=1、codex=1，指揮者以 `find -mtime -7` 復核為 172/105——差兩個數量級。「Haiku 不做取捨判斷/計數」定案延續，且盤點類任務復核不可省。
- **subagent 檔汙染量測指標**：本機 Claude 175 檔中大量為 `subagents/` 子檔，遠端同款（103 檔性質未確認）。所有跨機規則遵循比率需先「排除 subagent 重切檔」重切分母才可比——本輪三份 findings 均未做到（各自已自報）。此為量測債。

## 改進提案

| # | 優先級 | 工作量 | 提案 | 依據 |
|---|---|---|---|---|
| 1 | P0 | S | 盤點類任務禁用 Haiku 做計數/判斷，一律指揮者或 Sonnet 復核 | inventory-local.md（1 vs 172/105） |
| 2 | P1 | M | canary / delegation 合規量測工具化：先濾 subagent 檔、統一分母，才可跨機比較 | findings-claude-local.md、findings-remote.md |
| 3 | P1 | S | delegation 模板 hook 化（呼叫點強制檢查），而非事後量測 | findings-codex-local.md（11%）、findings-remote.md（35-42%） |
| 4 | P1 | S | context 耗盡前主動 handoff：接近上限即觸發 /session-handoff 提醒 | findings-codex-local.md（compacted 16）、findings-remote.md（5/6 重啟） |
| 5 | P2 | S | done-claim 偵測腳本同時檢查相鄰 tool_result，降低高估 | findings-claude-local.md |
| 6 | P2 | M | 07-28 fanout（91/66%）與 07-31 遠端爆量（88）深讀一次，判定健康平行或浪費 | findings-codex-local.md、findings-remote.md |
| 7 | P2 | S | cross-agent crosstalk 加訊息隔離/來源標記檢查 | findings-remote.md（cc654ee4） |

## 全量補掃修正（v4，取代抽樣值；findings-remote-fullsweep.md、findings-local-fullsweep.md）

- **規則遵循乾淨分母（遠端 top-level n=47，排除 subagent 檔）**：✈ canary 36.2%；GOAL/ACCEPTANCE/REPORT **4.3%**（先前抽樣 35-42% 抽的是 subagent transcripts，母體錯誤）；done-claim 無證據 **82.1%**（heuristic 上界）。合規現實比抽樣估計差一個量級。
- **correction 關鍵字全量數是上界**：top session 覆核 42 命中僅 6 次真的來自 user role，其餘為 assistant/注入文字誤中。
- **07-28 fanout 判定：健康平行分工**——120 檔＝83 root＋37 children（原 91 為手算漂移），children 型態清楚（review/fix/experiment/verification），119 normal / 1 abandoned。
- **codex 編排通道修正**：原生 spawn/wait/send tool-call 才是大宗（wait_agent 1782、spawn_agent 284），shell 顯式 agent-tmux 僅 27 次——own-tools 報告的 codex 404 次含文字命中，解讀下修。
- **數字裁決**：兩全量 worker 衝突（474 vs 137），指揮者同口徑親跑＝**138**，原 137 成立、474 推翻；「12 條 fork 鏈」口徑無法重現（實列 28 條膨脹上界，明細可信）。
- **agy 深挖**：172 db 全掃，窗內 36/4408 steps；內容為 protobuf blob，無 .proto 不可解，UNCONFIRMED。遠端 agy 時區疑雲結案（就是 1 個真實對話）。
- **流程教訓（本輪新增）**：①盤點 CLI store 從 binary/--help 反查，不猜 dotdir；②retro 每個數字附產生指令，否則手算漂移（91/12 兩例）；③分工定式：腳本全量（便宜層）→ LLM 深讀只碰標紅 → 口徑衝突由指揮者親跑裁決。

## 自家 tool/skill 採用（追加，詳見 findings-own-tools.md）

- **重度使用**：agent-tmux（Claude 368 次/29 sess + Codex 404 次/41 sess，本週最大宗）；agent-scripts 維運腳本（deploy.sh 82 次、check-rules-invariants.mjs 47 次）均為帶 exit-code 檢查的健康用法。
- **router skills 有被走到但量低**：using-workflows 3、using-skills 1、unknowns-discovery 2、delegation-templates 2（Claude 側實呼叫；Codex 側技能為文字注入，採用率結構性不可量測）。
- **12 支 workflow recipe 有 9 支本週 0 用**（consensus-gate、plan-pipeline、docs/design-vs-code-audit 等）；有用的 3 支全集中 paul-photo-gallery。
- **context-mode-local-insight 整個 repo 本週 0 次實跑**——是最明確的「shipped but unused」。
- 方法債教訓：分析工具使用率時必須先排除分析者自身 session，否則 never-used 清單失真（本次實際踩到並修正）。
- 追加提案 8（P2/S）：對 9 支未用 recipe 與 context-mode-local-insight 做「留/併/砍」決策，下週 retro 帶結論——shipped-but-unused 也是維護成本。

## UNCONFIRMED 與本次未覆蓋

- **UNCONFIRMED**：Codex 去重 137（過濾法未機械重放，未證偽）；per-turn model/effort；agent 端模板套用比率；本機 Claude 同指令重試、tmux worker 用量；遠端 done-claim 證據與 abandoned sessions；遠端 subagents 目錄性質。
- **agy 翻案（補件，findings-agy.md）**：agy = Google Antigravity CLI，store 在 `~/.gemini/antigravity-cli/`——原盤點「unused」是找錯目錄。本機窗內 ~36 conversations（claude 175 / codex 137 / agy 36，最小但非零），用途為 packet-based 開發/審查工作流（P3/P5/Round N），集中 paul-photo-gallery；07-30 有一次 RECOVERY×3 的 background process 卡死。系統性教訓：盤點 CLI store 要從 binary/--help 反查，不能猜 dotdir 名——「搜尋模式有效」不等於「候選路徑完備」。
- **未覆蓋**：agy conversation .db（protobuf blob）逐筆解析、遠端 agy mtime 判讀差異；07-28 spike ppg-* session 逐檔深讀；fork 12 條鏈內容；遠端全量掃描（僅抽 6）；Codex/遠端側 tool-call 統計。

—
終審：指揮者已逐項核對本報告數字/引句與六份輸入檔一致（2026-08-01）。
