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
    when: "接續前一段工作，先搞懂任務和之前怎麼做",
    text: `/session-handoff resume 前情提要：先搞懂這個任務，再談下一步。
1. 要解決什麼問題：用我的原話講。
2. 之前怎麼做：整份讀完交接、它接續的上一份交接、交接列的 artifact、Working Methods 和交接指到的 run dir 紀錄（plan.md、state.md 和它們引用的檔），以及上一個 session（寫這份交接的那個）的完整紀錄，不要只讀片段；更早的 session 看交接和 footprint 的 timeline，下一步要用到它的內容才開它的 log。列出哪些做法跑過有效、哪些失敗、當時在什麼條件下，各附原始紀錄 path:line 或 commit sha。
3. 專案的規範和筆記（AGENTS.md、CLAUDE.md、.claude/rules、.agents/rules、任務筆記）、記憶（.claude/memory、USER-MEMORY、共用記憶）和現成工具（scripts）裡，哪些和這個任務有關。
4. 現在停在哪、下一步是什麼、出處是什麼；現場唯讀查一次並附輸出。
5. 第 2、3 點每個來源逐項列「讀了」或「沒讀＋原因」。
紀錄裡有效的做法就照用；要換掉，先附它失敗或不適用這次條件的紀錄；沒有證據就只提唯讀查證，做法先不定。紀錄互相矛盾時，回去讀原始紀錄解決，不要猜，也不要拿 advisor 的推測當答案。
讀不完（context 快滿）就回報讀到哪、哪些沒讀、下一份要讀哪個，不要叫我選，也不要在讀完前定做法。
講完就停：不改專案檔、不發布、不派 worker、不碰遠端機器。紀錄裡找得到答案的事不准問我。`,
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

盯場：worker 在跑，你就要知道它在做什麼。
- 派出 worker 的同一輪，就看一次它的畫面或第一份產物，確認它真的開工、方向對。
- 結束一輪前一定要掛監看。叫醒條件不能只有「做完」：產物出現或更新、log 出現錯誤、worker 閒置或在等輸入、超過預期時間沒進度，都要叫醒你。
- 每次醒來，拿產物對照計畫：數字、樣本、範圍、輪數對不對；不對就當場停掉、修正或重派，不要等它跑完。
- 改了 worker 的指示（縮範圍、換順序、停掉某輪），下一個動作就去看它有沒有照做；沒照做就停掉它。
- 沒有新事情就安靜，不講廢話；但「安靜」不等於「沒在看」。

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
    text: `收工。核對本次目標、驗證和 push 狀態，未完成的如實列出。用 session-handoff skill 寫交接並跑過 validator，再給 recap：成果、證據、未完成、下一步、交接位置。
交接一定要寫清楚：
1. 大任務、各小任務的狀態、停在哪個檢核點和驗證結果、下一個小任務。
2. Working Methods：這次和之前的 session 用過的做法和工具，有效還是失敗、在什麼條件下，各附原始紀錄 path:line 或 commit sha（不能寫 brief，也不能寫「之前用過」）。上一份交接的做法整份帶過來。
3. 我這次的糾正如果是一類行為（例如「之前的都不看」），在 Mistakes and Corrections 寫：我的原話、我指的那份紀錄、下個 session 開工要先做的檢查（也列進下一步），以及照 maintenance §2 的處置（gate、rule fix 或 backlog row；改規則仍要我核准）。
待決事項只列要我拍板的；agent 自己的提案另列「agent 提案（使用者沒要求）」，不要寫成問題。`,
  },
]
