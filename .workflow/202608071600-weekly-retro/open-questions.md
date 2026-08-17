# 待使用者裁決 —— 全部集中（2026-08-07 議題裁決輪）

使用者指示：所有問題丟這裡，後續一起處理。
本檔是**唯一**的待決清單；報告與 backlog 的阻塞項都指回這裡。
處理方式建議：逐條回一行即可（同意 / 改成 X / 棄）。

---

## 裁決結果（2026-08-07 使用者逐條裁決；總表見 `.claude/handoffs/2026-08-07-210213-retro-w32-adjudication.md`）

| # | 裁決 | 落地狀態（2026-08-08） |
|---|---|---|
| A-1 | ✅ 追加 L1–L9，遠端規範格式 | ✅ 已寫入 `.agents/rules/lessons.md` 並部署兩機 |
| A-2 | ✅ 統一遠端格式 | ✅ 同上（本機偏離條目已改寫） |
| A-3 | ✅ 改 repo 同步（棄 local-only） | ✅ kernel 4.17.0 已移除 local-only 句；canonical 入 repo |
| A-4 | ❌ 不加 routing 行；retro 使用者自己發起 | 結案 |
| A-5 | ✅ 修 narration 規則（回退 9c0d9a1） | ✅ kernel 4.17.0 已部署兩機 |
| B-1 | 等使用者給 GCP console 存取 | ⏳ blocked |
| B-2 | 改題：探勘 Leonxlnx taste-skill 全家族 → W33 | 入 backlog |
| B-3 | skills 差集先盤點再裁去留 | 待盤點 |
| C-1 | ✅ collector 加 token/成本欄 | ✅ 已寫入 agenda v1.4 §2–4 |
| C-2 | ✅ 糾正事件輕量關鍵詞粗篩 | ✅ 同上 |
| C-3 | ✅ 產品 repo 算範圍但次要輕量 | ✅ agenda v1.4 範圍句已改 |
| C-4 | ✅ 維持手動觸發 | ✅ agenda v1.4 已明定 |
| D-1 | ✅ v1.4.0 轉正式 | ✅ 入 repo `.agents/rules/retro-agenda.md`，部署兩機 |
| D-2 | 無新動議 | 結案 |
| D-3 | ✅ 兩個都補：Layer 2 重跑含 unknowns-discovery；A7 驗收改寫 | ✅ layer2-rerun.md 已產出（3 平行 agents）；A7 驗收改寫入 backlog |
| D-4 | 裁完＋有處置政策或部署後才清 inbox | ✅ 已清（2026-08-08），新增兩筆隨手記 |
| E-1～E-5 | ✅ 全排下輪（E-4 第一順位、E-3 併 K4） | 入 backlog |
| F-1 | ✅ W33 主軸＝機器閘門 | 定案 |
| F-2 | ⏳ M1 先出設計＋效能評估再實作 | ✅ 已實作上線：`bash-read-audit.sh` log-only（~38ms/call 實測），兩機 PreToolUse 掛載 |

---

## A. 需要核准才能動的（有現成 diff 或明確動作，卡在授權）

| # | 問題 | 動作是什麼 | 為什麼卡住 |
|---|---|---|---|
| A-1 | `lessons.md` 追加本輪 L1–L9 提案條目 | 見 `retro-report.md` §7b 九條 | `maintenance.md §1` 是唯一編輯授權；且要先定 A-2 的格式 |
| A-2 | 兩機 `lessons.md` 格式分歧要統一到哪一種 | 遠端用 `## date \| scope \| trigger` + `Rule:`（符合檔頭自己宣告的 `maintenance.md §3`）；本機用 `Date:/Trigger:/Status:` 區塊 | 本機偏離規範，但改格式等於改既有條目，屬 guidance 編輯 |
| A-3 | `lessons.md` 跨機設計：維持 local-only 並在 retro 固定合併，或改為 repo 內同步 | 二選一，落成一條 rule | 「local-only」是原始設計理由；但代價已具體化——D2 要的 `--prompt-file` 教訓只存在遠端，本機看不到 |
| A-4 | `CLAUDE.md` routing 行新增（前輪已提，仍待核准） | 見前輪 handoff | kernel 編輯 |
| A-5 | 話少 / stop-slop 訴求與 kernel narration 規則**直接衝突**，要改 kernel | 現行規則要求 tool-call 之間每段 narration 都算 reply、都要守語言與 `✈`；訴求是「過程話少、只在重要發現或連續失敗時出聲」。建議改為 narration 只在重要發現/連續失敗時出聲、`✈` 只在 turn 結尾一次 | kernel 編輯，且是行為層改動 |

## B. 需要你提供資訊或存取的

| # | 問題 | 需要什麼 |
|---|---|---|
| B-1 | G1 GCP credits 活用（$31,283 GenAI App Builder + 月 ~$313–319 Developer Program） | console 存取或 credits CSV（各筆適用範圍與到期日）。Vertex AI 走 Claude/Gemini 是候選方向 |
| B-2 | taste-skill「好像改微調一下」具體指什麼 | 本輪結論是**不擴充、不動 body**（動 body 即成 fork，需 frontmatter 註明偏離）。若你指的是別的具體點，請指定 |
| B-3 | 遠端六個 skills 差集：哪些該補、哪些該退 | 本機獨有 5（`batch-grill-me`／`edit-article`／`obsidian-vault`／`wizard`／`writing-great-skills`——注意前三與 `writing-great-skills` 上游已 404）、遠端獨有 1（`web-design-guidelines`） |

## C. agenda 自己列的「待使用者補的面向」（`retro-agenda.md` 尾節，逐字）

| # | 問題 |
|---|---|
| C-1 | retro 要不要看 token / 成本面？（collector 尚無此面） |
| C-2 | 使用者糾正事件的收集要工具化到什麼程度？ |
| C-3 | 三 repo 之外（如 healthgo 等產品 repo 的 agent 使用）算不算 retro 範圍？ |
| C-4 | 週期與觸發：目前是使用者喊「RETRO時間」；要不要固定排程？ |

C-3 本輪實質上已經越界了——D1 深挖的 `6bc15b50` 與 §1c 名單大半在 `healthgo-mobile`，
而那不是三 repo 之一。若答案是「不算範圍」，本輪最重要的 P0 就不該做；
若答案是「算」，agenda 的範圍句要改。**這題會回頭改議程本身。**

C-1 也有具體背景：本輪 opus-low 對照只記重試次數，沒有 token/成本數字，
所以「opus low 是否比 sonnet 划算」在成本面**無法回答**。

## D. 議程本身的裁決（v1.3 尚未逐條核准）

| # | 問題 |
|---|---|
| D-1 | `retro-agenda.md` v1.3.0-draft 是否核准轉正式（含 §6.5 臨時動議機制） |
| D-2 | §6.5 補問（本輪裁決前漏問，現在問）：**還有沒有臨時動議或訴求？** |
| D-3 | 本輪程序缺漏兩項要不要補：Layer 2 未跑 `unknowns-discovery`；A7 驗收改寫（從總 pass 率改為「GOAL+ACCEPTANCE 同缺比例」）是否採用 |
| D-4 | inbox 條目何時倒空——依 §6.5 須你確認裁決後才清。要現在清（裁決以本報告為準），還是等這份清單處理完一起清？ |

## E. 本輪未研究、留 inbox 不下結論（要不要下輪排、還是直接棄）

| # | 題目 | 現況 |
|---|---|---|
| E-1 | 非多模態 agent 的視覺任務代理（`using-design-skills` / `writing-artifacts` 撞牌風險） | 未派工。該查的是 text-only worker 收到視覺子任務時的移交契約 |
| E-2 | Claude Code self-hosted runner | 僅知 Team/Enterprise gated。若你是個人帳號，這題可能直接棄 |
| E-3 | agy / grok / build 二線 CLI 的 plugin 支援 | 未派工。與 K4（Agent Plugins）併案較省 |
| E-4 | 遠端三筆 very-long + retry-dense session 深挖：`842a6043`(20.3MB)、`cbc898bf`(agent-scripts 自身, 7.7MB)、`c26d3bd2`(7.9MB) | 已在 backlog 列下輪第一順位，確認即可 |
| E-5 | 本機 7 筆形狀一致的 17–22 行 session 來源查明 | 會系統性污染 canary 與 done-evidence 的分母 |

## F. 主軸確認

| # | 問題 |
|---|---|
| F-1 | **W33 主軸定為「機器閘門」是否同意**——高頻規則往工具路徑收編，規則寫成可判定門檻而非禁令。七處證據見 `retro-report.md` §4.5；執行清單見 `next-week-backlog.md` M1–M6 |
| F-2 | M1（讓讀檔可稽核的 Bash PreToolUse hook）是主軸的前置——**沒有它，任何「判定前須附讀檔證據」的規則都驗不到**。是否同意先做這件 |

---

## 已結案、不需你回覆（列出以免重複問）

- E1 拓撲：`100.64.190.44` 就是本機，沒重配（`retro-report.md` §0）
- codex `default_mode_request_user_input`：已套用並驗證（binary feature 清單 + `codex exec` 冒煙測試）
- A6 撤 design-consensus attic 掛牌：驗收逐字符合，做了且有效（§6）
