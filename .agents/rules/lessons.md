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
