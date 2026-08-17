# W32 Weekly Retro Report — 2026-08-07

範圍：2026-08-01 之後的本機全量（100.64.190.44 經 `ssh … uname -n` 驗證即本機，
無獨立遠端節點；W31 的跨機前提失效）。每個數字附產生指令。

## 1. W31 backlog 對帳（做了沒 / 有效沒）

| # | 狀態 | 證據 | 有效性 |
|---|---|---|---|
| A1 usage-ledger v1 (P0) | ✓ done（落點改在 insight repo，A1+C1+C2 合併為 05b56ff agent-sessions collector） | GitHub `ohyeh/context-mode-local-insight` 05b56ff/53bdd6f；本地 clone 原落後（HEAD 6733e93），fetch 後確認 | 本次 retro §2 已改用 collector 輸出 → **驗收達成**。初版對帳誤判「未做」，肇因：只看本地 clone 沒對 GitHub |
| A2 bol validator+hook | ✓ done | 92608e1、f127f54；hook 掛於 settings.json（PreToolUse）；部署檔與 repo md5 一致 | 統計出爐（§2）。fail 率仍 51% → **不建議升 hard block**，續 warn 觀察 |
| A3 attic 掛牌+stats | ✓ done | 17c4a4b、8e1b527；`recipe-usage-stats.sh design-consensus` → `{"last_week":"2026-W32","uses":5,"consecutive_zero_weeks":0}` | **死碼假設被推翻**：W32 用了 5 次 → 建議解除掛牌 |
| A4 做市商試跑 | ✗ 順延 | 無紀錄 | 續列 |
| A5 context ledger hook | ✓ done + 驗收達成 | 07cf816；真輸出 `~/git/core/core-oidc-provider/.codex-fable5/ledger.jsonl` | 可 grep 的 ledger 存在 |
| T1 brief 子指令 | ✓ done | tmux-agent-tools 92a2d94 + e3a7040（#317/#318 一併修） | 「一週合規曲線比對」因 A1 缺席未做；且本週 tmux worker 幾乎閒置（§2），實戰樣本不足 |
| T2 RMA / T3 ADR | ✗ 順延 | 無紀錄 | 續列（T3 降順位，worker 使用量歸零使其急迫性下降） |
| C1 併入 retro 量測層 | ✓ done | 併入 05b56ff collector；本次 retro 實際引用其輸出 | 「通/值/導流」結論：**通、值、已導流**（fleet.mjs 跨機部分因無遠端節點暫無標的） |
| C2 cli --help | ✓ done | pull 後 `node bin/cli.mjs --help; echo $?` → exit=0（pull 前本地舊版 exit=1） | 達成 |
| R1 量測禁抽樣收編 | ✓ done | a7f75a8 folded into judgment-rubrics §5 | 本次 retro 即依此執行 |
| R2 retro recipe 化 | ✗ 未做 | `.claude/workflows/` 無 weekly-retro.workflow.js | 續列，前置 A1 |

小結：11 項中 5 done、1 部分、5 未做。P0 的 A1 落空是最大缺口——它同時卡住 T1 曲線與 R2。

## 2. 量測層（全量；主來源 = `node bin/cli.mjs agent-sessions --days 7`，cmli.agent-sessions.v1，每個數字自帶 method）

| 指標 | 值 | 來源 |
|---|---|---|
| Claude top-level sessions 7d | 30（另 113 subagent transcripts；healthgo-mobile 佔 25/111） | collector [audited] |
| Codex sessions 7d（去重後） | 7（filesSeen 2358、duplicatesDropped 6、archive 1） | collector [audited] |
| agy conversations 7d | 10 DBs / 10 trajectories / 766 steps | collector [audited] |
| ✈ canary rate（Claude top-level） | 43.3%（13/30） | collector [derived] |
| GOAL/ACCEPT/REPORT 出現率 | 46.7%（14/30） | collector [derived] |
| done-claim 無證據率 | **93.3%（14/15）** | collector [derived] |
| tmux worker 7d 內完結（result.json） | 0 | `find ~/.local/state/tmux-agent-tools -maxdepth 2 -name result.json -mtime -7 \| wc -l` |
| Agent tool 派發（bol hook, since 8/1） | 37 筆：18 pass / 19 fail（0 exempt） | `jq -r 'select(.timestamp>="2026-08-01")\|.result' ~/.local/share/agent-hooks/bol-prompt-stats.jsonl \| sort \| uniq -c` |
| bol fail 缺項分布 | GOAL,ACCEPTANCE×8；GOAL×5；ACCEPTANCE×3；全缺×2；ACCEPTANCE,REPORT×1 | `jq -r 'select(.result=="fail")\|.missing\|join(",")' … \| sort \| uniq -c` |

初版手排數字勘誤：claude 142 = top-level+subagent 檔案混計；codex 12 = 未去重；
agy 0 = store 路徑查錯（真實位置 `~/.gemini/antigravity-cli/conversations/*.db`）。
三處全由 collector 修正——A1 的存在理由本週自證。

## 3. Findings

1. **派發重心整週從 tmux worker 移到 in-session Agent tool**（worker 完結 0 vs Agent 派發 37）。
   T1 brief 子指令因此缺實戰樣本；bol hook 反而成了唯一的合規量測面。
2. **bol 合規率 49%（18/37）**，較 W31 的 4.3–11% 大幅上升——warn hook 有效。但缺項大宗是
   GOAL+ACCEPTANCE 同缺（純問句式派發），顯示缺的是「派發時的模板反射」，不是規則認知。
3. **design-consensus 復活**（W32 uses=5）：W31「唯一真死碼候選」判斷錯誤，attic 掛牌應撤。
4. **機隊拓撲改變**：100.64.190.44 已指回本機（host key 也換過）。fleet/跨機類 backlog
   （C1、fleet-deploy 相關）在恢復真遠端節點前全部失去標的。原因 UNCONFIRMED（推測
   Tailscale IP 重配）。
5. **exempt=0**：f127f54 的 Explore/Plan 豁免部署一致（md5 相同），只是本週尚無
   Explore/Plan 派發樣本，非 drift。
6. **done-claim 無證據率 93.3%（14/15）**，較 W31 的 82% 惡化。judgment-rubrics §2/§5
   已收編規則但行為未跟上；heuristic 屬 derived tier，需抽真 session 複核再定調。
7. **本地 clone 落後差點造成 P0 誤判**：insight repo 的 A1+C1+C2 已在 GitHub 完成，
   本地未 fetch 導致初版對帳判「未做」。retro 對帳的真相源是 remote，不是本地 clone。

## 4. 指揮者裁決

- A2 維持 warn-only；fail 率 51% 時升 hard block 只會製造摩擦。先解決 finding 2 的
  模板反射問題（見 W33 A7），下週看曲線再議。
- A3 掛牌撤回需動 workflows 檔 → 走正常 commit，列 W33。
- 本報告全部數字可由表列指令重跑復現；未含任何手算彙總。
