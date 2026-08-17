# Findings：本機 Codex（2026-07-25..08-01）

Worker 被 harness 擋寫檔，指揮者代存。過濾：sessions 749→105 in-window；archived 859→367 mtime-7d，其中 492 排除（無 in-window 活動）；合併去重＝**137 unique session_ids**（24 個雙份）。

## Volume
- 日分佈：**07-28 爆量 91（66%）**＝parallel worktree fanout（codex-tui：paul-photo-gallery 35 + ppg-* satellites 48）。
- cwd：photo-gallery 系 106/137（77%）、healthgo-mobile 7、agent-scripts 5。
- originator：codex-tui 81、Codex Desktop 38、codex_exec 18；版本混用 0.145.0×99 + 0.146 系×33。
- fork：12 unique forked_from_id。model/effort：session_meta 無該欄位，UNCONFIRMED。

## Friction（measured）
- turn_aborted 3 session、thread_rolled_back 4、context_compacted（超長）16——最長 019f9db8（5634 行/38 turns/~21.8h, 07-26）。
- 疑棄置（≤5 行）4。
- 明確挫折/糾正關鍵詞 4/137：019fa8e5、019fb10d、019fad99、019f9db8。

## Delegation
- 使用者 prompt 含 GOAL/ACCEPTANCE/REPORT 僅 15/133（11%）——多數 delegation 無結構；agent 端下游是否套模板 UNCONFIRMED。

## Top 5 摩擦
1. 019fa8e5 07-28T14:28Z — worktree 放錯位置＋尖銳糾正＋rolled_back。
2. 019fb10d 07-30T09:46Z — 使用者點名「老問題」重犯。
3. 019f9db8 07-26T12:57Z — done claim 一分鐘內被打回（「你先讀懂」「不做事」）；也是週最長 session。
4. 019fad99 07-29 — PR-review loop 反覆糾正＋turn_aborted。
5. 019fadfa＋019fad36 07-29 同日同 repo 雙 abort/rollback——mid-week rough patch。

## 未達 acceptance（worker 自報）
per-turn model/effort UNCONFIRMED；agent 端模板紀律 UNCONFIRMED；07-28 spike 的 ppg-* worker session 未深讀。
