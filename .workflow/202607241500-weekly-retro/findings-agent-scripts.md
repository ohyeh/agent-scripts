# Findings — agent-scripts 週回顧（W1 retro-agent-scripts 回傳，commander 代為落檔）

期間 2026-07-17 → 07-24。

## A. 主題分組（documented，附 commit）
- **Global 規則高速演進**：v4.6.3 → v4.6.14，一週 8 個規則 commit（deaef83 → 6e11d5d 07-21 精簡 AGENTS.md 並把 ✈ 弱化成 first-reply-only → 9c64c93 / a164ccc 07-22 supervision 兩連改 → 05d9e63 V=0 → e260cc5 07-23 還原 every-reply ✈ → f10adf3 / 2f2d78f 07-24 ADHD + anti-slop）。model-dispatch.md 被其中 4 個 commit 觸及。
- **Supervision rework（07-21→22）**：9c64c93 → a164ccc 同日重寫；final-report 自報 154 tests PASS + fleet MD5 match（未由本次獨立重驗）。
- **Execution-frontier eval harness（07-21）**：542aaf4 新增零依賴 Node harness；bf86bc8 同日修 scrub.sh（harness 自己的 commit 觸發 identity scan 漏洞）。23/23 PASS 但 Linux/Windows UNCONFIRMED（final-report 自標）。
- **Fleet/manifest 整理（07-19）**：6 個 canonical-audit 修復；e881fec 發現 using-skills 在 3 台機器全部未安裝卻已註冊 skills-lock.json；288ed67 remote2 redeploy 標 pending (host offline)。
- **歸檔（07-23）**：6687bf8 歸檔 4.5.1/4.6.1/4.6.2 快照 + canary 事故紀錄。

## B. 事故／摩擦（documented）
1. **✈ canary 喪失**：6e11d5d 在降噪名義下弱化 canary → 每回覆 ✈ 率 65%→7%（Codex）/ 22%→1%（Claude），兩天後 e260cc5 還原並寫入教訓「canary 是觀測儀器不是噪音」。本週最典型 fixed-twice。
2. **Supervision 規則同日兩改**（9c64c93→a164ccc）：設計未定就出貨，數小時內判定不完整。
3. **scrub.sh 缺口自曝**（bf86bc8）：同日修復。

## C. 規則 churn（週內 2+ 次）
- global 主檔 8 commits、model-dispatch.md 4 commits —— 均超標。

## D. 缺口
- UNCONFIRMED：remote2 redeploy（288ed67）本週無後續 commit 確認解決。
- UNCONFIRMED：execution-frontier 跨平台支援。
- INFERRED：07-21 canary 回歸是使用者發現的，非自動檢查。
- INFERRED：.claude/handoffs/ 的 closeout 檔產出後未 commit（untracked drift）。

## E. Proposed improvements（Status: proposed）
1. 對兩份 global 主檔加自動檢查：✈ every-reply 措辭再被縮窄即 fail。
2. model-dispatch.md／global 主檔的編輯 commit 需附 .workflow artifact 連結。
3. .claude/handoffs/*.md 決定 commit 或 .gitignore，消除常態 untracked drift。
4. 追蹤 remote2 fleet-recipe redeploy（288ed67）收尾。
5. 同日規則連改（如 9c64c93→a164ccc）合併為單一 reviewed commit。

註：W1 subagent harness 封鎖 report 檔寫入，本檔由 commander 代寫。
