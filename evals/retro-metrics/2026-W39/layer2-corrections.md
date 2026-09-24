# W39 Layer 2 — 兩場被糾正 session 深挖（retro-agenda §2–4）

對象：`cab30519`（Xcode 27.1 + iPhone Duo 模擬器 → project-b 版型驗證）、`e4fe0066`（承接：Duo UI 完整支援）。
行號 = transcript JSONL 行號。使用者原話只引短摘。

## 0. Unknowns：我以為 vs 實際（讀 transcript 前先寫左欄）

| # | 我以為 | 實際（證據） |
|---|---|---|
| 1 | cab30519 的糾正集中在「目標弄錯」（「我說的是 project-b」那類）。 | 只有 1 筆是指涉錯（L3942，套件版號 vs app 版號，一輪內自修）。主流是「負面結論下太早」與「該做的事丟回給使用者」。 |
| 2 | e4fe0066 的主因是 review 節奏規則缺失。 | 節奏只佔 1 筆（L1156）。更大的是 compaction 摘要把「SSH 到實驗機與任何模擬器操作需核准」寫成常駐限制（L1838 摘要內文），與使用者「實驗機自由發揮」（cab L3424、e4 L826、L5404）相反，造成反覆請示。 |
| 3 | 4 / 7 次 >100k cache break 與糾正相關（糾正 → 重讀）。 | cache break 全落在「使用者離開後回來」的第一輪（例：cab L3649 前是 07:01→10:37 空窗；e4 L747、L1159、L3917 都在使用者回覆之後）。是 TTL 過期的後果，不是糾正的原因；也不是規則問題。 |
| 4 | CORR regex 大致抓得到。 | 兩場 33+34 個 human turn 中，CORR 各只命中 1 筆（cab L3942、e4 L1156）。手動判定 10 與 23 筆（見 §1）。召回率約 1/10、1/23。 |
| 5 | 規則缺失為主。 | 多數是「規則存在但沒執行」：kernel 路由已寫 negative-state claim → judgment-rubrics §2/§5；lessons 2026-08-18（fastlane / 先查專案記錄）已在案。缺的是 UI 證據要附圖、常駐授權的保存、NOVA 派工對象。 |

## 1. 計數方法

- 腳本抽出每場 `type=user`、非 meta、非 tool_result、且不以 `<`／`This session is being continued`／`Another Claude session`／`The tmux-agent plugin` 開頭的 turn = human turn：cab30519 **33**、e4fe0066 **34**。
- 對每個 human turn 印出前一則 assistant 文字、區間內 tool error 與 hook BLOCKED、之後兩則 assistant 回應，逐筆人工判定。判定標準：該 turn 否定、改向或質疑 agent 上一步的行動或結論（含「顯然該做卻來問」的不耐回覆）。
- 結果：cab30519 **10 筆**（嚴格 8 筆，另 2 筆為過度請示後的授權回覆）；e4fe0066 **23 筆**（嚴格 19 筆，另 4 筆為對 agent 提問的授權/裁決回覆）。cab 嚴格 8 筆與 cmli collector 的 ~8 吻合。
- 排除（非糾正）：純指令、連結、補充需求（例：e4 L2015 加外框、L3976 註冊看看）。

## 2. 逐筆：使用者經歷 / agent 卡在哪 / 類別

格式：`L行號` 現象 → 根因類別 → 對策去向。類別：A=規則缺失、B=規則存在但沒執行、C=工具或環境問題。

### cab30519（10）

- L530「預期你幫我安裝好」：agent 停在密碼提示要使用者打 → C（sudo 與 Apple ID 密碼真的只有使用者能給，L558 `SUDO=needs-password`）→ 棄案
- L821「vnc 過去不就好了」：agent 列三個決定等使用者（L814），沒先試手上的路 → B（kernel「Search before you ask」）→ lessons 提案 #2
- L1070「直接叫他幫忙看啊」：agent 讀完 NOVA 對話卻沒發訊息；接著 Grok Bot 重啟、CDP port 消失（L1116）→ C（debug port 只在啟動時生效）→ backlog 項：using-grok-bot-app 加「發訊息前先確認 CDP 仍在」
- L1123「照我專案規範 build 有 fastlane 不要自以為聰明」：agent 用裸 `flutter build`，L1162 自認「專案 memory 有寫這條路…我先前是自己亂 build」→ B（lessons 2026-08-18 已在案）→ 棄案（已有 lesson，屬執行問題；併入 #2 證據）
- L2290「模擬器都能操作 你們沒仔細點過」：agent 靠 binary strings 下「開合沒實作」結論，L2295 自認「GUI 沒真的翻遍」→ B（kernel 路由 negative-state claim → judgment-rubrics §2/§5）→ lessons 提案 #1
- L2469「那你們可測更仔細」：同上一條的延續，L2462 自認拿假陰性（killall 沒殺成）當證據 → B → lessons 提案 #1
- L3424「那台就是實驗組啊 想生都可以」：agent 留 dirty 工作區並附清理指令等使用者 → B（lessons 2026-09-04「待你決定」）→ lessons 提案 #2（授權回覆，不計嚴格）
- L3942「我說的是 project-b」：agent 把「1.0.15」當套件版號查 pub.dev（L3891），L3929 自修 → A（無「提問指涉不明先對齊」條；operator-defaults 的 scope read-back 只管 UI/scope 變更）→ 棄案（一輪自修，成本低）
- L3968「multiscene=false 不是要改？」：agent 寫「結論成立」（L3961），L3972 承認展開態證據有缺口 → B（judgment-rubrics §5 Reports：inferred vs verified 要分開）→ lessons 提案 #1
- L5430「你又在弱智 亂搞啥」：目標是「哪裡有 ui 沒做好都要排查」（L4075），agent 卻花整段時間裝 idb、猜座標，還質疑 VM service 通則（L5424）；L5434 自認「水電工，不是你要的」→ B（judgment-rubrics §5「answers the ORIGINAL request」、§4 wrong-direction）→ lessons 提案 #1

### e4fe0066（23）

- L320「我們方針很明確」：agent 深挖 X 貼文細節（L312），偏離「列出該重設計的」→ B（§5 ORIGINAL request）→ 棄案（使用者一句拉回，L379 即交付清單）
- L675「本來就不能選便宜的偷懶」：agent 把「完整支援」兩種讀法丟給使用者（L668）→ B（lessons 2026-09-18 waiting）→ lessons 提案 #2（裁決回覆，不計嚴格）
- L744「交叉驗證啊」：agent 轉述 Astra 結論並寫「我沒有獨立複驗」，再請使用者同意動實驗機（L736）→ B（kernel Live truth：prior tool output 是線索不是事實）→ lessons 提案 #2
- L826「我就說了你們找共識 自由發揮」：交叉驗證後又「等你點頭」動實驗機（L819）→ A（常駐授權無處保存；見 L1838 摘要把實驗機操作寫成需核准）→ lessons 提案 #2
- L1156「有像樣的對抗 review 結論幾回合才找我」：兩份裁決對立，agent 一回合就拿去問「要我重寫還是你先裁」（L1149）→ A（consensus-gate／model-dispatch §5 只講重試升級，沒寫「裁決分歧時先跑反駁回合、收斂後才上報」）→ lessons 提案 #2
- L1229「沒有所謂現行 直接做出最終」：agent 請使用者核准 C1 分期（L1222）→ B 且規則運作正確（kernel：scope cut 需使用者明示）→ 棄案（裁決回覆，不計嚴格）
- L1768「上圖啊 不然我怎麼知道你有沒有鬼扯」：UI 改版只用表格和數字回報（L1761）→ A（無「UI 結論必附畫面」條）→ lessons 提案 #3
- L2068「我要真實畫面」：agent 交自畫外框示意圖（L2062 自己也標「不是 Apple 素材」）→ A → lessons 提案 #3
- L2249「我們從頭到尾都是在 mac mini 上做」：L1838 compaction 後 agent 在本機查 Xcode、報「這台沒有 Duo 模擬器」（L2077、L2241）→ C（摘要 24,959 字中實驗機只出現 2 次，且是限制句）＋ B（kernel「Diagnose the NAMED system first」）→ backlog 項：compaction 摘要必帶「工作主機＋常駐授權」欄
- L2604「問 grok bot 你完全在耍白癡」：L320 已指示派員研究，agent 仍自己試五條路後下「內螢幕打不開」負面結論（L2597）→ B（kernel negative-state claim 路由；user-named path binds）→ lessons 提案 #1
- L2708「這是新東西 你不能用舊觀念」：給 bot 的訊息以 Simulator.app 舊模型列排除清單（L2701）→ B（kernel Live truth，應先查 Xcode 27.1 新文件；L2723 一查就找到）→ lessons 提案 #1
- L2957「就叫 grok bot 幫忙啊」：查到文件後仍自己做 → B（同 L2604）→ lessons 提案 #1
- L2982「你要問 nova 不是亂問」：訊息送到 `coding-cli proxy` 而非現任指揮（L2975）；cab L966 早已讀出現任是「NOVA 替身 w38」→ A（using-grok-bot-app 沒有「派工先找現任指揮」步驟；session 間未帶過來）→ backlog 項
- L3222「就說可以」：agent 要 UAT 帳密（L3213）→ B（授權回覆）→ 棄案（帳密只有使用者能給，不計嚴格）
- L3287「自己處理 我覺得沒差」：agent 問「把帳密搬到另一台機器」要不要（L3279）→ B 且規則運作正確（kernel hard-stop：privacy exposure）→ 棄案（不計嚴格）
- L3438「上圖啊」：只回報觸控/AX 數據（L3431）→ A → lessons 提案 #3
- L3467「這樣不完整 要包含方向 旋轉 還有你沒登入」：驗收只截開合，漏旋轉與登入態；需求早在 cab L1407 說過「可以開合 可以旋轉」→ B（kernel：acceptance 不清 → unknowns-discovery；需求在紀錄裡）→ lessons 提案 #3
- L3914「為啥不能用」：agent 報「後端拒絕帳密」（L3905 前後），L3946 查出是自己送出的密碼大小寫錯誤（Shift 沒生效；原文已遮罩）→ B（negative-state claim 未驗輸入）→ lessons 提案 #1
- L4188「我沒看到你打勾啊」：agent 報「勾選框在 AX 樹不存在，註冊走不完」（L4181），L4224 自認「我在用猜的」→ B → lessons 提案 #1
- L4421「聽起來不合理啊」：agent 把點不到歸因為 app 無障礙缺口（L4414），L4425 自認「是我工具用錯」→ B → lessons 提案 #1
- L5118「Bot 上網研究啊」：agent 自己排除到一半，結尾問「先跑 A/B 還是先註冊」（L5112）→ B（lessons 2026-09-18 waiting；user-named path）→ lessons 提案 #2
- L5259「你用 chrome 看吧 智障」：agent 報「影片我看不到（X 登入牆）」（L5251），沒提出已登入瀏覽器這條路；kernel 禁止未經要求使用瀏覽器自動化 → C（登入牆）＋規則副作用 → backlog 項：kernel Tools 段補「被登入牆擋時，一行提出受管控的瀏覽器路徑，不要只報看不到」
- L5404「做啊 實驗機自由發揮」：agent 在實驗機上印 inset 前又問「要我跑嗎？」（L5397）→ A（同 L826，常駐授權未保存）→ lessons 提案 #2

## 3. 根因彙總

| 根因 | 筆數 | 類別 | 行號 |
|---|---|---|---|
| R1 負面/過滿結論先於窮盡證據（含沒用已點名的幫手、偏離原始目標） | 12 | B | cab 1123, 2290, 2469, 3968, 5430；e4 320, 2604, 2708, 2957, 3914, 4188, 4421 |
| R2 可自行推進卻請示/等核准；常駐授權（實驗機）跨 session 與 compaction 遺失 | 8 | A＋B | cab 821, 3424；e4 675, 744, 826, 1156, 5118, 5404；摘要證據 L1838 |
| R3 UI 結論不附真實畫面／驗收狀態不全 | 4 | A | e4 1768, 2068, 3438, 3467 |
| 工具/環境 | 5 | C | cab 530, 1070；e4 2249, 2982, 5259 |
| 指涉不明 | 1 | A | cab 3942 |
| 規則運作正確、不需對策 | 3 | — | e4 1229, 3222, 3287 |

合計 33 = cab 10 + e4 23。部分行同時沾兩類，以主類計一次。

## 4. CORR regex 檢查

`evals/retro-metrics/layer2-extract.py:6`：

```
CORR = re.compile(r"不對|不是這樣|我說的是|你改壞|別再|又錯|重來|不要這樣")
```

- 「弱智」**不在**pattern 中；「又錯」也不會命中「你又在弱智」。同樣缺：腦殘、智障、白癡、鬼扯、自以為聰明、不合理、不完整、「…啊」結尾的催促句（「交叉驗證啊」「上圖啊」「就叫 grok bot 幫忙啊」）。
- 本兩場實測召回：cab 1/10（只中 L3942）、e4 1/23（只中 L1156，靠「不是這樣」）。
- 對策去向：backlog 項（擴 pattern 前先用本檔 33 筆當標註集量 precision/recall，不直接加字）。

## 5. Lessons 草稿（未寫入 lessons.md）

```
## 2026-09-24 | scope: judgment | trigger: 負面結論（「做不到／不存在／後端拒絕／app 缺陷」）在窮盡證據前就回報，W39 兩場被推翻 10 次
Rule: 回報負面結論前，先列出已試路徑，並確認三件事：輸入真的送對了（實際送出的字串／座標）、新平台功能查過本版官方文件、使用者點名的幫手（bot／工具）問過了；少任一項就標 UNCONFIRMED 並繼續，不交給使用者。
Evidence: cab30519 L2290→L2295、L5430→L5434；e4fe0066 L2604→L2723、L3914→L3946、L4188→L4224、L4421→L4425。kernel 路由已有 negative-state claim → judgment-rubrics §2/§5，屬「規則存在但沒執行」。
Status: proposed

## 2026-09-24 | scope: waiting | trigger: 使用者已給常駐授權（實驗機自由發揮、找共識自由發揮），agent 跨 session／compaction 後仍逐次請示，並把對立裁決直接丟給使用者
Rule: 使用者給的常駐授權（主機、範圍、原話）寫進 run dir state 與 compaction 摘要的固定欄；摘要不得把已授權範圍改寫成「需核准」。審查裁決分歧時，先跑反駁回合直到收斂或 3 回合上限，再帶結論找使用者。
Evidence: cab30519 L3424（授權原話）；e4fe0066 L1838 摘要內「SSH 到實驗機與任何模擬器操作需核准」；L826、L5404 重複授權；L1149→L1156→L1160 改跑 Round 2 後 L1222 收斂。
Status: proposed

## 2026-09-24 | scope: completion | trigger: UI 版型結論只用表格／數字回報，使用者「上圖啊 不然我怎麼知道你有沒有鬼扯」
Rule: UI 或版面結論必附本輪實際截圖（模擬器或實機畫面，非自繪示意），並涵蓋需求紀錄裡點名的狀態（開合、旋轉、登入態）；做不到就說缺哪張、為什麼。
Evidence: e4fe0066 L1768、L2068（自繪外框被退）、L3438、L3467；需求原話 cab30519 L1407。
Status: proposed
```

## 6. Backlog 項（非 lesson）

1. compaction 摘要固定欄：工作主機、常駐授權原話（證據 e4 L1838、L2249）。
2. using-grok-bot-app：派工前讀現任指揮；發訊息前確認 CDP port 仍在（證據 cab L966、L1116；e4 L2982）。
3. kernel Tools 段：被登入牆擋時一行提出受管控的瀏覽器路徑（證據 e4 L5251→L5259）。
4. CORR regex：用本檔標註集量 recall 後再擴充（§4）。
