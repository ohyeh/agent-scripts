# W39 三機循環盤點（retro-agenda §5＋§6）

量測 2026-09-24，全程唯讀。機器鍵：`local-mbp14`（本機）、`remote-44`、`grok-bot-vm`。
窗口：2026-09-17 → 09-24（7d）。盤點腳本放 session scratchpad（`inv.sh`、`skillcalls.py`），
每台都跑同一支腳本，遠端經 SSH stdin 餵入。JSON sidecar：`loops-inventory.json`。

## lessons.md

| | local-mbp14 | remote-44 | grok-bot-vm | repo canonical |
|---|---|---|---|---|
| sha256（前 8） | c704e8f3 | c704e8f3 | c704e8f3 | c704e8f3 |
| 條數 | 54 | 54 | 54 | 54 |
| Status | 51 proposed / 3 adopted | 同 | 同 | 同 |
| 09-17 起新增 | 5 | 5 | 5 | 5 |
| zombie（proposed >90 天，header < 06-26） | 0 | 0 | 0 | 0 |

- **分歧判定：無分歧**。四份 sha256 完全相同（`c704e8f3cbf0…`）。W38 的分歧
  （grok-bot-vm 缺 09-15 `scope: release`，停在 2939e283）已消失：該機本週已追平。
- 本週新增 5 條，全部 `proposed`，全部 09-18：
  1. `live-truth`：回報版本/狀態/計數沿用上輪 retro、handoff、記憶的值
  2. `live-truth`：對 GitHub remote 歷史下結論，而 remote 有 squash／force-push 痕跡
  3. `waiting`：回合結尾是「待你決定」「要我…嗎」，而等待對象是使用者本人
  4. `judgment`：同場被指出「自言自語／沒意義輸出」或「濫開 PR／過度設計」
  5. `gates`：Stop hook 以「done 字眼無證據 token」打回
- W38→W39：49→54 條、proposed 46→51、adopted 3→3。本週沒有 proposed→adopted 的裁決。

## shared-memory inbox（`~/.agents/shared-memory-inbox/pending/`）

| | local-mbp14 | remote-44 | grok-bot-vm |
|---|---|---|---|
| pending 數（W38） | **21**（16） | 18（18） | store absent（absent） |
| 09-17 起新增 | 5 | 1 | — |
| 最舊（檔名日期） | 26 天（2026-08-29 grok-bot-app-automation） | 34 天（2026-08-21 claude-artifact-iframe-read-method） | — |

- local-mbp14 淨增 5、消化 0：本週 5 筆新投遞（09-17 W38 handoff、09-21／09-23／09-24 ×2 duo 系列）全部還在。
- remote-44：數量不變，但最舊一筆從 W38 的 `retro-w34-dual-cli-token-measurement` 換成
  `claude-artifact-iframe-read-method`（同為 08-21）→ 本週消化 1 筆、新增 1 筆（09-17 idb-stale-companion）。
- 積壓仍是 finding：兩機合計 39 筆，最舊 34 天；promote 只能由 Codex 走 shared-memory-intake。
- grok-bot-vm 仍無 store（同 W38）。

## Codex memories（`~/.codex/memories/`）

| | local-mbp14 | remote-44 | grok-bot-vm |
|---|---|---|---|
| rollout_summaries 09-17 起（依檔名日期） | 8 | 0 | absent |
| MEMORY.md 行數（W38） | 1,901（1,923） | 815（815） | — |
| MEMORY.md mtime | 2026-09-22 | 2026-09-15 | — |

- local-mbp14：`find -newermt` 顯示 498 檔被動過，但依檔名日期，本週新 summary 只有 8 筆
  （09-20 ×4、09-21、09-22 ×3）。mtime 大量更新多半是整批改寫，不是新內容（原因 UNCONFIRMED）。
  8 筆全屬 project-b／duo 摺疊機版面、screener 分析等專案工作；MEMORY.md 淨減 22 行（有合併或修剪）。
- remote-44：rollout_summaries 連續第 2 週 0 筆，MEMORY.md 自 09-15 未動。W38 記下的
  「memories 擷取在該機沒在跑」本週仍在（根因仍未查，UNCONFIRMED）。另一個訊號：該機的
  context-mode DB 最後寫入 09-18，09-19 起 `~/.claude/projects` 只有 1 個 transcript 被動過 → 本週該機幾乎沒有使用量。
- **與 W38 findings 對照**：8 筆新 summary 用 `stop hook`／`canary`／`lessons`／`grok` grep 皆 0 hit；
  `kernel|AGENTS.md` 1 hit 是讀專案 AGENTS.md，非治理面。**無矛盾、無新交集。**

## 死碼／零用量（§6）

### recipes

跑法：`scripts/recipe-usage-stats.sh <name> .workflow <scratchpad>/recipe-stats.json`，
每支 `skills/using-workflows/workflows/*.workflow.js` 各跑一次。stats 檔指向 scratchpad 副本，
所以 repo 內 `evals/recipe-usage-stats.json` 沒被改動。

- 13 支全部 `consecutive_zero_weeks=0`（uses 3–19）。
- **腳本缺陷（新）**：`uses` 是 `grep -rl` 掃整棵 `.workflow/`，沒有按週過濾，是累計值。只要歷史上
  出現過一次，這支 recipe 就永遠不會歸零。用 `find .workflow -newermt 2026-09-17` 限縮到本週窗口，
  13 支的命中數**都是 0**。所以本週 recipe 零用量的真實值 = 13/13（只限本 repo 的 `.workflow/`）。
- repo 內 committed 的 `evals/recipe-usage-stats.json` 仍停在 `last_week: 2026-W36`，而且沒有
  `pr-review-triage-resolve` 這個鍵 → W38 的更新沒進 git（同 W38 所記：交給 Paul）。streak 從 W36 起就斷了。
- 限制沿用 W38：只掃本 repo 的 `.workflow/`，其他專案的 run dir 不計。

### skills

公式：**零用量 = 已安裝 − (called ∪ mentioned)**，兩者都為 0 才算零用量。

- 已安裝：`skills-lock.json` `.skills` 的 64 個鍵（working tree 與 HEAD 名單相同，只有欄位內容不同）。
- called：`ctx-usage-report.py` 的「Explicit user-invoked skills」（三機都是 0）∪ Claude transcript
  `Skill()` tool_use（時間戳 ≥ 2026-09-17T12:16Z；只有 local-mbp14 有值：using-grok-bot-app 6、
  research 6、delegation-templates 5、using-tmux-agent-tools 4 …）。
- mentioned：`ctx-usage-report.py` 的「Captured skill mentions」（local-mbp14：tmux-agent-tools 82、
  unknowns-discovery 62、using-workflows 33、research 20 …；remote-44、grok-bot-vm 皆 0）。
- 結果：**20 支有用量、44 支零用量**（名單與逐支 streak 見 JSON `zero_usage_skills`）。

| streak（連續零週） | 支數 | 名稱 |
|---|---|---|
| 2（W38＋W39） | 41 | W38 名單中本週仍為零者 |
| 1（本週新進） | 3 | agent-browser、diagnosing-bugs、diagram-design |
| ≥ 4 | **0** | — |

- **attic 提案：無**。W38 是第一份名單基準（W37 沒有名單），最高只到 2；最早 W41 才可能達 4。
- **撤牌：無**。目前沒有任何 skill 掛 attic 牌（`skills/*/SKILL.md` grep `attic` 0 hit）。
  8 支從 W38 零名單中移出：apple-design、defect-first-review、grilling、html、research、stop-slop、
  tmux-agent-tools、verification-before-completion。
- 注意事項：
  - W38 的方法只算 Claude analyzer；W39 加上 ctx 報告的 mentions 與 transcript `Skill()`。所以
    streak 2 是拿兩種不同方法相比，下週起方法才一致。
  - `pierre-guard` 在 lock 中，但不在 `~/.agents/skills/`，所以報告的 allowlist 抓不到它 → 結構性永遠為零，
    不能當成用量證據。
  - remote-44 與 grok-bot-vm 本週 ctx 資料幾乎是空的（0 sessions／1 session），他們的零是「沒資料」，
    不是「有用但沒用到 skill」。

### Method（本輪實際執行的指令）

```
python3 scripts/ctx-usage-report.py --days 7                 # local-mbp14: 112 db, 98 sessions, 13736 events; exit 0
ssh <remote-44>   'python3 - --days 7' < scripts/ctx-usage-report.py   # 101 db, 0 sessions
ssh <grok-bot-vm> 'python3 - --days 7' < scripts/ctx-usage-report.py   # 11 db, 1 session
scripts/recipe-usage-stats.sh <name> .workflow <scratchpad>/recipe-stats.json   # ×13
python3 <scratchpad>/skillcalls.py                            # 三機 Skill() tool_use 計數
sh <scratchpad>/inv.sh                                        # 三機 §5 盤點
```

- 本機第一次跑 `ctx-usage-report.py` 失敗：`sqlite3.OperationalError: unable to open database file`
  （`mode=ro` 開 WAL DB 需要建立 `-shm`，被 sandbox 擋住）；關掉 sandbox 重跑成功（指令唯讀）。
  同時腳本只在 connect 時 catch，`execute` 時的錯誤沒被 catch → 一個 DB 打不開就整份報告崩潰。

## retro inbox（`.workflow/retro/inbox.md`，未改動）

待討論議題 3 條，本週隨手記 0 條：

1. 09-18 tmux-agent 孤兒收養：owner 心跳停 90s 後，同 cwd 每個 collector 都收養並各自重投（一台 peer 機上 3 個 worker 被 3 個 session 重投）；訴求單一 owner＋非派工 session 預設不收＋標明 adopted from。
2. 09-18 tmux-agent ack 不持久：`storeSet('tmux-agent.reported')` 沒生效，同批結果每 turn 重投（30+ 次）；`stop` 不寫 ack；根因 UNCONFIRMED。
3. 09-18 agy profile：worker 在 pane 內完成並輸出 ✈，但不寫 result.json，assign 90s 看不到活動 → 誤判 launch-failed。
