# P2-kirocrew —— pre-read REPORT（原始版本，未編輯）

來源：本 session subagent transcript `agent-aP2-kirocrew-81d4f27485f1d9f3.jsonl`（48 records）
派工：Agent tool，opus + effort low，2026-08-07 議題裁決輪 plan.md P 系列
本檔為 worker 最終回報全文逐字保留；經主 session 摘要與裁決的版本見 `../retro-report.md` §4。

---

## 1. 是什麼

KiroCrew（`kirodotdev/KiroCrew`，Python）不是 agent 規則庫，而是一個**常駐 Gateway 產品**：單一 asyncio 進程，把 dashboard / Slack / Telegram / CLI 等 surface 多工到 `kiro-cli` 的 ACP（JSON-RPC over stdio）runtime 上。它補上 runtime 刻意不管的層：session 持久化、六層記憶、skills、hooks、cron、subagent 派生、審批仲裁、metrics。定位是「跨 session 不中斷、可無人值守」的個人工作台，跑在自己硬體上。與我們**不是同一類**：我們是 prompt/rules 治理層，他們是 process/state 基礎設施層。

## 2. 與我們何處重疊（五維）

| 維度 | 判定 |
|---|---|
| **(a) 編組模型** | **我們的更好。** 他們的分派只是「選哪個 agent config」：`spawn_run(tasks=[...], agents=["code-reviewer","test-analyzer"])`，agent 定義在 `~/.kiro/agents/*.json`（model + system prompt + tools + MCP）；解析順序見 `docs/architecture/overview.md`（CLI→`default_agent`、cron→per-job `agent_id`、subagent→spawn 的 `agent` 否則繼承父 session）。**沒有 role→model tier 對照、沒有 effort 階梯、沒有 reviewer 獨立性規則。** 我們 `.agents/rules/model-dispatch.md` §1/§4/§5/§6 在這層完勝。反過來他們有一個我們沒有的**硬機制**：`no nesting`（subagent 不能再 spawn）由 runtime 強制；我們同語意的規則只是 `delegation-templates/SKILL.md` 裡的一行 prompt 文字。 |
| **(b) 派工契約** | **他們有更好的東西——本次唯一值得偷的核心。** 兩層要分開看：runtime 層 `spawn_run` 的 brief 是**自由文字**（"review the latest CR for MyPackage"），遠差於我們的 GOAL/ACCEPTANCE/REPORT。但**專案層 `.kiro/specs/<slug>/{requirements,design,tasks}.md` 三件套**比我們的 `.workflow/` run dir 嚴格：`requirements.md` 有 **Glossary**（把 `Config_Loader`、`Schema_Registry` 定為專有名詞）＋ **EARS 句式 Acceptance Criteria**（`THE X SHALL…` / `WHEN … THE … SHALL` / `WHERE … SHALL`）＋編號 `Requirement N`；`tasks.md` 每個子任務尾行掛 **`_Requirements: 1.1, 1.2, 1.3_` 反向追溯**，並穿插顯式 **`Checkpoint` 任務**（"2. Checkpoint — verify dataclass changes / all tests pass (`black && isort && flake8 && mypy && pytest`), ask the user if questions arise"）。我們的 `plan.md` 沒有需求編號、沒有 task→requirement 追溯、驗證點靠 judgment-rubrics 自律而非計畫裡的節點。 |
| **(c) 驗收／證據** | **我們的明顯更好。** 他們的 done 只有 dashboard 步驟圖示 ✅🔄❌⏳（`docs/task-runner.md`）；subagent 完成靠 `[Subagent completion event]` 把 transcript 截斷回注（`completion_keep` head/tail/both、`completion_keep_chars` 3000、全文留 `~/.kiro/crew/subagents/<id>/result.txt`，TTL 1h）。**無 verdict schema、無 PASS/BLOCK、無結構化 result.json、無「證據須本 session 執行」要求。** 我們 `judgment-rubrics.md` §2/§5 完勝。**但有一個工程優點值得抄**：截斷時回「短 preview + transcript 檔路徑」而非裸 blob，父 agent 用 `spawn_status(agent_id, offset=, limit=, grep=)` 按需分頁，回應前綴 `showing lines X-Y of N | more available`。這正是我們 footer「30 行上限 + 長內容寫 artifact 回路徑」的**機制化版本**——我們靠 prompt 請 worker 自律，他們由 runtime 強制。 |
| **(d) 量測** | **各有一半，他們有一個我們沒有的想法。** 他們用 OpenTelemetry SDK、**預設 OFF**（`telemetry.enabled: false` 時 call site 皆 no-op），instrument 如 `kirocrew.turn.duration`（histogram，labels `outcome`/`session_source`）、`kirocrew.mcp.backend.acquire.duration`、`kirocrew.skill.lazy_load.count`；另有**永遠開啟且不出網**的 token ledger `<data home>/usage/tokens/YYYY-MM-DD.jsonl`，每筆帶 `surface`（`dashboard`/`cron`/`subagent`/`task_runner`/`workflow`…）、`agent`、`context_used`、`context_window`、`credits`。誠實度我們更好：`context-mode-local-insight` 有 `bin/metric-contract.mjs` 的 `audited`/`derived`/`withheld` 三層信任標籤與 provenance banner（源於一次雙模型審計，把「750% blocker resolution rate」判為不誠實而下架）；他們文件也有類似自覺（明註 turn duration 是 wall-clock、會把人類等審批的時間算進去，p90 高可能是審批慢不是模型慢），但**沒有制度化 trust tier**。他們真正領先的是**把量測回饋進調度**：`dynamic-subagent-sizing` 在 reaper loop 取樣每個 subagent 的 process-tree RSS/CPU **high-water**，退出時寫 `cost_samples.jsonl`，下次啟動取**每 agent name 最近 N 筆的 p90**當除數，算出併發上限 `clamp(min(mem_term, cpu_term), 3, 32)`。我們的量測只用來**報告**，從不回頭改派工決策。 |
| **(e) 跨 runtime** | **我們的更好，他們幾乎沒有。** KiroCrew 綁死 `kiro-cli` ACP（`kiro-cli acp --agent <name>`），provider 欄位見過 `acp`/`claude_code`/`bedrock`，但架構文件明說 runtime 恆為 kiro-cli；他們的「跨」是**跨 surface**（Slack/Discord/Telegram/Teams/Webex/WeCom/WeChat）不是跨 agent CLI。且明文「Foreign-agent hooks are never imported」——hook script/command/matcher 屬 unsupported items，scan/apply 只報告存在、不搬移。我們 `using-workflows/SKILL.md` 的 `NATIVE`/`ADAPTED: claude-workflow-runner`/`UNAVAILABLE-NATIVE` 三態矩陣、depth-2 nesting 上限、`args.cli` 依受審作者反解的 fail-closed 規則，這維度無可偷之物。 |

## 3. 建議採用層級：**只偷概念**（三項，其餘棄）

整套不可能——那是要裝 wheel、開 5476 port、綁 kiro-cli 的產品，等於換掉我們整個 runtime 假設。部分採用也不划算：他們在 (a)(c)(e) 全面落後。帶進 retro 的只有三個概念：

1. **`tasks.md` 的 `_Requirements: N.N_` 反向追溯 ＋ 顯式 `Checkpoint` 任務**（價值最高、成本最低）。加進 `.workflow/<ts>-<slug>/plan.md` 慣例：需求編號化、每個 task 掛回編號、驗證點成為**計畫裡的節點**而非只寫在 judgment-rubrics 的自律。直接治我們「plan 與 acceptance 脫鉤、驗證靠 agent 記得去讀 §2」的老毛病。EARS 句式可選採（對機械檢查有幫助但讓 plan 變冗長）——建議只強制編號＋追溯，句式不強制。
2. **回報截斷機制化**：completion event 回「preview + result path」，配 `offset/limit/grep` 分頁。我們的 30 行上限目前是 prompt 請求；能否在 tmux wrapper 的 result 讀取層強制成同樣形狀，是個具體工程題。
3. **量測回饋進調度**：p90 學習成本 → 併發上限。最小可行版本是用歷史資料反推「某類任務實際 retry 率」去調 model-dispatch 起始 tier，而不是永遠靠靜態表。

明確**棄**：他們的 agent config／spawn 模型、驗收機制、跨 runtime 做法。

## 4. 證據

**我們這側（皆已實讀）**
- `/Users/paul.yeh/git/agent-scripts/.agents/rules/model-dispatch.md` — §1 live model contract、§3 assignment/report contract、§4 role-first 表、§5 effort/retry、§6 reviewer independence
- `/Users/paul.yeh/git/agent-scripts/.agents/rules/judgment-rubrics.md` — §1 escalation、§2 completion checklist（result.json body vs exit code）、§5 quality floor
- `/Users/paul.yeh/git/agent-scripts/skills/delegation-templates/SKILL.md` — 5 模板、common footer、dispatch shape A/B
- `/Users/paul.yeh/git/agent-scripts/skills/using-workflows/SKILL.md` — Cross-runtime execution、12-recipe 矩陣、write-back duty
- `/Users/paul.yeh/git/context-mode-local-insight/README.md` — `analytics` 區塊、`bin/metric-contract.mjs` trust tier、2026-07-21 雙模型審計
- `/Users/paul.yeh/.claude/CLAUDE.md` v4.16.0 — 路由索引、hard boundaries

**他們那側（皆實際 fetch）**
- `https://raw.githubusercontent.com/kirodotdev/KiroCrew/main/README.md`
- `https://raw.githubusercontent.com/kirodotdev/KiroCrew/main/docs/architecture/overview.md`
- `https://raw.githubusercontent.com/kirodotdev/KiroCrew/main/docs/system-specs/modules/memory-skills-hooks.md`
- `https://raw.githubusercontent.com/kirodotdev/KiroCrew/main/docs/system-specs/modules/metrics.md`
- `https://raw.githubusercontent.com/kirodotdev/KiroCrew/main/src/kiro_crew/docs/subagents.md`
- `https://raw.githubusercontent.com/kirodotdev/KiroCrew/main/src/kiro_crew/docs/task-runner.md`
- `https://raw.githubusercontent.com/kirodotdev/KiroCrew/main/src/kiro_crew/docs/dynamic-subagent-sizing.md`
- `https://raw.githubusercontent.com/kirodotdev/KiroCrew/main/src/kiro_crew/docs/agents.md`、`.../skills/README.md`、`.../src/kiro_crew/docs/index.md`
- `https://raw.githubusercontent.com/kirodotdev/KiroCrew/main/.kiro/specs/config-schema/requirements.md`、`.../tasks.md`

`UNCONFIRMED`：`.kiro/steering/` 查詢無回傳內容，無法確認 repo 內是否有 steering 檔案；README 宣稱的「self-learning lessons／self-evolving skills」我只讀到 `memory-skills-hooks.md` 的 auto-skill 路徑，未逐一驗證 lessons 寫入時機。`skills/subagent/SKILL.md` 在 `skills/README.md` 中被列出但該路徑 HTTP 404 — 故我對「subagent brief 的 skill 層指引」無第一手證據；(b) 維度中「runtime brief 為自由文字」的判斷依據是 `subagents.md` 的 `spawn_run` 參數說明（`task`/`tasks`/`agent`/`agents`，無任何 acceptance 欄位）。

## 5. 自評

重試／自我修正 **3 次**：(1) 用 GitHub git-tree API 拉全樹是誤判——421 個 section 全是 blob metadata，汙染三個維度的搜尋結果並浪費一次 search 額度；改為直接 fetch 具名 doc 才有用。(2) `skills/subagent/SKILL.md` 404，改以 `subagents.md` 工具簽章作 (b) 維度替代證據並標明。(3) search 的 snippet window 對「短文件的完整契約」不足——回報截斷語意與 spec 格式都是切換成整檔讀取後才看清，前兩次片段會讓我誤判他們有更多驗收機制。一句話原因：我一開始把「取得完整檔案清單」當成理解架構的前置步驟，但決定答案的只有少數幾份具名 doc，樹狀清單零資訊量。

✈
