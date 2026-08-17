# Findings：本機 Claude Code（2026-07-25..08-01）

Worker 無法直接寫檔（harness 阻擋），由指揮者代存其回報。
可重現腳本：scratchpad/agg.js、sample.js、sample2.js；來源 `find ~/.claude/projects -name '*.jsonl' -mtime -7` → 175 files。

## Measured
- 量能：175 jsonl、~124MB、平均 710KB；高峰 07-25（71）、07-28（59）——多為 `subagents/` 子檔，非獨立互動 session。Top 專案：paul-photo-gallery 81、agent_workspace 35、agent-scripts 25。
- 中斷：16/175（~9%）含 `[Request interrupted]`；最多者 e0394a98(6)、dbd2e7dc(5)、57f4e006(5)。
- Permission denial（啟發式）：10 個 session 檔，集中 paul-photo-gallery 與 agent-scripts。
- ✈ canary：50/159 有最終文字的 session（~31%）；GOAL/ACCEPTANCE/REPORT 結構 57/175（~33%）——分母被 subagent 檔灌水，非乾淨指標。
- done-claim 無證據（啟發式，可能高估）：67/175 —— regex 只掃 assistant 文字塊，未看相鄰 tool_result。
- 工具模式：Agent 113 次、SendMessage 100、TaskCreate/Update 86/146（重指揮週）；Skill 26 次（using-tmux-agent-tools×5、using-workflows×4、unknowns-discovery×3）；Bash 4234 次 vs ctx_* 少量。

## Inferred（抽讀）
- 多數中斷是使用者 scope 糾正或刻意打斷去跑 /session-handoff、/recap、/compact，非錯誤復原。例：e0394a98 @2026-07-25T04:42Z 使用者指 agent 偏題。

## Top 5 摩擦
1. scope 糾正型中斷；2. 打斷去跑 housekeeping 指令的模式；3. done-claim 缺行內證據；4. permission denial 依 repo 聚集；5. canary/合規指標被 subagent 檔汙染。

## 未達 acceptance（worker 自報）
- 同指令重試偵測 UNCONFIRMED（未腳本化）
- tmux worker 使用（Bash command body grep）UNCONFIRMED
- canary/GAR 比率未排除 subagent 檔重切
