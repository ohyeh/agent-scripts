# Weekly Retro Agenda

範圍：agent 協作過程與循環，核心包含 `agent-scripts`、`tmux-agent-tools`、`context-mode-local-insight` 三個 repo。產品 repo 僅在出現明確訴求或重複失敗時納入。

觸發：使用者手動下達「RETRO時間」。系統不得自動排程或自動觸發。

議程有缺陷時，先依 `maintenance.md` §1 裁定議程的 exact diff，再修改其他流程。

## 不變式

- 真相源是 GitHub remote（`gh api`、fetch 後的 log）；本地 clone 僅作線索。
- 產物必須寫入 `agent-scripts/evals/retro-metrics/<ISO-week>/`，至少包含 `plan.md`、`motions.md`、`retro-report.md`、`next-week-backlog.md`。
- `.gitignore` 忽略 `evals/retro-metrics/*`（`*.py` 例外進版控）；報告與量測檔只存在執行機。
- 開跑前必須在 `plan.md` 寫定窗口；終點必須是過去的時間，下一輪從該終點接續。
- 每個手動查核數字必須附執行指令與輸出；每個 0 值必須附更寬窗口的正例對照，缺一標記 `UNCONFIRMED`。
- 公開衛生：產物只寫機器鍵（`local-mbp14`、`remote-44`、`macmini`、`grok-bot-vm`），不得出現 SSH 別名、IP、主機名、使用者名或憑證。
- 發布或送審前，用 `find <run dir> -type f` 列檔；同批實體產物一併掃描，含存在的相鄰週檔、patch 和 gitignored 檔。掃敏感樣式、編碼 home 路徑與 SSH 別名；附正例對照與命中數。

## 議程：開跑先派各台收件匣清冊、上週 backlog 對帳證據、基準案例；其餘依下列順序收斂。

主軸為兩條線：（1）讀 owner 原話與各台收件匣；（2）上週 backlog 對帳與本輪動議。不再跑過往週統計與成本匯總表。

### 1. 上週 backlog 對帳（做了沒、有效沒）

- 開跑前先讀唯一狀態頁「[agent-scripts] 艦隊與 Retro」（URL 以 Artifact list 現場查）與上週 `next-week-backlog.md`。
- 逐項以 GitHub commit 或 issue 查核「做了沒」，再以本週實際案例查核「有效沒」。
- 對帳逐列核對原驗收，引用實際案例、指令及輸出；缺案例或證據時標 `UNCONFIRMED` 並列未查面，保留基準案例與對帳收據。
- 已合併但行為未變的項目，必須判為「做了、無效」，轉入 §3 深挖。

### 2. 開場收齊四台收件匣並派消化（收件匣規約 §6.5）

- 以實際唯讀 SSH 測試各在編機器可達性並附輸出；tailscale 狀態列不算證據。
- 開跑與收尾前，在四台分別列兩個收件匣的 pending 清冊、件數及積齡；無法讀取時附失敗輸出，標 `UNCONFIRMED`，不得記為 0。盤點只讀；搬檔或遠端寫入須有該機的授權。
- 共用記憶或反省匣任一台逾 20 件，開跑先派該台消化；收尾仍逾 20 件，列收件匣處理的 backlog。共用記憶由 Codex curator 以 `--as codex` 跑 `shared-memory-intake` 的 Codex 步驟 1–8（鎖、validator、來源機核證、MEMORY 去重、ad_hoc note、跨機傳輸與雜湊、逐件處置帳、交接確認）。
- 反省匣的新投稿只收符合 `maintenance.md` §3 的 `kind: proposal`，沒有合格反例就不投稿；可重用事實只投共用記憶。逐台逐件讀舊件並記去向，既有 note 作為深挖線索。
- 採納案按目標檔合併，走 `maintenance.md` §1；驗收通過、重複或 owner 核准棄案時，依 §3 在來源機追加對應 `closed:` 尾行，同輪搬至 `done/`，原文保留。逐件記 `motions.md`、佐證或承接 backlog 列；仍有未結子項時保留 pending。
- 每台實際執行一次 `context-mode` hook 指令並檢視 exit code；非零即列為本輪缺口。

### 3. 逐案讀原始紀錄與臨時動議

- 本輪 session 中 owner 的動議、提醒與糾正，必須即時記入 `<run dir>/motions.md`；開跑與收尾前各問一次「還有沒有臨時動議或訴求？」。
- owner 的訴求是最高優先訊號，直接成案，不需要統計佐證。
- 唯讀檢查本輪結案原檔中援引的 owner 原話，連同來源另列訴求，逐件判定已涵蓋、過時、一次性或仍開著。仍開著者列最小處理與證據；原提案維持結案。
- 深挖對象來自 owner 原話、收件匣線索與 §1「做了但無效」項目；必須逐案讀對應 session 原始 transcript（涵蓋 Claude、Codex、agy、Grok 四個 CLI），不得用週總數替代。
- 收件匣或 owner 點名真人訊號或 Grok Bot rule5 時，讀該案與前一則回覆再判定 relay；其餘不排全量標註。
- 每案判定根因類別（規則缺失、規則存在未讀、讀了未照做、工具缺陷）並決定去向（修改既有動作點、backlog 列、或棄案）。

### 4. 概念卡吸收

- 取出 `~/github/agent_automation/concept-cards/` 中 `收錄：` 落在本輪窗口的卡片。
- 先派 `agy-flash`（sonnet 層）分批逐張讀全文，分類為 A 可升級、B 已有（附 `file:line`）、C 不相關；A+B+C 必須等於清單總數。
- 再派兩席獨立討論者讀全部 A 類原文與目標檔，並抽核 B 與 C 分類，逐張給定判定（採用、先試一次、已有、不採用）與核准路徑。

### 5. 更深的問題（每週固定）

- 問題：在我最近反覆討論的問題背後，有沒有一個更深的問題，是我一直繞著它走、卻沒真正問出來的？
- 必須由 `opus` effort `high` worker 作答。派前依 `model-dispatch.md` 查該執行路由可用的模型與 effort；不可用則明列缺口，主 session 不代答。只在 §5 條件成立時用 `xhigh`。
- 輸入包含近 4 週各台 owner 原話、近期 report 與 backlog、kernel 與 git log；產出 `<run dir>/deeper-question.md`。
- 產出包含一句主問題（附 ≥5 句跨機跨週原話）、至多 2 個次選、最強反駁、下週可驗訊號，並先閉環判定上週訊號（成立、不成立、UNCONFIRMED）。

### 6. 決策樹與自動化串聯盤點（每週固定）

- 每週稽核 `using-decision-tree`：先派 `agy-flash` 逐列盤點全部 member 列與 `chain.tsv` 列，檢查該 member 是否仍在安裝清單、本輪窗口內兩份 nudge log 的命中數、下站是否接續執行、死連結與與 kernel 路由索引的衝突。
- 檢查觸發漏接：掃描本輪窗口內符合任一分支 `when` 條件、卻未收到 nudge 且未載入決策樹的 owner 原話。
- 檢查跨層串聯：逐一對照決策樹點名的每個 mod 與 workflow recipe，以及點名決策樹的每個 mod 與 recipe，列出單向或斷裂的連結。
- 盤點本輪窗口的 owner 原話，找出既不符合任何分支列、也不符合任何 kernel 路由列的任務，以及已有安裝的 skill、mod 工具、recipe 或 script 可接手某一階段，當時卻由 agent 手動完成的任務。按場景分組，附原話與來源，逐組點名可串聯的已安裝元件、各自可接手的階段與接續順序。
- 盤點完成後交兩席依 §7 流程獨立作答並交叉簽核；主幹、索引、分支問題與 `owner` 列必須取得 owner 對 exact diff 的核准，`mechanical` 列依決策樹自身規則處理。

### 7. 兩席共識、裁決與產出

- 重大設計或規則改動，由兩席各自作答，再交叉審閱同一整合版，記 `SIGN`／`NO-SIGN`。有分歧或 owner 要求時請 advisor 表態。routed rule 的語意改動必須讓 advisor 和第二模型審閱者對同一份 exact diff 達成共識，兩席同意仍走此路徑。
- 每個改動提案必須附四項：（1）owner 會看到什麼差別、（2）今天必失敗的反例、（3）撤回條件、（4）核准路徑（共識路徑或 owner 核准）。
- 優先修改既有動作點與刪除多餘文字。新增規則或 gate 必須取得 owner 明確核准，語意改動仍依 `maintenance.md` §1。
- 報告開頭寫白話 TL;DR「共識後預計這樣做」（一行一事，不放代號），接著「需要你決定」（只放共識階梯定不了的項目，一次問完），細節與證據放下方。
- 產出 `next-week-backlog.md`：每列符合 `maintenance.md` §3（日期、證據、目標檔、含反例的驗收），不寫自由文字教訓。
- 本輪完成已具備證據、授權與執行條件的列，包含同輪可完成的 exact diff 與驗證。留到下週的列分兩類：（a）需更多真實樣本才能判定，寫明待判事項、合格樣本條件、目前件數、最低所需件數與複查日期；（b）受其他阻塞，例如待 owner 核准或動手、跨 repo 分流、收件匣積壓，寫明已完成部分、卡住的步驟、解除條件與承接者，並保留未完成狀態。

### 8. 收尾固定更新

- 裁決落地後、報告收尾前，同 URL 原地更新唯一狀態頁「[agent-scripts] 艦隊與 Retro」。
- 儀表板只保留兩塊：**本輪決定**（TL;DR 與棄案結案摘要）與 **backlog**（上週做了沒／有效沒＋本週新列），並更新 `updated.at`（UTC）。
- 儀表板「相關報告」表若有頁面因本輪 findings 過時或完成，同 URL 原地更新並加「W(n) 後續」段；未受影響者填「無變化」，不得留白。
- `advisor`（L2）回覆必須當輪落檔至 `<run dir>/l2-review.md`；行為稽核 digest 使用 `evals/retro-metrics/session-digest.py <transcript> <out>`。
- 收尾前依 `judgment-rubrics.md` §2 與 §5 重查本輪 backlog 狀態，未查證者標 `UNCONFIRMED`，不得寫為「還沒做」。
