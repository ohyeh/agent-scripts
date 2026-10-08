# Lessons — 活案工作集（append-only；format per rules/maintenance.md §3 — NON-NORMATIVE）

只留「尚未處置完的活案」。條目畢業（折入 rules/kernel/skill/hook 的核准 commit）即刪；
歷史在 git log（2026-08-08 W32 清算：48 條 → 折入 judgment-rubrics §2/§4/§5、
model-dispatch §3/§4、maintenance §5、harness-diagnosis 信任層之後，餘下如下）。
2026-10-01 W40 整併（使用者核准）：58 條 → 24 條。已折入落點的 27 條刪除，7 組同類合併；
刪除條目與落點 file:line 見該 commit 訊息，原文 `git show a8f48b9:.agents/rules/lessons.md`。

## 2026-08-19 | scope: harness | trigger: worker completed the task but result.json stayed non-terminal — the injected contract never reached the pane, while both "injected" sentinels were written
Rule: never write a completion marker you have not verified; if you cannot verify, leave it unmarked. A sentinel that records intent (the paste command was issued) instead of arrival (the text is visible in the pane) converts a transport miss into a permanent silent failure, because `*_should_inject` is sentinel-gated and skips forever after.
Evidence: remote `agy-cli-blindagy2` (launch_id blindagy2-20260819T035147Z-9fe4, .44) answered all nine questions and went idle. `tmux capture-pane -p -J -S -` over the FULL scrollback contains neither `Write final JSON to this exact path:` nor `Ignore any project-local agent instructions` — yet `.result-path-injected` and `scope-guard-injected` both exist (0 bytes). audit.jsonl shows two `send.multiline` with enter_count 1; only sha256 is stored, so the wrapper cannot prove what landed. agent-tmux :5238-5252 verifies prompt arrival by nonce echo, then marks the injection sentinels 14 lines later with no verification at all.
Same pattern, three places: the injection sentinel (:2461), the retired `status:"success"` result seed (#317, now `pending`), and `launch_envelope_inline_block` (assumes the shell reaches statement 2).
Status: proposed

## 2026-08-19 | scope: maintenance | trigger: a full session of diagnosis produced zero artifacts because the session invented an approval gate that the §1 matrix does not impose（併 2026-08-21 diff-then-approve 重問條）
Rule: read the §1 row before claiming a gate. `rules/lessons.md` is "append entries freely"; only deletions/rewrites and proposed→adopted need approval. Where a diff IS required, producing the diff is the session's own first step — never substitute "shall I open the diff?" for the diff. A turn that identifies something worth recording must contain the record or the diff, not an offer of one. diff-then-approve 是一次性動作：把 exact diff 寫成檔案、講一次、繼續做其他不需核准的工作；同一個許可不得重問，等待核准期間不得停下全部進度。
Evidence: 2026-08-19 session 37839e4b. Confirmed the injection-delivery defect above, overturned two of its own wrong diagnoses, and designed three mechanisms; `git log --since='2026-08-19 00:00'` = 0 commits, repo files modified = 0, CC file-history = empty. Offered to open a lessons.md diff three times across the session while the matrix already permitted a direct append. Deploy therefore shipped the previous night's tree; the user caught it, not the session.
Evidence: 2026-08-21。遠端 37839e4b 行 5739「『要我開 diff 嗎』…把一回合的手續拖成一整天零產出」；本場 9e024f84 三次重問 lessons diff。
Status: proposed

## 2026-08-20 | scope: execution | trigger: a rules claim about SendMessage matching semantics was sourced from `strings -a` on the CLI binary and turned out to be false
Rule: a string constant found in a binary proves only that the string EXISTS; it never proves how the program uses it. `strings`/`grep` over a compiled artifact cannot read control flow, so any claim about BEHAVIOUR (matching semantics, precedence, validation) must be settled by running the operation, not by reading the binary. Reading the binary is not "closer to the source" than reading a schema — both are static, and neither is behavioural evidence.
Evidence: `session-titles.md:10-12` asserted "SendMessage({to}) matches against the title, start-anchored, so a UNIQUE PREFIX delivers just like an exact match (verified against CLI 2.1.237)". That "verification" was `strings -a` output. Live four-cell probe across two machines and two targets (sessions d0f81d85 and 37839e4b, CLI 2.1.237): prefix → refused; prefix + ref → refused; full name + ref → delivered; full name without ref → delivered. Semantics are exact full-name match; ref is harmless, not required. Cost of the wrong method: three failed SendMessage calls plus a committed rule that could not work.
Corollary, same day, both hosts: the `to` schema `^[\s\S]{0,300}$` is real and inclusive — 300 characters clears validation and fails later at resolution, 361 is refused as `InputValidationError` at the tool boundary without ever reaching resolution. So failures come in three layers, and the layer names the next move: schema (your string is malformed — do not go looking at ListAgents), resolution (`is named … exactly` = found but under-specified, `is not reachable` = nothing matched), delivery. Reading the schema gave the number; only running it gave the boundary and the layering.
Method note: the cap was probed with a deliberately nonexistent 300-character recipient. A real target would have delivered and hidden the validation layer under a success — when testing a boundary, pick a target that cannot succeed.
Status: proposed

## 2026-08-20 | scope: tools | trigger: a handoff passed its own validator while failing the repo's public-safety check — the two judge the same string by opposite criteria
Rule: knowing what a validator does NOT check is part of trusting its PASS. `session-handoff`'s `validate_handoff.py` has no secrets/privacy check at all: its only path logic is `check_file_references()`, which extracts paths from the body and records them as valid when the file EXISTS — so an absolute home-directory path is scored as a good reference, and the more real it is the more surely it passes. `check-rules-invariants.mjs`'s `public-sensitive-literals` forbids exactly that string. One tool rewards a resolvable path, the other forbids a leakable one; a PASS from the first is not evidence about the second.
Second defect, same file: the checker prints only the FIRST match per file, so fixing it and re-running surfaces a different literal and invites the wrong conclusion that the first diagnosis was mistaken. Here line 5 (`- Project: <absolute home path>`) was the real first hit; after redacting it, three Tailscale IPs (lines 33/87/173) appeared, and this session wrongly concluded the home path had never been a hit. A checker that reports one finding at a time reads as "that was the problem" rather than "that was the first problem".
Evidence: 2026-08-20, `.claude/handoffs/2026-08-20-122706-session-title-as-address.md`. Both classes redacted (`~/git/agent-scripts`, `<peer-host>`/`<this-host>`); the cell then passed. Peer session 37839e4b quoted the original first line verbatim, which is how the misattribution was caught. Verbatim originals: `ops/evidence/2026-08-20-sensitive-literals-handoff.md` (outside the checker's pathspec).
Status: proposed

## 2026-08-21 | scope: execution | trigger: 議程寫 `--days 7`、機隊三台，本場 retro 跑了 14d 且只跑一台，被使用者連兩次點名
Rule: 有議程／契約的流程，開場先把該文件的可判定參數（窗口、機隊、必收清單、輸出格式）抄成 run dir 的 checklist 並逐項打勾；缺一項不得進裁決節。「讀過議程」不等於執行議程。
Evidence: 2026-08-21 session 9e024f84。retro-agenda §Layer1 明寫 `--days 7` 與「機隊每台都要收」；本場首跑 14d、僅本機，遠端兩台在被點名後才補（mbpr 191 場、mac-mini 0 場）。
Status: proposed

## 2026-08-21 | scope: execution | trigger: 使用者要 session 使用情形分析，我回報 md5、版本號、clone 與 npm 狀態
Rule: 「量測基礎設施能不能跑」不是分析結果。體驗分析段只能出現分機 × 分桶的使用情形與收斂訊號；工具鏈狀態屬 §5／§8，工具修好本身不構成進度回報。
Evidence: 2026-08-21 session 9e024f84，使用者原話「你回報狗屁機器狀況幹嘛」。
Status: proposed

## 2026-08-21 | scope: measurement | trigger: 同一輪 retro 內兩次先下結論、後被證據打回（關鍵詞全檔 grep 高估糾正；依 session 起始時間分桶讓長場全落 before）（併 2026-08-28 指標三輪不動條）
Rule: 指標拿去比較前先問兩件事——分子是否只含目標主體（糾正只能取 `type=="user"` 純文字，全檔 grep 會把 agent 自述算進去），以及分桶依據是否與被比較的變數共變（依起始時間分桶時長場必然落在較早的桶，「早期摩擦高」是分桶造出來的）。跨切點長場一律用事件時間逐筆歸類。一個指標三輪不動，先懷疑量尺再懷疑行為。改口徑重測（同窗口、同資料）是第一步，不是加規則。
Evidence: 2026-08-21。第一版結論「新版沒改善、after 每百輪 34.59」作廢，正確值本機 3.29 → 1.70；本機糾正實為 16 次而非 191 次。橫跨切點證據：mbpr 37839e4b first 08-14T07:44Z last 08-20T07:57Z、is_error before 26 / after 9。第二個缺陷由 .62 peer 指出。
Evidence: 2026-08-28。done-w/o-evidence 連三輪 95→97→96；collector 要求 evidence 與 claim 在同一 jsonl 行；改為 assistant text + 前 6 行 lookback 後本機 7d 由 96.9%（31/32）降到 63%（17/27）；嚴格口徑（中文完成語＋PASS/DEPLOY OK/md5）只剩 3/58。corr 全文關鍵詞七場重算 175→0、53→4、24→2、23→1、17→1、22→0。claim-evidence gate 08-27 落地後指標未動，因此被誤讀為「gate 無效」。
Status: proposed

## 2026-08-26 | scope: context-mode | trigger: Cursor CLI 的 ctx_doctor 在 mcp.json / plugin.json 已 pin CONTEXT_MODE_DIR 後仍報 ~/.gemini store (default)
Rule: Cursor CLI 不把 mcpServers.env 傳進 MCP child；live server 是 plugin MCP 不是 ~/.cursor/mcp.json。要共用 Claude store，DIR 必須在啟動 command（wrapper）裡，不能只寫 JSON env。
Status: proposed

## 2026-08-28 | scope: tools | trigger: codex thread 01a045ef 用 10 次 1 秒 wait 輪詢一個測試跑完，使用者質疑「一樣的情況 claude 就很有效率」
Rule: 等待要外部化。yield 語意的 runtime（Codex `exec_command`）裡，**啟動時的 `yield_time_ms` 就是在預約輪詢鏈**——給 1 秒等於保證還要再回來一次，而每次回來都重送整個 context。長命令的 `yield_time_ms` 直接給預期耗時（實測 600000 可用），長工作走 `agent-tmux <cli> result wait-required --wait N` 阻塞在單一 process；真正需要續等時才 `wait`，30s 起、×2、上限 300s。kernel §Execution 現有的「Delegated long waits: blocking/event-driven, never fixed polling」只射到派工，射不到 exec 啟動參數，是規則缺口不是違規。
Evidence: 08-20 起 codex 132 場：`yield_time_ms=1000` 有 **1206 次在 exec 啟動、只有 48 次在 wait**；wait 共 617 次／372.4 分鐘（平均 36s）、waits per exec 0.029——瓶頸在啟動 yield 不在退避曲線。對照 claude 392 場：**背景啟動 153 次、BashOutput 輪詢 0 次**，最長 timeout 3,650,000ms；差距來自 harness 事件驅動而非模型自律。Codex 有 9 個 hook（permission_request／post_tool_use／pre_compact／pre_tool_use／session_end／session_start／stop／subagent_start／user_prompt_submit），**0 個能在 yield 後 re-invoke**；`notify` 只在 turn-ended 觸發且單向。
Related: 查 hook 能力時我先只看 `~/.codex/hooks/` 的三個檔就斷言「只有 session_start/stop」，被斷言測出 FAIL；真相在 `config.toml` 的 `[hooks.state]`。與 2026-08-21／08-25 兩條同屬「取樣面太窄 → 過早斷言」，但這次方向相反：不是訊號缺席，是**看到部分就當看完**。
Status: proposed

## 2026-08-28 | scope: deploy | trigger: 另一 session 的 handoff 說「skill 已部署、deploy 全綠」，本機 `~/.agents/skills` 沒有該 skill；bol gate 的 block 版本機 08-27 生效、第二台 Mac 到 08-28 才拿到（併 2026-09-04 e9d60e8 單機宣稱 deployed 條）
Rule: 部署驗證要寫主機名；一台 PASS 不是艦隊 PASS。「已部署」的宣稱必附每台目標機 deploy-log 的最後 sha（`~/.local/state/agent-scripts/deploy-log.jsonl`）。跨機比較指標前先對 deploy-log 確認兩機版本相同，不同就標「不可比」。
Evidence: 第二台 Mac 7d bol stats 34 個 fail 全為 `blocked=na`（舊 warn 版），本機同期 `blocked=true` 5 筆；`fleet-deploy.sh` 原本把 deploy 輸出丟 `/dev/null`。
Evidence: 2026-09-04 本機 deploy-log e9d60e8@09-04T04:19Z；.44 2f9fd14@09-03T12:47Z；.44 缺 `~/.claude/agents/explore-bounded.md`、`~/.agents/hooks/bash-readonly-gate.sh`（W1「fleet-deploy 唯一入口」再犯）。
Status: proposed

## 2026-08-28 | scope: ux | trigger: 8 次真實糾正中 6 次是「改對了東西、改錯了範圍」：品牌⇄商品列表、Toast⇄版型、視覺細節⇄wireframe、全命令⇄專測登入（併 2026-09-11 一改一條、2026-09-24 UI 截圖條）
Rule: 改 UI 或範圍類請求前，用一句話覆誦「要改的元件與範圍」再動手；請求指向一類東西時等回覆。同一交付物在 2 輪內被指出 ≥2 個獨立錯誤時，停止一改一；先渲染／列出全部狀態與 ≥3 處 sibling 慣例，整批修，再發布一次。UI 結論必須附本輪真實截圖，並涵蓋需求點名的每個狀態；只給表格或文字描述不算完成。
Evidence: e58cb016 ×4（L1844/1936/2164/3107）、421d7ec0 ×2（L3283/3700）；邏輯與工具皆對，位置錯。
Evidence: d6da8f7f 09-05 10:48／10:56／10:59「你內部先盤過啊 不要說一改一」；W39 R3 類 4 筆（layer2-corrections.md，來源 W39 F6）。
Status: proposed

## 2026-09-01 | scope: waits | trigger: 質疑 model-dispatch §4 的 wait 契約是為假想敵而寫，實測後推翻
Rule: delegated wait 的 deadline 規則有實證基礎，勿再以「沒發生過」為由刪減；要改先量。
Evidence: 24h 內 9 個 sleep 條件迴圈，4 個無 deadline（b2a2306b、37fc267e 等）；b2a2306b 兩次 `Command timed out after 2m 0s`。寫對的兩個（`SECONDS+560`、`timeout 900`）出自同一天同一批工具。
Status: proposed

## 2026-09-03 | scope: evidence | trigger: 用 `grep ... | head -3` 取 `$?` 判定「marker 存在」，實際拿到的是 head 的 0（併同日 `bash -n` 跑 zsh 腳本條）
Rule: 任何用來當證據的 exit code 都不能穿過 pipe；`grep -c` 或不接管線再取 `$?`。既有規則只寫「harvest 呼叫不要接管線」，同一個坑在 grep 上照樣成立。檢查器必須與目標語言相符；回報語法錯誤前先確認 shebang，並用 stash 到 HEAD 重跑確認是否既有。
Evidence: `grep -n "..." f | head -3` 印不出任何行卻 `exit=0`；改 `grep -c` 得 `0` 與 `grep -c exit=1`，結論反轉。
Evidence: `bash -n agent-tmux` 報 line 2290 錯誤，`zsh -n` exit=0；stash 到 HEAD 後 bash 同樣報錯，證明與本次改動無關。
Status: proposed

## 2026-09-03 | scope: waits | trigger: 把 `assign` 的 `result-path delivery UNCONFIRMED` 當成 cursor 的投遞 bug，據此推論「路徑沒送到、pending 永久」
Rule: 那句警告對 `heuristic_family=generic` 是設計上的必定觸發（`_sentinel_trustworthy` 刻意不標），不是投遞失敗的證據；permanent pending 要看 worker 自己的 state dir。折疊貼上內容的 TUI（cursor 顯示 `[Pasted text #1 +N lines]`）也無法用 pane capture 證實或否證。
Evidence: `result_path_via_prompt_default` 對 generic 回 true；rv-cursor3 自行寫出 `.../rv-cursor3/result.json` 並升到 `status: success`；pane grep 找不到 marker 但第 7 行是折疊標記。
Status: proposed

## 2026-09-04 | scope: completion | trigger: 審查產出一批結論後只回「審完了」，使用者「都審完了 你沒任何修正？」
Rule: 審查結論就是待辦清單：逐條落地並附每條的驗證證據，不得以「審完了」結束一輪。
Evidence: c48c0d3a 447k cache-break 該輪；W36 dive-A 分類「規則存在但沒執行」。
Status: proposed

## 2026-09-05 | scope: maintenance | trigger: kernel 4.26.0 壓 `kernel-lean.md` 進 6000 字元時，只驗字元數＋七個 anchor grep 就宣稱「語義未動」，實際砍掉 `never a silent edit`、`not authorization`、`runtime-native model`、`do not defend`
Rule: 壓縮規則檔的驗證是「舊版每個指令性子句在新版仍可對應」的逐句 diff，不是字元數與幾個 anchor；連帶刪減要先以 diff 給使用者（maintenance §1），不得在 apply 後才揭露。
Evidence: 690700d lean 5995/6000 PASS 但 advisor 逐句比對列出 4 條鐵律子句消失；補回並另砍 canary 例外、shared-memory 說明、Canonical 段後 5951。七條規則的依據：Astra `VERDICT: BLOCK` 審查（.workflow/202609051231-kernel-sweet-spot/astra-review.md，gitignored）→ 逐條「保留規則、加上不綁定的條件」；第 7 條來自使用者「快派啊 不要過度詢問」。
Status: proposed

## 2026-09-11 | scope: waiting | trigger: /loop、委派 worker 或任何回合在等 bot／CI／Billing／裝置／人
Rule: 等待協定三件事：(1) 靜默上限——等待 >10 分或每 20 輪必發一行狀態（等什麼、多久、備援）；(2) 回報節奏——委派 brief 的 REPORT 段加「每完成一列／每 15 分 SendMessage 一句進度＋卡點」，0 次中途回報視為缺陷；(3) 停滯 SLA——brief 寫明「N 分無新證據即停滯」，到期先催一次，再過 N/2 即 TaskStop 接手或重派；連續 2 輪無出貨要明說「本輪無出貨」。（(1) 已折入 kernel §Execution 與 operator-defaults；(2)(3) 未折入。）「待你決定」結尾 W39 起以 paired_indicators 量測，門檻由 retro 依實測定（原 2026-09-18 條，行為部分已折入 kernel §Hard boundaries）。
Evidence: 8c580e97 09-10 18:52「不會自己 MONITOR 在這發呆？」19:33「你又在耍智障發呆？」；9897ed3e 09-08 05:22「他停滯了？」05:58「誒 他在空轉啊」（worker 188 calls／0 SendMessage，主代理 21 則「繼續等待」）；662042d2 22:18–22:55「等 Billing」×4 無回報；W36 L-b 未落地即再犯。
Evidence: .62 2026-09-18 週 2 場結尾為「待你決定」（f0bda2f3、1c21ecf9）；paired_indicators 2026-W38.json。
Status: proposed

## 2026-09-11 | scope: git | trigger: 一次開 ≥2 個 PR（併 2026-09-18 濫開 PR 條的 PR 部分；recap 部分已折入 kernel §Language／§Execution）
Rule: 一個任務一支 PR，開第二支前先問。真需多支時，先跑 `git log --oneline --graph A B base` 判斷是否 stack；有依賴即底層 → base、上層 → 底層分支；拓樸一行給使用者再開。
Evidence: 491c3a9f 09-08 07:35 兩支都開向 develop → 07:37「pr stack 你不會？」→ rebase＋retarget 重做。
Evidence: f411d9c4「就說不要濫開 PR 啊 我額度都被你們用光了」；Layer 2 M 類 51 筆（來源 F3、§9 對照組）。
Status: proposed

## 2026-09-11 | scope: completion | trigger: 回報 build／compile／install 等背景長程序「還在跑」
Rule: 「在跑」必附 CPU time 增量或子程序清單；CPU time 不動即判停滯，不寫「正常要這麼久」。
Evidence: 36361d87 09-0x 08:52–08:53 兩次「活的」→ 08:55 make CPU time 0.4s 殭屍；09:03 再答「正常」後 1 分鐘抓到 miniruby 無限循環。
Status: proposed

## 2026-09-11 | scope: gates | trigger: 以「沒被引用」為理由刪 image／volume／檔案
Rule: 除靜態引用（ps／compose）外，`rg` 名稱於 runtime 程式碼與註解；命中 on-demand／pull 語意即不算未使用；刪除仍是 hard-stop。
Evidence: c9491e2f 15:07 判 vexa-bot 無 container 用 → 15:25 刪 6.55GB → 15:28 compose 註解「runtime spawns vexa-bot on demand」→ 重 pull。
Status: proposed

## 2026-09-18 | scope: live-truth | trigger: 對 GitHub remote 歷史下結論（誰在何時做了什麼），而 remote 有 squash／force-push 痕跡
Rule: 先 `git log origin/<branch> --since` 確認歷史是否重寫；重寫後只可斷言「現在存在」，不可斷言「何時、為誰做」，並在報告開頭標明證據限制。
Evidence: ohyeh/agent-scripts 2026-09-17 重寫為 8 支 squash commit（9f4f9b4..d4cc574），09-11..16 逐筆不可得；backlog-reconciliation.md:6；來源 F9、§1 對帳。
Status: proposed

## 2026-09-18 | scope: gates | trigger: Stop hook 以「done 字眼無證據 token」打回
Rule: 先判別是 matcher 誤中（回覆內已有 exit code／PASS／file:line 但正則沒認）還是真無證據；誤中只補逐字 token 不改行為敘述，且記一筆到 Z1（matcher 擴充）；真無證據才降級為「attempted, unverified」。此條不折入行為 lessons，屬 matcher 缺陷。
Evidence: collector done-無證據 51/56 為正則誤判、真值 ≈9%（layer2.json、backlog Z1）；本 session 被打回 2 次皆為字眼命中；claim-evidence-gate.sh:56,59；來源 F9、Y4 對帳。
Status: proposed

## 2026-09-24 | scope: judgment | trigger: 回報負面結論（不行、找不到、不支援、沒回應）
Rule: 回報前確認三件事：實際送出的輸入、新功能的官方文件、使用者點名的幫手。缺一項就標 UNCONFIRMED 並繼續做，不得以負面結論收尾。
Evidence: W39 cab30519 與 e4fe0066 兩場的使用者糾正中，R1 類 12 筆（evals/retro-metrics/2026-W39/layer2-corrections.md）；來源 W39 F6。
Status: proposed

## 2026-10-01 | scope: model-dispatch | trigger: `sonnet` alias 的實際 model ID 變了
Rule: model ID 只寫在 model-dispatch §1（其他檔案只指向 §1），以本機 transcript 的 `message.model` 為準；alias 換版時只改 §1。
Evidence: agent-scripts 專案 transcript：`claude-sonnet-5` 最後一次 2026-09-26T18:31Z；`claude-sonnet-5-5` 自 2026-10-01T11:55Z 起出現。來源 W40 remote-44 稽核 A。
Status: proposed

## 2026-10-01 | scope: operator | trigger: 交付要使用者自己跑的指令
Rule: 給可直接複製的整行（絕對路徑已展開），並說在哪裡跑；不要只給路徑和參數說明。
Evidence: tui-retro retro-report §4 L1：只給路徑和參數，使用者回「我不知道怎下指令」。
Status: proposed

## 2026-10-01 | scope: operator | trigger: 對使用者提到內部項目
Rule: 不用內部代號（P7、F1、Q-4）當主語；先說它是什麼、在畫面哪裡，代號放括號。
Evidence: tui-retro retro-report §4 L2：使用者回「這啥」。
Status: proposed

## 2026-10-01 | scope: search | trigger: 使用者限定了要看的範圍
Rule: 先找能回答問題的最小來源，留在使用者給的範圍內；不要擴張到整台機器的 session 紀錄。
Evidence: tui-retro retro-report §2 A6：掃了整台遠端的 Claude/Codex workflow 紀錄，使用者喊停「掃 git repo .workflow 就好」。
Status: proposed

## 2026-10-01 | scope: live-truth | trigger: 使用者說工作在某台機器做的
Rule: 那是 lead，不是事實；先在每台候選機器找 run dir（`.workflow/`）再下結論。
Evidence: tui-retro retro-report §4 L4：run dir 在本機，不在使用者說的那台。
Status: proposed

## 2026-10-03 | scope: hooks | trigger: hook 或 wrapper 要執行另一支 script
Rule: macOS 上不要讓 `#!` script 再直接執行另一支 `#!` script；每一層都寫 `bash <file>`（或 `exec bash <file>`），只留一層 shebang。
Evidence: `data.kalloc.1024[raw]` 達 8,289,979K，每分鐘約 +2.9 MB，只有重開機能釋放；每次工具呼叫都會走 `claude-only.sh` → hook、`fleet-*.sh` → `cursor-adapt.sh` → hook、`agy-adapt.sh` → hook。機制見 Claude Code #66020、#44824 與 Photon 的重現。修正在 cd166b9；這台（macOS 15.6）的 leak 速度是否下降：UNCONFIRMED，待 sudo `zprint` 量測。
Status: proposed

## 2026-10-03 | scope: hooks | trigger: 註冊 hook 指令，或 hook 內呼叫外部工具
Rule: 補充上一條：污染沿程序樹往下傳。只要祖先曾由 `#!` 啟動（cursor-agent 本身就是 bash script；由 agent-tmux 啟動的 tmux server 也算），後代每次 `#!` exec 都會漏。所以 hook 的註冊指令本身就要寫 `bash <file>`；hook 內也不要呼叫屬於 `#!` script 的工具（pyenv shim 的 `python3`、macOS 的 `shasum` 是 perl），改用 binary（`/usr/bin/python3`、`sha256sum`）。
Evidence: zprint 實測，每組 1500 次：zsh script → node → leaf.sh +1505K；未污染 shell → node → leaf.sh +144K；script 啟動的 tmux 底下 +1568K，對照 +89K。Cursor hook 在污染環境下每 300 次 +4758K，改用 /usr/bin/python3 後 +229K（對照 +91K）。修正在 b58e4f5、3b83d96。
Status: proposed

## 2026-10-07 | scope: tooling | trigger: 一個工具做不到，我就說「沒有任何指令做得到」，被使用者糾正多次
Rule: 說「沒有指令」之前，先列出已安裝與可裝的同類工具（devicectl、agent-device、libimobiledevice、pymobiledevice3…），逐一在實機上跑 `--help` 或唯讀指令；使用者說「直接送出」是要我找工具，不是重跑同一個失敗的指令。
Evidence: iPhone 8 設 AX5：devicectl、agent-device 都做不到，但 `pymobiledevice3 developer accessibility settings show` 實測讀得到 DYNAMIC_TYPE；我先說「只剩 Inspector」，還讓 worker 反覆開 Inspector 打斷使用者的 Mac。
Status: proposed
