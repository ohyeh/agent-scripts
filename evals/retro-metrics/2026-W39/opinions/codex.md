# W39 adversarial review

裁決：BLOCK。問題在數字口徑、證據推論與驗收漏洞；不是要求執行 backlog。

範圍：僅審查指定 report/backlog 及其檔案證據，讀取 gate 原碼；未 SSH、未委派、未 commit、未修改來源。下列簡稱均相對 `evals/retro-metrics/2026-W39/`；`W39.json`、`W38.json` 位於上層。同意表示檔案證據足以支持建議，不代表本次重新量測遠端 runtime。來源本身的限制仍保留。

## Findings 逐項裁決

| 項目 | 判定 | 一行理由與證據 |
|---|---|---|
| F1 | 不同意 | 同意提升窗口驗證，但「一律稽核值」不成立：VM canary/collector_sessions/outliers 仍是 mtime 歷史值，USD 摘要也未重算；`retro-report.md:5`、`../2026-W39.json:258`、`../2026-W39.json:332`、`../2026-W39.json:1236`。 |
| F2 | 不同意 | W38 846 是原始輪數，若扣報告所稱 8 則應為 838、$1.853，與 W39 $2.876 比為 +55.24%，不是 +57%；`retro-report.md:17`、`retro-report.md:21`、`../2026-W38.json:15`、`../2026-W38.json:128`、`../2026-W38.json:236`。 |
| F3 | 證據不足 | 下降數可追溯，但風暴在 04:50 reload 後停止、commit 切點為 10:42，來源又明言 commit≠部署；不能證明「已修」或殘餘必為不同根因；`layer2-cost-loops.md:17`、`layer2-cost-loops.md:61`、`layer2-cost-loops.md:89`。 |
| F4 | 不同意 | ≥3600 放行且未查 Monitor 屬實；0/121 不證明整支 gate 無效，只有後 4 次有 >100k break 清單，「每次」及「最差值」過度斷言；`.agents/hooks/wakeup-idle-gate.sh:43`、`.agents/hooks/wakeup-idle-gate.sh:53`（repo 根目錄）、`layer2-cost-loops.md:14`、`layer2-cost-loops.md:50`。 |
| F5 | 同意 | 支持修交接誤擋，來源逐一列出 3 個被擋動作，6 次攔截與 12→10 有配對紀錄；`layer2-cost-loops.md:34`、`layer2-cost-loops.md:52`、`layer2-cost-loops.md:84`。 |
| F6 | 不同意 | 升級理由稱 R1、R2 各超過 10 次，但 R2 明列 8 次；33 還包含 3 次正確請示，不可全當違規；`retro-report.md:104`、`layer2-corrections.md:70`、`layer2-corrections.md:71`、`layer2-corrections.md:75`。 |
| F7 | 證據不足 | 42/11 可由 raw JSONL 重算，31 筆有證據卻無逐筆標註或寬規則可重播；「所有有效沒都判不了」又與 F5/§4 的獨立 gate 證據衝突；`retro-report.md:62`、`retro-report.md:105`、`layer2-cost-loops.md:84`。 |
| F8 | 同意 | 封存、累計值、WAL、app 缺口均有具體反例，修改清單重數為 14+9+7=30；但 W39-1..4 並未涵蓋全部 30 條；`coverage-local-mbp14.md:17`、`coverage-remote-44.md:49`、`coverage-grok-bot-vm.md:57`。 |
| F9 | 不同意 | 「所有非 Claude CLI 都是 worker」被同份 audit 的窗口內 Codex 人工 hi 與 4 個 smoke probe 推翻；18/18 只適用 archived workers，25/25 是 transcript user lines；`retro-report.md:64`、`coverage-local-mbp14.md:17`、`coverage-local-mbp14.md:19`。 |
| F10 | 同意 | 244,787 有 log 計數來源，憑證相關本機執行也有紀錄；建議先查合理，但錯誤 log 無逐行時間戳，不能當精確週率；`coverage-grok-bot-vm.md:44`、`coverage-remote-44.md:21`。 |
| F11 | 不同意 | 0/12 是尚未量測成效而非證實無效，09-18 後 remote 無 commit 不能推出整週 repo 無 commit 或治理主因；44/streak2 還有跨週方法差異；`retro-report.md:109`、`backlog-reconciliation.md:7`、`backlog-reconciliation.md:39`、`loops-inventory.md:97`。 |
| F12 | 不同意 | W38 洩漏有來源，但 W39 coverage 又重述真實舊 hostname，還有疑似帳密 literal；只把歷史改寫交 D1 會漏掉本次待公開檔案；`retro-report.md:67`、`coverage-grok-bot-vm.md:53`、`layer2-corrections.md:59`。 |
| F13 | 同意 | 三機版本/hash 快照一致、dc8dc05 僅本機與 effort 待驗均有來源；只能支持採集時一致，不等於本次重新驗證部署；`../2026-W39.json:364`、`../2026-W39.json:442`、`../2026-W39.json:520`、`backlog-reconciliation.md:8`。 |

## Backlog 逐項裁決

評準：驗收必須能反駁「該項工作已達成」，不能僅要求非空產物或容許空結果過關。

| 項目 | 判定 | 一行理由與證據 |
|---|---|---|
| W39-1 | 不同意 | VM 三個總數可證偽但不足涵蓋所列四支工具、明確起訖與 now−7d 移除；需窗口邊界/還原 mtime 反例且逐入口驗；`next-week-backlog.md:8`、`coverage-local-mbp14.md:56`。 |
| W39-2 | 不同意 | 22 是 started sessions，窗口差額應包含 resumed session 得 23／37,655,442；37.78M±1% 反而容許原本累計錯誤通過；`next-week-backlog.md:9`、`coverage-local-mbp14.md:17`。 |
| W39-3 | 同意 | 唯一 WAL-only thread 可見是明確正例，可反駁 immutable 漏讀；`next-week-backlog.md:10`、`coverage-remote-44.md:13`。 |
| W39-4 | 不同意 | 只驗對話數，實作不計訊息、不標 lower bound 或把副本加入全隊仍可通過；應驗 15/≥852、15/≥552 及不得加總；`next-week-backlog.md:11`、`coverage-local-mbp14.md:24`、`coverage-remote-44.md:20`。 |
| W39-5 | 不同意 | 「加一條」及 method 寫窗口不驗行內窗口是否真用、零值是否有正例，會重演 F1；`next-week-backlog.md:12`、`retro-report.md:99`。 |
| W39-6 | 同意 | 三次 idle 3600 無 Monitor 擋／同 session 有 Monitor 放行有雙向驗收；實作時應固定預設 streak=2 並驗 stop reset；`next-week-backlog.md:13`、`.agents/hooks/wakeup-idle-gate.sh:22`（repo 根目錄）。 |
| W39-7 | 同意 | 指定 3 個誤擋放行、3 個非誤擋維持，兼顧正負例；需保存對應輸入讓重放可行；`next-week-backlog.md:14`、`layer2-cost-loops.md:84`。 |
| W39-8 | 不同意 | ≤1 次與預設不收都有可反駁條件，但完全不投遞也過關；需加 owner 正常完成恰好一次及明示 opt-in 收養成功；`next-week-backlog.md:15`、`backlog-reconciliation.md:23`。 |
| W39-9 | 不同意 | 僅誤判≤10 容許所有 claim 均放行，且尚無 42 筆 gold labels；需固定標註並驗漏判；`next-week-backlog.md:16`、`retro-report.md:62`。 |
| W39-10 | 不同意 | 只比總數差≤20%，選錯 33 則也能通過；應逐筆驗 precision/recall，人工集還須區分正確授權請示；`next-week-backlog.md:17`、`layer2-corrections.md:75`、`layer2-corrections.md:89`。 |
| W39-11 | 同意 | 固定欄位與指定 compaction 誤改寫案例可反駁，原授權及摘要反例已定位；`next-week-backlog.md:18`、`layer2-corrections.md:100`、`layer2-corrections.md:101`。 |
| W39-12 | 不同意 | 「下降或解釋無害」沒有觀測期間、基線、降幅與無害判準，且現有 log 無 timestamp；`next-week-backlog.md:19`、`coverage-grok-bot-vm.md:44`。 |
| W39-13 | 不同意 | 三機非空輸出不能證明按週、WAL 或錯誤處理正確；真實零活動本來就應允許 0；`next-week-backlog.md:20`、`loops-inventory.md:64`、`loops-inventory.md:115`。 |
| W39-14 | 不同意 | 顯示記錄與有成本表可查，但未要求相同任務/模型/輸入與 review 正確性，不能支持 low/medium 比較；`next-week-backlog.md:21`。 |
| W39-15 | 同意 | 指定三場各一張組成表是可反駁產物；應註明實測 token、字元估算與 unknown 殘額，勿先把 72k 當實測；`next-week-backlog.md:22`、`layer2-cost-loops.md:22`。 |

## §1–§4 數字核對與不可重現清單

本次執行 `python3 evals/retro-metrics/cost.py`，exit 0，關鍵原文：

```text
== 2026-W38 (2026-09-10 → 2026-09-17)  費率 Opus 5
  合計 Claude            $ 1552.61   ·  每輪 $1.835
== 2026-W39 (2026-09-17 → 2026-09-24)  費率 Opus 5
  合計 Claude            $ 1653.82   ·  每輪 $1.498
```

同時直接解析兩份 JSON，以 `(input*5 + output*25 + cache_read*.5 + cache_create*6.25)/1e6` 重算；這是 repo 宣告的當量，不是對官方價目或帳單的驗證。

| 原數字／說法 | 本次重算／可證實值 | 來源與缺口 |
|---|---|---|
| W38 真實 846、$1.835 | 原始 395+448+3=846；採用報告的 8 注入則為 **838、$1.8527566** | `../2026-W38.json:15`、`:128`、`:236`；8 只見 `retro-report.md:17`，指定佐證檔沒有其逐筆名單，因此 838 是條件式重算，不是假稱重新量到。 |
| W39 真實 575、$2.88 | 原始 7+1095+2=1104；1104−529=575；1653.819612/575=**2.8762080**，四捨五入成立 | `../2026-W39.json:355` 支持 529；但 strict audit 為 526，且另有 tag-wrapped/bridge/worker 訊息，扣 plugin 不等於純真人輪數。 |
| F2 +57% | 同時扣兩週 plugin：**+55.2394%**；原表未扣 W38 才約 +56.72% | 上兩列；在未有 W38 8 則來源前，嚴格一致窗口的百分比為 UNCONFIRMED。 |
| 529、local 566 真實輪 | 1095−529=566 可算；strict audit 則為 **526 plugin、461 human-like、268 tag-wrapped，合計1255** | `coverage-local-mbp14.md:16`；兩種窗口/排除法不能互換，不能把 566 標成 strict 稽核真值。 |
| local Claude 58 場 | analyzer 58 可追溯；strict event-window **59** | `coverage-local-mbp14.md:16`；report §2 把 analyzer sessions 與 strict tokens 拼一列。 |
| local Claude 2.55B、差2.3% | strict 2,554,150,642；collector 2,615,106,294；差60,955,652；占 collector **2.33%**、占 strict **2.39%** | `coverage-local-mbp14.md:16`；「collector +2.3%」分母應交代，成本未隨 strict tokens 修正；缺四種 token 分項，strict USD 無法重算。 |
| Codex 22／37.78M | 新開 **22**；含 resumed 的事件窗口 **23／37,655,442**；37,777,973 含 **122,531** 窗口前 token | `coverage-local-mbp14.md:17`；W39-2 的 ±1% 不足抓出此錯。 |
| VM 3,094 同小時檔案 | audit 26+2909+160+362=**3457**；不含 bot 仍 **3095** | `coverage-grok-bot-vm.md:12`；3094 僅在 W39.json gaps 重述，無一致 histogram 可支持。 |
| VM agy 112、cursor 0 | 可重述 WAL-view **112**，main-only **291**；cursor 可讀舊 store 為0，fuse store **UNCONFIRMED** | `coverage-grok-bot-vm.md:22`、`:23`；report §2 漏掉這兩項範圍限制。 |
| VM JSON pct_cached 91.4、canary53.8、goal30.8、collector26 | token 已為0，cache ratio應為不適用；嚴格 session **2**；canary/goal 的窗口內重算值 **UNCONFIRMED** | `../2026-W39.json:239`、`:258`；outliers 仍含非零歷史 token（如 `:1231` 47142），與窗口總 token0矛盾。應分開 raw 與 corrected。 |
| JSON USD total1661.42／VM7.6／per_turn1.505 | **1653.819612／0／1.4980250**（原始輪數）；扣529後2.8762080 | `../2026-W39.json:332`；是派生欄位未隨 token 更正。report 成本碼塊本身與 cost.py 一致。 |
| 三場 $661.63、40.6%、cache read約80% | 272.79+227.87+160.97=**661.63**；/1630.92=**40.5679%**；三場合併 read占比 **84.55%** | `layer2-cost-loops.md:19`、`:37`、`:55`；約80%是粗略說法，可支持 read主導。 |
| 每次重讀約170k | 是壓縮後底線；三場平均 context 分別 **269k／266k／523k** | `layer2-cost-loops.md:13`、`:39`、`:57`；不能把底線寫成每次呼叫實測均值。 |
| F4 6次每次都整段重寫 | 6次 allowed可追溯，但 >100k idle break清單只有**後4次**；1200–1800秒「從未」應限特定場、>100k門檻 | `layer2-cost-loops.md:14`、`:46`、`:50`；TTL與「最差值」未實測。 |
| R1/R2 都10次以上 | **12／8**；R3為4；12+8+4+5+1+3=33=10+23 | `layer2-corrections.md:70`；§6理由與自身數字衝突。 |
| F7 42筆、31筆、74%、11筆、7筆 | raw全數計數 **42 done_no_evidence、11 correction**；31/42=**73.8095%**算式成立，**31的分類無法重播** | raw local49筆=40+9、remote4筆=2+2、VM0；沒有逐筆gold/寬規則。11筆中可辨5摘要+1 review brief+1貼回handoff，7是「非直接糾正」，不宜全叫注入。 |
| F11 有效0/12 | **0項已證實有效**，不等於12項無效；來源明載1項倒退，其餘成效未量/不適用 | `backlog-reconciliation.md:39`；5/12可由Z2/Z3/Z9/Z10/Z11重數，不能把未量當失敗。 |
| 44零用量、streak2 | 清單算法為64−20=**44**，41+3=44；跨週streak的可比性 **UNCONFIRMED** | `loops-inventory.md:75`、`:83`、`:97`；W39加mentions，W38只Claude analyzer，另有allowlist/無資料限制。 |

其餘 §1–§4 數字的來源覆蓋：

| report 範圍 | 核對結果與來源 |
|---|---|
| §1 各機22.90／1630.92／0、7/58/2場、7/1095/2輪、Codex0/38/0M | cost.py輸出逐列一致；Codex38M是有污染的with_archived四捨五入，UNPRICED有明示。 |
| §2 local agy19/2474/差3、cursor22/2090/空目錄2、app15/≥852、其餘零值與日期 | `coverage-local-mbp14.md:18`、`:19`、`:20`、`:21`、`:22`、`:23`、`:24`可追溯；app各類entry加總852；grok0有歷史正例。 |
| §2 remote7、1/0、1/77、9檔/0、15/≥552、02-13及無正例零值 | `coverage-remote-44.md:12`至`:20`；app353+134+56+5+4=552；不把無store的0升格確證。 |
| §2 VM2/0/6.59M、0Codex、5/112 vs49/5612、cursor0 vs1、13 vs31/331/41 | `coverage-grok-bot-vm.md:20`至`:24`；6,588,990四捨五入6.59M；112及cursor0限制見上表。 |
| F3 76分鐘／396／391／$133／448/471→12/61／5–100分 | `layer2-cost-loops.md:15`、`:60`、`:89`；04:50−03:34=76分、$133.30取整133；95.12%→19.67%。數字可追溯，修正因果未證。 |
| F4/F5 0/121、6次、12→10、0超限、3/6 | `layer2-cost-loops.md:74`、`:84`；121其中111是noop:false，不能當121次應擋案例。 |
| F8 30條 | 全數重數 coverage changes bullets：local14、remote9、VM7，共30。 |
| F9/F10 18/18、25/25、2場429、244787、1筆shell | `coverage-local-mbp14.md:17`、`:19`、`coverage-grok-bot-vm.md:20`、`:44`、`coverage-remote-44.md:21`；限制見逐項裁決。 |
| F11 09-18後0commit、5/12、46→51、16→21、0消化 | `backlog-reconciliation.md:7`、`:39`、`loops-inventory.md:25`、`:31`、`:35`；remote後續0不等於整週0。 |
| F13 4.30.0/hash、4.31.0/dc8dc05 | W39 machine_layer三份快照與 `backlog-reconciliation.md:8`一致；本次git log亦回dc8dc05。 |

## §4 配對指標判定

| 改動 | 審查 |
|---|---|
| compaction cap | 12→10及3/6有來源，接受「本機觀測上限守住」，不外推全隊；`layer2-cost-loops.md:84`。 |
| idle gate | 0/121支持「無法驗證成效」，與§6「形同虛設」不一致；程式仍能擋streak>2且delay<3600；`retro-report.md:75`、`:102`、gate`:53`。 |
| 每場handoff | 舊格式0、指定場10次/1檔有來源，接受局部成效；source亦以git日期排除checkout mtime；`layer2-cost-loops.md:86`。 |
| wrapper | 6→8可追溯；保留無法驗證，8均在重構場，不是正常使用退步；`layer2-cost-loops.md:87`。 |
| dispatch gate | 6→3可追溯，W38已在跑，無法單獨歸因的措辭正確；`layer2-cost-loops.md:88`。 |
| function-hook mod | 448/471→12/61是按commit切，不是按已證實部署切；風暴早於commit停止，降幅不能直接證明該commit有效；`layer2-cost-loops.md:17`、`:61`、`:89`。 |

此外 before/after窗口分別為W38 09-10T16:00→09-17T16:00Z、W39 09-17T12:15→09-24T12:15Z，重疊 **3小時45分**，不是互斥週窗口（`layer2-cost-loops.md:80`）。coverage用12:00，collector用12:15–12:18，須統一或明列分母。

## 公開 repo 檢查

- 全數掃描 W39.json及W39目錄既有15個檔案（不含opinions），以rg和Python regex交叉檢查IPv4、home path、hostname上下文、已知W38 hostname及帳號字樣；沒有輸出敏感原文到本artifact。
- 本次掃描未命中IPv4或絕對家目錄路徑（macOS 與 Linux）；這是檔案內容結果，不是所有編碼/秘密形式的保證。
- **仍有歷史真實hostname**：`coverage-grok-bot-vm.md:53`；同檔`:6`聲稱無hostname，互相矛盾。機器鍵alias與已遮罩numeric id不算未遮罩hostname，但該行舊hostname是明文。
- **疑似帳密literal**：`layer2-corrections.md:59`；語境為送錯帳密，無法確認效力，公開前應遮罩，review不重述。
- `backlog-reconciliation.md:7`含公開GitHub owner帳號；這不是主機登入帳號或新秘密。其餘 `~` 為相對home，機器鍵為既有alias。
- 本次未連線查公開remote或改寫歷史，W38「已push」只採對帳來源；目前review來源多為untracked，不能宣稱W39已公開。

## 結果與下一步

28列：同意9、不同意17、證據不足2。先修正W38分母、strict/collector口徑、JSON殘留值、因果措辭、敏感literal及驗收漏洞，再交使用者裁決。所有無法得到唯一重算值的項目已明列UNCONFIRMED或證據缺口；沒有用猜測補值。來源檔案未修改，工作區原有其他改動保留。

VERDICT: BLOCK

## Round 2

複核修訂後的report、backlog、W39.json，重掃W39.json與W39/全部16檔（含opinions）。未SSH、未委派、未commit；僅追加本節及更新指定result.json。

Round 1實際為同意9、不同意17、證據不足2；需求及`retro-report.md:125`的10/16/2誤載。本輪完整核對19列，不漏掉第17個不同意。以下路徑簡稱沿用Round 1。

| 項目 | 結果 | 一行理由與file:line |
|---|---|---|
| F1 | not resolved | VM比例、outliers與USD已作廢或更正，但gaps仍把22/37.78M叫真值、仍稱cursor低估，3,094三目錄計數也不符26+2909+160=3095；`../2026-W39.json:347`、`../2026-W39.json:351`、`retro-report.md:56`、`coverage-grok-bot-vm.md:12`。 |
| F2 | not resolved | 838／$1.853／約55%算式已修，但JSON稱12:00 strict窗口529、audit同窗口526，差3未對帳，W38的8仍無可重播來源；`../2026-W39.json:340`、`coverage-local-mbp14.md:5`、`coverage-local-mbp14.md:16`、`retro-report.md:25`。 |
| F3 | resolved | 已明示reload早於commit、commit≠部署、因果未證與殘餘根因UNCONFIRMED，§4同步降級；`retro-report.md:58`、`retro-report.md:83`、`retro-report.md:105`。 |
| F4 | resolved | 已區分111次非idle、6次放行與後4次break，移除最差TTL斷言，升級理由限3600例外及未查Monitor；`retro-report.md:59`、`retro-report.md:106`。 |
| F6 | resolved | R2改為8，理由不再稱超過10次，33筆中的3次正確請示明確排除違規；`retro-report.md:61`、`retro-report.md:108`。 |
| F7 | not resolved | 已限定受影響指標，但仍報31／74%上限；承認不可重播不使上限成立，需提供規則/標註，或撤回數字並標UNCONFIRMED；`retro-report.md:66`。 |
| F9 | resolved | 改為worker為主，18場與25則分母分開，列出人工Codex及4個probe例外；`retro-report.md:68`。 |
| F11 | resolved | 明列已證實有效0、未量不等於無效、跨週streak不可比，§6移除整週無commit的主因斷言；`retro-report.md:70`、`retro-report.md:113`。 |
| F12 | not resolved | Markdown已遮罩，但JSON的last_user_msg仍含疑似帳號／電話及密碼literal，不能宣稱W39產物已遮罩完成；`coverage-grok-bot-vm.md:53`、`layer2-corrections.md:59`、`../2026-W39.json:743`、`retro-report.md:71`。 |
| W39-1 | resolved | 新增timestamp與mtime相反的雙向反例，四支工具逐支驗證，補上原先只核對VM總數的漏洞；`next-week-backlog.md:8`。 |
| W39-2 | resolved | 改為22新開／23含續用、37,655,442精確相等並排除122,531窗口前token；`next-week-backlog.md:9`。 |
| W39-4 | resolved | 加入兩機對話及訊息下限、lower bound標示與全隊不得加總；`next-week-backlog.md:11`。 |
| W39-5 | not resolved | 每個0的正例已補，但行內timestamp只抽查3欄，其餘欄仍可寫method而未實際過濾，不滿足每個Layer1值及measurement全覆蓋要求；`next-week-backlog.md:12`、`retro-report.md:103`。 |
| W39-8 | resolved | 加入正常owner恰好1次及opt-in收養成功，零投遞不再能通過；`next-week-backlog.md:15`。 |
| W39-9 | resolved | 先建人工標註集，並同時限制誤判與漏判，全部放行不能再靠單一誤判數過關；`next-week-backlog.md:16`。 |
| W39-10 | resolved | 改逐筆precision/recall≥0.8，並將3筆正當請示標為負例，補上只比總數的漏洞；`next-week-backlog.md:17`。 |
| W39-12 | not resolved | 7天基線及90%門檻已補，但替代路徑仍只有具體證據不影響seat運作，未定成功率/延遲/觀測期間等可反駁無害判準；`next-week-backlog.md:19`。 |
| W39-13 | resolved | 三支工具各有對應反例：本週零、WAL與壞DB、實際clone路徑，取代非空輸出；`next-week-backlog.md:20`。 |
| W39-14 | resolved | 固定同模型及同5個diff，比較bug、誤報與成本，補上任務與品質不可比缺口；`next-week-backlog.md:21`。 |

### 數字與JSON複驗

- 本輪重跑cost.py，輸出W38 `合計 Claude            $ 1552.61   ·  每輪 $1.835`、W39 `合計 Claude            $ 1653.82   ·  每輪 $1.498`；JSON的USD更正一致。
- 採用8與529時，846−8=838、1104−529=575，$1.8527566→$2.8762080、+55.2394%的算術成立；未因此驗證注入數的窗口與來源。同窗口526/529需逐筆對帳，不能自行挑一個代入。
- VM `collector_derived_invalid`包含canary_by_project，outliers有`_invalid`，不把已明示作廢的歷史資料本身當未修。F1剩餘缺陷是未作廢且互相衝突的gaps敘述與3,094計數。
- §7首輪票數應改為9/17/2（`retro-report.md:125`）。本輪19項：**resolved 13、not resolved 6**。

### 公開內容重掃（含opinions）

- 以`rg -n -o --hidden`搜尋home path、IPv4、登入帳號形狀、hostname、password/credential/帳密等，再以Python逐檔驗證IPv4/IPv6候選、W38已知hostname、帳號字樣與credential literal模式；全數16檔，包含Round 1意見。
- 未觀察到可解析IPv4/IPv6、具體使用者絕對home path或剩餘已知真實hostname；Round 1路徑命中是`<account>`佔位符，JSON hostname是既有機器鍵。
- 帳號字樣命中`backlog-reconciliation.md:7`的公開GitHub owner，屬repo來源識別，不是登入憑證。
- **敏感literal仍在`../2026-W39.json:743`**：e4fe0066的cache-break `last_user_msg`含疑似帳號／電話及密碼。有效性UNCONFIRMED，但與登入失敗語境相連，應遮罩整個敏感片段。本review不重述原文。
- 另兩個credential模式命中是`task-notification`的字串片段，已判為誤報。Markdown原兩处已遮罩，不能推論JSON也乾淨；Round 1與本節皆僅記位置，無原始敏感literal。掃描不保證涵蓋任意編碼秘密。

僅追加本節、保留Round 1。先遮罩JSON，再對帳窗口與未證數字、移除矛盾gaps並補驗收；目前仍不能解除BLOCK。

VERDICT: BLOCK

## Round 3

僅複核Round 2指定的6項。前兩輪保留，未SSH、未commit、未委派；本輪僅追加此節並更新指定result.json。

| 項目 | 結果 | 一行理由與file:line |
|---|---|---|
| F1 | not resolved | Codex/cursor gaps已修、3094/3095差異已標UNCONFIRMED，但3457的第四個目錄誤寫cursor projects；來源362檔實屬agent-data/agent-transcripts，需同步修report與JSON；`retro-report.md:63`、`../2026-W39.json:346`、`coverage-grok-bot-vm.md:12`。 |
| F2 | not resolved | 兩窗口重播及839／578、54.6%均成立，但JSON gaps仍把529全稱plugin注入，且沿用$1.835→$1.505，未標作廢，與更正後欄位矛盾；`../2026-W39.json:358`、`../2026-W39.json:340`、`retro-report.md:22`、`retro-report.md:29`。 |
| F7 | resolved | 明確撤回31筆／74%，誤判率改為UNCONFIRMED，不再以不可重播值作上限；`retro-report.md:73`。 |
| F12 | resolved | JSON的last_user_msg已遮罩帳密，指定17檔重掃未再發現原敏感literal或未遮罩的已知hostname；`../2026-W39.json:743`、`coverage-grok-bot-vm.md:53`、`layer2-corrections.md:59`。 |
| W39-5 | resolved | 改為每支Layer1 collector都驗雙向反例、每個0附正例，缺項標UNCONFIRMED且不得進成本表，移除僅抽查3欄；`next-week-backlog.md:12`。 |
| W39-12 | resolved | 無害替代路徑已定7天觀測、成功率不低於前7天及錯誤時段無seat失敗，具體且可反駁；`next-week-backlog.md:19`。 |

### 計數重播

本輪讀完`plugin-injected.py`後，原樣執行report §1兩個命令，兩者exit 0：

```text
python3 evals/retro-metrics/plugin-injected.py 2026-09-10T16:02:00 2026-09-17T16:02:00
{"injected": 7, "quoted": 2}
python3 evals/retro-metrics/plugin-injected.py 2026-09-17T12:15:00 2026-09-24T12:15:00
{"injected": 526, "quoted": 3}
```

W38：846−7=839，1552.610059/839=1.850548342；W39：1104−526=578，1653.819612/578=2.861279606；增幅54.6179335%，報告54.6%成立。此處F2未結案僅因JSON殘留未作廢敘述，不要求重新量測已重播的結果。local-only與非純人工輪數限制已由`retro-report.md:32`明示。

F1計數為26+2909+160=3095，再加362=3457；362的來源路徑為`~/agent-data/agent-transcripts`，不是cursor projects。3094與3095的差1目前有UNCONFIRMED標示，不再將此不確定性本身當作未揭露缺陷。

### 隱私重掃

全數掃描W39.json、W39/（含opinions/）及plugin-injected.py，共17檔。以Python regex查絕對home path、帳號字樣、credential literal及帳密/hostname上下文；以ipaddress解析IPv4/IPv6候選，並對照W38已知hostname。僅列位置與分類，沒有複製敏感內容。

- 具體絕對home path、可解析IP、credential literal候選、已知hostname使用情境命中均為0；歷史意見中的`<account>`路徑是佔位符。
- 帳號字樣1處：`backlog-reconciliation.md:7`為公開GitHub owner，非登入憑證；JSON hostname為既有機器鍵。
- 帳密/hostname上下文26行均為遮罩、欄位名稱、通用描述或前輪發現位置；原JSON敏感值已替換為遮罩。這是本次範圍與模式的檔案檢查，不宣稱能排除任意編碼秘密。

本輪 **resolved 4、not resolved 2**。剩餘均是既有F1/F2修正未同步到全部敘述：修正第四目錄名稱，並更新或明示作廢JSON舊529與成本句。未重開其他已解決項目。

VERDICT: BLOCK

## Round 4

僅核對Round 3未解決的F1、F2；不重開已解決項目，不修改來源。前輪計數重播證據沿用，本輪讀取修訂後兩檔核對文字與JSON欄位。

| 項目 | 裁決 | 理由與file:line |
|---|---|---|
| F1 | PASS | report與JSON均改為grok bot agent-transcripts目錄362檔，3095+362=3457；兩檔全文搜尋cursor projects及cursor/projects皆0命中；`retro-report.md:63`、`../2026-W39.json:346`。 |
| F2 | PASS | gaps現列W39 injected526/quoted3、W38 injected7/quoted2，839／578輪與$1.851→$2.861（54.6%）一致，舊529及$1.835→$1.505明示作廢，與usd_equiv值2.861及report一致；`../2026-W39.json:358`、`../2026-W39.json:339`、`../2026-W39.json:340`、`retro-report.md:22`、`retro-report.md:23`、`retro-report.md:25`。 |

本輪讀取檢查exit 0：`JSON_PARSE_OK`；兩檔的`CURSOR_PROJECTS_MATCHES`皆`[]`；`PER_TURN_EX_PLUGIN 2.861`。兩項均通過，Round 3剩餘阻擋解除。本裁決僅涵蓋指定兩項，未擴大重審。

VERDICT: PASS
