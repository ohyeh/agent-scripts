# Weekly Retro — 2026-07-17 → 07-24（commander 綜合）

輸入：findings-agent-scripts.md / findings-tmux-agent-tools.md / findings-usage.md（三個 sonnet workers，全程指揮模式，commander 未親寫分析）。

## 一週大勢
- **agent-scripts**：規則體系高速演進 v4.6.3 → v4.6.14（8 個規則 commit），主軸是 supervision 規則重寫、V=0、ADHD/anti-slop 輸出塑形；07-19 完成 repo-canonical 翻轉與三機收斂。
- **tmux-agent-tools**：13 commits，主軸 external-worker supervision（BREAKING 移除三個 subagent 定義、blocking supervisor、PR #316 bridge artifact 實測三種 CLI worker）；07-18 單日修正 result/audit 正確性。
- **使用面**：.workflow 慣例在 agent-scripts 內執行良好（3/3 run 檔案齊全），其他 repo 零採用；lessons.md 一週新增 11 條但 14 proposed / 0 adopted。

## 系統性摩擦（跨 repo 同款）
1. **fixed-twice 模式**：✈ canary（6e11d5d 弱化 → e260cc5 還原，回覆率 65%→7% 才被人工發現）；supervision 同日兩改（9c64c93→a164ccc）；tmux 的 72e4cf1→3ec0666 同日同 3 檔二修。共同根因：規則/行為變更出貨前缺自動回歸檢查。
2. **主張未驗證殘留**：154 tests PASS、60/60 smoke 等都是 artifact 自報；stars/clones 當 usage 證據自標 UNCONFIRMED。
3. **積壓**：lessons.md 14 條 proposed 未消化；remote2 redeploy（288ed67）未確認收尾；upstream #34399（luna 被拒）僅留 fallback。

## 本次 retro 自身的發現
- Subagent harness 硬擋 findings/report 檔名寫入 → workers 只能 inline 回傳、commander 代落檔（三個 workers 全中）。
- context-mode hook 硬轉向 WebFetch → 讀 claude.ai artifact 死結，最終靠 Chrome 目視 + force 覆蓋解決；「agent-scripts spinout — 工作順序」artifact 無本地備份，仍無法更新。

## 提案清單（彙整三 workers，Status: proposed，待你裁定）
A. 防回歸：global 主檔加 CI 檢查（✈ every-reply 措辭被縮窄即 fail）；tmux repo 加同日同檔追修偵測。
B. 流程衛生:規則編輯 commit 附 .workflow artifact 連結；同日規則連改合併為單一 reviewed commit；.claude/handoffs 決定 commit 或 ignore；清 execution-frontier 雜檔。
C. 積壓消化：排程 lessons.md review（14 proposed）；追 remote2 redeploy;#34399 入 docs。
D. 觀測:下次 retro 加「skills 實際被 invoke」檢查;artifact 類頁面（如 spinout）建立本地備份慣例（agent_workspace/artifacts 已起步，缺 spinout）。
E. 工具鏈：context-mode hook 對 claude.ai/code/artifact URL 放行 WebFetch（否則 artifact 更新流程每次都要 force）。

## 三個 fleet artifact 更新狀態
- Skill Manifest（83743cc1）：已更新發佈（stop-slop/adhd/using-skills 補列、paperclip-create-plugin 移除、07-24 戳記）。
- Workflow Manifest（6733cfaf）：已重驗發佈（12/12、hash a5f8770f 不變）。
- spinout 工作順序（ed298346）:BLOCKED — 無本地源檔亦不在備份目錄，待使用者提供內容。
