# Findings — tmux-agent-tools 週回顧（W2 retro-tmux-tools 回傳，commander 代為落檔）

期間 2026-07-17 → 07-24，13 commits；repo 歷史始於 31882b9（07-17 squashed init）。

## 主題一：external-worker supervision（本週主軸）
- 6129fb5（07-18）BREAKING：移除 tmux-delegate / codex-oneshot / claude-oneshot subagent 定義（4 處同步位置）；CHANGELOG v0.36.0 記載理由（16/16 實際 invocation 已走 repo-local auto-discovery；tmux-delegate 0/16 觸發）。「無沉默外部使用者」的主張 CHANGELOG 自標 UNCONFIRMED（僅憑 stars/clones，非 telemetry）。
- deb0257（07-19）重寫 using-tmux-agent-tools/SKILL.md（淨 -80 行）；3ed20b8 加 42 行 router evals。
- fc63f26（07-21，PR #316）codex-external-cli-subagent-bridge workflow artifact：final-report 記載 codex-tmux / claude-tmux / agy-tmux 實測通過、60/60 smoke pass（documented，本次未重跑）。
- 實際 bug：native runtime 拒收 gpt-5.6-luna（host catalog 有列），fallback 到 terra，追蹤 upstream issue #34399。
- 摩擦訊號：72e4cf1（07-22）「add silent blocking supervisor」同日被 3ec0666「remove ambiguous liveness output」二修，同 3 檔（agent-tmux、core-workflow.md、test-supervise-smoke）—— 本週最明確的 fixed-twice 案例。

## 主題二：result/audit 正確性修復（07-18 單日）
- ce95a36 telemetry 改預設開啟 + append 失敗 fail-fast（原 silent drop）。
- bca96f1 worker status 正規化為 success|failed|blocked|needs-input，舊值讀取時映射。
- f274223、9bd4dae docs/CI 衛生修復。

## 健康訊號
- 本週零新增 TODO/FIXME、零 revert。10+ 個 smoke test 檔被更新。
- 唯一 pass-rate 主張為 artifact 內的 60/60（documented，未由本 session 驗證）。
- 使用證據：202607210238 artifact 顯示三種 external CLI worker 真實跑過並清理。

## Proposed improvements（Status: proposed）
1. CI 加「同日同檔追修 commit」偵測（如 72e4cf1/3ec0666），提早抓 incomplete-ship。
2. 在本 repo docs 內追蹤 upstream issue #34399（luna 被拒），不要只留 fallback 說明。
3. 用可驗證的 opt-in telemetry 取代 6129fb5 背後的 stars/clones UNCONFIRMED 論證。
4. .workflow/ artifact 建立命名/索引慣例（本週僅存一個，找它得全樹 find）。
5. 驗證 test-audit-smoke 是否真的覆蓋 ce95a36 的 AUDIT_LOG=0 opt-out + fail-fast 路徑（UNCONFIRMED）。

註：W2 subagent harness 封鎖 report 類檔名寫入，本檔由 commander 代寫。
