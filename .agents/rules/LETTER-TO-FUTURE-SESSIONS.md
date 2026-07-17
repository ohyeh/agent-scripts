# 給未來 session 的信

寫於 2026-07-10，由一次性的 Fable 5 session 留下。讀者：這套規則的擁有者，與未來每一個
（大多是 Sonnet/Opus/Haiku 的）session。規則本體在 `rules/`；這封信只講規則檔
放不下的三件事、制度會怎麼壞、以及我自己哪裡最沒把握。

## 一、三件你沒問、但我認為最重要的事

**1. 制度的成敗不在規則檔，在回饋迴路。**
所有 rules 檔加起來，價值低於「使用者每次看到 proposed diff 時花一分鐘批准或駁回」
這個習慣。lessons.md 是整套制度唯一會成長的器官；三個月沒人審提案，它就退化成
裝飾品，規則會停在 2026-07-10 的世界觀。請把「處理 proposed 條目」當成例行公事，
哪怕答案永遠是「駁回」。

**2. 長期瓶頸是 context，不是模型智力。**
你的環境每個 session 開場就注入：CLAUDE.md ＋ ponytail hook ＋ Explanatory ＋
Learning 兩套 output style ＋ context-mode 指令 ＋ 約 60 個 skill 描述。這是數千
token 的固定稅，而且其中三組互相矛盾（實查屬實，見 rules/harness-diagnosis.md §2）。
你 2026-07-10 決定維持現狀，我照辦並改用優先序規則緩解——但要誠實說：**停用重複的
output style plugin 是目前環境裡單一最大、最便宜的可回收 token 池**，隨時想收就收，
改 settings.json 前備份即可。弱模型在乾淨的 context 裡，常常贏過強模型在髒的 context 裡。

**3. 弱模型最危險的不是能力不足，是自信地編造。**
整套制度圍繞 evidence 設計，而它有一個單點故障：使用者的容忍度。只要你接受過一次
沒有證據的「完成了」，之後每個 session 都會學到那樣就能過關。最值得堅持的一條規則
是最便宜的那條：沒有 raw evidence，一律說「attempted, unverified」。

## 二、這套制度最可能的退化方式與預防

| 退化方式 | 預防（多半已內建） |
|---|---|
| 規則檔膨脹回長文，弱模型讀不完 | 每檔 ≤150 行硬上限＋季度精簡（maintenance §4） |
| 路由形同虛設：模型跳過「先讀 rules 檔」直接動工 | 交辦與完成宣告前讀檔已定為 MANDATORY；使用者可抽查：「你剛引用了哪個檔的哪一節？」答不出即失效 |
| 型號表過期，照舊表派工 | dispatch §8 季度重驗＋fable→opus 靜默 fallback |
| lessons.md 變垃圾場 | 三行格式、40 條觸發整併、90 天 proposed 自動清理 |
| 使用者急件時繞過制度硬幹 | 正常，不用愧疚；事後補一條 lesson 就是制度在運作 |
| 驗證退化成作者自驗 | dispatch §7 白紙黑字：超過 triviality 門檻，作者的「我驗過了」不是證據 |

## 三、誠實條款：我信心最低的產出

1. **model-dispatch §5 的「任務型態→模型」對應表**。型號名稱與參數是實查的；但
   「什麼任務配什麼模型」是我依一般能力階梯的推斷，沒有用你的額度與實際案例校準。
   例如 Sonnet 5 可能足以處理多數 hard debugging，Opus 4.8 的額度成本我完全不知道。
   用兩週後依實感修表——這正是 lessons.md 的用途。
2. **「被導向 Opus 4.8 的請求是否消耗 Fable 額度」**：查不到，未確認。請到
   claude.ai 的 usage 儀表板實測，把結論寫進 lessons.md。
3. **診斷 §2（風格衝突是失焦主因之一）**：三組矛盾注入是實查的事實；「它是主因」
   是推斷，沒做過對照實驗。方向我有把握，排名我沒有。
4. **優先序規則（precedence order）本身是品味判斷**。拆解與驗證補得了執行品質，
   補不了這種裁量——這是任務裡「誠實條款」預言的那類東西。我的處理方式：明說它是
   裁量，交給使用時間去修正，而不是假裝它有實證基礎。

## 四、明天怎麼開始用（給下一個 session 的最短路徑）

1. 開場照常載入 ~/.claude/CLAUDE.md（Codex 為 ~/.codex/AGENTS.md；路由表在其中）。
2. 接到非 trivial 任務 → 先讀 `rules/model-dispatch.md`，照 §3 三要素交辦。
3. 宣告完成前 → 過 `rules/judgment-rubrics.md` §2 checklist。
4. 踩雷 → 三行寫進 `rules/lessons.md`，繼續幹活。

祝順利。制度不會讓弱模型變聰明，但會讓它少犯強模型也會犯的錯。

— Fable 5, 2026-07-10
