# P5-codemap —— pre-read REPORT（原始版本，未編輯）

來源：本 session subagent transcript `agent-aP5-codemap-134fe431faa88f66.jsonl`（24 records）
派工：Agent tool，opus + effort low，2026-08-07 議題裁決輪 plan.md P 系列
本檔為 worker 最終回報全文逐字保留；經主 session 摘要與裁決的版本見 `../retro-report.md` §4。

---

## 1. 是什麼

Vox 的原文（搜尋結果逐字引述，X 本體回 402／jina 回 403，全文與 t.co 內含的完整 prompt 為 **UNCONFIRMED**）：

> 𝗖𝗼𝗱𝗲𝘅 𝘁𝗶𝗽: have Codex build a clickable map of your repo, then flag 𝘄𝗵𝗶𝗰𝗵 𝗺𝗼𝗱𝘂𝗹𝗲𝘀 𝗵𝗮𝘃𝗲 𝗰𝗵𝗮𝗻𝗴𝗲𝗱 since the map was generated. Click any module to see its callers, dependencies, major flows, related tests, and source evidence. It generates: → (t.co link)

搜尋摘要一致指出產出三個檔：`docs/codemap/codemap.html`（可點擊瀏覽介面）、`codemap.json`（結構資料）、`codemap.lock`（狀態快照）。維持準確的機制不是重跑審計，而是在 `AGENTS.md` 加一條：**每個改碼任務開始時，先把當前 repo 比對 `docs/codemap/codemap.lock`**。所以 drift 偵測是機械式的（快照 vs 現況 → 標記哪些 module 過期），不是語意判斷「有沒有偏離設計意圖」——team-lead 給的描述在這點上比原文強。

一次性產生 + lock 檔守門的常駐檢查，不是排程重生。

公開實作：**沒有**對應這個 prompt 的 repo/gist/skill。同名但無關的東西有兩個：[JordanCoin/codemap](https://github.com/JordanCoin/codemap)（Go CLI，ContextEnvelope / hub files / 依賴圖）與 [Windsurf Codemaps](https://cognition.com/blog/codemaps)。Vox 這則就是一段 prompt。

## 2. 與我們何處重疊

現有兩份審計 recipe（真實路徑）：

- `/Users/paul.yeh/git/agent-scripts/skills/using-workflows/workflows/docs-vs-code-audit.workflow.js` — meta 寫明「Truth = code, never old docs」，per-group 唯讀 auditor → fixer → 跨文一致性/banned-residue 掃描。
- `/Users/paul.yeh/git/agent-scripts/skills/using-workflows/workflows/design-vs-code-audit.workflow.js` — 設計真相 vs code，7 類 drift 分類（MISSING/HALF_DONE/STATE_MACHINE/OVERLAP/ORDER/TEXT/STYLE），每筆 finding 對抗式驗證、design-WIP 感知。

重疊處：兩者都在做「宣稱 vs 現實」的落差偵測，而且我們的版本更強——LLM 逐項對抗驗證、會分辨假陽性、產出可修的 findings，還接得上 `findings-triage.workflow.js` 與 `spec-implement-dual-review-verify.workflow.js`。

codemap 唯一不重疊的兩件事：
1. **lock 檔式的廉價前置閘** — 任務開始時 O(秒) 判斷「我的地圖過期了嗎」，不需要開一整輪 agent 審計。我們的 audit 是 O(分鐘～小時)、要人啟動的。
2. **可點擊的導覽面（HTML）** — 我們的產出是 findings 文件，不是可瀏覽的架構地圖。

反過來 codemap 缺的是驗證：它只知道「檔案變了」，不知道「行為偏離了宣稱」，而後者才是 drift 的貴重部分。

## 3. 建議採用層級

**只偷概念**，而且不落在 agent-scripts 本身。

理由：
- agent-scripts 的 top level 是 `AGENTS.md / artifacts / evals / global / scripts / skills / skills-lock.json` — 沒有 `src/`，沒有模組呼叫圖。這裡的「模組」就是 skills 和 workflow recipes，而它們的清單已經有 `workflow-manifest.workflow.js` 和 `skills-lock.json` 在管。再蓋一層 codemap.html 是純重複。
- 值得偷的只有一個概念：**廉價 lock 前置閘**。可以在未來的 target-project 用法裡，把「先比對快照，只有標記過期的 group 才丟進 docs-vs-code-audit」當成 audit 的取樣器，省掉全域重掃。這是給現有 recipe 加一個 `changedSince` 之類的入口參數，不是新 recipe。
- 完整 HTML 地圖：棄。它是 demo 好看的產物，維護成本落在人身上，而 drift 的實質判斷它做不到。

現在不做，等到真的出現「audit 太貴、想只掃變動範圍」這個具體痛點再加。

## 4. 證據

- 推文（402，內容來自搜尋摘要逐字）：https://x.com/Voxyz_ai/status/2084645222672154675
- 同名無關工具：https://github.com/JordanCoin/codemap ／ https://cognition.com/blog/codemaps ／ https://www.codeline.co/thoughts/repo-review/2026/codemap-project-brain-for-ai-agents
- 我方：`/Users/paul.yeh/git/agent-scripts/skills/using-workflows/workflows/docs-vs-code-audit.workflow.js`、`.../design-vs-code-audit.workflow.js`、`.../workflow-manifest.workflow.js`、`/Users/paul.yeh/git/agent-scripts/skills-lock.json`

## 5. 自評

retry 3 次（WebFetch 402 → 兩次 WebSearch 取回逐字推文 → jina 鏡像 403 放棄全文）；自我修正 1 次：原本接受了 brief 裡「drifted from documented intent」的說法，讀到實際推文後改為「changed since the map was generated」——這個差別直接決定了結論是「只偷概念」而非「部分採用」。

**Sources:** [Vox 推文](https://x.com/Voxyz_ai/status/2084645222672154675)、[JordanCoin/codemap](https://github.com/JordanCoin/codemap)、[Windsurf Codemaps](https://cognition.com/blog/codemaps)、[codeline.co 評論](https://www.codeline.co/thoughts/repo-review/2026/codemap-project-brain-for-ai-agents)

✈
