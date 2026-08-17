# Lessons — 活案工作集（append-only；format per rules/maintenance.md §3 — NON-NORMATIVE）

只留「尚未處置完的活案」。條目畢業（折入 rules/kernel/skill/hook 的核准 commit）即刪；
歷史在 git log（2026-08-08 W32 清算：48 條 → 折入 judgment-rubrics §2/§4/§5、
model-dispatch §3/§4、maintenance §5、harness-diagnosis 信任層之後，餘下如下）。

## 2026-08-08 | scope: agent-device | trigger: 使用者更正根因——simulator 被開不是副作用，是 `open` 沒帶 `--device` 時預設落到 simulator（實機與同名 simulator 並存）
Rule: `agent-device open`（mobile 平台）必帶 `--device <name-or-udid>`；已由 PreToolUse gate `agent-device-target-gate.sh` 強制（web/macOS 豁免）。
Status: adopted   # gate 上線 2026-08-08，兩機部署；觀察一週無誤擋即刪本條

## 2026-08-13 | scope: rule-reading | trigger: ONE OWNER 的 Exception 句，前半授權 `--detach` 被執行、後半 `bounded harvest` 被忽略，前景阻塞 420s；同一份 byte-identical SKILL.md 在另一機做對過
Rule: 等待成本在哪一步都算成本 — 把阻塞從 assign 搬到 harvest 不算解決。（前半「授權與限制同等強制、先讀完整句」已折入 judgment-rubrics preamble，2026-08-13 畢業）
Status: proposed

## 2026-08-14 | scope: retry-doctrine | trigger: W33 retro——App→FIG 迴圈已有 fresh 根因證據（builder source 缺失、Auto Layout 1.88% vs 95%）仍被三輪 session 重跑，燒 ~1.4B tokens 零進度
Rule: 已有 fresh 證據證明某路徑不可行時，重跑同路徑前必須先推翻該證據；否則直接 BLOCK 上報缺口（缺的是外部依賴，不是 compute）。落點：judgment-rubrics §3（retry）。
Status: proposed   # 使用者 2026-08-14 裁決通過，待折入

## 2026-08-14 | scope: delegation-budget | trigger: W33 retro——兩個 userMsgs=0 的 codex worker 各燒 ~200M tokens 無人止損；kernel「unattended loops 先問」存在但 delegation brief 沒帶進去
Rule: delegated worker brief（GOAL/ACCEPTANCE/REPORT）必帶預算欄：token/輪數上限＋「連續 N 輪 gate 不過即停並上報」。落點：delegation-templates ＋ model-dispatch。
Status: proposed   # 使用者 2026-08-14 裁決通過，待折入

## 2026-08-14 | scope: handoff-format | trigger: W33 retro——blocked handoff 未帶「已證明不可行的路徑」，後繼 session 把前人結論當 lead 重驗三輪
Rule: blocked handoff 必填「已燒成本＋已排除路徑（含證據指標）」節；後繼 session 禁止重驗未被推翻的已排除路徑。落點：session-handoff 格式。
Status: proposed   # 使用者 2026-08-14 裁決通過，待折入

## 2026-08-18 EMFILE kills worker Stop hooks under load
Status: proposed
Evidence: session 37839e4b — adversarial-kernel worker finished in 16m but its
Stop hooks died 3x with "Too many open files (os error 24)", leaving
result.json stuck at `pending`; supervise/result-wait then blocks until
timeout. At diagnosis time kern.num_files was 7724/122880 and the tmux server
ulimit -n was 1048576 — per-pane fd limits ruled out; the pressure was
transient (6 concurrent codex tmux workers + browsers). Root cause UNCONFIRMED.
Lesson: a finished worker with pending result.json + Stop-hook EMFILE in the
pane is a HARVEST-DIRECTLY signal, not a hang; on next EMFILE capture
`sysctl kern.num_files` and `lsof | wc -l` immediately before touching anything.
