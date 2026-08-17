# 三 repo 改進 backlog（2026-08-01 retro 產出，供下週執行與驗收）

原則：每項有證據來源、落點 repo、驗收條件。下週 retro 逐項對帳——做了沒、有效沒。

## agent-scripts
| # | 優先 | 項目 | 證據 | 驗收 |
|---|---|---|---|---|
| A1 | P0 | retro 量測工具化 v1：usage-ledger 腳本進 scripts/（含 subagent 檔分流、workflow() 間接呼叫計數、數字附產生指令） | 4.3% vs 35-42% 母體錯誤；91/12 手算漂移；lifecycle 間接執行漏計 | 下週 retro 全部數字由腳本產出，零手算 |
| A2 | P1 | bill-of-lading validator（warn-only）：validate 腳本＋本週 11%/89% 樣本 fixture；PreToolUse hook 掛 Agent tool | delegation 合規 4.3-11% | 一週 deny/warn 統計出爐，才決定 hard block |
| A3 | P1 | design-consensus 掛牌 30 天（attic 流程第一單）；統計腳本加 consecutive_zero_weeks 欄位 | 唯一真死碼候選 | MOVED.md 存在；欄位有數據 |
| A4 | P2 | 做市商試跑：docs/design-vs-code-audit 姊妹對各跑一單真任務，記「通/值/為何沒導流」 | 未觸及但可能是沒導流 | 兩行結論進下週 retro |
| A5 | P2 | context 耗盡 ledger 最小版：PostToolUse hook 記 tool+path+sha256 到 run dir | compacted 16 例、5/6 重啟 | 一個真 session 產出可 grep 的 ledger.jsonl |

## tmux-agent-tools
| # | 優先 | 項目 | 證據 | 驗收 |
|---|---|---|---|---|
| T1 | P1 | `dispatch --template implement --goal --acceptance` 原型：dispatch table 新 case＋template render，出口接現成 prompt-file resolver（~:3683）；命名避開現有 dispatch-gate 語意 | 合規 4.3%；lazy-path 對齊 ★ | --dry-run 印出編譯 prompt；一週後比對子指令 vs 手寫合規曲線 |
| T2 | P2 | RMA 第一步（不寫自動化）：rma.json schema＋state.json 計數器，拿現有 result.json 手動模擬一輪 | done-claim 無證據 82%；019f9db8 實例 | worker 憑退貨單能否自修的結論 |
| T3 | P3 | post-result hook 設計筆記（net-new；或 result wait-required 輪詢層疊）——先寫 ADR 不寫碼 | repo 無 post-result 事件點 | 一頁 ADR |

## context-mode-local-insight
| # | 優先 | 項目 | 證據 | 驗收 |
|---|---|---|---|---|
| C1 | P1 | 併入 retro 量測層試點：下週 retro 用 fleet.mjs 跨機 snapshot 取代 ssh 手工掃（做市商試跑第一單） | 0 用但無可替代、17/17 tests pass | 下週 retro 引用其輸出；記「通/值/導流」 |
| C2 | P3 | 補 --help（現在 exit 1） | CLI 人因缺陷 | cli.mjs --help exit 0 |

## 跨 repo 流程
- R1（P0）：lessons.md「量測層禁抽樣」提案走 maintenance.md §1 正式收編。
- R2（P1）：recipe 化擴成兩支——①weekly-retro.workflow.js（盤點→全量掃→裁決→backlog，量測層跑腳本，裁決留指揮者）；②multi-repo-fix.workflow.js（本次 wf_144a561d-ad8 骨架參數化：per-repo 串行 implement 鏈疊同 branch + worktree 隔離 + fresh review VERDICT + 指揮者終審；args = {repos:[{path, branch, tasks:[{label, model, brief}], reviewScope}]}）。前置：wf_144a561d-ad8 實戰驗證骨架成立，且入 bundle 前過一輪 consensus-gate（behavior-tier）。
- 2026-08-01 批次執行紀錄：GH issues #317/#318（tmux-agent-tools）、T1、A2/A3/A5、A1+C1+C2 以 wf_144a561d-ad8 開跑；#2/#3 draft-only 待使用者核准；A4/T2/T3 順延。

執行順序建議：A1 → T1 → C1（三者都直接餵下週 retro），其餘按優先。
