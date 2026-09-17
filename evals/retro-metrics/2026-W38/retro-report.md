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

## 3. Findings（9）

1. **總量**：三機 Claude 127 場 / 846 turns / 2.35B 去重 / $1,553（W37 四機 94 場 / 1,009 turns / 2.62B / $1,761；mini 本週不計）。每輪 $1.84（W37 $1.75）。
2. **重心移動**：.62 turns 818→448、subagent 100→49；.44 turns 172→395、sessions 26→66（.44 主戰場 tmux-agent-tools 24 場 / yunlin 15 場）。
3. **.44 規則遵循下滑**：canary 55.6→27.9%、triplet 63→47.1%、correction 2→4。逐專案 canary：tmux-agent-tools 0/24、yunlin 2/15、agent-scripts 13/23。同 kernel 4.30.0 的 agent-scripts 場仍 57% → 下滑集中在 tmux worker 場（worker 不載 kernel）與 yunlin 專案，非 kernel 版本。
4. **cache break >100k**：三機 39（W37 55）；.62 29 筆中 10 筆 context 含 `/loop`（idle ≥60 分撞 1h TTL，W37 同型）；us-options-terrain 12 / agent-scripts 12。
5. **Codex**：三機 50M（W37 四機 48M）；.44 以 gpt-5.6-luna 為主、.62 以 gpt-6-astra；cached 比例 .44 93% / .62 88%。turns/sessions 口徑本週換新（`codex-tokens.py`），跨週僅供參考。
6. **其他 CLI**：agy .44 19 軌 / .62 7 軌；cursor .62 15 chats（5 無 meta、3 unreadable → messages 低估）；grok VM seats 16（W37 26）、orphan child 32→41 續增。
7. **艦隊狀態**：grok VM kernel 4.29.0 落後 repo 4.30.0；.62 與 .47 皆無 agent-scripts clone（W37「單機缺口」續存，換了機器）。
8. **治理**：lessons.md 46 proposed / 3 adopted / 2 pending（W37 42/42 proposed）；repo 11 skills 有 3 支零用量（ask-nova、defect-first-review、writing-artifacts）；retro inbox 兩節皆空。
9. **W37 gaps 結案 0.5/7**：`codex-tokens.py` 入 repo；機器層 `probe.py` 仍未重建。

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

## 7. 相關 artifact（09-17 已各補 W38 段）

- 艦隊儀表板 https://claude.ai/artifact/EZdbYiSrTZp8s3sQw6xc4J（v25：status 列、「W38 更新」section、三機 × 五 CLI 與機器層兩表、相關報告列）
- Skill 扇出健檢 https://claude.ai/artifact/5QvEAn6hV3t3KHJTsUoGFK（v8：status 列、主要發現 W38 條、coverage caption）
- 三模型 Kernel 甜蜜點 https://claude.ai/artifact/RP8c6qTTEAT2azKcQJu6fo（v9：status 列、§08 Layer 2 對照行為軸）
- Skill Routing 現況 https://claude.ai/artifact/Ki6dFPe6zZcjR2he8oyURE（v8：status 列、§06 hook 命中）
- 856M 重讀帳單 https://claude.ai/artifact/V9sVLjfpdYxkjtprdRT21x（v11：status 列、W38 續追表）

## 8. 機器層補量（09-17 追加；部分關閉 G3）

`~/.local/share/agent-hooks/*.jsonl`，7d（timestamp 2026-09-10..17）：

| | .44 | .62 | grok VM |
|---|---|---|---|
| claim-evidence rows / blocked | 110 / 48 | 133 / 59 | 無檔 |
| bol-prompt rows | 25 | 40 | 無檔 |
| deny-replay rows / 短路 | 4,212 / 0 | 9,591 / 0 | 0 / 0 |
| skill-router-nudge 命中 | 3（consensus-gate） | 32（resolving-merge-conflicts 15、consensus-gate 5、review-renovate 3、update-deps 2、triage 2、skill-creator 1） | 無檔 |
| 命中 owner 同期 Skill() | — | 0 | — |

仍缺：context-mode kept-out、deploy-log sha、shared-memory pending、Stop hook 誤打回逐筆判別（X9/X11）。

Artifact: https://claude.ai/artifact/EWFiyZFf5Di55goYXJVBup
