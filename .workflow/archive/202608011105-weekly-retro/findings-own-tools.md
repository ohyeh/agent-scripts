# Findings：ohyeh 自家 tool/skill 使用情況（2026-07-25..08-01）

Worker（Sonnet）回報，指揮者終審抽查通過（agent-tmux in-window 153 檔提及 vs 29 sessions 實呼叫方向一致；fleet.mjs in-window 0 確認）。
方法重點：只計實際 tool_use/exec 呼叫，非文字提及；已排除本分析 session 的自我汙染（排除前 execution-frontier.mjs 等曾誤判有 hit）。

## 自家 surface
- agent-scripts：7 skills、12 workflows、9 scripts
- tmux-agent-tools：agent-tmux CLI + 2 skills
- context-mode-local-insight：獨立 repo（⚠ 與第三方 context-mode plugin 是兩回事）
- 第三方排除：context-mode plugin（mksglu）、ponytail（DietrichGebert）、claude-hud（Jarrod Watts）

## 使用統計（實呼叫）
| 項目 | Claude | Codex | 備註 |
|---|---|---|---|
| agent-tmux | 368次/29 sess | 404次/41 sess | 本週最大宗，真實派工全流程 |
| deploy.sh | 44/5 | 38/7 | agent-scripts 部署 |
| check-rules-invariants.mjs | 18/3 | 29/6 | 帶 exit code 的驗證閘門用法 |
| check-router-adoption.sh | 4/2 | 20/4 | |
| fleet-deploy.sh | 10/2 | 8/1 | shellcheck + --verify-only 謹慎用法 |
| check-canary.sh | 6/2 | 10/5 | |
| Skills（Claude 側） | tmux-agent-tools 6、using-tmux-agent-tools 5、using-workflows 3、unknowns-discovery 2、delegation-templates 2、using-skills 1、shared-memory-intake 1 | UNCONFIRMED（Codex 技能為文字注入，無觸發事件可量） | |
| Workflows | feature-lifecycle-auto 4、findings-triage 1、root-cause-deep-dive-audit 1 | — | 全在 paul-photo-gallery |

## Never-used（zero-result 驗證過）
- Skills：second-model-consensus、using-design-skills
- Workflows：consensus-gate、design-consensus、design-vs-code-audit、docs-vs-code-audit、feature-plan-consensus、plan-pipeline、project-direction-review、spec-implement-dual-review-verify、workflow-manifest（12 支中 9 支本週 0 用）
- Scripts：execution-frontier.mjs、test-execution-frontier.mjs、test-review-gate-smoke.mjs
- **context-mode-local-insight 整個 repo 本週 0 次實跑**（唯一命中是 MEMORY.md 檢討文字）

## Caveats
- Codex 技能層採用率結構性不可量測（注入≠使用）。
- 低頻項目（scrub.sh 等）數字含「讀取腳本內容」的 grep，非全為實跑。
- agent-tmux 兩系統 sessions 不可跨系去重相加。
- 自我汙染是真實踩到的資料完整性問題：同類分析必須先排除分析者自身 session。
