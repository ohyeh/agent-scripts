# Weekly Retro — 2026-W38（窗口 2026-09-10 → 2026-09-17）

資料：`evals/retro-metrics/2026-W38.json`（機器指標）、`layer2.json`（逐場挖掘）、`next-week-backlog.md`（X9–X16）。
方法：三機唯讀採集（本機 .44、ssh .62、ssh box@.47；mini .41 依指示跳過）。
量尺：`usage-dedupe.py` midkey（三機各跑兩次差 0）、`analyze-sessions.mjs --json --since 7d`（shasum 1c5beaf1）、
`codex-tokens.py`（本週新增）、cmli `agent-sessions` v4 909d4db（tar 送 `bin/` 到遠端直接 import）。
機器鍵沿用 W37：`remote-44` = 本機 .44、`local-mbp14` = .62、`grok-bot-vm` = .47。

## 1. 成本（cost.py，API 費率當量，非帳單）

```
== 2026-W38 (2026-09-10 → 2026-09-17)
  remote-44            claude $  435.98  (66 場 / 395 輪)  codex 34M UNPRICED
  local-mbp14          claude $ 1116.55  (58 場 / 448 輪)  codex 16M UNPRICED
  grok-bot-vm          claude $    0.09  (3 場 / 3 輪)  codex 0M UNPRICED
  合計 Claude            $ 1552.61   ·  每輪 $1.835
```

W37（四機）$1,760.85 / 每輪 $1.745 → W38（三機）$1,552.61 / 每輪 $1.835。

## 2. 三機比較（Claude；括號為 W37）

| 指標 | .44 remote-44 | .62 local-mbp14 | .47 grok-bot-vm |
|---|---|---|---|
| sessions | 66 (26) | 58 (63) | 3 (2) |
| turns | 395 (172) | 448 (818) | 3 (2) |
| 去重 total tokens | 651M (386M) | 1,697M (2,217M) | 17k (49k) |
| output tokens | 2.17M (1.13M) | 4.96M (6.95M) | 26 (128) |
| subagent calls | 15 (15) | 49 (100) | 0 |
| cache break >100k | 10 (14) | 29 (41) | 0 |
| ✈ canary | 27.9% (55.6) | 83.6% (85.3) | 33.3% (50) |
| GOAL/ACCEPT/REPORT | 47.1% (63) | 83.6% (86.8) | 33.3% (100) |
| done 無證據（collector） | 55% 11/20 (61.5) | 76.9% 20/26 (72.2) | 0 |
| correction sessions | 4 (2) | 3 (6) | 0 |
| top skill（api calls） | session-handoff 56 | loop 1627 | — |

其他 CLI：

| | .44 | .62 | .47 |
|---|---|---|---|
| Codex sessions / turns / tokens | 17 / 31 / 34M（luna 14） | 18 / 27 / 16M（astra 17） | 0 |
| agy 軌 / 步 | 19 / 5,261 | 7 / 1,354 | 1 / 2 |
| cursor chats / messages | 7 / 1,162 | 15 / 2,428（5 無 meta、3 unreadable） | 1 / 6 |
| grok seats / child / orphan | — | — | 16 / 331 / 41（W37 26 / 264 / 32） |

## 3. Findings（9＋臨時動議 3）

1. **總量**：三機 Claude 127 場 / 846 turns / 2.35B 去重 / $1,553（W37 四機 94 場 / 1,009 turns / 2.62B / $1,761；mini 本週不計）。每輪 $1.84（W37 $1.75）。
2. **重心移動**：.62 turns 818→448、subagent 100→49；.44 turns 172→395、sessions 26→66（.44 主戰場 tmux-agent-tools 24 場 / project-c 15 場）。
3. **.44 規則遵循下滑**：canary 55.6→27.9%、triplet 63→47.1%、correction 2→4。逐專案 canary：tmux-agent-tools 0/24、project-c 2/15、agent-scripts 13/23。同 kernel 4.30.0 的 agent-scripts 場仍 57% → 下滑集中在 tmux worker 場（worker 不載 kernel）與 project-c 專案，非 kernel 版本。
4. **cache break >100k**：三機 39（W37 55）；.62 29 筆中 10 筆 context 含 `/loop`（idle ≥60 分撞 1h TTL，W37 同型）；project-a 12 / agent-scripts 12。
5. **Codex**：三機 50M（W37 四機 48M）；.44 以 gpt-5.6-luna 為主、.62 以 gpt-6-astra；cached 比例 .44 93% / .62 88%。turns/sessions 口徑本週換新（`codex-tokens.py`），跨週僅供參考。
6. **其他 CLI**：agy .44 19 軌 / .62 7 軌；cursor .62 15 chats（5 無 meta、3 unreadable → messages 低估）；grok VM seats 16（W37 26）、orphan child 32→41 續增。
7. **艦隊狀態**：grok VM kernel 4.29.0 落後 repo 4.30.0；.62 與 .47 皆無 agent-scripts clone（W37「單機缺口」續存，換了機器）。
8. **治理**：lessons.md 49 條＝46 proposed / 3 adopted（W37 42/42 proposed；初稿誤寫「2 pending」，agy 審閱指出，已刪）；repo 11 skills 有 3 支零用量（ask-nova、defect-first-review、writing-artifacts）；retro inbox 兩節皆空。
9. **W37 gaps 結案 0.5/7**：`codex-tokens.py` 入 repo；機器層 `probe.py` 於 09-17 補齊重建（§8、§10 F9），結案數修正為 1.5/7。

10. **tmux-agent 孤兒多重收養**（§6.5 M1）：同 cwd 多 collector 各自收養並重投，無鎖、無 opt-in。
11. **tmux-agent ack 不持久**（§6.5 M2）：同批結果每 turn 重投 30+ 次；根因 UNCONFIRMED。
12. **agy profile result 停 pending**（§6.5 M3）：assign confirm-processing 誤判 launch-failed。

## 4. Layer 2 逐場挖掘（72 筆；W37 36 筆）

方法：`layer2-extract.py` 於 .44/.62 抽 7d 內 top-level transcript 的 (a) 使用者糾正句 (b) assistant done-claim 且前 6 行無證據 token；正則沿用 cmli v4；每場 done-claim 上限 3 筆；分類人工判讀。.47 無 flagged 場。

| 類別 | 筆數 | 說明 |
|---|---|---|
| A 規則存在但沒執行 | 10 | 真正的違規 |
| M 量尺誤判 | 51 | done 正則命中但證據其實在場（`All tests passed!`、PASS 表格、量測數字、誠實 `UNCONFIRMED`），或 PASS/done 是引文、欄位名、狀態色 |
| D 使用者側／貼文誤判 | 10 | correction 正則命中續接摘要、貼入的 peer/bot 訊息 |
| C 工具環境 | 1 | peer 探針吃掉面板一列 |

A 類 10 筆的主題：

| 主題 | 筆 | 案例 |
|---|---|---|
| done 無證據（宣稱 PASS/verified/proven 未引用工具輸出） | 4 | .44 953c6236 ×2、.62 f0bda2f3、.62 1c21ecf9 |
| Live truth 誤判 | 2 | .44 a753e36e 把已完成 worker 判 idle（peer 打回）；.62 貼回前 session 以 `last_agent_message: null` 判「完全沒產出」 |
| 等待協定 | 2 | .44 b85b334b 人在鍵盤前仍「跟我說一聲我立刻派」；.62 8c580e97 定時 25 分醒來「等於發呆」自述 |
| 簡化預設／誤讀意圖 | 2 | .44 f6afa86f 使用者：「TEST 過度 SLOP，UI/UX 功能都沒做出來」；.62 781cdc62 提議 gitSha 注入，使用者只要 Settings bundle 顯示 |

**關鍵推論**：collector 的 done-無證據率（.44 55% / .62 76.9%）有 51/56 是量尺誤判；真值約 5/56 ≈ 9%。W37 F6 已點名 matcher 漏 `# pass N` / `FLEET OK`，本週證實漏的更廣。Stop hook（claim-evidence-gate）用同一組正則，本 session 也被它誤打回一次（引了 cost.py 輸出仍判無證據）。
W37 兩大主題「授權外推 ×3」「等待協定缺失 ×4」本週分別為 0 與 2 → 有改善但未消失。

## 5. Gaps（7）

1. W37 backlog（X1–X8，.62 `.workflow/202609111022-weekly-retro/`）已不存在，本週無法評 backlog 有效性；W38 backlog 改入 repo 本目錄。
2. mini .41 未採集（依指示跳過），跨週合計不可直接與 W37 四機比。
3. 機器層 `probe.py`（Stop hook 命中、deny-replay、fleet-deploy）未重建，本週無這三組數字。
4. Layer 2 只挖 flagged 場，無隨機對照（W37 同）。
5. .44 tmux-agent-tools 0/24 canary：worker session 是否應載 kernel 未裁決（Paul 待決）。
6. cursor .62 5 chats 無 meta、3 unreadable → messages 低估。
7. grok seats 無 token 記帳；agy/cursor 只有筆數。

## 6. 待 Paul 決定（本週不動）

- tmux worker session 是否載 kernel（F3、G5）
- grok VM 4.29→4.30、.62/.47 補 clone → 是否跑 fleet-deploy（F7）
- 是否 push（e604790 起）
- 下週 backlog 編號：X9–X16 誤接 X 序列，改 Z1–Z8 或 Y8–Y15？（backlog-reconciliation.md）
- recipe-usage-stats.json 本 session 前已改動（M），是否隨 retro commit？

## 6.5 臨時動議（09-18；.62 現場觀察，Paul 裁定要記）

證據目錄：.62 `/private/tmp/claude-501/-Users-paul-yeh-github-agent-scripts/6c218550-…/scratchpad/tmux-agent-quarantine/{live-agy-b676,live-cursor-b67r,smoke-test-vc8n}/`；程式 `~/github/tmux-agent-tools/mods/tmux-agent/hooks/register.ts`（HEAD ddf74e3 09-17）。這三個 worker **不是**本 retro 派的：本 session 在 .62 只用 ssh stdin 跑 `probe.py`／`inventory.sh`／collector，沒有 `agent-tmux assign`；dispatch.json `owner` 為 2615a468（.62 本地 session）。

| # | 動議 | 證據 | 落點 | 驗收 |
|---|---|---|---|---|
| M1 | 孤兒收養無單一 owner：owner 心跳停 >90s 後，同 cwd 每個 collector 都收養並各自投遞 | `register.ts:43-45`（ORPHAN_MS 90_000）、`:386-392`（adoptable 只看 cwd＋心跳）、`:429-432`（註解承認雙 collector 會各自收養）；三 worker 被 6c218550／56300f8b／d9466459 各自重投 | ohyeh/tmux-agent-tools | 收養寫回 dispatch.json owner（鎖或轉移）；非派工 session 預設不收（opt-in）；投遞標 `adopted from <owner>`。W39 量：同一 launch_id 投遞 session 數 ≤1 |
| M2 | ack 不持久：`storeSet('tmux-agent.reported')` 後同批結果每 turn 重投（6c218550 收到 30+ 次）；`stop` 只清 panel 不寫 ack | `register.ts:38`（STORE_KEY）、`:832`（storeSet 只在 keep 長度變化時寫）；store 落點未找到 → 根因 UNCONFIRMED | tmux-agent-tools | 同一 launch_id 投遞 ≤1 次；stop 寫 ack |
| M3 | agy profile：pane 完成、輸出 ✈，但 result.json 停 `pending`，assign confirm-processing 90s 誤判 launch-failed | `live-agy-b676/result.json` status pending、terminal_reason stopped；`mod-assign.log` "no processing activity within 90s of send"；同型前例 `lessons.md:95-97`（08-25 worker 完成但 result.json 停 pending）；本 session 09-18 agy 審閱 worker 正常寫回 success（未重現）；本 session 09-18 對 codex assign 同見此訊息，但該次為 codex 額度用盡（plan.md），非同因 | tmux-agent-tools agy profile | agy worker result.json 由 pending → success；confirm-processing 改看 pane 活動或 result 檔 |

## 7. 相關 artifact（09-17 已各補 W38 段）

- 艦隊儀表板 <artifact-url>（v25：status 列、「W38 更新」section、三機 × 五 CLI 與機器層兩表、相關報告列）
- Skill 扇出健檢 <artifact-url>（v8：status 列、主要發現 W38 條、coverage caption）
- 三模型 Kernel 甜蜜點 <artifact-url>（v9：status 列、§08 Layer 2 對照行為軸）
- Skill Routing 現況 <artifact-url>（v8：status 列、§06 hook 命中）
- 856M 重讀帳單 <artifact-url>（v11：status 列、W38 續追表）

## 8. 機器層補量（09-17 追加；部分關閉 G3）

`~/.local/share/agent-hooks/*.jsonl`，7d（timestamp 2026-09-10..17）：

| | .44 | .62 | grok VM |
|---|---|---|---|
| claim-evidence rows / blocked | 110 / 48 | 133 / 59 | 無檔 |
| bol-prompt rows | 25 | 40 | 無檔 |
| deny-replay rows / 短路 | 4,212 / 0 | 9,591 / 0 | 0 / 0 |
| skill-router-nudge 命中 | 3（consensus-gate） | 32（resolving-merge-conflicts 15、consensus-gate 5、review-renovate 3、update-deps 2、triage 2、skill-creator 1） | 無檔 |
| 命中 owner 同期 Skill() | — | 0 | — |

上表為 09-17 稍早批次；probe.py 16:57Z 值（.62 137/61、deny-replay 4,234/9,609）以 `2026-W38.json` machine_layer 為準。仍缺：context-mode kept-out、Stop hook 誤打回逐筆判別（X9/X11）；deploy-log／shared-memory pending 已由 probe 補齊（loops-inventory.md）。

Artifact: <artifact-url>

## 9. 定額訊號（retro-agenda §2–4；09-17 追加）

- **turns=0 且 total>1M**（`session-outliers.py 7`）：.44 0／71 場、.62 0／64 場；Codex 三機 0（`codex-tokens.py`）。W37 同為 0。
- **糾正候選名單**：collector suspects .44 10、.62 10、.47 2（`cmli-*.clean.json`）＋ Layer 2 A/M/D 72 筆（`layer2.json`）。
- **隨機對照組**（seed 38，非 suspect 場 10+10+3，寬正則）：.44 0/10、.47 0/3 命中；.62 4/10 命中，其中 2 場為 skill 檔頭貼文誤中（38b15e56、fb6b0a41），**2 場為真糾正且 collector 漏抓**：f134135d（agent-scripts，「減少自言自語…每次 LOOP 要主動往下一輪」）、f411d9c4（project-a，「不要濫開 PR，額度都被用光」）。對照組漏抓率 2/23 → collector correction 計數（F3 的 2→4）為低估，方向仍成立。
- **配對指標**（W37 動議驗收）：「等下一次 tick」結尾 0/0/0；「待你決定」結尾 .44 0、.62 2（W37 19）；terrain PR 1（≤30）、runs 4（filter UNCONFIRMED）。

## 10. 待 Paul 裁決（§7；只列，不裁）

| F | 證據 | 建議 | 理由 |
|---|---|---|---|
| F1 總量 $1,553 | `retro-report.md:48`；`2026-W38.json` usd_equiv | 觀察 | 每輪成本持平（1.84 vs 1.75），無行動點。 |
| F2 重心移到 .44 | `retro-report.md:49`；.44 sessions 26→66 | 觀察 | 工作分佈變化，非缺陷。 |
| F3 .44 canary 27.9%／tmux worker 0/24 | `retro-report.md:50`；`2026-W38.json` canary_by_project | **升級**（X10 worker 載 kernel） | 同 kernel 的 agent-scripts 場 57%，下滑可歸因到 worker 不載 kernel；對照組另證 correction 低估。 |
| F4 cache break 39／`/loop` 10 筆 | `retro-report.md:51` | 觀察（沿 W37 G5） | idle ≥60 分撞 TTL 是結構性，kernel 已禁「keep cache warm」；無新機制可加。 |
| F5 Codex 50M／口徑換新 | `retro-report.md:52`；`codex-tokens.py` | 觀察 | 跨週不可比，W39 起才有趨勢。W37 動議「effort 分佈欄」未做（reconciliation 表）。 |
| F6 其他 CLI／grok orphan 41 | `retro-report.md:53` | 觀察→W39 若 >50 升級 | orphan 32→41 連兩週增；W37 已列觀察。 |
| F7 grok VM 4.29／.62 .47 無 clone | `retro-report.md:54`；probe-47 `deploy_log_last` 09-11、lessons sha 2939e283 | **升級**（X12 fleet-deploy） | 直接造成 lessons 分歧（loops-inventory）；fleet-deploy 是外部側效，需 Paul 點名。 |
| F8 lessons 46 proposed／3 adopted；3 支零用量 skills | `retro-report.md:55`；`lessons.md` Status 統計 | 觀察；G9 折入方式仍待答 | W37 是非題「G9 已裁決 3 筆怎麼折入」未答；零用量本週有名單（49 支），W39 算 streak。 |
| F9 W37 gaps 結案 0.5/7 → 本輪 probe.py 重建 | `retro-report.md:56`；`probe.py` 三機 JSON | 觀察（部分結案） | 機器層可量；仍缺 kept-out、hook 誤打回逐筆（X11）。 |
| F10 孤兒多重收養 | `register.ts:43-45,386-392,429-432`；quarantine 三 worker | **升級**（tmux-agent-tools issue） | 註解自認缺陷；三 session 重投為實例；Paul 訴求明確。 |
| F11 ack 不持久 | `register.ts:38,832`；6c218550 30+ 次 | 升級但先補觀測 | store 落點未找到，先加 ack 寫入日誌再修。 |
| F12 agy result pending | `live-agy-b676/result.json`、`mod-assign.log` | 觀察→本 retro agy 審閱若重現則升級 | 09-18 本 session 以 agy 跑審閱，可當第二個樣本。 |

**lessons 草稿**（proposed；只列不寫入 `lessons.md`）：

1. `scope: live-truth` — trigger：回報版本／狀態／數字時沿用上輪或記憶值。Layer 2 A 類 10 筆中 4 筆為「沿用」；本輪儀表板亦被要求「全換或標本週未量測」。
2. `scope: live-truth` — trigger：對 remote 歷史做結論。09-17 歷史重寫後 09-11..16 逐筆不可得；結論須標「現在存在」而非「何時做」。
3. `scope: waiting`（修 09-11 條）— 補「等人」：等待對象是使用者決定時，回合結尾為「待你決定」仍算停等；.62 本週 2 場。
4. `scope: judgment` — trigger：交付物在一輪內被指「過度設計」或「誤讀意圖」。Layer 2 M 類 51 筆中兩主題最多（f134135d「自言自語」、多場「不要濫開 PR」）。
5. `scope: gates` — trigger：Stop hook 打回「done 無證據」。屬 matcher 誤判（X9：collector 51/56 → 真值 ≈9%；本 session 2 次皆為字眼命中），不是行為缺陷；修 matcher 前不折入行為 lessons。

## 11. 新增檔案（09-17 補齊）

`backlog-reconciliation.md`（§1）、`loops-inventory.md`（§5–6）、`plan.md`、`opinions/agy.md`（第二模型審閱）、`../probe.py`、`../session-outliers.py`。

## 12. 第二模型審閱結果（agy，`opinions/agy.md`）

VERDICT: BLOCK。F1–F7 同意；F8 證據不足（「2 pending」無據 → 已修 §3 第 8 條）；F9 不同意（「probe.py 仍未重建」與 §8 矛盾 → 已修 §3 第 9 條）。三點遺漏採納為裁決附註：(1) Layer 2 A 類 10 筆未升格 findings（保留為 lessons 草稿，交 Paul）；(2) Y4 P0 未動應獨立成缺口（見 backlog-reconciliation 結案計數）；(3) inbox 積壓 34 筆＋.44 codex memories 0 新增（loops-inventory）。修正後未重跑審閱。
