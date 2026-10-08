# Lessons — 活案工作集（append-only；format per rules/maintenance.md §3 — NON-NORMATIVE）

只留「尚未處置完的活案」。條目畢業（折入 rules/kernel/skill/hook 的核准 commit）即刪；
歷史在 git log（2026-08-08 W32 清算：48 條 → 折入 judgment-rubrics §2/§4/§5、
model-dispatch §3/§4、maintenance §5、harness-diagnosis 信任層之後，餘下如下）。
2026-10-01 W40 整併（使用者核准）：58 條 → 24 條。已折入落點的 27 條刪除，7 組同類合併；
刪除條目與落點 file:line 見該 commit 訊息，原文 `git show a8f48b9:.agents/rules/lessons.md`。
2026-10-09 W41 lessons B（使用者核准）：31 條 → 7 條。已有 gate 9、已有規則 12、一次性 3 共 24 條刪除；
分類與落點 file:line 見該 commit 訊息，原文 `git show a3992bd:.agents/rules/lessons.md`。
餘 7 條各等 backlog 列落地後刪；全部落地即刪本檔。

## 2026-08-28 | scope: tools | trigger: codex thread 01a045ef 用 10 次 1 秒 wait 輪詢一個測試跑完，使用者質疑「一樣的情況 claude 就很有效率」
Rule: 等待要外部化。yield 語意的 runtime（Codex `exec_command`）裡，**啟動時的 `yield_time_ms` 就是在預約輪詢鏈**——給 1 秒等於保證還要再回來一次，而每次回來都重送整個 context。長命令的 `yield_time_ms` 直接給預期耗時（實測 600000 可用），長工作走 `agent-tmux <cli> result wait-required --wait N` 阻塞在單一 process；真正需要續等時才 `wait`，30s 起、×2、上限 300s。kernel §Execution 現有的「Delegated long waits: blocking/event-driven, never fixed polling」只射到派工，射不到 exec 啟動參數，是規則缺口不是違規。
Evidence: 08-20 起 codex 132 場：`yield_time_ms=1000` 有 **1206 次在 exec 啟動、只有 48 次在 wait**；wait 共 617 次／372.4 分鐘（平均 36s）、waits per exec 0.029——瓶頸在啟動 yield 不在退避曲線。對照 claude 392 場：**背景啟動 153 次、BashOutput 輪詢 0 次**，最長 timeout 3,650,000ms；差距來自 harness 事件驅動而非模型自律。Codex 有 9 個 hook（permission_request／post_tool_use／pre_compact／pre_tool_use／session_end／session_start／stop／subagent_start／user_prompt_submit），**0 個能在 yield 後 re-invoke**；`notify` 只在 turn-ended 觸發且單向。
Related: 查 hook 能力時我先只看 `~/.codex/hooks/` 的三個檔就斷言「只有 session_start/stop」，被斷言測出 FAIL；真相在 `config.toml` 的 `[hooks.state]`。與 2026-08-21／08-25 兩條同屬「取樣面太窄 → 過早斷言」，但這次方向相反：不是訊號缺席，是**看到部分就當看完**。
Status: proposed

## 2026-09-03 | scope: evidence | trigger: 用 `grep ... | head -3` 取 `$?` 判定「marker 存在」，實際拿到的是 head 的 0（併同日 `bash -n` 跑 zsh 腳本條）
Rule: 任何用來當證據的 exit code 都不能穿過 pipe；`grep -c` 或不接管線再取 `$?`。既有規則只寫「harvest 呼叫不要接管線」，同一個坑在 grep 上照樣成立。檢查器必須與目標語言相符；回報語法錯誤前先確認 shebang，並用 stash 到 HEAD 重跑確認是否既有。
Evidence: `grep -n "..." f | head -3` 印不出任何行卻 `exit=0`；改 `grep -c` 得 `0` 與 `grep -c exit=1`，結論反轉。
Evidence: `bash -n agent-tmux` 報 line 2290 錯誤，`zsh -n` exit=0；stash 到 HEAD 後 bash 同樣報錯，證明與本次改動無關。
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

## 2026-10-01 | scope: operator | trigger: 交付要使用者自己跑的指令
Rule: 給可直接複製的整行（絕對路徑已展開），並說在哪裡跑；不要只給路徑和參數說明。
Evidence: tui-retro retro-report §4 L1：只給路徑和參數，使用者回「我不知道怎下指令」。
Status: proposed

## 2026-10-03 | scope: hooks | trigger: 註冊 hook 指令，或 hook 內呼叫外部工具
Rule: 補充上一條：污染沿程序樹往下傳。只要祖先曾由 `#!` 啟動（cursor-agent 本身就是 bash script；由 agent-tmux 啟動的 tmux server 也算），後代每次 `#!` exec 都會漏。所以 hook 的註冊指令本身就要寫 `bash <file>`；hook 內也不要呼叫屬於 `#!` script 的工具（pyenv shim 的 `python3`、macOS 的 `shasum` 是 perl），改用 binary（`/usr/bin/python3`、`sha256sum`）。
Evidence: zprint 實測，每組 1500 次：zsh script → node → leaf.sh +1505K；未污染 shell → node → leaf.sh +144K；script 啟動的 tmux 底下 +1568K，對照 +89K。Cursor hook 在污染環境下每 300 次 +4758K，改用 /usr/bin/python3 後 +229K（對照 +91K）。修正在 b58e4f5、3b83d96。
Status: proposed

