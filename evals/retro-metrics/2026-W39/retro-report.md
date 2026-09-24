# Weekly Retro — 2026-W39（窗口 2026-09-17 → 2026-09-24）

資料：`../2026-W39.json`（已套稽核更正，collector 原值保留在各欄 `collector_raw` 或 `collector_derived_invalid`）、本目錄 `coverage-*.md`（三機逐 CLI 稽核）、`layer2-corrections.md`、`layer2-cost-loops.md`、`backlog-reconciliation.md`、`loops-inventory.md`、`opinions/codex.md`（第二模型審閱）。
方法：三機唯讀採集（`local-mbp14` 本機、`remote-44`、`grok-bot-vm`，09-24 SSH 實測皆可達）。Layer 1 跑完後，另派三個稽核逐機逐 CLI 直接讀 store 重算，每個 0 都要有正例對照。
本週與 W38 不同：Layer 1 的驗收全過（dedupe 兩跑差 0、jq exit 0、keys 相同），但 grok-bot-vm 的值仍是錯的。token 與場數以稽核值為準。grok-bot-vm 由 collector 衍生的比例（canary、GOAL/ACCEPT/REPORT、done、correction）已作廢，窗口內重算值 UNCONFIRMED。
窗口定義：稽核用 09-17T12:00Z → 09-24T12:00Z；collector 在 12:15–12:18Z 執行、用「執行當下 −7d」。兩者差 15–18 分鐘，已知未統一（W39-1）。

## 1. 成本（cost.py，Opus 5 API 費率當量，非帳單）

```
== 2026-W39 (2026-09-17 → 2026-09-24)  費率 Opus 5
  remote-44            claude $   22.90  (7 場 / 7 輪)  codex 0M UNPRICED
  local-mbp14          claude $ 1630.92  (58 場 / 1095 輪)  codex 38M UNPRICED
  grok-bot-vm          claude $    0.00  (2 場 / 2 輪)  codex 0M UNPRICED
  合計 Claude            $ 1653.82   ·  每輪 $1.498
```

cost.py 印出的每輪 $1.498 不可用。輪數裡混有 tmux-agent plugin 注入的訊息，兩週用同一方法扣除：

| 週 | Claude USD | collector 輪數 | plugin 注入 | 扣除後 | 每輪 |
|---|---|---|---|---|---|
| W38 | $1,552.61 | 846 | 7 | 839 | $1.851 |
| W39 | $1,653.82 | 1,104 | 526 | 578 | $2.861 |

每輪成本上升 54.6%。注入數可重播：

```
python3 evals/retro-metrics/plugin-injected.py 2026-09-10T16:02:00 2026-09-17T16:02:00   # {"injected": 7, "quoted": 2}
python3 evals/retro-metrics/plugin-injected.py 2026-09-17T12:15:00 2026-09-24T12:15:00   # {"injected": 526, "quoted": 3}
```

窗口用各週 collector 的執行時刻，與 collector 輪數同口徑。只數內容以該句開頭的 user 訊息；使用者引用該句的 quoted 訊息算真人輪，不扣。這與稽核的 526 一致。只掃 local-mbp14，另兩機本週 Claude 使用接近 0。扣掉 plugin 訊息不等於純人工輪數：稽核另數到 268 則 tag 包裹訊息與 bridge 訊息，未扣。

local-mbp14 的 Claude token 以行內時間戳嚴格窗口為 2,554,150,642，collector 為 2,615,106,294，差 2.33%，成本未改。Codex 的 38M 是含封存的累計值，窗口差額見 §2。

## 2. 三機 × CLI 稽核結果

| 機器 | CLI／app | 稽核值 | collector 是否可信 | 關鍵原因 |
|---|---|---|---|---|
| local-mbp14 | claude | 嚴格窗口 59 場 / 2.55B token（analyzer 58 場） | 大致可信 | mtime 選檔含窗口前舊行 |
| local-mbp14 | codex | 窗口內新開 22 場；含續用 23 場 / 窗口差額 37,655,442 | 否，collector 210,468 | codex-tokens.py 不讀封存，且取累計非窗口差額 |
| local-mbp14 | agy | 19 對話 / 2,474 步 | 可信 | 差 3 個 db 是窗口邊界 |
| local-mbp14 | cursor | 22 chats / 2,090 則 | 可信 | 「2 unreadable」實為空目錄，不是低估 |
| local-mbp14 | grok CLI | 0（有正例） | 標錯 | store 在 `~/.grok/sessions`，collector 寫 store absent |
| local-mbp14 | Grok Bot app | 15 對話 / ≥852 筆 | 無 collector | 是 VM 資料的客戶端副本，不得加總 |
| local-mbp14 | opencode | 0（有正例） | 可信 | 最後使用 2026-02-26 |
| local-mbp14 | gemini-cli、aider | 0 | UNCONFIRMED | store 從未寫入，找不到正例 |
| remote-44 | claude | 7 場 | 可信 | 7 場皆 09-17 W38 收尾，09-18 起 0 turn |
| remote-44 | codex | 1 thread / 0 token | 部分 | thread 只在 WAL，`immutable=1` 讀不到 |
| remote-44 | agy | 1 對話 / 77 步 | 可信 | W38 review worker |
| remote-44 | cursor | 0 | 可信 | 9 個近期檔都是讀取產生的 wal/shm |
| remote-44 | Grok Bot app | 15 對話 / ≥552 筆 | 無 collector | 本週使用轉到這裡 |
| remote-44 | opencode | 0（有正例） | 可信 | 最後使用 2026-02-13 |
| remote-44 | gemini、amp、droid | 0 | UNCONFIRMED | 無 session store |
| grok-bot-vm | claude | 2 場 / 0 token | 否，灌入 6.59M | container 09-19 重建，store 檔 mtime 落在窗口 |
| grok-bot-vm | codex | 0（有正例） | 可信 | 無 rollout 目錄 |
| grok-bot-vm | agy | 5 對話；含 WAL 112 步、只讀主檔 291 步 | 否，collector 49 / 5,612 | 同上；步數兩種讀法不一致 UNCONFIRMED |
| grok-bot-vm | cursor | 可讀的舊 store 0 | 否，collector 1 | 同上；fuse store 讀取 I/O error，UNCONFIRMED |
| grok-bot-vm | grok bot | 13 seats；對話數 UNCONFIRMED | 否，collector 31 / 331 / 41 | child、orphan 是歷來累計 |

## 3. Findings

1. **F1 腳本跑完不等於數字正確**：Layer 1 驗收全過，grok-bot-vm 仍全錯。兩跑差 0 只證明可重現，不證明窗口正確。抓到錯的是稽核的正例對照與行內時間戳。證據：container 開機於 09-20 04:35 本地時間；本 session 對 claude、gemini、cursor chats 三個目錄計數，3,094 個檔 mtime 在同一小時；稽核同三目錄計 3,095，差 1 可能是兩次計數之間的新檔（UNCONFIRMED）；加上 grok bot 的 agent-transcripts 目錄 362 個，共 3,457（`coverage-grok-bot-vm.md:12`）。
2. **F2 每輪成本升 54.6%**：$1.851 → $2.861。前三大 session 共 $661.63，佔 local-mbp14 的 40.6%，cache read 佔三場合計的 84.6%。每次呼叫至少重讀約 170k token，這是 compaction 後的底線；三場平均 context 為 269k、266k、523k。證據：`layer2-cost-loops.md:13,39,57`。
3. **F3 tmux-agent 重送風暴 $133**：a454348f 一則「worker finished」在 76 分鐘內重送 396 次，agent 回 391 次「Stale duplicate」。風暴在 09-18 03:34–04:50Z，04:50 reload 後停止。dcd2186 在 10:42Z commit，之後重送比例從 448/471 降到 12/61。commit 不等於部署，風暴也在 commit 前就停了，所以因果未證。殘餘 12 次間隔 5–100 分鐘，是否為不同根因 UNCONFIRMED。
4. **F4 wakeup-idle gate 本週 0 次攔截**：121 筆紀錄中 111 筆是 `noop:false`，不在攔截範圍。gate 仍會擋「streak 超限且 delay < 3600」，本週沒有這種案例。47d84cf3 連續 6 次閒置 3600s 皆放行，gate 不檢查 Monitor；其中後 4 次有 >100k 的 cache break。本週這三場裡 1200–1800s 的喚醒沒有 >100k break；cache TTL 的確切值未實測。證據：`wakeup-idle-gate.sh:53`；`layer2-cost-loops.md:14,46,50`。
5. **F5 compaction cap 有效但誤擋**：單場最多 compaction 12 → 10，無場超限，只量本機。6 次攔截有 3 次擋到正當的交接步驟：查 session ID、開接手 session、讀 session-titles。
6. **F6 使用者糾正的根因**：兩場共 33 筆，cab30519 10 筆、e4fe0066 23 筆，其中 3 筆是正當的請示，不算違規。
   - R1 12 筆：證據未查完就回報負面結論，規則存在未執行。
   - R2 8 筆：已有常駐授權仍逐次請示。compaction 摘要把「實驗機自由發揮」改寫成「需核准」。
   - R3 4 筆：UI 結論只給表格，未附真實截圖。
   - 另 5 筆是工具或環境問題，1 筆其他。
7. **F7 粗篩指標不可靠**：done 無證據 42 筆，抽看的樣本中有多筆帶了測試結果或 commit sha 卻被判無證據，例如「+15: All tests passed!」、「commit `cfd19357`」。誤判率沒有逐筆標註，本週 UNCONFIRMED；先前用一組未標註的寬正則得出的 31 筆、74% 已撤回，不作為數字引用。糾正句 11 筆有 7 筆不是直接糾正：5 筆續接摘要、1 筆 review brief、1 筆貼回的交接文字。CORR 正則也漏掉辱罵字。依賴這兩個指標的「有效沒」判定都不可靠。W38 Z1 已點名，連兩週未修。
8. **F8 覆蓋漏洞**：Grok Bot app 在兩台 Mac 都無 collector。codex 封存與累計口徑錯。sqlite `immutable=1` 漏 WAL。cursor、agy、grok 都用 mtime 切窗口。三份稽核共列 30 條 collector 修改，W39-1 至 W39-4 只涵蓋其中主要幾條，其餘見各 `coverage-*.md`。
9. **F9 使用型態**：remote-44 自 09-18 起 Claude 0 turn，使用轉到 Grok Bot app。local-mbp14 的非 Claude CLI 流量以 tmux-agent worker 為主：封存的 codex 18 場都是 worker，cursor 25/25 則 transcript 使用者訊息來自 worker。例外有 1 場人工開的 Codex Desktop 對話與 4 個 smoke probe。grok-bot-vm 本週 Claude 2 場，都被 API 429 拒絕。
10. **F10 grok bot VM 錯誤洪流**：`sand-session-sync` log 有 244,787 行「CDP no webSocketDebuggerUrl」。log 沒有逐行時間戳，不能換算週率。09-18 另有一筆 Grok Bot 在 remote-44 本機執行 shell 的紀錄，指令與憑證有關，內容未寫入 repo。
11. **F11 治理停滯**：三 repo 在 09-18 之後 remote 0 commit。W38 backlog 做了 5/12；已證實有效 0 項，其中 1 項倒退（Z6），其餘成效未量，不等於無效。lessons proposed 46 → 51。local-mbp14 shared-memory pending 16 → 21，一筆未消化。零用量 skill 44 支；W38 只算 Claude analyzer、W39 加了 mentions，跨週 streak 的可比性 UNCONFIRMED。
12. **F12 公開 repo 洩漏主機名**：已 push 的 `2026-W38.json` 在 `machines.*.hostname` 寫了實際主機名。W39 已改寫為機器鍵；W39 產物中的舊主機名與一筆測試帳密明文，已在審閱後遮罩。
13. **F13 艦隊 kernel 一致**：採集時三機皆 4.30.0（md5 426a7620），W38 的 grok VM 落後已消失。4.31.0 已在本機 commit dc8dc05，未 push。Opus 5.5 的 `modelSettings` effort key 是否生效，待新 session 驗。

## 4. 改動配對指標（W38 行為改動，local-mbp14）

| 改動 | 指標 | 前 → 後 | 判定 |
|---|---|---|---|
| 4a458fc compaction cap | 單場最多 compaction | 12 → 10 | 本機上限守住；3/6 誤擋（F5） |
| 4a458fc idle wakeup 擋 | gate 擋下次數 | — → 0/121 | 無法驗證有效性（F4） |
| 4a458fc 每場一份 handoff | 舊格式檔 | 部署後 0；f57972bc 10 次 compaction 產 1 檔 | 本機有效 |
| 166a32f wrapper 合併 | 舊 wrapper 名稱呼叫 | 6 → 8（皆在重構 session 內） | 無法驗證有效性，無成功指標 |
| 4537a58 dispatch gate | gate 擋下 | 6 → 3（W38 已在跑） | 無法單獨驗證 |
| dcd2186 function-hook mod | 重複重送比例 | 448/471 → 12/61 | 下降可追溯；以 commit 切點計，因果未證（F3） |

只量了 local-mbp14；另兩機本週 Claude 使用接近 0，無可配對。前後窗口為 W38 09-10T16:00→09-17T16:00Z 與 W39 09-17T12:15→09-24T12:15Z，重疊 3 小時 45 分，不是互斥窗口。

## 5. §6.5 inbox 與臨時動議

inbox 待討論三條，隨手記 0 條：

| 條目 | 本週狀態 | 去向 |
|---|---|---|
| M1 孤兒多重收養 | Z9 部分：單一 owner 與 `adoptedFrom` 做了，opt-in 在 0.7.0 做反，#323 仍 OPEN | 續列 W39-8 |
| M2 ack 不持久 | Z10 直接修了，超出「先補觀測」的裁決；殘餘重送 12/61 | 續列 W39-8 |
| M3 agy result.json pending | Z11 觀察；本週 agy 流量皆 worker，未見新樣本 | 觀察 |

本輪的臨時動議與訴求：待使用者補，見 §8。

## 6. 裁決建議（§7；待使用者裁決）

| F | 建議 | 理由 | 落點 |
|---|---|---|---|
| F1 | 升級：議程修訂 | 每個 Layer 1 值要有行內時間戳窗口加正例對照，不能只看重跑差 0 | retro-agenda.md 不變式（W39-5） |
| F2 | 觀察 | 成本來自長 context 重讀，對策要先量 context 組成 | W39-15 |
| F3 | 觀察 | 重送已下降，殘餘併 W39-8；因果未證 | tmux-agent-tools |
| F4 | 升級 | 閒置 loop 用 3600s 就能穿過，gate 不檢查 Monitor | W39-6 |
| F5 | 升級 | 誤擋交接步驟會卡住 handoff | W39-7 |
| F6 | 升級：三條 lessons 草稿 | R1 12 筆、R2 8 筆，是本週最多的兩個主題 | lessons.md（需核准） |
| F7 | 升級：Z1 第三週 | 指標不修，依賴它的成效判定都不可靠 | W39-9、W39-10 |
| F8 | 升級 | 覆蓋漏洞讓成本與使用表偏離 | W39-1 至 W39-4 |
| F9 | 觀察 | 使用型態變化，非缺陷 | — |
| F10 | 升級：先查 | 錯誤洪流與憑證相關的 shell 執行都要有人看 | W39-12、決策 D6 |
| F11 | 觀察 | 本週 repo 在 09-18 後無 commit；Z6 等裁決 | — |
| F12 | 決策 | 清除要改寫公開 main 歷史 | 決策 D1 |
| F13 | 觀察 | push 待授權 | 決策 D2 |

**lessons 草稿**（proposed；只列不寫入 `lessons.md`，全文見 `layer2-corrections.md` §5）：

1. `scope: judgment`：回報負面結論前確認三件事：實際送出的輸入、新功能的官方文件、使用者點名的幫手。缺一項就標 UNCONFIRMED 繼續做。
2. `scope: waiting`：使用者給的常駐授權要寫進 run dir 與 compaction 摘要的固定欄位，摘要不得改寫成「需核准」。裁決分歧時先跑反駁回合，到 3 回合上限才找使用者。
3. `scope: completion`：UI 結論必須附本輪真實截圖，並涵蓋需求點名的狀態。

## 7. 第二模型審閱（Codex，`opinions/codex.md`）

首輪判定 `VERDICT: BLOCK`：28 項中同意 9、不同意 17、證據不足 2。第二輪仍 BLOCK：19 項中解決 13、未解決 6。兩輪都已採納並修正：
- **W38 分母**：兩週都用 `plugin-injected.py` 按 collector 執行窗口重算，W38 扣 7 則為 839 輪與 $1.851，W39 扣 526 則為 578 輪與 $2.861，升幅 54.6%。529 與 526 的差 3 是使用者引用該句的訊息。
- **F7 數字**：31 筆與 74% 撤回，誤判率改標 UNCONFIRMED。
- **gaps 矛盾**：codex 真值、cursor 低估、3,094 計數三條已改寫，與稽核一致。
- **JSON 帳密**：cache break 清單中的一筆帳號與密碼明文已遮罩。
- **口徑混用**：§2 本機 claude 改列嚴格窗口 59 場；Codex 改列 23 場與窗口差額 37,655,442。
- **JSON 殘留**：grok-bot-vm 的 canary 等比例、`pct_cached`、`usd_equiv`、outliers 清單已作廢或更正。
- **因果措辭**：F3、F4、F7、F9、F11 與 §4 的 dcd2186 改為「因果未證」或加上例外。
- **公開 repo**：遮罩 W39 Markdown 產物中的舊主機名與測試帳密。
- **驗收漏洞**：W39-1、2、4、5、8、9、10、12、13、14 的驗收已改成可反駁。

## 8. 待使用者決定（一次問完）

- **D1 公開 repo 主機名**：`2026-W38.json` 已 push 且含實際主機名。清除要改寫 main 歷史，屬硬停止項。
- **D2 push kernel 4.31.0**：本機 commit dc8dc05 要 push 並 deploy 才生效。
- **D3 lessons**：上列三條草稿是否寫入 `lessons.md`，Status 為 proposed。
- **D4 議程修訂**：F1 的正例對照是否寫進 retro-agenda 不變式。
- **D5 刪除 scratchpad 複本**：稽核留下約 157M 的 remote-44 資料庫複本，含私人資料。
- **D6 Grok Bot 憑證相關 shell 執行**：是否要另開一次安全檢視。
- **D7 臨時動議與訴求**：本週還有沒有想討論的題目或對 agent 的不滿。
- **各 finding 的裁決**：§6 的建議欄。
