// The owner's combo texts: data only, edit here. A text may embed another
// combo's text as {{<hotkey>}} (combo 8 reuses 7). register.ts checks the list once on load.
// Kept as .ts: a hooks module may import only code files, not .json.
export default [
  {
    hotkey: "4",
    label: "更深的問題",
    when: "反覆討論同一件事，需要找出一直沒問的更深問題",
    text: `在最近反覆討論的問題背後，有沒有一個更深的問題，是我們一直繞著它走，卻沒有真正問出來的？`,
  },
  {
    hotkey: "5",
    label: "前情提要",
    when: "接續前一段工作，先讀來源並確認前情",
    text: `/session-handoff resume 前情提要：照 RESUME 流程讀（Step 3b 的兩個 filter 都要跑：我的訊息，加上 agent 的 tool call），然後像看劇的前情提要一樣講給我聽。交接要讀最近兩天同一條工作線的每一份，不是只讀最新一份；分不出是哪條線就寫進第 4 點，不要自己挑。html／artifact 要讀內文，Artifact 工具不能用時改用 codex-cu 或讀本機檔。
講的時候分四段：
1. 照時間順序講每一段實際做出了什麼（改了哪些檔、行為怎麼變、證據在哪），卡在哪裡，被我糾正了什麼。
2. 讀過的來源：session id、html／artifact 連結、commit SHA，每個用一句話說它講了什麼，並照 skill 標 \`full\`／\`partial (<範圍>)\`／\`not read\`。
3. 現在停在哪。先對照交接的待辦、plan.md 的 task 清單和我最後幾則訊息，再判斷是不是已經收完。收完了就直接說，然後等我給新目標，之後走規劃期。如果是大任務拆成小任務，就列出大任務、每個小任務的狀態（已驗證完成／未完成）、上次停在哪個檢核點、當時的驗證結果，以及下一個小任務。待決事項分三類列：我已經答過的（引用原話，不再問）；我交代了但還沒做的；agent 自己提的（標「agent 提案，你沒要求」，不做也不問）。
4. 只放兩種：讀了但無法確認的；試過但讀不到的（附錯誤訊息和試過的替代方法）。能讀而沒讀的，先讀完再講，不能放在這裡交差。
驗證：至少驗 3 個繼承來的說法，必須包括上次檢核點的驗證結果、交接說「已完成」裡最重要的一項、下一步要依賴的前提。每個都附本 session 跑的指令和輸出。HEAD 與 origin 一致、檔案存在、版本號相同只是環境檢查，不算驗證。說「沒變、不用重做」要附 SHA 或 mtime。
講完就停：不改檔、不發布、不派 worker、不碰遠端機器。結尾不給選單，也不問要不要補讀；只問真的要我拍板、紀錄裡又找不到答案的事，最多 2 題，用 AskUserQuestion 問。`,
  },
  {
    hotkey: "6",
    label: "規劃期",
    when: "新目標需要先畫狀態圖確認共識，再寫計畫",
    text: `規劃期：先不要寫 PLAN。先把你理解的系統畫成狀態圖（狀態、轉移、不變條件，用 system model 表示），再依 using-decision-tree 的 design 分支選 motion、diagram 或 canvas 呈現，加上範圍、取捨和還不確定的地方，給我確認我們有共識；會跨模組、動到介面的程式任務，另外附一份程式骨架（型別、簽名、未實作的函式）。我確認以後，才在本任務的 .workflow run dir 寫 plan.md 和 task 清單：每個 task 對應 model 的轉移 ID，並附驗收和驗證方式。`,
  },
  {
    hotkey: "7",
    label: "指揮",
    when: "目標已確定，要由主 agent 指揮 workers 實作與審查",
    text: `全程指揮模式：實作與審查都交給 workers 執行。你是大腦：盤點、決策、派發、復驗、定奪；自己只寫少量重要的產品 code。

你的主要任務是分析、編排和驗證，具體工作盡量交給 local coding agent CLI 或 grok bot 執行。

自己只做需求澄清、方案拆解、任務分派和結果驗收；實作類工作（讀大量程式碼、寫程式、跑測試、批次修改）交給 workers。

Discover live, never recite from memory.`,
  },
  {
    hotkey: "8",
    label: "指揮＋loop",
    when: "規劃已確認，要持續指揮直到所有結束條件達成",
    text: `/loop 完成規劃好的所有內容

{{7}}

每一輪 loop 你都要主動多做事
每一輪不只收尾，還要主動往下一輪前進
目標是完整完成所有任務，不是做最小改動；做紮實的修正，不要表面繞過

請執行，不要隨便停下，不准跟我交談

等待就等待不要一堆廢話 安靜等待 遵守規範

請直接提供最終結果，不需要解釋過程，也不要問我是否需要進一步說明，一次性完成
所有內容

開跑前在本任務 run dir 的 state 檔寫可檢查的結束條件；達成才停，卡住就換做法繼續，真的走到死路才回報；每輪在 state 檔記一列：改了什麼、結束條件有沒有前進。`,
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
    when: "任務已收尾，需要交接、投稿與下一個檢核點",
    text: `收工。核對本次目標、驗證及 push 狀態，未完成項目如實列出。用 session-handoff skill 寫可接續的交接，再給 recap：成果、證據、未完成項目與下一步。整理本 session 的錯誤、修正與開發建議，納入 main session、sub-agent 和 tmux worker 的行為，依 shared-memory-intake skill 投稿；附交接與投稿位置。有大任務拆小任務的，交接裡寫明大任務、各小任務狀態、這次停在哪個檢核點與驗證結果、下一個小任務。交接的待決事項只列要我拍板的；agent 自己的提案另列「agent 提案（使用者沒要求）」，不要寫成待我回答的問題。`,
  },
]
