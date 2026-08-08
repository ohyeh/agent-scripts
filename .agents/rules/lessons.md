# Lessons — 活案工作集（append-only；format per rules/maintenance.md §3 — NON-NORMATIVE）

只留「尚未處置完的活案」。條目畢業（折入 rules/kernel/skill/hook 的核准 commit）即刪；
歷史在 git log（2026-08-08 W32 清算：48 條 → 折入 judgment-rubrics §2/§4/§5、
model-dispatch §3/§4、maintenance §5、harness-diagnosis 信任層之後，餘下如下）。

## 2026-07-18 | scope: scrub | trigger: 預設 evidence dir 落在 repo 內自弄髒 worktree（踩過兩次）
Rule: scrub.sh 一律傳外部 evidence dir 為 `$2`；歷史掃描命中先分流 real-secret vs documented-placeholder 再升級。
Status: proposed   # 待折入 scrub 腳本 usage/註解後刪

## 2026-08-08 | scope: dispatch | trigger: agy「卡帳號驗證」實為 start --prompt-file 舊寫法讓任務沒送達（agy 本身登入正常）；使用者設計的步驟化序列被證實有效
Rule: M5 wrapper 收編使用者的六步序列為單一 dispatch 指令（start 不帶 prompt-file → CLI 就緒確認含 agy folder-trust capture+enter → result init → send --from-file → capture 確認 pane 在處理 → 一次阻塞 supervise），每步確認才走下一步、失敗即報 blocker 帶 capture；wrapper 上線後 7/22 的 per-worker 監督 proxy 撤（序列本身就是監督）。
Status: proposed   # 畢業條件：tmux-agent-tools wrapper 上線（M5，P0）

## 2026-07-27 | scope: agent-device | trigger: 使用者多次糾正 simulator 被工具當副作用開啟；規則已存在仍犯（W32 L2 確認為執行失敗）
Rule: 每次 `agent-device` 指令後檢查 `xcrun simctl list devices | rg -i booted`，非空即 shutdown 並回報——待做成工具閘門（wrapper/hook），排 W33 機器閘門。
Status: proposed   # 畢業條件：閘門上線

## 2026-07-28 | scope: workflows | trigger: read-job agent 鬆散 schema 使 payload 被包成單一字串，guard 誤報 missing arg
Rule: workflow agent 讀結構化 payload 時 schema 宣告真實形狀（required + typed properties）；abort 訊息區分「檔案不存在」與「解析後為空」。已修 run-local 副本，installed workflow 待核准 diff。
Status: proposed   # 畢業條件：installed workflow 修復核准

## 2026-08-08 | scope: session-handoff | trigger: W32 Layer 2 — resume 後首要目標認錯＋worktree 沒切（fd7e9719）；validator regex 假 FAIL 兩 session
Rule: session-handoff resume 段補 acceptance-echo（複誦唯一驗收物＋確認 cwd/worktree）；validate_handoff.py regex `##?` → `#{1,6}`。installed skill 修改待核准 diff。
Status: proposed   # 畢業條件：skill 修復核准（N2）

## 2026-08-08 | scope: artifacts | trigger: W32 Layer 2 — Artifact 多 session 並發編輯 409×3＋早期 SVG 遭覆蓋誤刪（cbc898bf）
Rule: artifact 更新前先 WebFetch 讀最新版、在其上 merge 再 publish；409 的正解是重讀重併，force 需使用者明示。
Status: proposed   # 畢業條件：折入 writing-artifacts skill 或 pre-publish 檢查（N3 餘項）
