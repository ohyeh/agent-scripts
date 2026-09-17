# Next-week backlog — from 2026-W38 retro

> **編號說明**：W36 用 X1–X8，W37 用 Y1–Y7＋2 追加。本週初稿誤接 X 序列（X9–X19），09-18 統一改為 **Z1–Z11**（Z1=原 X9 … Z11=原 X19），report／reconciliation／W38.json 同步替換。下週序列請用 W 之後的下一字母或直接 `W39-1…`，不再回頭接舊字母。

（原句「編號延續 W37 X1–X8」有誤，X1–X8 為 W36；見上方編號說明。）每條對應 report 的 F（finding）/ G（gap）/ L2（Layer 2）。
狀態：`open` | `decision`（待 Paul）| `done`。下次 retro 逐條評「有效／無效」。

| # | 項目 | 對應 | 驗收 | 狀態 |
|---|---|---|---|---|
| Z1 | **evidence matcher 擴充**：cmli `agent-sessions` 與 `~/.agents/hooks/claim-evidence-gate.sh` 同一組正則，補 `All tests passed`、`\d+ pass(?:ed)?`、`\| PASS \|` 表格格、`SMOKE_BOOT: PASS`、`Invariant checks passed`、`UNCONFIRMED` 視為誠實非違規；PASS/done 出現在引文或 JSON 欄位名不計 | F3、L2（51/56 誤判） | 對 W38 `layer2.json` 72 筆重跑，M 類 ≤ 10 筆；collector done-無證據率落到 ≤ 15% | open |
| Z2 | **tmux worker session 載 kernel？** canary 0/24、triplet 低；若載，agent-tmux profile 加 `--append-system-prompt-file ~/.claude/CLAUDE.md` 或等價；若不載，collector 把 worker 場排除在 canary 分母外 | F3、G5 | Paul 裁決；裁決後 W39 .44 canary 分母正確 | open（F3 升級，09-18） |
| Z3 | **retro 工具鏈全部入 repo**：重建機器層 `probe.py`（Stop hook 命中、deny-replay、fleet-deploy 到達數）放 `evals/retro-metrics/`；`collect.sh`（三機 dedupe×2/analyzer/codex/cmli 打包）入 repo | F9、G3 | `ls evals/retro-metrics/` 有 probe.py + collect.sh；W39 method 欄不再指向 `.workflow/` | open |
| Z4 | **艦隊落後**：grok VM 4.29→4.30；.62/.47 補 agent-scripts clone；fleet-deploy 輸出列出「缺哪幾台」 | F7 | Paul 裁決是否跑 fleet-deploy；跑後三機 `grep Version ~/.claude/CLAUDE.md` 同值 | open（F7 升級；fleet-deploy 執行未點名） |
| Z5 | **/loop idle cache break**：.62 29 筆 10 筆含 `/loop`；`ScheduleWakeup` idle 預設 1200–1800s 已在 TTL 內，需查這 10 筆實際 delay 是否 >3600 或跨多次 noop 累積 | F4 | 列出 10 筆的 delaySeconds 與 gap；若 >55 分才 break，改 loop 規則上限 | open |
| Z6 | **lessons 裁決**：46 proposed / 3 adopted；一次裁決 session，目標 proposed ≤ 30，adopted 條折入 rules 或標 rejected | F8 | `grep -c 'Status: proposed' ~/.agents/rules/lessons.md` ≤ 30 | decision（G9 折入方式 Paul 未答） |
| Z7 | **Live truth / 等待協定殘餘**：A 類 4 筆（worker idle 誤判、last_agent_message null 誤判、人在鍵盤前仍留待決、定時醒來發呆）→ 各補一條 fixture 到 `evals/fixtures/`（judgment-rubrics 負例） | L2 | 4 個 fixture JSON 過 `check-rules-invariants.mjs` | open |
| Z8 | **Layer 2 隨機對照**：下週除 flagged 場外抽 10 場未 flagged 隨機讀，估 false negative | G4 | W39 layer2.json 含 `control` 欄 | open |

W37 主題追蹤：授權外推 W37 ×3 → W38 0；等待協定缺失 W37 ×4 → W38 2（Z7）。

## 09-18 臨時動議追加（編號沿用問題見 backlog-reconciliation.md）

- Z9 tmux-agent 孤兒收養單一 owner＋opt-in＋`adopted from`（F10；落點 ohyeh/tmux-agent-tools；驗收：同 launch_id 投遞 session ≤1） — 狀態：open，09-18 升級，issue ohyeh/tmux-agent-tools#323
- Z10 tmux-agent ack 持久化＋stop 寫 ack（F11；驗收：同 launch_id 投遞 ≤1 次） — 狀態：open，先補 ack 觀測不修
- Z11 agy profile result.json pending → success；confirm-processing 改判據（F12） — 狀態：觀察
- Z12 **Claude Code mod 使用量測**（M4；Paul 09-18 起開發 plugin/hooks module）：W39 起每台機器量「裝了哪些 mod、觸發次數、投遞／攔截／失敗數」。量測方法：`probe.py` 加 `mods` 段——列 `~/.claude/plugins/` 與 mod 目錄下 manifest（名稱、版本、sha）；各 mod 若寫 `~/.local/share/agent-hooks/<mod>-stats.jsonl`（與 skill-router-nudge 同格式：timestamp、event ∈ {trigger, deliver, block, fail}），probe 用 `jsonl_window` 統計 7d 各 event 數；無 stats 檔的 mod 標「未記帳」。驗收：W39 `2026-W39.json` 每台機器有 `mods` 陣列，每個 mod 四個計數或「未記帳」；retro-agenda §5 新增「mod 使用」列（提案見 retro-report §6.5 M4，不在本 commit 改 agenda）。
