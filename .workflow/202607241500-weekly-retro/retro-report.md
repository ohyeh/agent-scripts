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

## 補遺 — 三機補掃（2026-07-24，回應使用者質疑「只掃了本機？」）
- 承認：原三個 workers 只掃 mbp14。補掃結果：
- mac-mini-m2：原為 v4.6.11（落後三版）、無 stop-slop → 已用 deploy.sh + rsync 拉平至 v4.6.14（md5 b1ce74fe 與本機一致），stop-slop 兩處已裝。
- 100.64.190.44：v4.6.14（本日已部署）。修正 W3 結論：「其他 repo 零 .workflow 採用」只對 mbp14 成立 —— 這台的 healthgo/ttpush/standard/yunlin/core 等多個工作 repo 都有 .workflow 目錄，採用度高。
- spinout artifact 備份：兩台遠端都沒有 agent_workspace/artifacts 備份，仍 BLOCKED。
- 新 proposed：fleet 機器的規則版本檢查應納入每次部署（mac-mini-m2 落後三版無人察覺）。

## 補遺 2 — 三機 skills + 近七天 sessions 盤點（2026-07-17 起，metadata-only）
| 機器 | Claude sessions | Codex sessions | 主力專案 | Skills (agents/claude/codex) |
|---|---|---|---|---|
| mbp14 | 202 | 194 | agent-workspace(104)、healthgo-mobile(33)、photo-gallery(22) | —（本機，見 manifest） |
| 100.64.190.44 | 93 (91M) | 107 (175M) | healthgo-mobile 佔 74%；Codex 07/23 單日 53 場 | 102/111/7；lock drift: commit-commands、stop-slop（手動裝） |
| mac-mini-m2 | 7 (548K，全在 openclaw 08-Aurora) | 1（07/22「更新 llm-gate 並重啟服務」） | 近一週幾乎閒置 | 101/100/2；lock 格式異常（僅 4 個 top-level key）UNCONFIRMED drift |

觀察：
- Codex 使用量與 Claude 相當甚至更高（remote2 175M vs 91M），fleet 是真雙 runtime。
- mac-mini-m2 近一週近乎閒置 + 規則落後三版被抓到 —— 閒置機器最容易變成版本孤兒；~/.codex 下多個 config.toml.bak-* 顯示近期頻繁重設定。
- 新 proposed：skill-lock 對 stop-slop/commit-commands 的 unmanaged 狀態要嘛入 lock 要嘛記為 documented manual extra（manifest 已記前例）。

## 補遺 3 — ohyeh skill 系列實際觸發分析（2026-07-17 起，兩批 sonnet workers 交叉）
方法：rg Skill-tool 調用（`"name":"Skill","input":{"skill":"…"}`）+ `<command-name>` 載入，掃 `~/.claude/projects` 內 -newermt 2026-07-17 的 JSONL；隱私上僅取 skill 名/次數/檔名。兩批 workers pattern 寬窄不同（寬鬆 `"skill":"…"` vs 嚴格全結構），計數以區間呈現。

**mbp14（204–206 檔）**：
| skill | 調用 | distinct sessions |
|---|---|---|
| using-tmux-agent-tools | 4–8 | 4–8 |
| delegation-templates | 5–7 | 5–6 |
| using-workflows | 2–4 | 2–4 |
| unknowns-discovery | 1–4 | 1–4 |
| tmux-agent-tools | 3–4 | 3–4 |
| using-skills | 0–1 | 0–1 |
| using-design-skills | 0–1 | 0–1 |
| 校準：brainstorming 0–1；verification-before-completion 0；codex-dynamic-workflows 0 |

**100.64.190.44（93 檔）與 mac-mini-m2（7 檔）**：全部 10 個 skill 零調用、零 `<command-name>`；pattern 有效性以窗外舊檔（yunlin-portal-app 含 delegation-templates 調用）及其他 tool 名可匹配交叉驗證 —— 零是真零。

**摩擦訊號**：三台皆零 Skill 調用錯誤（is_error / not found / permission denied）、零 command-name 載入錯誤。mbp14 的 `gate FAILED` 41 次/11 sessions 抽樣全為 CLAUDE.md 規則原文被注入 context 的引述，非真實 gate 失敗（heuristic 上限，實際 ~0）。

**解讀**：
- gate 類 skills（delegation-templates、unknowns-discovery、tmux 系列）在 mbp14 確實被觸發，且與 gate 設計一致（派工/監督情境）；非 shelf-ware。
- router 類（using-skills、using-design-skills）近乎零觸發 —— 與設計相符（PRIMARY goal 直入 domain，router 只在 ownership 不明時用），但也代表其價值需重新評估。
- 遠端兩台完全零觸發是結構性的：那邊的 sessions（healthgo-mobile 為主）大量是 Codex 或未走 Skill tool 的 Claude 工作；skills 部署了但該環境的工作型態不觸發。Codex 側（AGENTS.md 路由）本方法量不到 —— 是觀測盲區。
- 校準 skill 也全零/近零，說明「Skill tool 調用」整體就是低頻事件；用調用次數單獨判 shelf-ware 會誤殺。

Status: proposed（併入提案 D）— 下次 retro 的 skill-invoke 檢查需涵蓋 Codex 側（掃 ~/.codex sessions 的 skill 讀取痕跡），並區分「router 零觸發＝設計如此」vs「gate 零觸發＝流程沒被走」。
