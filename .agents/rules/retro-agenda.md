# Weekly Retro Agenda

範圍：agent 協作過程與循環。核心是 agent-scripts、tmux-agent-tools、
context-mode-local-insight 三 repo。產品 repo 算次要，只在 Layer 1
出現強訊號時深挖。

觸發：使用者手動喊「RETRO時間」。不排程、不自動觸發。

每次 retro 後若議程本身有缺陷，先改這份再改流程。

## 不變式

- 真相源是 GitHub remote（`gh api`、fetch 後的 log）；本地 clone 只是 lead。
- 每個數字自帶產生方法：collector 走 `{value, method, tier}` 契約，手排指令
  附原文。
- 全量不抽樣（judgment-rubrics §5）。缺量測面寫「本週未量測」，不得沉默略過。
- 腳本跑完不等於數字正確：Layer 1 每個值用行內時間戳切窗口，不用檔案 mtime。
- 每個 0 值附正例對照，即同一查法在更寬窗口得到 >0；重跑差 0 只證明可重現。
- 上兩項缺一即標 UNCONFIRMED，不得進成本表。
- 產物落在 `agent-scripts/evals/retro-metrics/<ISO-week>/`。
- `.gitignore` 寫 `evals/retro-metrics/*`；`*.py` 例外進版控，其餘只存在執行機。
- 產物至少三檔：`plan.md`、`retro-report.md`、`next-week-backlog.md`。
- 窗口在 `plan.md` 開跑前寫定，終點必須是過去的時間；下一輪從此終點接續。
- 公開 repo 衛生：產物只寫機器鍵。
- `scripts/scrub.sh` 只掃 git index，掃不到 gitignored 的 run dir。
- 發布或送審前，同一組 pattern 直接套在同批全部實體檔，含 run dir 與相鄰的
  `evals/retro-metrics/<ISO-week>.json`。
- 另掃編碼 home 路徑（`-Users-<name>-`、`-home-<name>-`，project key 形式）與
  ssh 主機別名，附正例對照與命中數。
- 列檔用 `find <run dir> -type f`；`for f in dir/*` 會跳過子目錄。

## 議程（固定收集清單，依序）

### 1. 上週 backlog 對帳 — 做了沒、有效沒
- 開跑前先讀「[agent-scripts] 艦隊與 Retro」，上一輪紀錄在「歷週紀錄」分頁；
  URL 以 Artifact list 現場查。
- 把上週 TL;DR「共識後預計這樣做」與「需要你決定」逐條列成本輪起點，再對照
  本版議程開始。
- 派盤點 worker 時，brief 附上儀表板 backlog dataset 的上週列快照。
- 逐項對 `next-week-backlog.md`（上一輪由 §7 產出）：GitHub commit/issue 為證據，
  驗收條件逐字檢查。
- 分開評兩件事：merge 了但行為沒變，算做了、不算有效。

### 2–4 體驗分析漏斗 — 先全量粗篩，再帶訊號深挖

分析兩種體驗，缺一不可：
- 使用者體驗：被糾正、重問、改口、放棄、自己接管的時刻。
- AGENT 體驗：工具失敗、權限被拒、重試迴圈、context 耗盡、規則打架、
  找不到該用的 skill 或資訊。

**Layer 1 全量粗篩（context-mode-local-insight）**

- 指令：`node bin/cli.mjs agent-sessions --days 7`。
- 四個 CLI 都看：codex | claude | agy | cursor。
- cursor store 是 `~/.cursor/chats/<bucket>/<uuid>/{meta.json,store.db}`。
- 窗口取 `meta.json` 的 `updatedAtMs`；缺 meta 退回 `store.db` mtime 並計入
  `withoutMeta`。
- cursor 無 token 記帳，只出 chat 數與訊息數，不得與 codex/claude 對齊；
  方案用量另讀 `~/.cursor/statusline-usage-cache.json`。
- 窗口內有無封存都算：codex archived_sessions、claude 舊 project dir、
  agy 全部 `*.db`。
- claude 封存含 `projects_archived/**`（`.jsonl` 與 `.jsonl.gz`）與
  `transcripts/ses_*.jsonl`。
- 讀不到的 store 是量測缺口：明寫，並回填 collector。
- 每台 coverage 檔附逐 store 表：路徑樣式｜窗口內 session 數｜其中封存｜
  token 或訊息數。
- grok-bot-vm 另有 Grok Bot agents：帶時間的資料在 `search-index.db` 的
  `messages`（`?mode=ro`）。
- Grok Bot 的 per-agent `store.db` 與 `agent-transcripts/*.jsonl` 切不出整週
  窗口，後者無逐筆時間戳；無 sender 欄，要寫明真人／bot 判準。
- 產出除了總量，還要可疑名單：done-claim 無證據、canary 缺失、
  GOAL/ACCEPT/REPORT 缺失、異常長或異常短、重試密集，每筆附路徑。
- collector 只出 rate 不出名單的面，列為 collector backlog。
- 手排只補 collector 未覆蓋的面（tmux worker result.json、bol-stats），
  不重算已覆蓋的數字。
- 補缺面：`evals/retro-metrics/layer1-gaps.py SINCE UNTIL`，UTC ISO，出
  trigger 分類、可疑名單、store coverage。
- 另一支 `evals/retro-metrics/grok-bot-classes.py SINCE_MS UNTIL_MS`，只在有
  `search-index.db` 的 host 跑。
- 兩支用位置參數，不是 `--since/--until`；報告寫明執行 host、實際窗口與
  未量測面。token 總量仍以 usage-dedupe 為準。
- token／成本面每輪必收。Claude 側跑 `session-report@claude-plugins-official`
  的 analyzer：`node <skill-dir>/analyze-sessions.mjs --json --since 7d`。
- 取 `overall` 的 token 四分類、`cache_breaks_over_100k`、
  `subagent.calls/total_tokens`、`by_subagent_type`、`by_skill`、
  `top_prompts`。
- 已知瑕疵：`by_project` 的 token 歸戶為 0；`uncached` 未依 message.id 去重，
  不得引用。
- 正式量尺是 `evals/retro-metrics/usage-dedupe.py`（midkey；驗收＝同 input
  重跑差 0）。
- 該量測只讀 `~/.claude/projects`，不含 `projects_archived/*.jsonl.gz`、
  `transcripts/ses_*.jsonl`、codex、agy；缺的面自行補，不得當全量。
- Codex 側從 session jsonl 的 `payload.info.total_token_usage` 取
  `input/cached_input/cache_write_input/output/reasoning_output/total`。
- 記 `model_context_window` 分布；同機混用多個 window ＝ 成本模型混算，
  是 finding。
- 兩側都出「派工場 vs 非派工場」與「每輪 token」對照；模型對照必附成本數字，
  只有重試次數不算完成。
- 定額訊號一：cache break >100k 的逐筆清單，附破快取前的最後一則使用者訊息。
- 定額訊號二：turns=0 但 total>1M 的 session。
- 任一面缺料寫「本週未量測」，同 `{value, method, tier}` 契約。
- 逐週數字落 `evals/retro-metrics/<ISO-week>.json`，不版控，只存在執行機；
  同目錄的腳本才版控。
- USD 以 `evals/retro-metrics/cost.py` 換算，註明是 API 費率當量，非實付帳單。
- 分項與忙碌度每輪必收：三支 collector 吃同一個 `--since/--until`，各附
  `--self-test`。
- `evals/retro-metrics/codeburn-breakdown.py`：每台 `codeburn export`，出活動／
  模型／CLI／專案 USD 與工具、MCP、shell 次數；單價和 cost.py 的 Opus 5.5
  當量是兩種口徑。
- `codex-walk.py`：每台 Codex ctx 走路率，code-mode 依呼叫點計。
- `grok-bot-busy.py`：grok-bot-vm 經 stdin 唯讀跑，出各 bot 本週與前 3 週
  訊息量及 coding-cli LOG 檔數；不是 USD。
- Grok Bot 官方用量：app 帳號選單的「Weekly usage N% used」，用
  using-grok-bot-app 唯讀讀，讀完關選單，每週記一次。
- `reqkey_advisor` 是 advisor（fable）用量，cost.py 以外另算，不得漏。
- 使用者糾正事件粗篩：collector 加輕量關鍵詞欄（「不對」「不是」「我說的是」
  「你改壞」等改口或糾正訊號）。
- 關鍵詞只出候選名單餵 Layer 2，不建大系統，不判定語意。
- 分工：機械蒐集（collector、SSH 計數、對帳格式）可交 exec tier。
- 要讀前一則回覆才能判斷的標註（真人訊號、Grok Bot rule5）交 opus high，
  不得用關鍵字代替。
- Grok Bot rule5 全量讀，不設關鍵字下限；交辦 NOVA 時寫明。
- 真人訊號的 brief 寫明 worker 可用唯讀 ssh 讀 remote-44 的 transcript，
  不寫入、不部署。
- 判 relay 要讀前一則回覆；只給本機檔案會讓 §6.7 的訊號開跑前就 UNCONFIRMED。

**Layer 2 定向深挖（/wayfinder、/unknowns-discovery 的精神）**
只挖 Layer 1 點名的 session，不掃全部原文：
- 每筆可疑 session 讀原文，回答：使用者當下經歷了什麼？agent 卡在什麼？
- 判定是規則缺失、規則存在但沒執行、還是工具或環境問題。
- 深挖前先跑 unknowns-discovery，明列假設與實際的 map/territory 差距。
- 每筆結論落成一行：現象 → 根因類別 → 對策去向（gate／backlog 列／棄案）。
- backlog 列走 maintenance §3：要改的檔案＋含反例的驗收。
- 過不了這格式的深挖視為未完成。

**改動配對指標（原 §2，併入漏斗的對照組）**
- 上週每項行為性改動（規則、hook、工具、skill）在 Layer 1 找一個前後指標。
- 找不到指標的改動明列「無法驗證有效性」，這本身是 finding。

### 5. 循環工具與記憶盤點 — 自家 repo 之外的回饋迴路，每台機器都有、都要看
這些檔案多為 per-machine，不出現在 GitHub 對帳；漏看就斷循環：
- `~/.agents/shared-memory-inbox/pending/`：未消化筆記的數量與積齡。
- 積壓是 finding；消化走 shared-memory-intake（Codex 寫 ad_hoc note 交給
  Codex 本體整合）。
- 任一台 pending 超過 20 件：retro 開跑前先派一個 worker 照
  shared-memory-intake 消化。
- `~/.agents/retro-inbox/pending/`：機隊每台的反省檔數量與積齡。
- 任一台超過 20 件：retro 開跑前先把 `kind: note` 依 §6.5 轉 Layer 2，
  其餘按目標檔分批，每個目標檔一個合併 diff，走 maintenance §1 核准。
- 收尾後任一台仍超過 20 件：下一輪 backlog 加一列「inbox 收割腳本」。
- `~/.codex/memories/`（MEMORY.md、rollout_summaries/）：本週新增的官方摘要，
  對照 retro findings 有無矛盾。
- hook stats（bol-prompt-stats.jsonl、context ledger）已由 Layer 1 收，勿重算。
- 機隊每台在編機器的上述三項都要收。
- 可達性一律以實際 SSH 一次為準並附輸出；tailscale 狀態列寫 offline 不是證據。
- hook 可執行性：每台實際跑一次 context-mode hook 指令並看 exit code。
- 只看 hook 有掛載不夠；hook exit 非零就是缺口。
- 新機器入列時此節是 provisioning 檢查項；拓撲只記在私有 machine config。

### 6. 死碼盤點 — 用量為零的資產
- recipe：`recipe-usage-stats.sh <name>`（consecutive_zero_weeks）。
- skill／tool 用量：`scripts/ctx-usage-report.py --days 7`，唯讀 context-mode
  SQLite，涵蓋 codex 與 claude。
- 出 tool 次數與 bytes、plugin 歸屬、使用者明確呼叫的 skill、skill 提及次數。
- `--agent codex|claude` 可分側。
- 零用量 skill ＝ 已安裝清單減去該報告的呼叫集合與提及集合；兩者都零才算。
- 只看提及會誤殺被程式化呼叫的 skill。
- rules 的零用量仍無工具，此缺口續留。
- 連續零週 ≥ 4 → attic 掛牌提案；掛牌後又有使用 → 撤牌。
- 單週快照會誤殺，不得用單週判定。

### 6.5 臨時動議與使用者訴求
- 常設收件匣：每台機器的 `~/.agents/retro-inbox/`，不在任何 repo 裡，
  deploy 不碰；不存在就建立 `pending/`、`done/`。
- 只收反省：做錯什麼、要改哪個檔、驗收與一個必須 FAIL 的反例
  （格式見 maintenance §3）。
- 可重用的事實或做法是筆記，投 `~/.agents/shared-memory-inbox/`；
  同一件事不兩邊抄，handoff 只寫檔名。
- 一件一檔：`pending/<UTC>-<slug>.md`；沒有 `pending/` 就 `mkdir -p`。
- `kind: proposal` 是議題；`kind: note` 是隨手記（collector 撈不到的人為觀察、
  可 global 化但還寫不成 §3 row 的候選，引用其 shared-memory 投稿檔名）。
- 投稿不設門檻，採用與否在這裡決定。
- 機隊每台在編機器的 `pending/` 同樣計數、同樣處理。
- retro 開跑時與報告收尾前（§8）各收一次，以 SSH 收齊每台在編機器的
  `pending/`，可達性同 §5。
- 逐件處理後移到 `done/`：只搬檔，不改原文，唯一例外是結案時追加的
  `closed:` 尾行（maintenance §3）。
- 去向記在 `motions.md` 與 backlog 列號。
- 議題與 global 化候選逐條討論、決定採用與否；其他隨手記餵 §2–4 當 Layer 2
  線索。
- 本輪 session 中使用者的動議、提醒、糾正，同步記在 run dir `motions.md`。
- 再問一次「還有沒有臨時動議或訴求？」，使用者隨時可插入，不受清單限制。
- 臨時動議是本週想討論但議程沒排的題目，當場列入本次 findings 一起裁決。
- 訴求是對 agent 行為或流程的不滿與期望；訴求本身就是最高優先的體驗訊號，
  直接對應 §2–4 的使用者體驗面，不需要 collector 佐證即成案。
- 兩者都落入 gate 或 backlog 列，與其他 findings 同格式（證據／落點／驗收），
  不得只記「已討論」。

### 6.6 概念卡 — 外部新做法對照升級
- 取 `~/github/agent_automation/concept-cards/` 中 `收錄：` 落在本輪窗口的卡。
- 派兩位獨立審查者（內建 sonnet subagent、deepseek），彼此不讀對方報告。
- 逐張讀全文，分 A 可升級、B 已有、C 不相關。
- A 的判準：agent-scripts 的 kernel／rules／skills／workflow 或 sibling repo
  沒有，且卡片給出具體做法。
- B 附 file:line。
- A+B+C 等於清單張數；C 的檔名全列供抽查，答沒有時附 ≥2 種搜尋 pattern。
- 主 session 合併兩份成對照表，直接派 sol 逐條給判定（已有／既有動作點修正／
  新增規則文字／先 probe／不採用）與核准路徑。
- 「既有動作點修正」走 maintenance §1 對應路徑。
- 「新增規則文字」受不加新規則與不加新 gate 的既有約束，需 owner 改判。
- 先 probe 的落 backlog 列（§7）。

### 6.7 更深的問題（每週固定）
- 問題：在我最近反覆討論的問題背後，有沒有一個更深的問題，是我一直繞著它
  走、卻沒真正問出來的？
- 執行：派 opus effort high 的 worker（agent-tmux profile
  `claude-opus55-high`），不由主 session 作答。
- profile 設定在 `~/.config/agent-tmux/profiles/`，不在 repo；機器上沒有就先建。
- 只有符合 model-dispatch §5（兩次有證據的 high 失敗，或使用者明確選擇）
  才用 xhigh。
- 輸入：使用者近 4 週三台機器的原話（含 Grok Bot agents）、本週 human-signal、
  近幾輪 report／backlog／對帳、kernel 與 git log。
- 產出 `<run dir>/deeper-question.md`：一句主問題（用使用者會問的方式）
  ＋至多 2 個次選。
- 主問題附 ≥5 句原話引用，跨 ≥2 台、≥2 週。
- 附最強反駁與為何沒勝出，以及下週可量的驗證訊號與門檻。
- 只描述行為模式，不揣測心理，不下診斷。
- 閉環：先判定上週的驗證訊號（成立／不成立／UNCONFIRMED），再問本週的問題；
  判定寫進報告同一節。
- 報告固定一節；結論影響本輪 TL;DR 的收斂方向時要寫明。

### 7. 裁決與產出
- 報告開頭是 TL;DR「共識後預計這樣做」：一行一件事，用白話寫要改什麼、
  調整什麼，不放代號（F/D/W 編號）。
- 接著是「需要你決定」：只放共識階梯（judgment-rubrics §3）定不了的事，
  一次問完。
- TL;DR 之下才是細節；同一根因或彼此相依的 findings 併成一條。
- 分成方向題（做不做、往哪走）與流程題（怎麼做），每條附證據和代號。
- 裁決結果分升級、觀察、棄案三種，不自動升級為 hard block。
- 產出 W+1 backlog：每項有證據、落點 repo、可驗收條件、配對指標。
- 配對指標至少一項是使用者面數字（糾正率、追問次數或同類抱怨數）。
- 只寫機制計數（如 deny 次數）的列不合格。
- 使用者糾正一次、或同摩擦兩次：落成 gate、規則修正或 backlog 列
  （maintenance §2/§3），不寫自由文字教訓。

### 8. 收尾固定更新（每輪必做，不待點名）
- 裁決落地後、報告收尾前，用當輪活資料重生唯一狀態頁
  「[agent-scripts] 艦隊與 Retro」。
- Dashboard 型別，同 URL 原地更新：資料寫 datasets、頁面寫 `files/index.html`。
- URL 以 Artifact list 現場查，標題固定；不再另開每週 Retro 頁。
- 資料一律現場重測，禁止沿用上輪數字。
- 儀表板固定區塊：各機器 USD 當量、CodeBurn 分項、其他分析、漏斗 6 步與門檻
  的推進、backlog（上週各列做了／有效＋本週列）。
- 其他分析含 context-mode 走路率（含 Codex）、真人訊號含打斷率、常駐偏好、
  改動配對、advisor 補算、Grok Bot 忙碌度。
- 少一區要在報告寫明原因，不得默默拿掉；樣本太小的值灰掉並標分母。
- dataset 的 `updated.at` 填寫入當下的 UTC。
- 收尾前依 judgment-rubrics §2／§5 重查本輪 backlog 狀態，再更新報告。
- 未查證的項目保留並標 `UNCONFIRMED`，不得列為「還沒做」。
- L2（advisor）的意見當輪寫進 run dir 的 `l2-review.md`；transcript 裡 advisor
  回覆是加密內容，沒落檔就無從核對。
- 行為稽核的 digest 用 `evals/retro-metrics/session-digest.py <transcript> <out>`；
  手寫 digest 會漏 advisor 的 `server_tool_use`。
- 資料源 repo 與各自量測層：
- agent-scripts 這一列的量測層是：`global/` kernel、`.agents/rules/` routed rules、
  `.agents/hooks/`＋`settings.json` 掛載、skills-lock.json、workflows 套組 hash。

| Repo | 量測層 |
|---|---|
| ohyeh/agent-scripts | 上一條列出的各層 |
| ohyeh/tmux-agent-tools | agent-tmux script 指紋、dispatch-gate plugin ×4 位置、smoke 狀態 |
| ohyeh/context-mode-local-insight | agent-sessions --fleet（雙機 session 量測，schema 版本） |
| 機器層（非 repo） | 兩個 inbox 的 pending、codex --version、部署層 `.skill-lock.json` hash |

- 儀表板「相關報告」表每一頁，本輪 findings 若讓它某句變假、過時或已完成，
  就同 URL 原地更新：改掉那句、標完成，再加一個短的「W(n) 後續」段。
- 不另開新頁寫心得；沒受影響的頁在表上寫「無變化」。
- 表的最右欄固定是本輪的後續欄，每頁一格不得空白。
- 舊有五頁（skill/workflow manifest、健檢報告、分群圖、spinout）已併入並立
  指路碑，不再更新。
