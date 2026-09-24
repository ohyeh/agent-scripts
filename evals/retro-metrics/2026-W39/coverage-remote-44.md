# W39 覆蓋稽核：remote-44

- 窗口：2026-09-17T12:00Z → 2026-09-24T12:00Z（對照組 W38：2026-09-10T12:00Z → 2026-09-17T12:00Z）
- 稽核時間：2026-09-24 約 12:30–12:45Z，全程 ssh 唯讀（`bash -l`，並直接檢查 `~/.local/bin`、`/opt/homebrew/bin`）
- 讀取方式：jsonl 直接解析；sqlite 以 tar 串流讀回稽核機，**含 `-wal` 一起讀**（見 §4 C1：`immutable=1` 會跳過 WAL）；遠端未留下任何檔案
- 比對來源：`2026-W39.json` `.machines["remote-44"]` 與 `.gaps`

## 1. 逐 CLI / App 覆蓋表

| CLI / App | Store（相對 home） | 窗口 sessions | messages | tokens | W39.json 值 | match | 原因 / 證據 | driver |
|---|---|---|---|---|---|---|---|---|
| claude 2.1.275 | `.claude/projects/**/*.jsonl` | 7 有 user 訊息的 top-level session（另有 1 檔無 sessionId、0 user/0 assistant）；subagent 1 | 8 則 user text；assistant rows 315（去重前）；另有約 9 則 `origin.kind=peer` bridge 訊息 | output 325,841（去重前）/ cache_read 48.3M（去重前） | 7 sessions / 7 turns / 186 api_calls / output 163,360 | yes（sessions）；turns 口徑偏低 | 所有 assistant row 都在 09-17 15:55–17:40Z。09-18 起只剩 5 筆 `frame-link` 維護 row（09-18..09-23），沒有 turn。W38 對照：74 個 top-level session、5,049 assistant rows。collector 不把 peer 訊息算成 turn | 長壽命的 `claude` 行程（09-17T10:00Z 起跑，至今仍閒置存活），由另一台機器的 bridge peer session 遠端下指令（W38 retro 收尾）；其餘 6 個 session 是同時段 1 則 prompt 的 worker |
| codex | `.codex/sessions/**/rollout-*.jsonl` + `.codex/state_5.sqlite`（含 WAL）+ `.codex/history.jsonl` | 1 thread（`01a0b054`，09-17T17:05–17:07Z） | 2 則 user-role（注入的 context）、1 則 history prompt | 0 — 唯一的 `token_count` 事件 `info=null`；state `tokens_used=0`、`has_user_event=0` | sessions 0 / turns 1 / total 0；cmli 1 | yes（tokens 0 為真）；sessions 0 vs 1 為口徑差 | 對照：W38 在 state+WAL 有 18 thread、34.2M tokens_used。若用 `immutable=1` 讀 state_5，W39 thread 會消失（它只在 WAL 內） | Claude retro session 在 17:05Z 以 `agent-tmux codex` 派出 `w38-review` worker，17:09Z 在模型回應前就 stop 掉 → 0 token |
| agy 1.2.5（Antigravity CLI） | `.gemini/antigravity-cli/conversations/*.db`（148 個 db）+ `brain/` | 1 trajectory（`ce5a7b1e`，09-17T17:11Z 建立） | 77 steps | 無記帳 | 1 trajectory / 77 steps | yes | 對照：W38 有 19 個 trajectory、約 5,200 steps。m7 的 77 個檔 = 20 個 0-byte `-wal` + 20 個 `-shm`（reader 在 09-17T16:01Z 與 collector 在 09-24T12:17Z 碰觸）+ 25 個 `ce5a7b1e` brain 輸出 + log/updater | Claude retro session 在 17:10Z 以 `agent-tmux agy assign` 派出 `w38-review-agy`，17:16Z stop |
| cursor-agent 2026.09.15 | `.cursor/chats/<hash>/<uuid>/store.db`（28 個 chat） | 0 | 0 | 無記帳 | 0 chats | yes | 9 個「m7」檔全是 reader 產物：3 個 0-byte `store.db-wal`（09-17T16:01Z）+ 6 個 32K `store.db-shm`（09-17T16:05Z）。窗口內沒有 `store.db` 主檔被寫入。對照：W38 窗口內建立 6 個 chat（09-14..09-17T08:43Z） | 無（W39 沒有使用） |
| gemini CLI 0.47.0 | 預期 `.gemini/tmp/*/chats` — **不存在** | 0 | 0 | 無記帳 | 未收 | n/a | `.gemini/tmp` 不存在，所有時期都沒有 session 檔；`.gemini` 下的 m7 檔都屬於 agy。0 無法做 positive control → **UNCONFIRMED**（store 從未建立） | 無 |
| opencode | `.local/share/opencode/opencode.db`（含 WAL） | 0 | 0 | 未查（無使用） | 未收 | n/a（未收） | positive control：全期 228 session / 7,236 message；最後一個 session 在 2026-02-13，W38 也是 0 | 無（自 2026-02 起未使用） |
| amp | 伺服器端 thread；本機只有 `.amp`（套件）、`.cache/amp`（2 檔，最後 2026-02-12） | 0（本機） | 0 | 無記帳 | 未收 | n/a | 本機沒有 thread store，無法做 positive control → **UNCONFIRMED** | 無本機證據 |
| droid 0.39.0 | `.factory/`（8 個檔，沒有 sessions 目錄） | 0 | 0 | 無記帳 | 未收 | n/a | 兩個 m7 檔（`logs/droid-log-single.log`、`certs/system-certs-cache.json`）是 09-24T12:31–12:32Z 被寫入，也就是本次稽核跑 `droid --version` 的時間 = probe 雜訊。log 日期只有 2025-12-23、2026-09-03、2026-09-24。沒有 session store → **UNCONFIRMED** | probe（本次稽核與先前的 probe） |
| Grok Bot app 0.56.1（Electron，執行中） | `Library/Application Support/Grok Bot/sand-client-persistence/`（檔名為 base32 編碼的 key；24 個 `transcript.replicas.*` JSON blob） | 15 個對話有窗口內 entry（roster 共 28 個 bot） | 552 筆 entry：353 send-message（341 text）、134 message/user、56 message/assistant、5 event、4 attachment | 無記帳（entry 沒有 usage/token 欄位） | `"store absent"` | **no** | collector 找錯路徑，store 其實存在。每個 replica 上限 66 筆（多個剛好 66），所以數字是下限。對照：W38 有 17 個對話、390 筆。每日窗口 entry：09-17 60、18 72、19 5、20 98、21 44、22 21、23 117、24 135 | 人（send-message 經 Grok Bot client；replica 是伺服器 transcript 的同步副本，**是否在本機打字 UNCONFIRMED**）+ 伺服器端 bot 回覆 |
| Grok Bot local-exec daemon | `.grokbot/local-exec-daemon.log`、`~/terminals/*.txt` | 1 筆本機執行紀錄（09-18T23:59Z，cwd Desktop，exit 0） | n/a | n/a | 未收 | n/a | bot 可透過 gateway 在本機執行 shell。log 無時間戳：76 次 start / 73 次 SIGTERM、805 次 watch stream ConnectError、439 次 poll DeadlineExceeded。該 terminal 紀錄的指令與憑證有關，內容不寫入 | Grok Bot 遠端 agent |

其他：`claude --chrome-native-host`、Codex「ChatGPT for Chrome」extension host、`agent-browser` / `agent-device` daemon 都是常駐行程（CPU 0%），沒有 session store，不影響計數。

## 2. 判定：Claude 66→7 的下降是真的

- **這是真實的使用下降，不是量測漏洞。** Claude assistant rows / 日（全 store）：09-14 976、09-15 826、09-16 529、09-17 3,317，09-18..09-24 為 **0**。W39 的 7 個 session 全部落在 09-17 15:55–17:40Z，而且都屬於 W38 retro 收尾（由 bridge peer 遠端驅動）。
- 已排除其他漏洞：只有一個使用者目錄；只有一個 Claude config 根目錄（沒有 `.claude-*` 或 `.config/claude*`）；沒有 crontab；LaunchAgents 裡沒有 agent 排程；W38 對照用相同查詢得到 74 個 session。
- 使用量**移到了 Grok Bot app**：W39 有 552 筆以上 entry、15 個對話，Grok Bot app 從 09-17T22:01Z 起常駐。collector 回報「store absent」，所以這部分完全沒有被量到。
- Codex 0 token、agy 1 trajectory 是真的：兩者都是 09-17T17:05–17:16Z retro session 派出後很快 stop 的 review worker。

## 3. 判定：cursor 9 個檔 vs 0 chats

- **collector 的 0 是對的。** 那 9 個檔是 SQLite 的附屬檔被 reader 碰觸（09-17T16:01/16:05Z，也就是 W38 retro probe 的時間）：3 個 `-wal` 是 0 byte，6 個 `-shm` 是 32K。窗口內沒有任何 `store.db` 主檔被修改。用 mtime 找檔案的 probe 會把 reader 痕跡誤判成活動。
- 附帶發現：`cursor-agent --version` 透過 ssh 執行時失敗，錯誤是「macOS login keychain is locked」。這就是 W39.json gap 中「cursor_agent --version 空」的原因（不是移除）。實際版本 2026.09.15 仍然安裝著。

## 4. 負載 ~2.7–3.0 的來源

- 稽核時 `vm.loadavg` = 3.04，10 核心（約 30%）。`top` 取樣：WindowServer 22%、Grok Bot Helper renderer 18% + GPU 16%、loginwindow 16%、TrendMicro iCoreService/iCoreSecurity 約 12%（`ps` 長期平均高達 45%）、Tailscale network extension 約 15%（`ps`）、trustd。
- **沒有任何 agent CLI 在耗 CPU**：閒置的 claude 行程 1.4%，其他都約 0%。負載來自持續渲染的 Grok Bot Electron UI、登入視窗/WindowServer，以及端點安全軟體（TrendMicro）。

## 5. 其他觀察

- Tailscale：在本機自己的 `tailscale status` 裡，本節點顯示「offline」，但透過它的 tailnet 位址 ssh 可以通。這表示 data plane 正常，但和 coordination server 的連線中斷（UNCONFIRMED 原因）。同時 Grok daemon log 有大量 ConnectError/ETIMEDOUT/ENETUNREACH，機器上還有 TrendMicro 與 AdGuard 的 network extension 在過濾流量，可能有關（UNCONFIRMED）。
- cli_versions「降版」是 PATH 問題：login shell 先解析到 `/opt/homebrew/bin/codex` 0.144.3，但實際使用的是 `~/.local/bin/codex` → standalone 0.154.0（rollout `cli_version` 0.154.0）。node 只有 v26.8.2 一份。

## 6. 需要的 collector 修改（每條一行）

- C1：所有 sqlite 讀取改用 `mode=ro`（或先 copy db+`-wal` 再讀），不要用 `immutable=1`；否則 WAL 內的 thread 會遺失（codex state_5 的 W39 thread 只在 WAL 內）。
- C2：新增 Grok Bot collector：讀 `Library/Application Support/Grok Bot/sand-client-persistence/` 中 base32 key 為 `*.transcript.replicas.*` 的 blob，依 `timestampMs` 計數，並標注「replica 上限 66 筆 = 下限」。
- C3：Grok Bot local-exec：計數 `~/terminals/*.txt` 的 `started_at`，以及 `.grokbot/local-exec-daemon.log` 的 start/SIGTERM/error 次數（只計數，不讀指令內容）。
- C4：Claude turns 要另外計 `origin.kind=peer`（bridge 遠端驅動）的訊息，與 human turns 分開，避免遠端驅動的 session 被算成 1 turn。
- C5：probe 的「m7 檔案數」要排除 `-wal`/`-shm` 與 0-byte 檔，並排除 probe 自己寫入的檔（droid log/certs）；改用 store 內的時間戳，不用 mtime。
- C6：cli_versions 對每個 binary 列出所有候選路徑（`which -a` + `~/.local/bin` + `/opt/homebrew/bin`），並取實際 rollout/transcript 記錄的版本為準。
- C7：`cursor-agent --version` 失敗時要記錄錯誤類別（keychain locked），不要輸出空字串；版本改從 `~/.local/share/cursor-agent/versions/` 讀。
- C8：gemini CLI / amp / droid 在 store 不存在時輸出 `store absent`（附檢查的路徑），不要輸出 0，並在 retro 表中標為 UNCONFIRMED。
- C9：probe 要記錄 Tailscale 自身節點的狀態，並在 ssh 可達但 tailnet 顯示 offline 時列為 gap。
