# Weekly Retro Agenda

Version: 1.5.0（2026-08-08 §8 收尾更新入章、資料源 repo 點名；1.4.0 為使用者逐條裁決後轉正式版。
每次 retro 後若議程本身有缺陷，先改這份再改流程。）

範圍：以 agent 協作過程與循環為主軸——ohyeh/agent-scripts、ohyeh/tmux-agent-tools、
ohyeh/context-mode-local-insight 三 repo 是核心；產品 repo（如 healthgo）的 agent
使用也算範圍但次要輕量，只在 Layer 1 帶出強訊號時深挖。

觸發：使用者手動發起（喊「RETRO時間」），不排程、不自動觸發。

## 不變式

- 真相源是 GitHub remote（`gh api` / fetch 後的 log），本地 clone 只是 lead。
- 每個數字自帶產生方法（collector 的 `{value, method, tier}` 契約；手排指令要附原文）。
- 全量不抽樣（judgment-rubrics §5）。缺量測面就明寫「本週未量測」，不得沉默略過。
- 產物落在 `agent-scripts/.workflow/<YYYYMMDDHHMM>-weekly-retro/`，至少三檔：
  `plan.md`、`retro-report.md`、`next-week-backlog.md`。

## 議程（固定收集清單，依序）

### 1. 上週 backlog 對帳 — 做了沒、有效沒
逐項對 `next-week-backlog.md`：GitHub commit/issue 為證據，驗收條件逐字檢查。
「有效沒」與「做了沒」分開評：merge 了但行為沒變 = 做了、無效。

### 2–4 體驗分析漏斗 — 先全量粗篩，再帶訊號深挖

分析對象是**兩種體驗**，缺一不可：
- 使用者體驗：被糾正、重問、改口、放棄、自己動手接管的時刻。
- AGENT 體驗：工具失敗、權限被拒、重試迴圈、context 耗盡、規則互相打架、
  找不到該用的 skill/資訊——agent 工作時踩到的摩擦。

**Layer 1 全量粗篩（context-mode-local-insight）**
`node bin/cli.mjs agent-sessions --days 7`，覆蓋契約：
- 三個 CLI 都看：codex | claude | agy。
- 時間區段內**有無封存都算**（codex archived_sessions、claude 舊 project dir、
  agy 全部 *.db）；collector 覆蓋不到的 store = 量測缺口，明寫並回填 collector。
- 產出不只總量，還要**可疑名單**：done-claim 無證據、canary 缺失、
  GOAL/ACCEPT/REPORT 缺失、異常長/異常短、重試密集的 session 清單（附路徑）。
  collector 目前只出 rate 不出名單者，列為 collector backlog。
- 手排只補 collector 未覆蓋的面（tmux worker result.json、bol-stats），
  不得重算 collector 已覆蓋的數字。
- **token／成本面**：collector 加 token/成本欄（每 session 的 token 用量與估算成本，
  同 `{value, method, tier}` 契約）；模型對照（如 opus-low vs sonnet）必附成本數字，
  只有重試次數不算完成。欄位未落地前明寫「本週成本面未量測」。
- **使用者糾正事件粗篩**：collector 加輕量關鍵詞欄（「不對」「不是」「我說的是」
  「你改壞」等改口/糾正訊號），只出候選名單餵 Layer 2，不建大系統、不判定語意。

**Layer 2 定向深挖（/wayfinder、/unknowns-discovery 的精神）**
只挖 Layer 1 點名的 session，不掃全部原文——粗篩就是為了讓深挖有效率：
- 每筆可疑 session 讀原文回答：使用者當下經歷了什麼？agent 當下卡在什麼？
  是規則缺失、規則存在但沒執行、還是工具/環境問題？
- 深挖時先跑 unknowns-discovery：明列「我以為 vs 實際」的 map/territory 差距，
  避免帶著上週的假設讀本週的 session。
- 每筆結論落成一行：現象 → 根因類別 → 對策去向（lessons 提案 / backlog 項 /
  棄案），過不了這格式的深挖視為未完成。

**改動配對指標（原 §2，併入漏斗的對照組）**
上週每項行為性改動（規則 / hook / 工具 / skill），在 Layer 1 找一個前後指標；
找不到指標的改動明列「無法驗證有效性」——這本身是 finding。
（例：bol hook → pass 率曲線；judgment-rubrics §2 → done-claim 無證據率。）

### 5. 循環工具與記憶盤點 — 自家 repo 之外的回饋迴路，每台機器都有、都要看
這些檔案多為 per-machine，不會出現在 GitHub 對帳裡，漏看就斷循環：
- `~/.agents/rules/lessons.md`（2026-08-08 起 repo 同步，canonical 在
  `.agents/rules/lessons.md`）：本週新增 proposed 條目逐條列出；>90 天仍 proposed
  的 zombie 提醒使用者裁決（maintenance §3）。部署前先確認兩機無未合併的本地追加。
- `~/.agents/shared-memory-inbox/pending/`：未消化的 submissions 數量與積齡；
  積壓 = finding，消化走 shared-memory-intake（Codex 才能 promote）。
- `~/.codex/memories/`（MEMORY.md、rollout_summaries/）：本週新增的官方摘要，
  對照 retro findings 有無矛盾。
- hook stats（bol-prompt-stats.jsonl、context ledger）已由漏斗 Layer 1 收，勿重算。
- 機隊：每台在編機器的上述四項都要收；目前僅本機（100.64.190.44 指回本機，
  待 E1 釐清）。新機器入列時此節是 provisioning 檢查項。

### 6. 死碼盤點 — 用量為零的資產
recipe：`recipe-usage-stats.sh <name>`（consecutive_zero_weeks）。
skill / rules 的零用量統計尚無工具（W32 缺口）。連續零週 ≥ 4 → attic 掛牌提案；
掛牌後又有使用 → 撤牌（W32 的 design-consensus 教訓：單週快照會誤殺）。

### 6.5 臨時動議與使用者訴求
常設收件匣：`agent-scripts/.workflow/retro/inbox.md`（兩節：待討論議題＋本週隨手記；
`.workflow/` 下 run dir 之外的具名子目錄，比照 recipes/ 慣例，跨週存活不倒空目錄）。
平常隨時追加一行；隨手記收 collector 撈不到的人為觀察（糾正時刻、體驗峰谷、環境異動），
retro 時倒空 inbox：議題逐條討論、隨手記餵給 §2–4 當 Layer 2 線索。
再問一次「還有沒有臨時動議或訴求？」使用者隨時可插入，
不受固定清單限制：
- **臨時動議**：本週想討論但議程沒排的題目（新工具評估、方向調整、某次體驗特別糟/好）。
  當場列入本次 findings 一起裁決。
- **訴求**：對 agent 行為或流程的不滿與期望。訴求本身就是最高優先的體驗訊號——
  直接對應 §2–4 的「使用者體驗」面，不需要 collector 佐證即成案。
- 兩者都落入 backlog 或 lessons 提案，與其他 findings 同格式（證據/落點/驗收），
  不得只記「已討論」。

### 7. 裁決與產出
- findings 逐條給指揮者裁決（升級 / 觀察 / 棄案），不自動升級 hard block。
- 產出 W+1 backlog：每項有證據、落點 repo、可驗收條件。
- lessons.md 追加 proposed 條目（§2 門檻：使用者糾正一次即記；同摩擦兩次即記）。
- 需要使用者決策的事項集中列在報告最後，一次問完。

### 8. 收尾固定更新（使用者裁定 2026-08-08：每輪必做，不待點名）
裁決落地後、報告收尾前，用當輪活資料重生唯一狀態頁
「Claude Code 艦隊儀表板」（同 URL 原地更新；URL 以 Artifact list 現場查，
標題固定）。資料一律現場重測，禁止沿用上輪數字。資料源 repo 與各自量測層：

| Repo | 量測層 |
|---|---|
| ohyeh/agent-scripts | kernel（global/）、routed rules（.agents/rules/）、hooks（.agents/hooks/＋settings.json 掛載）、skills-lock.json、workflows（skills/using-workflows/workflows/ 套組 hash） |
| ohyeh/tmux-agent-tools | agent-tmux script 指紋、dispatch-gate plugin ×4 位置、smoke 狀態 |
| ohyeh/context-mode-local-insight | agent-sessions --fleet（雙機 session 量測，schema 版本） |
| 機器層（非 repo） | shared-memory-inbox pending、codex --version、部署層 .skill-lock.json hash |

舊有五頁（skill/workflow manifest、健檢報告、分群圖、spinout）已於
2026-08-08 併入並立指路碑，不再更新。
