# Weekly Retro 續輪執行計畫（2026-08-07，inbox 議題裁決輪）

Status: **DONE（2026-08-07 執行完畢）** → 產出 `retro-report.md`。
執行時範圍擴大：使用者指定本機與 `100.77.191.62` **雙機**都要量測（原計畫只寫議題裁決）。
D1/D2/P1–P5 全數完成；G1 仍阻塞於使用者。實際偏離見報告 §1、§3、§6。
依據：`~/.agents/rules/retro-agenda.md` v1.3。
啟動語：「照 .workflow/202608071600-weekly-retro/plan.md 跑」。

## 範圍定位

W32 對帳與量測今早已完成（`.workflow/202608071000-weekly-retro/`），本輪不重跑。
本輪重心＝**inbox 18 題的研究與裁決準備**＋漏斗補課（Layer 2 上午沒做的定向深挖）：

1. Pre-read 研究（可並行外派）
2. Layer 2 定向深挖（含使用者點名的 sid）
3. 彙整成裁決簡報，回使用者定案 → 產出併入 W33 backlog

## 派工配置（配好，照表執行）

模型依 model-dispatch 原則選；使用者本週訴求「sonnet 效益差、opus low 可能更適合」
→ 本輪 Claude 系 worker 一律 **opus + effort low** 試跑，順便當對照實驗（記錄重試/糾正次數）。
所有 brief 走 delegation-templates（GOAL/ACCEPTANCE/REPORT），受 bol hook 檢查。

| # | 任務 | 執行者 | 模式 |
|---|---|---|---|
| P1 | pre-read: agentplugins org 全 repo（spec/schemas/discussions） | Agent tool, opus low | 並行 |
| P2 | pre-read: KiroCrew 逐面對照我們現有件 | Agent tool, opus low | 並行 |
| P3 | pre-read: fable-advisor ＋ sol-advisor（併一件，重點：路由 doctrine 與 lite mode 落地成本） | Agent tool, opus low | 並行 |
| P4 | pre-read: mattpocock/skills 全目錄 × using-skills ADOPTED surface 差集 | Agent tool, opus low | 並行 |
| P5 | pre-read: codemap 手法（推文＋任何公開實作），評估在 agent-scripts 試產 | Agent tool, opus low | 並行 |
| D1 | Layer 2: sid 6bc15b50…（**P0**）——兩案併查：(a) grep-and-conclude 失智迴圈：數同錯重複次數、糾正後行為有無改變、每次亂下定論前讀了哪些檔案；(b) 術語過度翻譯環節定位 | 主 session 自做（讀 transcript 不必外派） | 序，優先做 |
| D2 | Layer 2: 本日 agy/codex --prompt-file 誤派事件時間線（tmux 派工步驟化提案的證據附件） | 主 session 自做 | 序 |
| G1 | GCP credits：下載 credits CSV，列各筆適用範圍與到期日 | 需使用者提供 console 存取或 CSV → 待使用者 | 阻塞題 |

並行上限 3（尊重 rate-limit 訴求）：P1–P5 分兩批（3+2）。
REPORT 統一格式：是什麼／與我們何處重疊／建議採用層級（整套/部分/只偷概念/棄）／證據連結。

## 裁決簡報（本輪主產出）

`retro-report.md` 以「題→研究結論→建議裁決」表呈現，18 題分四束：
1. **機器閘門束**：Osmani 閘門、Debug Loop 證據契約、步驟化派工、A8、done-claim——建議定為 W33 主軸。
2. **派工經濟束**：rate-limit、sonnet 效益（含本輪 opus-low 對照數據）、WORKER|REVIEWER、fable/sol-advisor 結論。
3. **生態採用束**：Agent Plugins、KiroCrew、mattpocock skills、codemap、二線 CLI 對齊、self-hosted runner。
4. **雜項束**：話少/stop-slop、術語翻譯（D1 結論）、七條 AGENTS.md 擇條、GCP credits（若 G1 未解則標阻塞）。

每題結尾給一行建議：升級（入 W33 backlog，附驗收）/ 觀察 / 棄案。

## 驗收（本輪算完成的條件）

- P1–P5 五份 REPORT 齊，D1/D2 各兩行結論。
- retro-report.md 四束 18 題全覆蓋，無沉默略過；每題有建議裁決。
- inbox 條目全部標注去向（裁決後由使用者確認才真正清空）。
- 需使用者決策事項集中最後一節（含 G1、E1、agenda 四題、CLAUDE.md routing 行）。
- opus-low 對照數據記入報告（P1–P5 各自的重試/糾正次數）。
