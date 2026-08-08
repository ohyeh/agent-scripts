# Lessons — 活案工作集（append-only；format per rules/maintenance.md §3 — NON-NORMATIVE）

只留「尚未處置完的活案」。條目畢業（折入 rules/kernel/skill/hook 的核准 commit）即刪；
歷史在 git log（2026-08-08 W32 清算：48 條 → 折入 judgment-rubrics §2/§4/§5、
model-dispatch §3/§4、maintenance §5、harness-diagnosis 信任層之後，餘下如下）。

## 2026-07-18 | scope: scrub | trigger: 預設 evidence dir 落在 repo 內自弄髒 worktree（踩過兩次）
Rule: scrub.sh 一律傳外部 evidence dir 為 `$2`；歷史掃描命中先分流 real-secret vs documented-placeholder 再升級。
Status: proposed   # 待折入 scrub 腳本 usage/註解後刪

## 2026-07-22 | scope: dispatch | trigger: 使用者裁定外部 worker 監督 proxy 為 MUST，一週試用
Rule: 試用期已過（2026-07-22 起）——需對照真實 worker 使用資料裁決轉正或撤，本輪 Layer 2 顯示 proxy 機制本身未被穩定走到。
Status: proposed   # 待使用者裁決轉正/撤

## 2026-07-27 | scope: agent-device | trigger: 使用者多次糾正 simulator 被工具當副作用開啟；規則已存在仍犯（W32 L2 確認為執行失敗）
Rule: 每次 `agent-device` 指令後檢查 `xcrun simctl list devices | rg -i booted`，非空即 shutdown 並回報——待做成工具閘門（wrapper/hook），排 W33 機器閘門。
Status: proposed   # 畢業條件：閘門上線

## 2026-07-28 | scope: workflows | trigger: read-job agent 鬆散 schema 使 payload 被包成單一字串，guard 誤報 missing arg
Rule: workflow agent 讀結構化 payload 時 schema 宣告真實形狀（required + typed properties）；abort 訊息區分「檔案不存在」與「解析後為空」。已修 run-local 副本，installed workflow 待核准 diff。
Status: proposed   # 畢業條件：installed workflow 修復核准

## 2026-08-08 | scope: session-handoff | trigger: W32 Layer 2 — resume 後首要目標認錯＋worktree 沒切（fd7e9719）；validator regex 假 FAIL 兩 session
Rule: session-handoff resume 段補 acceptance-echo（複誦唯一驗收物＋確認 cwd/worktree）；validate_handoff.py regex `##?` → `#{1,6}`。installed skill 修改待核准 diff。
Status: proposed   # 畢業條件：skill 修復核准（N2）

## 2026-08-08 | scope: fleet | trigger: W32 Layer 2 — agy 在 tmux pane 反覆卡 "Verifying your account"（842a6043 ×4 波、c26d3bd2）
Rule: agy headless 認證需根因診斷（tmux pane 缺 GUI/keychain session？）→ tmux-agent-tools issue；artifact publish 前先讀最新版 merge（cbc898bf 409×3＋SVG 誤刪）。
Status: proposed   # 畢業條件：issue 開立＋工具修復（N3）
