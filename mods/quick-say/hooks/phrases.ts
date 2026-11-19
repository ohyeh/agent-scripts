// The owner's combo texts: data only, edit here. A text may embed another
// combo's text as {{<hotkey>}}. register.ts checks the list once on load.
// Kept as .ts: a hooks module may import only code files, not .json.
export default [
  {
    hotkey: "3",
    label: "整理",
    when: "開發告一段落、初步跑通，要整理程式碼和 commits",
    text: `/simplify 開發告一段落，初步跑通了，現在整理程式碼和 commits。
You are the owner and long-term maintainer of this codebase, and its design is up to you.
1. 先跑一次現有的測試或檢查，記下通過的基準。
2. 整理這次改動涉及的程式碼（上游分支之後的 commit，加上還沒提交的改動）：合併重複、刪掉用不到的、把名稱和結構理順；行為不變。
3. 整理 commits：只動還沒 push 的 commit，合併成幾個各自說得清楚的 commit；已 push 的不改寫。
4. 整理完再跑同一組檢查，結果要和基準一致。
5. 收尾列出每一項改動，包含小改動、新增的測試和文件；任何行為變更單獨列出，由我決定留不留。`,
  },
  {
    hotkey: "4",
    label: "更深的問題",
    when: "反覆討論同一件事，需要找出一直沒問的更深問題",
    text: `/unknowns-discovery 在最近反覆討論的問題背後，有沒有一個更深的問題，是我們一直繞著它走，卻沒有真正問出來的？`,
  },
  {
    hotkey: "5",
    label: "前情提要",
    when: "接續前一段工作，先讀來源並確認前情",
    text: `/session-handoff resume 前情提要：照 RESUME 第一段，10 次工具內先回報停點、下一步與來源、現場指令與輸出、未讀和未驗的範圍及下一個查證動作。標 partial。原話或關鍵收據未齊，依賴缺項的下一步列待定。
只有 D1–D5 任一成立才走第二段，依 Step 3b 親自逐頁全讀，再核證三個繼承說法：上次停點、最重要的已完成項、下一步的前提。現場唯讀查證，過去事件用 --call 印完整收據。只補下一步要接續的 commit diff 與頁面內文。依 skill 列 Sources Read，分清已裁定、交代未做與 agent 提案。
講完停。不改專案檔、不發布、不派 worker、不碰遠端機器。只問紀錄裡沒有答案且需要 owner 拍板的事，最多兩題。`,
  },
  {
    hotkey: "6",
    label: "規劃期",
    when: "新目標需要先畫狀態圖確認共識，再寫計畫",
    text: `規劃期：先不要寫 PLAN。先把你理解的系統畫成狀態圖（狀態、轉移、不變條件，用 system model 表示），再依 using-decision-tree 的 design 分支選 Motion、diagram 或說明頁呈現，加上範圍、取捨和還不確定的地方，給我確認我們有共識；會跨模組、動到介面的程式任務，另外附一份程式骨架（型別、簽名、未實作的函式）。我確認以後，才在本任務的 .workflow run dir 寫 plan.md 和 task 清單：每個 task 對應 model 的轉移 ID，並附驗收和驗證方式。`,
  },
  {
    hotkey: "7",
    label: "調查",
    when: "問題原因不明或方向不清，先查清楚再動手",
    text: `調查模式：先查清楚，不改產品 code、不發布。
1. 先依 using-decision-tree 確認這件事歸哪個 skill 或 recipe，照它走。
2. 壞掉、報錯、變慢、測試失敗：照 /diagnosing-bugs，先做出一個會變紅的回饋迴圈，重現、縮小，再提假設、加觀測，證實根因。
3. 需求或驗收講不清、陌生領域、上次做錯想直接重試：照 /unknowns-discovery，列出已知、未知和盲點；真的要我回答的才問，一次一題。
4. 搜尋要完整：不准 head／tail 截斷、不准 rg -E，一次沒找到不算不存在。每個結論附本 session 跑的指令和輸出；查不到的標 UNCONFIRMED，並寫怎麼確認。
5. 交出：根因（或最可能的假設和已排除的）、證據、建議修法和驗證方式。修不修由我決定。`,
  },
  {
    hotkey: "8",
    label: "指揮＋loop",
    when: "規劃已確認，要持續指揮直到所有結束條件達成",
    text: `/loop 完成規劃好的所有內容

全程指揮模式：實作與審查都交給 workers 執行。你是大腦：盤點、決策、派發、復驗、定奪；自己只寫少量重要的產品 code。

你的主要任務是分析、編排和驗證，具體工作盡量交給 local coding agent CLI 或 grok bot 執行。

自己只做需求澄清、方案拆解、任務分派和結果驗收；實作類工作（讀大量程式碼、寫程式、跑測試、批次修改）交給 workers。

Discover live, never recite from memory.

每一輪 loop 你都要主動多做事
每一輪不只收尾，還要主動往下一輪前進
目標是完整完成所有任務，不是做最小改動；做紮實的修正，不要表面繞過

請執行，不要隨便停下，不准跟我交談

等待就等待不要一堆廢話 安靜等待 遵守規範

請直接提供最終結果，不需要解釋過程，也不要問我是否需要進一步說明，一次性完成
所有內容

開跑前在 \`.claude/loop.md\` 或 \`/loop\` 提示中引用本 repo job 的 \`verification\` 或測試指令。沒有驗證就先問我。有人值守用可勾選的清單，無人值守須先獲授權，並用涵蓋輸入版本與每項驗收條件的驗證指令。開跑前證明驗證能對產品故障、缺少輸入及逾時判定失敗。state 記我的原話、目標、範圍、預算、檢查點、結束條件與糾正。每輪記改了什麼和驗證結果。達成才停，卡住換做法，確定無路才回報。`,
  },
  {
    hotkey: "9",
    label: "驗收",
    when: "依已確認的 model 和 task 清單驗收真實產物",
    text: `驗收：對照規劃期確認的 model 和 plan.md 的 task 清單逐項驗收，每個轉移和每個 task 都要附本 session 實際跑出來的證據，例如指令輸出、exit code、截圖或錄影、commit SHA；單元測試和 smoke 不算能用的證據。專案有 verify skill 就照它的功能地圖跑。沒過的項目列出原因和修法，修完再驗一次。全部通過後，依規則請 reviewer 審驗收結果的客觀問題（bug、安全、證據），有共識才算完成。最後給使用者一張 scope／direction 卡：這次做了哪些、有沒有多做或漏做使用者要的，做法有沒有偏離方向、有哪些取捨要使用者拍板。`,
  },
  {
    hotkey: "0",
    label: "收工",
    when: "任務已收尾，需要交接與下一個檢核點",
    text: `收工。核對本次目標、驗證及 push 狀態，未完成項目如實列出。用 session-handoff skill 寫可接續的交接，再給 recap：成果、證據、未完成項目與下一步。附交接位置。有大任務拆小任務的，交接裡寫明大任務、各小任務狀態、這次停在哪個檢核點與驗證結果、下一個小任務。交接的待決事項只列要我拍板的；agent 自己的提案另列「agent 提案（使用者沒要求）」，不要寫成待我回答的問題。`,
  },
]
