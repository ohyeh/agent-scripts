# Lessons — 活案工作集（append-only；format per rules/maintenance.md §3 — NON-NORMATIVE）

只留「尚未處置完的活案」。條目畢業（折入 rules/kernel/skill/hook 的核准 commit）即刪；
歷史在 git log（2026-08-08 W32 清算：48 條 → 折入 judgment-rubrics §2/§4/§5、
model-dispatch §3/§4、maintenance §5、harness-diagnosis 信任層之後，餘下如下）。

## 2026-08-08 | scope: dispatch | trigger: agy「卡帳號驗證」實為 start --prompt-file 舊寫法讓任務沒送達（agy 本身登入正常）；使用者設計的步驟化序列被證實有效
Rule: M5 wrapper 收編使用者的六步序列為單一 dispatch 指令（start 不帶 prompt-file → CLI 就緒確認含 agy folder-trust capture+enter → result init → send --from-file → capture 確認 pane 在處理 → 一次阻塞 supervise），每步確認才走下一步、失敗即報 blocker 帶 capture；wrapper 上線後 7/22 的 per-worker 監督 proxy 撤（序列本身就是監督）。
Status: proposed   # wrapper `assign` 已實作＋smoke PASS（tmux-agent-tools e13674a）；畢業還差 push＋兩機 skill 部署＋使用者確認撤 proxy（model-dispatch §4 語意變更）

## 2026-08-08 | scope: agent-device | trigger: 使用者更正根因——simulator 被開不是副作用，是 `open` 沒帶 `--device` 時預設落到 simulator（實機與同名 simulator 並存）
Rule: `agent-device open`（mobile 平台）必帶 `--device <name-or-udid>`；已由 PreToolUse gate `agent-device-target-gate.sh` 強制（web/macOS 豁免）。
Status: adopted   # gate 上線 2026-08-08，兩機部署；觀察一週無誤擋即刪本條
