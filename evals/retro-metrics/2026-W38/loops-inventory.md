# W38 三機循環盤點（retro-agenda §5）

量測：`scratchpad/w38/inventory.sh`（唯讀）＋ `probe.py` 2026-09-17T16:57Z；.44＝本機、.62＝MacBookPro、.47＝grok VM（box）。mac-mini .41 本週跳過（Paul 指定）。

## lessons.md

| | .44 | .62 | .47 |
|---|---|---|---|
| sha256（前 8） | 9f787557 | 9f787557 | **2939e283** |
| 條數 | 49 | 49 | 48 |
| 09-10 起新增 | 7 | 7 | 6 |
| zombie（proposed >90 天） | 0 | 0 | 0 |
| Status 分佈（.44） | 46 proposed / 3 adopted | 同 | — |

- 三機 09-11 六條相同（authorization、waiting、judgment、git、completion、gates；皆 proposed）。
- **分歧**：.47 缺 09-15 `scope: release`（scrub.sh `rev-list --all` 使 push gate 不可滿足）。.47 kernel 亦停在 4.29.0（deploy-log 最後 09-11T05:49Z，method clone-tracked）。同一根因：.47 自 09-11 未再 deploy（F7）。
- W37 指認的 L-b（回報節奏）本週以 09-11 waiting 條落地；配對指標見 backlog-reconciliation Y1。

## shared-memory inbox（pending）

| | .44 | .62 | .47 |
|---|---|---|---|
| pending 數 | 18 | 16 | store absent |
| 最舊 | 27 天（2026-08-21 retro-w34-dual-cli-token-measurement） | 20 天（08-29） | — |

- W37 觀察項 G15「pending 走 intake」：本週兩機 pending 數未降（W37 儀表板未記錄基準數，趨勢 UNCONFIRMED）；最舊一筆是 W34 retro 自己投的。
- .47 無 store：grok VM 上無 `~/.agents/shared-memory-inbox/`，外部投遞在該機不可能發生。

## Codex memories（`~/.codex/memories/`）

| | .44 | .62 | .47 |
|---|---|---|---|
| rollout_summaries 09-10 起 | 0 | 6 | absent |
| MEMORY.md 行數 | 815 | 1,923 | — |

.62 六筆新 summary：09-12 ×4（travel-board review→grok handoff、日本行程看板對抗式審查 ×2、terrain UI/UX 重構）、09-13 adversarial pattern-audit BLOCK、09-15 wrapper 小任務。

**與本週 findings 的交集／矛盾**：

- 交集 1：.62 MEMORY.md:14,23 記「1 個 Stop claim-evidence gate、6 個 PreToolUse gate」＝ F 治理面；無矛盾。
- 交集 2：.62 MEMORY.md:232,238 記 4.29→4.30 部署流程「synchronized global/AGENTS.md、showed commit」＝ probe `identical: true`；無矛盾。
- 交集 3：.44 MEMORY.md:47 記「stop hook 說缺證據 → 不要升 done，找出漏的檢查」＝ Z1/Z3（Stop hook 誤打回）；codex 側學到的是「順從 gate」，Layer 2 學到的是「gate 有誤判」，兩者方向相反但不矛盾（都成立）。
- 無交集：canary 下滑、cache break、grok orphan、零用量 skills 在兩機 MEMORY.md 皆 0 hit。
- .44 codex 09-10 起 0 筆 summary，但 `codex-tokens.py` 量到 .44 codex 17 sessions／34M tokens → memories 擷取在 .44 沒在跑（原因未查，UNCONFIRMED）。

## 死碼／零用量（§6）

- recipes（`evals/recipe-usage-stats.json`）：13 支，本週 12 支 uses>0、`pr-review-triage-resolve` consecutive_zero_weeks=1。缺陷：(a) W37 未記錄（last_week 直接 W36→W38，streak 斷一週）；(b) `scripts/recipe-usage-stats.sh` 只掃當前 repo `.workflow/`，跨專案 run dir 不計；(c) 檔案在本 session 開始前已被改動（git status M），是誰跑的未查 → 本輪不 commit 該檔，交 Paul。
- skills（lock 64 支）：三機 Claude analyzer 命中 15 支，**49 支零用量**（名單在 `2026-W38.json` `zero_usage_skills`）。範圍限制：只算 Claude 側 Skill() 呼叫；codex 側 ctx mentions 中 11 支在此名單（tmux-agent-tools 215、brainstorming 43、impeccable 41…），mentions≠呼叫，故非「全艦隊零用量」。分母：本表 lock 64，report F8 的 3 支用 repo 11 支，兩個分母並存。W37 觀察 G13「下週 ≥4 掛 attic」：W37 無名單基準，本週起算，W39 才能算連續週；本週不提 attic 名單。
- ctx-usage-report：codex 側 10 sessions／1,219 events（ctx_execute 108、batch 11、search 8、fetch 2）；claude 側 dynamic recipes 只 plan-pipeline 1。兩側「Dynamic workflow recipes 0 none」＝ recipes 不經 ctx。
