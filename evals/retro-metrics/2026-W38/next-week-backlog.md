# Next-week backlog — from 2026-W38 retro

編號延續 W37 X1–X8（該檔已失，見 retro-report §5 G1）。每條對應 report 的 F（finding）/ G（gap）/ L2（Layer 2）。
狀態：`open` | `decision`（待 Paul）| `done`。下次 retro 逐條評「有效／無效」。

| # | 項目 | 對應 | 驗收 | 狀態 |
|---|---|---|---|---|
| X9 | **evidence matcher 擴充**：cmli `agent-sessions` 與 `~/.agents/hooks/claim-evidence-gate.sh` 同一組正則，補 `All tests passed`、`\d+ pass(?:ed)?`、`\| PASS \|` 表格格、`SMOKE_BOOT: PASS`、`Invariant checks passed`、`UNCONFIRMED` 視為誠實非違規；PASS/done 出現在引文或 JSON 欄位名不計 | F3、L2（51/56 誤判） | 對 W38 `layer2.json` 72 筆重跑，M 類 ≤ 10 筆；collector done-無證據率落到 ≤ 15% | open |
| X10 | **tmux worker session 載 kernel？** canary 0/24、triplet 低；若載，agent-tmux profile 加 `--append-system-prompt-file ~/.claude/CLAUDE.md` 或等價；若不載，collector 把 worker 場排除在 canary 分母外 | F3、G5 | Paul 裁決；裁決後 W39 .44 canary 分母正確 | decision |
| X11 | **retro 工具鏈全部入 repo**：重建機器層 `probe.py`（Stop hook 命中、deny-replay、fleet-deploy 到達數）放 `evals/retro-metrics/`；`collect.sh`（三機 dedupe×2/analyzer/codex/cmli 打包）入 repo | F9、G3 | `ls evals/retro-metrics/` 有 probe.py + collect.sh；W39 method 欄不再指向 `.workflow/` | open |
| X12 | **艦隊落後**：grok VM 4.29→4.30；.62/.47 補 agent-scripts clone；fleet-deploy 輸出列出「缺哪幾台」 | F7 | Paul 裁決是否跑 fleet-deploy；跑後三機 `grep Version ~/.claude/CLAUDE.md` 同值 | decision |
| X13 | **/loop idle cache break**：.62 29 筆 10 筆含 `/loop`；`ScheduleWakeup` idle 預設 1200–1800s 已在 TTL 內，需查這 10 筆實際 delay 是否 >3600 或跨多次 noop 累積 | F4 | 列出 10 筆的 delaySeconds 與 gap；若 >55 分才 break，改 loop 規則上限 | open |
| X14 | **lessons 裁決**：46 proposed / 3 adopted；一次裁決 session，目標 proposed ≤ 30，adopted 條折入 rules 或標 rejected | F8 | `grep -c 'Status: proposed' ~/.agents/rules/lessons.md` ≤ 30 | open |
| X15 | **Live truth / 等待協定殘餘**：A 類 4 筆（worker idle 誤判、last_agent_message null 誤判、人在鍵盤前仍留待決、定時醒來發呆）→ 各補一條 fixture 到 `evals/fixtures/`（judgment-rubrics 負例） | L2 | 4 個 fixture JSON 過 `check-rules-invariants.mjs` | open |
| X16 | **Layer 2 隨機對照**：下週除 flagged 場外抽 10 場未 flagged 隨機讀，估 false negative | G4 | W39 layer2.json 含 `control` 欄 | open |

W37 主題追蹤：授權外推 W37 ×3 → W38 0；等待協定缺失 W37 ×4 → W38 2（X15）。

## 09-18 臨時動議追加（編號沿用問題見 backlog-reconciliation.md）

- X17 tmux-agent 孤兒收養單一 owner＋opt-in＋`adopted from`（F10；落點 ohyeh/tmux-agent-tools；驗收：同 launch_id 投遞 session ≤1）
- X18 tmux-agent ack 持久化＋stop 寫 ack（F11；驗收：同 launch_id 投遞 ≤1 次）
- X19 agy profile result.json pending → success；confirm-processing 改判據（F12）
