# ADHD：retro 摩擦的結構性根治（2026-08-01）

問題：done-claim 無證據、delegation 模板 11%、指標被 subagent 檔汙染、context 耗盡重啟、便宜模型計數錯量級、worker 研究不透徹——要 harness 層根治，不要提醒文字。
5 frames × 6 ideas，五個獨立 frame 收斂到同 6 個 cluster。

## Cluster（wide set 摘要，[N V F]）
- A. done 變資料結構 [5 8 9]：evidence_ref schema、hook 先寫 result.json 才准說 done、DONE object 無證據不放行。
- B. 派發層強制模板 [5 9 9]：bill of lading、dispatch regex 拒收、constructor-only prompt、positional args type error。
- C. 來源分流 [6 9 8]：subagent transcript 出生即打 tag/xattr/獨立目錄，量測只掃 manifest。
- D. structured ledger 取代臨終 summary [7 7 8]：增量帳本、tool-result hash replay、hub 不囤貨。
- E. chokepoint 計數 [7 8 7]：spawn 事件計數、條碼式 model_id 標籤、禁自我申報。
- F. customs/RMA 驗貨 [7 6 9] ★：verifier queue 強制 replay，不合格退回原 worker 附退貨單，人審變兩次 RMA 失敗的例外。

## 收斂（shortlist）
1. **B 派發層強制**——合規率問題直接消滅，enforcement point 現成（PreToolUse hook / agent-tmux wrapper）。
2. **F RMA 驗貨** ★ 非顯而易見之選——把「人審是常態出口」翻成「人審是例外」，正中你「還是需要我最後看過」的痛點。
3. **C 來源分流**——一行分流修掉整類量測債，quick win，不需 deepen 直接做。
4. **D structured ledger**——攻 context 耗盡，與現有 .workflow 慣例相容。

Traps：
- 刪掉盤點腳本改全靠 wrapper 計數（speedrunner）——wrapper 覆蓋不全就漏計。
- subagent 檔改副檔名讓舊 grep 直接變對——會弄壞其他吃 .jsonl 的消費者。
- 帳單 API 當計數真相——Codex/Claude 帳單未必可程式化取得，viability 低。

## Deepened

### B. Bill of lading（派發強制）
PreToolUse hook 攔 Agent tool prompt 驗 GOAL/ACCEPTANCE/REPORT；agent-tmux start/send-wait 送出前跑同一支 validator，不合規 exit 1；Codex 側走呼叫路徑前置 lint。三處共用一份 schema（放 .agents/rules/，單一事實來源）。
- 承重風險：只能驗格式不能驗內容，會養出格式合規的空洞樣板（Goodhart）；hook crash 卡死整條 dispatch。
- 第一步：獨立 validate_bill_of_lading 腳本＋以本週 11%/89% 樣本做 fixture，跑通再接 hook。
- 子想法：hash 綁定防先射箭後畫靶；單檔可逆改動豁免；先 warn-only 一週量 baseline 再 hard block；schema 跨機 symlink；deny 事件進週報。

### D. Structured ledger（取代臨終 summary）
PostToolUse hook 每次 tool 呼叫 append 一筆 {ts, tool, args_digest, result_hash, files_touched, decision?} 進 run dir ledger.jsonl；resume 讀 ledger 尾端＋對 files_touched 重新 hash 比對，不一致標 STALE 強制重查；永不信 prose。
- 承重風險：hook 沒跑到的路徑留空洞，「看似完整的 ledger」比沒有更危險。
- 第一步：定 schema＋5 行 PostToolUse hook 只記 tool+path+sha256，真 session 跑一次驗可 grep 可 replay。
- 子想法：decision 欄位限 enum 禁敘事；ledger verify CLI；compaction 本身記一筆；replay-check 當 resume 前自動 gate。

### F. RMA 驗貨（★）
result.json 寫入觸發 verifier（fresh Sonnet），逐項 acceptance 且**必須 replay 至少一條可執行驗證指令**；FAIL 生成 rma.json（failed_acceptance_id, missing_evidence, replay_output）退回**同一 worker**（send-wait，不開新 worker）；兩次 FAIL 才升級人審並附兩份退貨單摘要。
- 承重風險：verifier 若只讀文字不 replay，整條流程退化成橡皮圖章——verifier 是否真執行 replay 是唯一承重假設。
- 第一步：只定 rma.json schema＋計數器，拿現有 result.json 手動模擬一輪，看 worker 憑退貨單能否自修，先不寫自動化。
- 子想法：無可執行驗證指令的 acceptance 一律不合格（逼 worker 寫可驗證 acceptance）；verifier 用同 profile worker；每 10 次抽查 verifier 一次；RMA 統計反饋 model-dispatch 模型升降級。

## Provocation
如果 delegation prompt 根本不該由 LLM 手寫——所有派發都走一個 CLI（`dispatch new --goal ... --acceptance ...`），prompt 是編譯產物，那 11% 這種指標從此不存在。要不要把 delegation-templates 從「文件」升級成「編譯器」？

## 執行順序建議（lazy path）
C（一行分流，今天可做）→ B warn-only（validator 腳本＋fixture）→ F schema 手動跑一輪 → D 最小 hook。每步先 warn/手動，量一週再 hard block。
