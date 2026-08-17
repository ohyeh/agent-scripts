# 三 repo 綜合圖與留/併/砍建議（2026-08-01，指揮者綜合三份 Explore）

## 1. tmux-agent-tools —— 留（健康主力）
- 8161 行 zsh 單體 CLI 在 skills/tmux-agent-tools/scripts/agent-tmux（頂層 scripts/ 是 69 個 smoke test，別搞錯位置）。v0.39.0，commit 節奏活躍，TODO/FIXME 0，~50 smoke 可跑。
- ADHD 提案落點已探明：
  - `dispatch --template`：dispatch table（agent-tmux:8046）加新 case＋template-render helper，接現成 prompt-file resolver（~3683），start/send-wait 不用改。註：repo 內「dispatch」現指 PreToolUse gate，命名要避開混淆。
  - RMA verifier：**沒有 post-result hook**（只有 --on-start）——net-new 機制，或用現成 `result wait-required --json` 輪詢層疊。

## 2. agent-scripts recipes —— 「9 支未用」翻案
相依圖（code-verified）：feature-lifecycle-auto → {feature-plan-consensus, plan-pipeline, spec-implement-dual-review-verify}；後三支互為循環一體；plan-pipeline → project-direction-review；×2 recipe → consensus-gate；docs↔design-vs-code-audit 互引姊妹。
- lifecycle 本週跑 4 次 → 鏈上的 stage recipes 是**間接執行**，own-tools 的計數只抓「名字直呼」，天然漏 workflow() 內部呼叫（量測口徑缺陷，記入量測債）。plan-pipeline 07-31 才改過＝活躍維護。
- 重分類：
  - 直接用：feature-lifecycle-auto、findings-triage、root-cause-deep-dive-audit
  - 鏈上活體（留，視為一個單元）：feature-plan-consensus、plan-pipeline、spec-implement-dual-review-verify、consensus-gate、project-direction-review
  - 工具型（留）：workflow-manifest
  - **真正未觸及**：docs-vs-code-audit＋design-vs-code-audit（姊妹對，一起算）、design-consensus
- 建議：砍單只剩 design-consensus 一支候選；audit 姊妹對交「做市商試跑」一輪再判（它們是 loop 的 audit 入口，可能是沒導流不是沒需求）。

## 3. context-mode-local-insight —— 留＋併入 retro 管線（不砍）
- 0 用但**非死碼**：17/17 tests pass、CLI 實跑正常（pattern 掃到 186 session DBs/1146 sessions）、無任何東西重複其功能——上游 ctx_insight 已改 hosted-only，本 repo 正是為了找回 local 計算而生。
- 它算的東西（session 統計、fleet 跨機聚合、HTML dashboard）**正是週 retro 每次手刻 jq 腳本在做的事**。自然的「併」：把它接成 retro 的量測層（fleet.mjs 跨機 snapshot 取代 ssh 手工掃），下週 retro 實測一次＝做市商試跑第一單。
- 小缺陷：無 --help（exit 1），順手補。

## 給下週 retro 的三個 action
1. 量測口徑修正：recipe 使用統計必須含 workflow() 間接呼叫（讀 run journal 或 recipe_result）。
2. 做市商試跑第一批：context-mode-local-insight（併入 retro 管線實測）＋ docs/design-vs-code-audit 姊妹對。
3. 唯一砍單候選 design-consensus 掛牌 30 天。
