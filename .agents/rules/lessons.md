# Lessons — 活案工作集（append-only；format per rules/maintenance.md §3 — NON-NORMATIVE）

只留「尚未處置完的活案」。條目畢業（折入 rules/kernel/skill/hook 的核准 commit）即刪；
歷史在 git log（2026-08-08 W32 清算：48 條 → 折入 judgment-rubrics §2/§4/§5、
model-dispatch §3/§4、maintenance §5、harness-diagnosis 信任層之後，餘下如下）。

## 2026-08-14 | scope: retry-doctrine | trigger: W33 retro——App→FIG 迴圈已有 fresh 根因證據（builder source 缺失、Auto Layout 1.88% vs 95%）仍被三輪 session 重跑，燒 ~1.4B tokens 零進度
Rule: 已有 fresh 證據證明某路徑不可行時，重跑同路徑前必須先推翻該證據；否則直接 BLOCK 上報缺口（缺的是外部依賴，不是 compute）。落點：judgment-rubrics §3（retry）。
Status: proposed   # 使用者 2026-08-14 裁決通過，待折入

## 2026-08-14 | scope: delegation-budget | trigger: W33 retro——兩個 userMsgs=0 的 codex worker 各燒 ~200M tokens 無人止損；kernel「unattended loops 先問」存在但 delegation brief 沒帶進去
Rule: delegated worker brief（GOAL/ACCEPTANCE/REPORT）必帶預算欄：token/輪數上限＋「連續 N 輪 gate 不過即停並上報」。落點：delegation-templates ＋ model-dispatch。
Status: proposed   # 使用者 2026-08-14 裁決通過，待折入

## 2026-08-14 | scope: handoff-format | trigger: W33 retro——blocked handoff 未帶「已證明不可行的路徑」，後繼 session 把前人結論當 lead 重驗三輪
Rule: blocked handoff 必填「已燒成本＋已排除路徑（含證據指標）」節；後繼 session 禁止重驗未被推翻的已排除路徑。落點：session-handoff 格式。
Status: proposed   # 使用者 2026-08-14 裁決通過，待折入

## 2026-08-18 | scope: execution | trigger: session handed a project-answerable question back to the user (iOS fastlane env drift) instead of searching the repo
Rule: before asking the user anything, exhaust the project's own record — sibling/platform implementations, `*.example` files, the lane/script that owns the value, docs/, CI config, and `git log` for the touched key; only a genuine preference (cost, risk appetite, priority) may go to the user, and the question must state what was already searched.
Status: proposed

## 2026-08-19 | scope: harness | trigger: worker completed the task but result.json stayed non-terminal — the injected contract never reached the pane, while both "injected" sentinels were written
Rule: never write a completion marker you have not verified; if you cannot verify, leave it unmarked. A sentinel that records intent (the paste command was issued) instead of arrival (the text is visible in the pane) converts a transport miss into a permanent silent failure, because `*_should_inject` is sentinel-gated and skips forever after.
Evidence: remote `agy-cli-blindagy2` (launch_id blindagy2-20260819T035147Z-9fe4, .44) answered all nine questions and went idle. `tmux capture-pane -p -J -S -` over the FULL scrollback contains neither `Write final JSON to this exact path:` nor `Ignore any project-local agent instructions` — yet `.result-path-injected` and `scope-guard-injected` both exist (0 bytes). audit.jsonl shows two `send.multiline` with enter_count 1; only sha256 is stored, so the wrapper cannot prove what landed. agent-tmux :5238-5252 verifies prompt arrival by nonce echo, then marks the injection sentinels 14 lines later with no verification at all.
Same pattern, three places: the injection sentinel (:2461), the retired `status:"success"` result seed (#317, now `pending`), and `launch_envelope_inline_block` (assumes the shell reaches statement 2).
Status: proposed

## 2026-08-19 | scope: maintenance | trigger: a full session of diagnosis produced zero artifacts because the session invented an approval gate that the §1 matrix does not impose
Rule: read the §1 row before claiming a gate. `rules/lessons.md` is "append entries freely"; only deletions/rewrites and proposed→adopted need approval. Where a diff IS required, producing the diff is the session's own first step — never substitute "shall I open the diff?" for the diff. A turn that identifies something worth recording must contain the record or the diff, not an offer of one.
Evidence: 2026-08-19 session 37839e4b. Confirmed the injection-delivery defect above, overturned two of its own wrong diagnoses, and designed three mechanisms; `git log --since='2026-08-19 00:00'` = 0 commits, repo files modified = 0, CC file-history = empty. Offered to open a lessons.md diff three times across the session while the matrix already permitted a direct append. Deploy therefore shipped the previous night's tree; the user caught it, not the session.
Status: proposed

## 2026-08-20 | scope: execution | trigger: a rules claim about SendMessage matching semantics was sourced from `strings -a` on the CLI binary and turned out to be false
Rule: a string constant found in a binary proves only that the string EXISTS; it never proves how the program uses it. `strings`/`grep` over a compiled artifact cannot read control flow, so any claim about BEHAVIOUR (matching semantics, precedence, validation) must be settled by running the operation, not by reading the binary. Reading the binary is not "closer to the source" than reading a schema — both are static, and neither is behavioural evidence.
Evidence: `session-titles.md:10-12` asserted "SendMessage({to}) matches against the title, start-anchored, so a UNIQUE PREFIX delivers just like an exact match (verified against CLI 2.1.237)". That "verification" was `strings -a` output. Live four-cell probe across two machines and two targets (sessions d0f81d85 and 37839e4b, CLI 2.1.237): prefix → refused; prefix + ref → refused; full name + ref → delivered; full name without ref → delivered. Semantics are exact full-name match; ref is harmless, not required. Cost of the wrong method: three failed SendMessage calls plus a committed rule that could not work.
Corollary, same day, both hosts: the `to` schema `^[\s\S]{0,300}$` is real and inclusive — 300 characters clears validation and fails later at resolution, 361 is refused as `InputValidationError` at the tool boundary without ever reaching resolution. So failures come in three layers, and the layer names the next move: schema (your string is malformed — do not go looking at ListAgents), resolution (`is named … exactly` = found but under-specified, `is not reachable` = nothing matched), delivery. Reading the schema gave the number; only running it gave the boundary and the layering.
Method note: the cap was probed with a deliberately nonexistent 300-character recipient. A real target would have delivered and hidden the validation layer under a success — when testing a boundary, pick a target that cannot succeed.
Status: proposed

## 2026-08-20 | scope: harness | trigger: two sessions spent several rounds designing a "stable address" inside the session title while the protocol was already handing them a stable address in every message envelope
Rule: when a protocol delivers an identifier to you, test that identifier as an address before designing one. A cross-session message arrives with `from="bridge:session_<bridgeSessionId>"`; that value delivers as `to` verbatim, does not change with status/outcome/title, and is not one-shot like ` [ref]`. The session TITLE is therefore not an address and must not be engineered into one — titles are for humans. The machine address is derivable on demand: `jq -r 'select(.sessionId==env.CLAUDE_CODE_SESSION_ID) | "session_" + (.bridgeSessionId|sub("^session_";""))' ~/.claude/sessions/*.json`.
Evidence: probe from d0f81d85 with `to: bridge:session_016dsMjMi8f5WzHF6hivZfi1` (the raw `from` attribute of the peer's message) returned success with no name-resolution warning; the reverse direction had already succeeded earlier in the same exchange. This dissolves — rather than trades off — the conflict that a status-bearing title cannot also be a stable address: the two live in different namespaces. Consequences for `.agents/rules/session-titles.md`: the prefix-delivery claim (:10-12) is falsified, "address a peer by the `<host>-<sid8>` head alone" (:16) cannot work, "the title is also the cross-session address" (:10) is the false premise under the whole section, and the 200-char cap's stated rationale (:19-21) evaporates — any real cap belongs to SendMessage's `to`, not to the title. The `<host>-<sid8>` format may still earn its place as a human-scannable machine marker, but it carries no delivery role.
Related: the same session's earlier rename defect (9d3703d) and this one share one shape — a snapshot quoted from history was treated as the live record. Both had a live source available at the time.
Status: proposed

## 2026-08-20 | scope: harness | trigger: an error message's suggestion was read as advice it did not give
Rule: when a tool's error message suggests a fix, re-read what it literally prints before acting. `SendMessage` answers a prefix `to` with `No agent is named 'X' exactly. Re-send with the ref to confirm you mean: <FULL NAME> [ref]` — it prints the full name and the ref on one line, which reads as "add a ref to your prefix". Retrying as prefix + ref fails with a different error (`is not reachable`), so the misread costs a whole round trip. Two distinct failure modes exist: the target was resolved but needs confirming, versus it was never resolved.
Evidence: 2026-08-20, both hosts, five-cell delivery test. Prefix and prefix+ref both fail; exact full name (with or without ref) and `bridge:<bridgeSessionId>` both deliver. Verbatim errors in sessions 37839e4b / d0f81d85.
Status: proposed

## 2026-08-20 | scope: tools | trigger: a handoff passed its own validator while failing the repo's public-safety check — the two judge the same string by opposite criteria
Rule: knowing what a validator does NOT check is part of trusting its PASS. `session-handoff`'s `validate_handoff.py` has no secrets/privacy check at all: its only path logic is `check_file_references()`, which extracts paths from the body and records them as valid when the file EXISTS — so an absolute home-directory path is scored as a good reference, and the more real it is the more surely it passes. `check-rules-invariants.mjs`'s `public-sensitive-literals` forbids exactly that string. One tool rewards a resolvable path, the other forbids a leakable one; a PASS from the first is not evidence about the second.
Second defect, same file: the checker prints only the FIRST match per file, so fixing it and re-running surfaces a different literal and invites the wrong conclusion that the first diagnosis was mistaken. Here line 5 (`- Project: <absolute home path>`) was the real first hit; after redacting it, three Tailscale IPs (lines 33/87/173) appeared, and this session wrongly concluded the home path had never been a hit. A checker that reports one finding at a time reads as "that was the problem" rather than "that was the first problem".
Evidence: 2026-08-20, `.claude/handoffs/2026-08-20-122706-session-title-as-address.md`. Both classes redacted (`~/git/agent-scripts`, `<peer-host>`/`<this-host>`); the cell then passed. Peer session 37839e4b quoted the original first line verbatim, which is how the misattribution was caught. Verbatim originals: `ops/evidence/2026-08-20-sensitive-literals-handoff.md` (outside the checker's pathspec).
Status: proposed

## 2026-08-20 | scope: execution | trigger: two `deploy exit=0` runs left the just-edited file stale in `~/.agents/rules/`, while the script's own `PASS [rules] 0 diff` passed both times
Status: proposed
`scripts/deploy.sh` deploys `origin/main`, NOT the working tree: `resolve_release()` takes the SHA from `git ls-remote <url> refs/heads/main`, `download_release()` extracts that tarball to a scratch dir, and every layer copies from `$SRC` (deploy.sh:36-48, 80). So an uncommitted or unpushed edit CANNOT reach runtime, and the deploy still exits 0. Its internal `diff -rq ~/.agents/rules/ "$SRC/.agents/rules/"` (deploy.sh:81) compares runtime against that same downloaded tree, so it passes by construction and can never detect the gap. Both observed drifts were edit-then-deploy-before-push; two deploys on the already-pushed tree at `58a7251` were IN_SYNC, consistent with this and not with a race. Correct order is commit, push, deploy, then an external `diff -rq` against the working tree. This also falsifies two guesses made from memory in the same session — mine, that deploy copies the working tree, and the peer's, that it reads the current working directory.

## 2026-08-20 | scope: harness | trigger: `CLAUDE_CODE_SESSION_ID` was carried as UNCONFIRMED across resume/compaction, leaving the title's `sid8` field unverifiable
Rule: measured across two compactions of one session — the env value held and still matched its live `~/.claude/sessions/*.json` `.sessionId`, so a title's `sid8` needs no compaction exception.
Status: proposed
## 2026-08-21 | scope: execution | trigger: 議程寫 `--days 7`、機隊三台，本場 retro 跑了 14d 且只跑一台，被使用者連兩次點名
Rule: 有議程／契約的流程，開場先把該文件的可判定參數（窗口、機隊、必收清單、輸出格式）抄成 run dir 的 checklist 並逐項打勾；缺一項不得進裁決節。「讀過議程」不等於執行議程。
Evidence: 2026-08-21 session 9e024f84。retro-agenda §Layer1 明寫 `--days 7` 與「機隊每台都要收」；本場首跑 14d、僅本機，遠端兩台在被點名後才補（mbpr 191 場、mac-mini 0 場）。
Status: proposed

## 2026-08-21 | scope: execution | trigger: 使用者要 session 使用情形分析，我回報 md5、版本號、clone 與 npm 狀態
Rule: 「量測基礎設施能不能跑」不是分析結果。體驗分析段只能出現分機 × 分桶的使用情形與收斂訊號；工具鏈狀態屬 §5／§8，工具修好本身不構成進度回報。
Evidence: 2026-08-21 session 9e024f84，使用者原話「你回報狗屁機器狀況幹嘛」。
Status: proposed

## 2026-08-21 | scope: tools | trigger: `ctx_fetch_and_index` 抓 SPA 得到 0.1KB 外殼，隨即對使用者宣告「卡住」
Rule: 宣告 blocked 前，先確認用的是該工具文件指定的那一個。`ctx_fetch_and_index` 自身文件寫明 WHEN NOT: SPA-rendered page；需要登入態或動態頁時的正解是 `ctx_execute`。工具選錯造成的失敗不是 blocker。
Evidence: 2026-08-21 session 9e024f84，artifact read-back。改用 `ctx_execute` 後兩條 API 路徑皆回空 body，兩次即停。
Status: proposed

## 2026-08-21 | scope: measurement | trigger: 同一輪 retro 內兩次先下結論、後被證據打回（關鍵詞全檔 grep 高估糾正；依 session 起始時間分桶讓長場全落 before）
Rule: 指標拿去比較前先問兩件事——分子是否只含目標主體（糾正只能取 `type=="user"` 純文字，全檔 grep 會把 agent 自述算進去），以及分桶依據是否與被比較的變數共變（依起始時間分桶時長場必然落在較早的桶，「早期摩擦高」是分桶造出來的）。跨切點長場一律用事件時間逐筆歸類。
Evidence: 2026-08-21。第一版結論「新版沒改善、after 每百輪 34.59」作廢，正確值本機 3.29 → 1.70；本機糾正實為 16 次而非 191 次。橫跨切點證據：mbpr 37839e4b first 08-14T07:44Z last 08-20T07:57Z、is_error before 26 / after 9。第二個缺陷由 .62 peer 指出。
Status: proposed

## 2026-08-21 | scope: maintenance | trigger: `maintenance §1` 的 diff-then-approve 被當成反覆要許可的藉口，一場 session 問到零產出；本場 retro 同樣問了三次
Rule: diff-then-approve 是一次性動作：把 exact diff 寫成檔案、講一次、繼續做其他不需核准的工作；同一個許可不得重問，等待核准期間不得停下全部進度。
Evidence: 2026-08-21。遠端 37839e4b 行 5739「『要我開 diff 嗎』…把一回合的手續拖成一整天零產出」；本場 9e024f84 三次重問 lessons diff。
Status: proposed

## 2026-08-21 | scope: measurement | trigger: Codex 側 68 場 turns=0 但 total>1M 的高消耗 session，現有 canary／糾正／done-claim 指標全數抓不到
Rule: 成本面必須有一條「無人參與」的偵測軸：turns=0 且 total>1M 即列可疑名單。Codex 每輪 3.5M 是 Claude 1.27M 的 2.8 倍，且其 `cache_write_input_tokens` 三機全為 0 而 cached_input 佔 96.7%（UNCONFIRMED 為回報缺漏或行為本身）。
Evidence: 2026-08-21 三機掃描（本機 11 筆、mbpr 57 筆、mac-mini 0 筆；單場最大 82.5M）。Codex 158 場中 116 場（73%）位於 archived_sessions，不掃封存即漏四分之三。
Status: proposed

## 2026-08-25 | scope: judgment | trigger: 看到 worker `status: pending` 就對使用者宣告「卡住、30 分鐘沒交件」，實際上該 worker 已完成 11 檔 +169/−63、analyze 乾淨、463 tests passed
Rule: §2 是單向閘——整份 checklist 只管「宣告完成」，反向宣告（卡住／失敗／缺失／未實作／沒回報）沒有對稱門檻，而反向宣告才是觸發 re-dispatch、revert、重寫這些昂貴且破壞性動作的那一種。所以：宣告任何負面狀態前，證據門檻與宣告完成相同，且必須先排除「訊號缺席」這個解釋——「我沒收到回報」不等於「它沒做事」。§2 現有的 delegated-worker box 是這條的實例，不是特例。
Evidence: 2026-08-25 session 367ba284 稽核 session c42d1927。我僅憑 `agent-tmux agy result` 的 `status: pending` 一個訊號下結論，並在該前提上疊了一整段「supervision proxy 是壞的」的結構性批判。推翻證據是 `git diff --stat`（11 檔 +169/−63、mtime 10:42:56–10:47:24）與 `agent-tmux agy capture`（pane 有完整交付報告、`flutter analyze` No issues、`flutter test test/reward` 463 passed、完成標記 MARK-aa7756），兩個指令我一個都沒下就先講了。真正的缺陷是 worker 從未寫 result.json，`wait-required` 因此無法區分「還在做」與「做完但沒寫檔」。附帶：依 §2 同一個 box，pane PASS 而無有效 result.json 時該 worker 狀態仍應標 `UNCONFIRMED`，我第二輪的翻案（「它已經做完了」）同樣超標。
Related: 2026-08-21 scope:tools 條（`ctx_fetch_and_index` 抓 SPA 得 0.1KB 隨即宣告「卡住」）是同一類的第一次；本條為第二次，兩次都是「訊號缺席 → 負面斷言」。依 maintenance §1 (a)(c)，機制化強制已具備核准資格。
Status: proposed
Deferred: `global/kernel-lean.md` 的同步 trigger 詞表未改——該檔現為 4990/5000 字元，最小可用增補 13 字元即破 MUST 上限。lean 版需先有一筆獨立的裁減決定。

## 2026-08-26 | scope: context-mode | trigger: Cursor CLI 的 ctx_doctor 在 mcp.json / plugin.json 已 pin CONTEXT_MODE_DIR 後仍報 ~/.gemini store (default)
Rule: Cursor CLI 不把 mcpServers.env 傳進 MCP child；live server 是 plugin MCP 不是 ~/.cursor/mcp.json。要共用 Claude store，DIR 必須在啟動 command（wrapper）裡，不能只寫 JSON env。
Status: proposed

## 2026-08-26 | scope: harness | trigger: 另一台自有主機（.44）三場被使用者稱「失智」的 session（421d／e58c／510a）各 compact 3／4／1 次，510a 在 16:16 compact 的同一分鐘就丟掉「uat = staging」指令；當天 ~3400 個 hook 事件 deny=0，接線的 gate 一個都沒觸發
Rule: compaction summary 是有損改寫，使用者原話是最先丟的東西；kernel 寫的「compaction 後先 `ctx_search(sort:"timeline")`」實測救不回——context-mode 只索引 turn_end 的 assistant 訊息與 CLAUDE.md，不索引 user prompt（本場查「outputStyle Concise」零結果）。可靠來源是磁碟上的 transcript jsonl，它逐字保留且不受 compaction 影響。另：✅ 標題是完成宣告，應受 §2 同一門檻約束，但 sentinel 只做週期性提醒，不看證據。
Evidence: 本場 197fabb7 對 .44 host 14 場 transcript 的統計（frustration 關鍵詞 vs isCompactSummary 時間戳），與 `ctx_search` 空結果；機制化：`.agents/hooks/compaction-recall.sh`（SessionStart matcher compact，重注入最後 20 條原話、≥3 次 compact 升級 handoff）與 `session-title-sentinel.sh` 的 ✅-無證據單次 block，均有 smoke 覆蓋。
Status: proposed
Deferred: `global/CLAUDE.md` §Tools 的 ctx_search 句未改（byte ratchet + maintenance 流程），待本條核准後一併修。

## 2026-08-26 | scope: layers | trigger: Cursor tmux 支援被當成本 repo 的設定檢查，沒先對 layer
Rule: `cursor.conf` / `agent-tmux` binary 屬 `ohyeh/tmux-agent-tools`；本 repo 只接 Cursor fleet hooks adapter 與 `tmux-assign-host-gate` 是否掛上。跨層題先對齊 sibling，不在 agent-scripts 寫第二份 profile。
Status: proposed

## 2026-08-28 | scope: tools | trigger: codex thread 01a045ef 用 10 次 1 秒 wait 輪詢一個測試跑完，使用者質疑「一樣的情況 claude 就很有效率」
Rule: 等待要外部化。yield 語意的 runtime（Codex `exec_command`）裡，**啟動時的 `yield_time_ms` 就是在預約輪詢鏈**——給 1 秒等於保證還要再回來一次，而每次回來都重送整個 context。長命令的 `yield_time_ms` 直接給預期耗時（實測 600000 可用），長工作走 `agent-tmux <cli> result wait-required --wait N` 阻塞在單一 process；真正需要續等時才 `wait`，30s 起、×2、上限 300s。kernel §Execution 現有的「Delegated long waits: blocking/event-driven, never fixed polling」只射到派工，射不到 exec 啟動參數，是規則缺口不是違規。
Evidence: 08-20 起 codex 132 場：`yield_time_ms=1000` 有 **1206 次在 exec 啟動、只有 48 次在 wait**；wait 共 617 次／372.4 分鐘（平均 36s）、waits per exec 0.029——瓶頸在啟動 yield 不在退避曲線。對照 claude 392 場：**背景啟動 153 次、BashOutput 輪詢 0 次**，最長 timeout 3,650,000ms；差距來自 harness 事件驅動而非模型自律。Codex 有 9 個 hook（permission_request／post_tool_use／pre_compact／pre_tool_use／session_end／session_start／stop／subagent_start／user_prompt_submit），**0 個能在 yield 後 re-invoke**；`notify` 只在 turn-ended 觸發且單向。
Related: 查 hook 能力時我先只看 `~/.codex/hooks/` 的三個檔就斷言「只有 session_start/stop」，被斷言測出 FAIL；真相在 `config.toml` 的 `[hooks.state]`。與 2026-08-21／08-25 兩條同屬「取樣面太窄 → 過早斷言」，但這次方向相反：不是訊號缺席，是**看到部分就當看完**。
Status: proposed


## 2026-08-28 | scope: measurement | trigger: retro 指標「done-w/o-evidence」連三輪 95→97→96 不動，被當成行為常數
Rule: 一個指標三輪不動，先懷疑量尺再懷疑行為。改口徑重測（同窗口、同資料）是第一步，不是加規則。
Evidence: collector 要求 evidence 與 claim 在同一 jsonl 行；改為 assistant text + 前 6 行 lookback 後本機 7d 由 96.9%（31/32）降到 63%（17/27）；嚴格口徑（中文完成語＋PASS/DEPLOY OK/md5）只剩 3/58。corr 全文關鍵詞七場重算 175→0、53→4、24→2、23→1、17→1、22→0。
Related: claim-evidence gate 08-27 落地後指標未動，因此被誤讀為「gate 無效」。
Status: proposed

## 2026-08-28 | scope: deploy | trigger: 另一 session 的 handoff 說「skill 已部署、deploy 全綠」，本機 `~/.agents/skills` 沒有該 skill；bol gate 的 block 版本機 08-27 生效、MBP-14 到 08-28 才拿到
Rule: 部署驗證要寫主機名；一台 PASS 不是艦隊 PASS。跨機比較指標前先對 `deploy-log.jsonl` 確認兩機版本相同，不同就標「不可比」。
Evidence: MBP-14 7d bol stats 34 個 fail 全為 `blocked=na`（舊 warn 版），本機同期 `blocked=true` 5 筆；`fleet-deploy.sh` 原本把 deploy 輸出丟 `/dev/null`。
Status: proposed

## 2026-08-28 | scope: judgment | trigger: 同一 session 內同一被擋操作重送：tmux-assign-host-gate ×2（c42d1927）、Stop gate ×4（fc159339）、SendMessage 同錯 ×2（9e024f84）、同一不存在路徑 cd ×2（421d7ec0）
Rule: 同一錯誤訊息第二次出現前必須換策略或查 schema；被 gate BLOCKED 的呼叫不得原樣重送。
Evidence: 7 場 Layer 2 中 5 場出現；上輪 N2 列 P0 但無程式碼，本輪落地 `deny-replay-gate.sh`（PreToolUse，指紋＝tool+sorted input sha）。
Status: proposed

## 2026-08-28 | scope: ux | trigger: 8 次真實糾正中 6 次是「改對了東西、改錯了範圍」：品牌⇄商品列表、Toast⇄版型、視覺細節⇄wireframe、全命令⇄專測登入
Rule: 改 UI 或範圍類請求前，用一句話覆誦「要改的元件與範圍」再動手；請求指向一類東西時等回覆。
Evidence: e58cb016 ×4（L1844/1936/2164/3107）、421d7ec0 ×2（L3283/3700）；邏輯與工具皆對，位置錯。
Status: proposed
