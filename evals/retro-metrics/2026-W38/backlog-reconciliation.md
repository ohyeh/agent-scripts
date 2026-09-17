# W38 backlog 對帳（retro-agenda §1）

對帳對象：W37 retro 出去的 Y1–Y7 ＋追加 2 席（來源：艦隊儀表板「Findings → 去向」「臨時動議 → 機制」，2026-09-11）。
「做了」＝GitHub `origin/main` 或本機檔案可見的變更；「有效」＝本週量到的配對指標。兩欄分開，不互推。

**證據限制**：`ohyeh/agent-scripts` 於 2026-09-17 歷史重寫為 8 支 squash commit（`9f4f9b4..d4cc574`，`git log origin/main --since=2026-09-10`），09-11..16 的逐筆 commit 不可得；「做了」只能證明「現在存在」，不能證明「何時、為誰做」。

| # | W37 席次 | 做了？（證據） | 有效？（W38 配對指標） | 判定 |
|---|---|---|---|---|
| Y1 | 等待協定落地（G2） | 部分。kernel 4.30.0 `global/CLAUDE.md:103` 有 stall limit（brief 或 10 分）；lessons 09-11 `scope: waiting` 條在（`~/.agents/rules/lessons.md:224`，proposed）。「等待協定」未成獨立 rules 檔。 | 「等下一次 tick」結尾：.44 0/71、.62 0/64、.47 0/3（目標 0，達）。「待你決定」結尾：.44 0、.62 2（f0bda2f3、1c21ecf9）vs W37 19（目標 ≤5）。口徑差：W37 的 19 是「含『待你決定』的場」（儀表板「含合理用法，未逐場判別」），本週量的是回合結尾句 → 不可直接比。 | 做了（部分）／有效 UNCONFIRMED（口徑） |
| Y2 | 授權不外推＋fleet 印 missing（G1/G3） | 授權：kernel「approval names the action itself」段在（`global/CLAUDE.md` Hard boundaries）；lessons 09-11 `scope: authorization`（`lessons.md:219`）。fleet：`scripts/fleet-deploy.sh:58` 有 `echo missing`。 | 授權外推：Layer 2 本週 A 類 10 筆（W37 主題之一，未歸零）。fleet missing 未在本週執行 fleet-deploy，無輸出可證。 | 做了／有效 UNCONFIRMED |
| Y3 | .41 補 deploy ＋ mini 標 provider（G3/G4） | .41 本週不在量測範圍（Paul 指定跳過）。collector `agent-sessions.mjs` 無 `provider` 欄（grep 0 hit）。 | 不可量。 | 未做（provider）／.41 不可量 |
| Y4 | hook matcher ＋ collector hook-recovered（G6/G7），P0 | matcher：`~/.agents/hooks/claim-evidence-gate.sh:56,59` 正則仍為 W37 版型（有 `VERDICT: *PASS`、無 backlog 文字排除）。collector：`agent-sessions.mjs` 無 `hook-recovered`（grep 0 hit）。 | claim-evidence blocked 7d：.44 48/110、.62 61/137（probe）。誤打回逐筆判別未做（X11）。本 session 被打回 2 次，皆為「done 字眼無 token」型。 | 未做 |
| Y5 | insight fleet／版本／sdk（X5/X7/F16） | cmli `origin` 09-10 起 0 commit；`bin/fleet.mjs` 無 version/sdk 欄。 | 遠端執行仍需繞 MCP sdk（本週直接 import `agent-sessions.mjs`）。 | 未做 |
| Y6 | agenda 指向 usage-dedupe（G8） | `~/.agents/rules/retro-agenda.md:3` 1.8.0（09-11）、`:56` 指向 `usage-dedupe.py`。 | 本週三機 `rerun_midkey_input_equal: true`（2026-W38.json）。 | 做了／有效 |
| Y7 | ctx-usage-report（G12）；驗收 terrain PR ≤30／run ≤150 | `scripts/ctx-usage-report.py` 在，codex 側可跑（10 sessions、1219 events）；claude 側 recipes 只 plan-pipeline 1。 | terrain 09-11 起 PR 1（≤30 達）；runs 4（filter 語法 UNCONFIRMED）。 | 做了／有效（run 數待核） |
| 追加 1 | compaction-recall 6 → 10 | `~/.agents/hooks/compaction-recall.sh:20` `MAX_COMPACTIONS=10`，註解記 W37 依據。 | compact summaries 7d：.44 11、.62 58；本 session 1 次 compaction 後 handoff 可讀。無糾正配對量尺。 | 做了／有效 UNCONFIRMED |
| 追加 2 | model-dispatch 跨家族對照 | `~/.agents/rules/model-dispatch.md:55,57` astra≈fable、sol/luna≈sonnet。 | subagent model mix 本週未量。 | 做了／有效未量 |

## 臨時動議 → 機制（W37）

| 動議 | 機制 | W38 狀態 |
|---|---|---|
| skill/workflow 三週零改善 | `skill-router-nudge.sh` | 命中 .44 3、.62 32；命中 owner 同期 Skill() 0（report §8）。機制在、行為未變。 |
| terrain loop 燒 CI | kernel 12h 時鐘 | PR 1／run 4（上表 Y7）。 |
| opus 等 tick 偷懶 | kernel Loop 條＋授權句 | 上表 Y1。 |
| Codex astra 消耗 | reasoning effort 分佈欄 | 未加；`codex-tokens.py` 有 reasoning tokens 總量，無 effort 欄。 |
| router 只認 lock 64 | `using-skills-diff.md` 待核 | 檔案不存在（`fd using-skills-diff` 0 hit）。 |
| Stop hook 誤報 → Y4 P0 | matcher 修 | 未做（上表 Y4）。 |

## 編號問題（交 Paul）

W37 的下週 backlog 用 Y 序列（Y1–Y7＋2）；本週 `next-week-backlog.md` 沿用 X 序列寫成 X9–X16，與 W36 的 X1–X8 相接、跳過 Y。建議：改為 Z1–Z8 或回 Y8–Y15，不自行改名。

## 結案計數

做了 6/9（Y1 部分、Y2、Y6、Y7、追加 1、追加 2；Y3/Y4/Y5 未做）；有效可證 2/9（Y6、Y7；Y1 口徑待核）。Y4 為 W37 P0 且未動，是本週最大缺口。
