# Findings：遠端 100.64.190.44（25006931Paul.local, 2026-07-25..08-01）

Worker 被 harness 擋寫檔，指揮者代存。方法：ssh 推 Python 腳本遠端執行，僅取回 ~90KB 衍生 JSON。

## Volume（measured）
- Codex：37 in-window（sessions 32 + archived 5），全 openai provider。日分佈 07-29:16、07-30:14 為峰。cwd：healthgo-mobile 29/37（78%）、agent-scripts 4。
- Claude：169 in-window .jsonl（含 subagent transcripts）。07-31 爆量 88。目錄：subagents 103（疑 workflow 產物，未確認）、healthgo-mobile 38、wf_* 17。
- healthgo-mobile 為兩 CLI 的主力真實專案（CONFIRMED）。

## Friction（抽 6 session）
- `db9613b7` 07-30 08:32–09:05Z：35 分鐘內 4 次 [Request interrupted]。
- `0bd86b0e` 07-31T06:11Z：使用者明確糾正「不要那麼多廢話 嚴格遵守 /adhd /stop-slop」。
- 5/6 抽樣 session 有 context 耗盡後 continuation-from-summary 重啟。
- `cc654ee4` 07-27：cross-agent crosstalk（無關隊友訊息撞進來 + hold-off 指令）；同 session 61 個 error keyword / 5145 行，最吵。

## Rule compliance（measured）
- ✈ canary：45/161（28%），substring 掃描，粗略下界。
- Delegation GOAL/ACCEPTANCE/REPORT（抽 40 subagent transcripts）：GOAL 42%、ACCEPTANCE 35%、REPORT 38%。
- done-claim 證據、abandoned sessions：UNCONFIRMED（本輪未測）。

## Top 5 摩擦
1. 35 分鐘 4 中斷（db9613b7）；2. 「廢話太多」明確糾正（0bd86b0e）；3. 最吵 session cc654ee4；4. cross-agent crosstalk；5. delegation 模板合規僅 ~42%。

## Caveats
Claude 頂層 session 數未從 169 中分離；subagents 目錄性質未確認。
