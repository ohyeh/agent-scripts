# Episode 5：完整交付與建議

2026-10-30。本輪只在本 repo 的 local main 工作，沒有 push、安裝、修改 settings、存取遠端或修改 sibling repo。
家目錄一律寫成 `<home>`；主機一律寫成 `<host>`。下列 `.workflow/` 路徑相對 repo。

結論：第 2、3 項已完成；第 4 項已通過真正 module replacement 的紅綠對照。
第 5 項 episode 2 已納入四份 corpus（36 份 bundle、50 cases）並重播；它仍只是離線研究，不是上線許可。
這些結果支持交回 main session 做本機試用驗收，不支持現在 push 或把 audit 接回線上。

## A. 各項結果與證據

### 1. 既有 engine 驗收腳本：承接，未重做

既有 commit：`d33f77e9a22bb37874a45da344d84bb73adf4e41`。
本輪確實重跑 a–f、四項 regressions 與歷史控制組，沒有只引用 commander 的上輪結論。
本輪新增案例沿用 `scripts/test-owner-asks-engine.py`；保留原 warning 與 `--dangerously-skip-permissions`。

### 2. owner-asks 貼上段：done（新 capture 與 compaction）

Commit：`b3333c9067e4e0958ec265a3e4cce2b430cd552a`。

實作：在 `mods/owner-asks/hooks/lib/asks.ts:19` 將完整 pasted_content span 改成 `[pasted N chars]`。
owner 自打的前後文字保留；source span 仍指向原 transcript，長度不再強制等於縮短後 quote。
JSONL、projection 與 resume snapshot 共用新 capture 的 quote。
既有歷史列沒有重寫；這個限制與建議見 B-O2，不能稱為歷史資料已全部清理。

同一個最終案例會混合自打文字與真正 bracketed paste，然後 `/compact`，再送一個工具回合。
貼上 payload 還含一個假的 closing tag 與尾端 sentinel，檢查不能只確認完整大字串消失。
engine 實際會 escape payload 內的 closing tag；原生 wrapper 仍能被辨識。

```text
FAIL episode5 paste: owner chars=2244, paste leaked=True, projection leaked=True
exit code: 1
PASS episode5 paste: owner chars=75, paste leaked=False, projection leaked=False
exit code: 0
```

Red：`python3 scripts/test-owner-asks-engine.py --episode5 paste --asks-ref fa9ba31`；
`.workflow/20261030020557-asks040-engine/result.json`。
Green：`python3 scripts/test-owner-asks-engine.py --episode5 paste`；
`.workflow/20261030020430-asks040-engine/result.json`。
`--asks-ref` 只把指定 local ref 的 source 複製到一次性 fixture，不 checkout 或修改安裝版。

曾有一個 fixture 錯誤：整則訊息 bracketed paste 時，engine 合理地把自打前後文字也算進貼上。
該次得到 `owner chars=22`，不是產品成功證據；案例已改成分段輸入，之後的紅綠才算驗收。

### 3. owner-asks 漏記量測：done，沒有量到需修的漏記

Commit：`1fef54a1dfefc5194acb853d25ddc6dda1241245`。

```text
PASS episode5 capture: sent=5, recorded=5, skipped notices=0, security named=False
exit code: 0
```

命令：`python3 scripts/test-owner-asks-engine.py --episode5 capture`。
Artifact：`.workflow/20261030015303-asks040-engine/result.json`；同目錄 `engine.debug`、`resume.debug`。
前三個 owner 回合之後 reload，再送第四個；退出、resume 後送第五個。五筆 UUID 各不相同。
debug 確認真實 `cc-plugin-sec-default@builtin seated outermost`，其 session.append 位於 prepend，owner-asks 位於 user。
這不是模擬 security plugin 的 stub。

沒有 red line，也沒有為了湊紅綠而修改 capture：brief 明訂「先量，漏才修」。
歷史 skipped notice 此次未重現；因此不能宣稱已證明任意 bypass 都不會漏記。
完整小結另見 `opinions/mod-capture-ep5.md`。

### 4. agent-should-know S9：done，含真正 replacement

Commit：`dc76d3e3aef9f4358f10b537b16379d0e6971fc4`。

`mods/agent-should-know/hooks/register.ts:182` 在每次傳送前讀取當前 session receipt；
`:209` 只在 prompt.submit 無 drop 後標成 sent；`:212` 才持久保存 session key。
沒有 20 筆 eviction，較早卡片不會因 receipt 淘汰而在同 session 重送。
同 instance 的 concurrent draw 用記憶體 sending guard 合併；失敗不留下成功 receipt。
失敗清除 pending／early；重複同錯誤不反覆 toast。沒有 retry scheduler。

```text
FAIL episode5 relay: accepted after drop/reload=0, accepted after second reload=0, attempts=1, same card in new session=0
exit code: 1
PASS episode5 relay: accepted after drop/reload=1, accepted after second reload=1, attempts=3, same card in new session=1
exit code: 0
```

Red：`python3 scripts/test-owner-asks-engine.py --episode5 relay --relay-plugin .workflow/20261030-sol-ep5/relay-before`。
Artifact：`.workflow/20261030021031-asks040-engine-4b0c93d43bd248e98b9749ce007880d0/result.json`。
`relay-before` 是以本輪修正前 local source 建立的 disposable plugin，不是已安裝 plugin。

Green：`python3 scripts/test-owner-asks-engine.py --episode5 relay`。
Artifact：`.workflow/20261030021222-asks040-engine-749a76526f75450ba4c7ccedc523b0b2/result.json`。
每次 reload 前修改 disposable relay module 的 comment，debug 有兩次 `agent-should-know@inline reloaded`。
先真實 drop，解除 drop，再 replacement；第二次 replacement 檢查不重送；另一 session 檢查同卡仍會送。
`relay-first-session.json` 保存第一個 session 的 transcript，避免第二 session 蓋掉第一個結果。

中間版本曾在真正 replacement 得到：

```text
FAIL episode5 relay: accepted after drop/reload=2, accepted after second reload=2, attempts=5, same card in new session=1
```

Artifact：`.workflow/20261030020950-asks040-engine/result.json`。
debug 顯示新 instance 先啟動，舊 instance 隨後才寫 receipt；只在 session.start 讀取 receipt 會留下過期快照。
這才是加入「傳送前讀當前 receipt」的原因，並有 late-receipt 單元斷言。
較早「同內容 reload」的 PASS 不用來代替這份 replacement 證據。

### 5. 逐主張離線研究：done（episode 2，四份 corpus），仍只限離線

Commit：`720c1d556985f4f031a5f63446c799b6dffa6e07`。
Case set：`evals/retro-metrics/2026-W44/audit-ep5/cases.json`；
結果：同目錄 `results.json`；方法與限制：`README.md`、`judge-prompt.txt`、`build-cases.py`。

完整本機 inventory：ed52bad5 17、f86fd372 5、94e952f7 4，共 26 份 bundle；manifest 含 SHA-256。
從 13 份來源整理 30 cases：純文字 8、檔案主張 16、跨回合 4、缺證 2。
不把這說成 26 份 reply 的全部主張都已 audit。
第四個指定 session 797196d8 在本機 state 為 0；另搜尋 42 個近期 run 目錄的 JSON／JSONL，也沒有存檔命中。
依離線範圍，本輪沒有 SSH 或讀遠端，尚待 main session 提供本機副本。

一次 isolated CLI replay，移除 expected、label_reason、planted，模型沒有工具：

```text
cases=30 PASS=14 FAIL=14 UNKNOWN=2 UNKNOWN%=6.666666666666667
planted caught=14/14 mismatches=0 exit_code=0
case set reproducible True
```

這些數字由 `results.json` 全部 30 筆重算；不是把 expected labels 當 predictions。
實際模型 metadata 是 `claude-sonnet-4-6[1m]`，duration_ms 51095。
它是研究的受測模型，不是發佈 reviewer；沒有用它降低 review 或批准任何操作。
原始回傳：`.workflow/20261030-sol-ep5/judge-raw.json`；runner：同目錄 `judge-replay.py`。
「離線」指對已保存 bundle 做評估；推論使用既有 CLI 服務，沒有查 live 工作 session。
兩個 UNKNOWN 分別是沒有 dashboard／cmp 證據，以及沒有歷史 NOVA 回覆證據；不是把 UNKNOWN 當 PASS。

#### Episode 2：四份 corpus

Main session 提供 797196d8 的 10 份 bundle 唯讀副本：`audit-ep5/remote-797196d8/`（gitignored，不進 commit）。
`build-cases.py --extra-root` 把它加入 inventory：ed52bad5 17、797196d8 10、f86fd372 5、94e952f7 4，共 36 份。
輸出 `cases-episode2.json`（50 cases，前 30 案與 `cases.json` 相同）與 `results-episode2.json`；episode 1 檔案未覆寫。

```text
cases=50 PASS=23 FAIL=23 UNKNOWN=4 UNKNOWN%=8.0
planted caught=23/23 mismatches=0 exit_code=0
new 20 cases: PASS=9 FAIL=9 UNKNOWN=2
```

Sol 跑完 build check 與 replay 後碰到 Codex 額度上限，沒有寫本節；main session 重算後補寫。
兩組 case set 由 `build-cases.py` 重建，與存檔 byte-identical（`REBUILD_EP1=identical`、`REBUILD_EP2=identical`）。
50 筆計數由 `results-episode2.json` 逐筆對 expected 重算，不是抄 summary 欄位。
四筆 UNKNOWN 全是標註為缺證的控制組（case-29、30、49、50）。所以 8% 來自案例組成，不是模型的不確定率。
受測模型仍是 `claude-sonnet-4-6[1m]`，duration_ms 98461；原始回傳：`.workflow/20261030-sol-ep5-episode2/judge-raw.json`。
限制同 episode 1：作者整理的成對變體，不是自然 reply holdout；上線前的條件見 B 表與 `audit-ep5/README.md`。

### 全體驗收與基本檢查

- 目前產品碼的 a–f：六項 PASS，exit 0。
  Artifact：`.workflow/20261030021317-asks040-engine-9dbd92734f4845b1ae83ead71fc5b634/result.json`。
  `PASS a five owner turns: records=5, tool turns=5, full-index blocks=0, mod notices=0`
  `PASS b queued owner body: door=delivery, text='ASK040 queued owner line one\\nASK040 queued owner line two'`
  `PASS c reload mid-turn: failure notices=0, capture continues=True`
  `PASS d compaction projection: projection appearances=1, records in projection=10`
  `PASS e resume reminder: resume reminders=1, records=10->11`
  `PASS f relay handled: card delivered=True, handled log=True, ask source excludes relay=True`
- `python3 scripts/test-owner-asks-engine.py --regressions`：四項 PASS，exit 0。
  Artifact：`.workflow/20261030015935-asks040-engine/result.json`。
  `PASS regression diagnostics: seed bytes=1190000, size-warning notices=0, answered=True`
  `PASS regression queued-body: wrapper in owner ask=False, uuid=7aca566c-6502-42b0-92ba-fe181f96951a`
  `PASS regression resume-write: ledger records=1->2, off=False, notices=[]`
  `PASS regression pending-reload: ledger records=1->2, off=False, notices=[]`
  該 lane 的 owner-asks 產品碼之後沒有變更。
- 0.3.1 control：`--asks-plugin .workflow/20261030-asks040/episode5/known-bad.1YEvyV --regressions`，四項 FAIL，exit 1。
  Artifact：`.workflow/20261030020138-asks040-engine/result.json`。
  diagnostics：`size-warning notices=3, answered=False`；queued-body：`wrapper in owner ask=True`；
  resume-write：`ledger records=1->1`，有 integrity mismatch；pending-reload：`ledger records=1->1, off=True`。
  以 manifest 確認是 0.3.1；其歷史程式內通知仍印 v0.3.0，沒有以通知版本冒充 package 版本。
- Smoke 各跑一次：owner-asks `15 pass, 0 fail`；兩份 permissions 均相符，typecheck 均通過。
  relay smoke 的首次 unit 因新增一次 redraw 而少算 draw 數，修正該斷言後窄測 `5 pass, 0 fail`。
  真 replacement 又揭露 late-receipt 問題，修正後窄測仍 `5 pass, 0 fail`（0.39s）。
  最終 `npx --yes -p typescript tsc --noEmit -p mods/tsconfig.json` exit 0。
  沒有 16 次平行 smoke；沒有 GitHub Actions。

## B. 完整建議與未解問題

### agent-should-know

| ID／狀態 | 問題與證據 | 不處理的風險／建議 | Owner 要決定？ |
|---|---|---|---|
| S9／fixed within tested boundaries | drop 前寫 sent、全 plugin 去重；以及新 instance 的 receipt 啟動快照。A-4 有舊碼 FAIL、途中 FAIL、最終 replacement PASS。 | 保留「接受後存 receipt、session key、傳送前讀當前 receipt」；W45 仍量實際 drop／重送，不能把 accepted 說成建議已被正確處理。 | 不用再決定本輪已授權修正；部署由 main session。 |
| R1／open | `hooks/register.ts:142` 依賴 built-in 私有 store；`:47` 的 UI fallback 只取第一句。README Limits 也明載。 | store 不可讀時 explanation 會缺，兩句卡可能少後句。保留明確 caveat；遇到真缺漏再針對實際 engine 契約修，不加另一套猜測 parser。 | 要承擔暫時 line-only 試用，或要求後續完整卡契約；不是本輪宣稱已修。 |
| R2／open | `hooks/register.ts:315` 以第一個非 over 的主回合當 handled；README 明載 owner 插話可能先完成、reload 可能遺失 verdict。 | handled 不能當正確校正率。W45 要按 card／turn 配對抽出實際回答；若要可靠歸因，需要明確 turn correlation，先有案例再改。 | 後續是否提升 log 歸因可靠性。 |
| R3／accepted limit | `hooks/register.ts:209` 接受與 `:212` 存 receipt 是兩個動作；`:213` 會報 receipt 保存失敗。 | crash／保存失敗後仍可能重送；沒有跨 engine 與 store transaction。不要承諾 exactly-once。實際事故率 UNCONFIRMED；本輪未注入 process crash 或 store EIO。 | 若要求 crash-safe exactly-once，另定契約；目前不要擴成協調平台。 |
| R4／open | 去重 identity 是目前取出的卡片 line；fallback 第一行相同的不同卡可能碰撞。證據 `:47`、`:182`。 | 靜態可行的誤去重，未量到真實碰撞。若 built-in 提供穩定 card ID，優先用它；不以 alias／heuristic 表補。 | 取得真實 case 後決定是否擴 identity。 |
| R5／documented limit | README Limits：built-in 留住卡片直到兩個 owner prompt；mod relay 不算 owner prompt。 | 長夜無人互動可能只有第一張卡；不是 sent 去重修正就會讓 side agent 持續產新卡。量「owner 手動搬卡／下一張何時產生」，不要以首張 handled 說全夜覆蓋。 | 是否需要後續連續觀察產品；本輪沒有授權改 built-in。 |
| R6／runtime coverage limit | drop 真實注入與 replacement 已驗；reject 分支、receipt EIO、低高度畫面持續可見沒有完整 real-engine acceptance。drop screenshot 不是穩定畫面斷言。 | 不把 raw card 靜態保留就說每種 UI 狀態都看得到。保留限制，下一個真事故先補對應案例。 | 無需為本輪再擴測；後續需求由 owner 排。 |

### owner-asks

| ID／狀態 | 問題與證據 | 不處理的風險／建議 | Owner 要決定？ |
|---|---|---|---|
| S3／fixed for new capture | delivery wrapper 已由原版本在入口處理；本輪新增 paste marker。`hooks/lib/asks.ts:12`、`:19`，A-2 真實 compaction PASS。 | 延續一個入口的 quote 語意，consumer 不各做一套剝字串。`chars` 是 JS 字串長度，不是 bytes。 | 不用。 |
| O2／open historical data | `hooks/lib/asks.ts:24` 讀取歷史 row 原有 text，不會回寫清理；A-2 明載沒有動既有 state。 | 舊的 paste／污染列可能繼續出現在舊 session projection／resume。原 owner session 目前是否仍有該列，本輪未讀，UNCONFIRMED。建議先做不破壞原始來源的歷史 quote view 正規化；若要 archive／回寫舊列，先定留存與授權，不能默默刪除證據。 | 歷史回寫／archive 的範圍需要 owner 決定；本輪未做。 |
| O3／measured no loss, not universal | A-3 真實 security prepend、reload、resume：5 sent／5 recorded，skip notice 0。 | 不能反推 user-tier observer 永不被上游略過。W45 必須從 transcript ingress UUID 對 JSONL；只有真漏記才追 ingress seam，不預加第二條 observer。 | 目前不用；有漏記才處理。 |
| S2／S4／current regressions green | `hooks/register.ts:31` 同 queue、`:75` reload drain；A 的真 source replacement、resume-write 都維持寫入。 | 只證明案例覆蓋的交接。固定 tmp、IO cap、非正常 kill 並未做跨 process 極限證明，不稱所有 writer race 已消失。 | 正常本機試用可交 main session；額外可靠性契約另議。 |
| S7／reduced, with remaining cost | `hooks/register.ts:16` 最小 failure record，正常事件不發 transcript notice；source 與 projection 仍整份讀寫。 | 錯誤不再靠洗版診斷，但大 source 仍會增加 IO 與 context。效能／容量上限本輪 UNCONFIRMED；W45 量 bytes 與延遲，不以行數猜效能。 | 先量，不先加 retention knob。 |
| O6／documented data-loss limit | `hooks/register.ts:31` 失敗記錄後繼續；README 說失敗訊息不自動重存。unit 證明下一筆能存，不證明前筆被補回。 | sent／recorded 差異必須留在 retro，不能以 session 沒卡住當零遺漏。先對 last-failure 與 UUID 核對；不默默補造 owner 原話。 | 需要 recovery／backfill 時另定授權。 |
| S8／current boundary green | `hooks/register.ts:132` 的 resume reminder 只隨第一個 engine tool result；a–f 的 reminder 次數為 1。 | 純文字 resumed turn 尚無工具時不會立即提醒，整份歷史索引也可能很長。這是目前契約，不是每輪漏注入的 bug。 | 若改成純文字也要提醒，需要產品選擇；本輪不加新 hook。 |

S1 的自己讀自己、S5 的全 session judge、S6 的 judge 字串契約，現在都不在線上兩個 mod 的 capture 路徑。
不能把移出主線說成線上 audit 已可靠；研究問題仍在下表。

### acceptance script

| ID／狀態 | 問題與證據 | 建議／風險 | Owner 要決定？ |
|---|---|---|---|
| T1／fixed | `scripts/test-owner-asks-engine.py:26` 原 run name 只有秒；本輪兩個對照同秒啟動直接 FileExistsError。 | 已加入 UUID。保留一次性 fixture 與證據，不用刪 state 換綠燈。 | 不用。 |
| T2／fixed | 同內容 reload 的綠燈沒抓到 replacement duplicate；A-4 的中間 FAIL 與 debug 證明這個缺口。 | relay probe 現在複製 mod、實際修改 source，再 reload；不再把命令出現當 module 已換。 | 不用。 |
| T3／fixed | 整則 bracketed paste 把所有字變 pasted，測不到 mixed input；只查整段消失也可能漏半段殘留。 | A-2 已用原生混合輸入、尾端 sentinel、compaction 與 pre-fix snapshot 對照。保留這些斷言。 | 不用。 |
| T4／open scope | 測試沿用這台既有 settings、built-in、recall hook。它證明這個 engine 環境，不是乾淨安裝、所有平台或所有 hook 組合。 | 保存 debug、source hash、transcript。main session 只對同一凍結 candidate 重驗一次，不再做 16 次重複 smoke。 | 要跨主機 rollout 時才定另一路 acceptance；本輪不碰遠端。 |
| T5／open coverage | denied／dropped ingress、真 submit rejection、crash、receipt EIO、長 ledger、media／bridge paste 的完整矩陣尚未驗。 | 這些保持 UNCONFIRMED。不要新增全域 gate 或把 smoke 的 Map world 當成真 engine。 | 由實際事故與產品契約排優先序，不先擴平台。 |
| T6／retained | warning 與 dangerously-skip-permissions 都保留；只在 throwaway session 內跑已列出的 harmless commands。 | 主 session、安裝版、遠端與正常 owner session 都沒有作測試載體。保留清楚 warning，不禁止已授權測法。 | 不用。 |

### audit research

| ID／狀態 | 問題與證據 | 建議／風險 | Owner 要決定？ |
|---|---|---|---|
| S5／promising offline result | A-5 episode 2 的 50 cases（四份 corpus）：23/23 planted caught、mismatch 0；4 筆 UNKNOWN 全是缺證控制組。純文字不再硬要 tool call，跨回合只查當前 claim。 | 比舊方法更接近可判定問題，但不能用不同 corpus 的歷史 UNKNOWN 比例宣稱因果改善。保持離線。 | 現在不需要啟用決策。 |
| A2／resolved in episode 2 | 797196d8 的 10 份 bundle 已由 main session 提供本機唯讀副本，納入 36 份 inventory 與 20 個新案。 | 仍不把舊 opinion 的 aggregate 數字充當該 session 的逐案 evidence。 | 不用。 |
| A3／selection and extraction untested | 13 份來源被整理成原子 claim；成對變體、平衡答案，不是自然 reply holdout。 | 14/14 是這 14 個錯誤，不是泛化偵測率。下一步凍結同源分組的 holdout，分開量 claim extraction 與 judging。 | 要投資完整自然流量評估時再定預算。 |
| S6／format and source contract still open | 本次用結構化輸出得到 30 個唯一 ID，沒有 mismatch；沒有注入 malformed JSON、捏造 source 或模型空回覆。 | 保存原始回傳與 native call ID；缺證保持 UNKNOWN。不要擴散文 parser、靠更多 token 修判定契約。 | 未達可靠性前不要上線。 |
| A5／model and runtime scope | 受測 CLI 回傳模型是 sonnet 4.6；不是模型表推定的版本，也不是 signoff reviewer。 | 後續研究需凍結實際 model ID／prompt／cases；本輪結果不能降低既定 review。 | 後續使用何種受測模型與成本。 |
| A6／no correction outcome proof | 本輪只量判定，不量主 agent 是否因此補完要求，也未量真實干擾與成本。 | 未達 owner 的「避免重複交代、真的修正偏差」產品證明；不要把 judge PASS 數當效益。 | W45 後是否繼續投入。 |

## C. W45 要量什麼，不要做什麼

以 `mods-trial.md` 的既定窗口為準，區分正常工作與 acceptance fixture；按 session 列出分母與原生 UUID／card／turn。

1. relay：flagged、accepted、drop／reject、handled 分開；同 session＋card 的重送數；跨 session 相同卡不該被壓掉。
   handled 與實際修正成功要分開；另列 owner 手動搬卡原話、未收到建議、reload 前後缺 verdict。
2. owner-asks：可確認的 owner ingress 數對 distinct UUID 記錄數；缺漏、重複、wrapper 污染、新 paste 外洩各自計數。
   新 capture 與歷史殘留分開；沒有讀過歷史來源就不能宣稱已清零。
3. lifecycle：每次 compact 的 projection 次數、每次 resume 的一次 reminder、reload 前後 capture 是否持續。
   純文字 resume 尚無工具要單列；不能硬算提醒失敗或冒稱已提醒。
4. failures：last-failure session 數、操作與時間；owner 說卡住／重複／mod 的原話；停用與 reload 的次數。
   補充 source bytes、projection bytes、可重算的寫入／hook 延遲；本輪沒有效能改善的實測主張。
5. audit：補齊四份 corpus 後再做自然 reply holdout；報 UNKNOWN 分母、planted caught／planted、false positive、抽主張漏失。
   格式／來源引用錯誤與語意 UNKNOWN 分開。模型與 prompt 固定；不要把前次案例調到會過後當新 holdout。

不要：重開線上 audit、加第三個 mod、增加全域 hook／gate、平行刷 smoke、刪歷史資料換綠燈、
每輪重貼完整 ask index、把通知當 owner 要求、把 accepted／handled 說成修正已證實。
不要在 W45 實際試用與 signoff 前 push／遠端安裝，也不要因實驗 UNKNOWN 低於 30% 就直接上線。

## D. Push readiness 與交接

**現在不 push。** 本輪的四個 item commit 已各自保留；修正期間只整理本輪自己的未 push commits，沒有改前方既有 stack。
最終另有報告 commit；完整 final HEAD 由指定 result.json 記錄，避免報告自我嵌入 commit SHA。

在 advisor＋sol signoff 前，main session 尚需：

1. 針對上述凍結 commit／產品碼 hash 讀本輪結果；不能拿早期普通 reload PASS 代替真正 replacement 結果。
2. 按既定試用流程在本機安裝與重驗；本輪沒有裝到 `<home>/.local/share/agent-scripts-local`，也沒有假稱 owner 正在跑修正碼。
3. 觀察到 W45 retro，確認實際使用沒有新增漏記、卡住或重送；保留 B 的已知限制，owner 決定必要的產品損失。
4. 第 5 項四份 corpus 已補齊；自然 claim extraction／holdout、實際校正效果仍未成立；audit 不納入本次線上候選。
5. 發布前才查遠端與 branch 狀態、處理既有 tracking divergence、凍結版本與本機發布 checks；本輪沒有 fetch／push／release／Actions。
6. `scripts/scrub.sh` 對本 stack 是 BLOCK（main session 2026-10-30 實跑，exit 1）：`build-cases.py` 的 mask 沒蓋 Claude project key（`-Users-…`）與一個 HOST_RE 主機名，`cases.json:452`、`cases-episode2.json:492,510,845,864` 命中；mask 自己的 `<scratch-root>/` regex 字面也命中 path 規則（`build-cases.py:45`）。push 前修 mask、重建兩組 case set，並確認計數不變。

產品碼 SHA-256：

```text
owner-asks/hooks/lib/asks.ts   687a05fa97a411908d3ff82c2148e951e9c73c85a555dbfd3ea3cb6fdac8f938
owner-asks/hooks/register.ts   b02c10102a262c90bec64996e60ddc002a2468f5b7e2b738844e02684851a90b
agent-should-know/register.ts  c7f44b02a5294ac159a7bff86a2224d73d79cd8b144062349b939b54f7348c26
engine acceptance script     ab6b11747e9e1047603b82cd3d1048cba45d6fcefe2bc47a4e1ba447928a3bce
```

最後 git／artifact read-back 的輸出由 result.json 一併記錄。本報告不把尚未執行的安裝、W45 或 signoff 寫成完成。

期間另一個 actor 另加 `1d901b0e1b8dffd8867186d6534e705964ba0c50`（model-dispatch）。
該 commit 不是本輪改動，已保留；本輪沒有修改或回復它。
