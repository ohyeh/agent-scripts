# ADHD：shipped-but-unused 工具的留/併/砍與採用（2026-08-01）

問題：12 recipes 9 支 0 用、router skills 個位數、context-mode-local-insight 0 跑、delegation-templates 實戰 11%。
5 frames（markets、game design、competitor、remove-assumption、10-year-old）× 6 ideas。

## Cluster [N V F]
- A. 沉默即處置 [6 9 9]：期貨到期交割、30-day kill-switch、delist 掛牌認領、玩具箱每週縮一吋。
- B. 造市試跑／blackout drill [7 7 8]：做市商每週對 0 用 recipe 重放真任務；季度隨機停用一支看誰發現。
- C. 懶惰路徑＝正確路徑 [7 8 9] ★：模板縮到比違規更短、低用能力收編為 agent-tmux 子指令、熱門工具借冷門零件才動。
- D. usage 訊號可信化 [5 8 7]：signed counter、router 必須 echo dispatch 目標（bypass 可 diff）。
- E. retro 當 gate／損失可視化 [6 5 6]：boss fight（trap）、locked chest 顯示錯過的 stat。
- F. 拋棄式 skill／記憶回放 [8 5 6]：inline 用完即丟、「回放你前三次怎麼做」取代 12 支 recipe。

Traps：boss fight 強制每週摸一次非 tmux 工具（Goodhart，為指標而用）；對 agent-tmux 上 prestige cap（人為降主力效率）；交易稅補貼冷門（機制複雜度>收益）；刪 repo 只留一段 prose（把主力也刪了）。

## 收斂
1. **A 沉默即處置**——機械、不靠人記得砍，直接回答「留/併/砍怎麼決」。
2. **C lazy-path 對齊** ★——不救 router，把能力搬到 772 次/週的肌肉記憶上；同時根治 11% 合規（prompt 變編譯產物）。
3. **B 做市商試跑**——A 的前置判官：分辨「沒需求」vs「沒被看見」，避免誤焚有價值但沒導流的 recipe。

## Deepened

### A. 沉默即處置
沿用本週 retro 的 jq/rg 管線寫 usage-ledger.jsonl；workflow-manifest 讀 ledger 找連續 N 週 0 用者 → 移 attic/ 附 MOVED.md（掛牌 30 天）；認領＝期限內真實呼叫一次或明文 KEEP 理由；無認領則唯讀封存。
- 風險：ledger 若只抓直接呼叫，會漏 router 間接觸發，假陽性焚毀活 recipe。
- 第一步：統計腳本加 consecutive_zero_weeks 欄位，先看分佈再定 4-8 週門檻，不急建 attic。
- 子想法：revive.sh 自動搬回；先用 7 支 skills 做 pilot（無 router 間接呼叫問題）；30 天窗口進 config 不寫死；擴充 workflow-manifest 現有欄位不另建格式。

### C. Lazy-path 對齊 ★
五個 delegation 模板收編為 `agent-tmux dispatch --template <name> --goal --acceptance --report`（CLI 編譯 prompt）；consensus-gate 收編為 `agent-tmux review --consensus`。多階段 loop（audit/triage）與治理型 skill 不收編——語意不合，硬塞會讓 agent-tmux 變隱形 orchestrator。子指令仍寫同一份 result.json contract，`--dry-run` 可印編譯後 prompt 留審計軌跡。
- 風險：旗標把思考壓成填空，塞敷衍字串過必填檢查——合規率漲但品質不漲（達標非達意）。
- 第一步：只做 IMPLEMENT 模板原型，量一週「子指令 vs 手寫」兩條合規率曲線再擴。
- 子想法：--goal/--acceptance 最小長度校驗；reviewer 用 profile 別名；多階段考慮 `watch --recipe` 另一語意。

### B. 做市商試跑
每週 retro 對 0 用 recipe 用本週真實任務重放一次（真 findings 跑 findings-triage），記「通/值/為何沒導流」三欄進 retro 產出。連續 M=3 次「通但無價值」→ 交 A 的到期流程；「跑不通」→ 修或砍；「有價值沒導流」→ router 觸發條件 diff 提案（走 maintenance.md 提案制）。
- 風險：價值判定自評自證會偏（想證明自己該存在，或真人慣性讓一切都顯得多餘）。
- 第一步：下次 retro 手動試跑 context-mode-local-insight（最極端案例），人工記一行，先驗證判斷可靠再排程化。
- 子想法：價值評分外包第二模型；「真人事後補標為何沒用」取代主動試跑（更便宜更真）；先只自動化「跑不通」維度；M 次窗口拉到季降抖動。

## Provocation
如果 skill 本來就不該是「安裝的資產」而是「當下寫完即丟的行為」——12 支 recipe 換成一個只會問「你前三次遇到這個怎麼做」並回放的記憶反射，coverage 從實際歷史長出來，而不是從預期需求長出來。要不要挑一支被砍的 recipe 做這個實驗？

## 執行順序（lazy path）
B 第一步（下次 retro 手動試跑 context-mode-local-insight，零成本）→ A 第一步（統計腳本加 consecutive_zero_weeks）→ C 原型（dispatch --template implement）。三者互鎖：B 判死因、A 執行處置、C 救該救的。
