# Retro 續輪報告 — inbox 議題裁決輪（2026-08-07）

依據 `~/.agents/rules/retro-agenda.md` v1.3。本輪不重跑 W32 對帳
（見 `.workflow/202608071000-weekly-retro/`），重心為兩機量測 + inbox 議題研究與裁決準備。

**量測範圍變更（本輪最重要的一件事）**：使用者指定本機與 `100.77.191.62` 都要分析。
過去所有 retro 數字只跑本機——本輪首次雙機全量。

---

## 議程對帳（本報告 vs `retro-agenda.md` v1.3，逐節自查）

修訂記錄：第一版（`47fd4d2`）只做到約一半議程。使用者質問後逐節自查並補做，
以下為現況；補做的節次標「補」。

| agenda 節 | 狀態 | 說明 |
|---|---|---|
| 不變式・真相源＝GitHub remote | **補・已符合** | `git fetch` 後 `origin/main` 與本地同 `0238a99`；7 日窗 33 個 commit 出自 `git log origin/main`。第一版只讀本地 log |
| 不變式・數字自帶方法 | 符合 | collector `{value,method,tier}`；手排皆附指令 |
| 不變式・全量不抽樣 | 符合 | 雙機全掃，無抽樣 |
| 不變式・三檔產出 | **補・已符合** | 第一版缺 `next-week-backlog.md`，本次補上 |
| 不變式・範圍三 repo | **部分** | agent-scripts ✅、context-mode-local-insight ✅、**tmux-agent-tools 本機不存在**（見 §5），僅在遠端看到 HEAD |
| §1 上週 backlog 對帳 | **說明後略過** | W33 backlog 是**今早同日**（`.workflow/202608071000-weekly-retro/`）才產出，數小時大，無可對帳之事。但其中五項的早期指標已在 §1b 配對 |
| §1b 改動配對指標 | **補** | 第一版完全沒做。見 §1b |
| §2–4 Layer 1 全量粗篩 | 符合（含缺口明寫） | 雙機三 CLI 全跑；封存已含（codex `fromArchive`）；手排只補 collector 未覆蓋面 |
| §2–4 Layer 1 可疑名單 | **補** | 第一版只出 rate。見 §1c，合計 40 筆 |
| §2–4 Layer 2 定向深挖 | **部分** | D1 完成（§2）、D2 證據不足（§3）；**遠端三筆 very-long+retry-dense 未深挖**（§1c）。未跑 unknowns-discovery——記為本輪程序缺漏 |
| §5 循環工具與記憶盤點 | **補** | 第一版幾乎全漏。兩機都收，見 §5，抓到三個 P0 |
| §6 死碼盤點 | **補** | 12 支 recipe 全跑，見 §6。skill/rules 零用量仍無工具，明寫未量測 |
| §6.5 臨時動議與訴求 | 符合 | inbox 逐條處理（§4.5–4.7）。**未在裁決前再問第二次**——程序缺漏，補問見 §5 尾 |
| §7 裁決與產出 | **補** | 裁決 ✅；**lessons.md proposed 條目**第一版沒追加，本次補（見 §5 與 §7b）；需使用者決策集中 ✅ |

## §0 拓撲（E1 結案）

| 節點 | tailnet | hostname | 狀態 | 證據 |
|---|---|---|---|---|
| 本機 | `100.64.190.44` | `25006931Paul.local` | 本機自身 | `ifconfig \| rg '100\.'` → `100.64.190.44`；`uname -n` |
| 遠端 | `100.77.191.62` | `ohYEHs-MBP-14.local` | SSH 可通、活躍 | `ssh 100.77.191.62 uname -n` |
| 其他 | `100.75.172.41` mac-mini-m2 | — | active（未納入本輪） | `tailscale status` |
| 其他 | `100.73.34.79` iphone181 | — | offline 19d | 同上 |

**E1 裁決：結案。** `100.64.190.44` 沒有消失也沒重配，它就是本機。
上週之所以差點誤判，是因為 `tailscale status` 把自己列成 `offline`——那是
coordination server 連不上（Fortinet 阻擋 tailnet 同步）的副作用，不是節點狀態。

→ lessons 候選：**節點存活不以 `tailscale status` 為真相源；自身 IP 以 `ifconfig` 對照。**

---

## §1 雙機量測（agent-sessions collector v1，7 天窗）

執行：`node bin/cli.mjs agent-sessions --days 7 --json`（兩機同一 commit `53bdd6f`）。

### 工作量分布

| 指標 | 本機 100.64.190.44 | 遠端 100.77.191.62 | 遠端/本機 |
|---|---|---|---|
| claude top-level sessions | 28 | 32 | 1.1× |
| claude subagent transcripts | 49 | 120 | **2.4×** |
| subagent/top-level 比 | 1.75 | **3.75** | — |
| codex sessions | 8 | **60** | **7.5×** |
| codex duplicatesDropped | 6 | 209 | 35× |
| agy trajectories / steps | 10 / 766 | **100 / 7733** | **10×** |

**P0 發現：量測盲區。** 真正的工作量在遠端——codex 7.5 倍、agy 10 倍、
subagent 2.4 倍。W31/W32 兩份 retro 全部只量本機，等於用約 1/8 的樣本
做全域判斷。所有歷史趨勢數字（含 done-claim 惡化、canary 下滑）都必須標為
「僅本機、樣本偏誤」，不能直接跟本輪雙機數字比較。

### 行為率（雙機合併，全量不抽樣）

| 指標 | 本機 | 遠端 | 合併 |
|---|---|---|---|
| canary `✈` 出現率 | 42.9% (12/28) | 62.5% (20/32) | **53.3% (32/60)** |
| brief 三段齊全率 (GOAL+ACCEPTANCE+REPORT) | 39.3% (11/28) | 84.4% (27/32) | **63.3% (38/60)** |
| done-claim 無證據率 | 92.3% (12/13) | **100% (19/19)** | **96.9% (31/32)** |

tier：canary / brief / done-evidence 三項皆 `derived`（正則啟發式，regex 見 collector
method 欄）；session 與 transcript 計數為 `audited`。

三點解讀：
1. **brief 合規遠端明顯較好（84.4% vs 39.3%）**——遠端是主要派工機，bol hook 的
   warn 有在起作用；本機多為對談型 session，分母被稀釋。A7 驗收（pass > 70%）
   在遠端已達標、本機未達，**A7 應改為分機驗收**，否則合併數字會掩蓋差異。
2. **done-claim 無證據率合併 96.9%，遠端 19/19 全中**——比 W32 的 93.3% 更糟，且
   遠端沒有任何一筆例外。A8 的複核已不必再問「heuristic 是否高估」，先問
   「為什麼一筆都沒有」。
3. canary 53.3%：規則載入但近半數 session 沒守。屬「規則存在但沒執行」大類。

### 跨機 drift 稽核

| 項目 | 結果 | 證據 |
|---|---|---|
| kernel `CLAUDE.md` / `AGENTS.md` | **實質同版**（4.16.0-live-truth-p0），僅差結尾換行；且與 repo canonical `global/CLAUDE.md` 同 hash `5ac33691` | `diff` 全文，非只比 hash |
| `~/.agents/rules/` | 本機 9 檔、遠端 8 檔 —— **遠端缺 `retro-agenda.md`** | `diff <(ls) <(ssh ls)` |
| `~/.agents/skills/` | 本機 67、遠端 63；本機獨有 5（batch-grill-me / edit-article / obsidian-vault / wizard / writing-great-skills）、遠端獨有 1（web-design-guidelines） | 同上 |
| `agent-scripts` HEAD | 本機 `2e0cf93`、遠端 `8d41919`（落後 4 commits） | `git log --oneline -3` |
| `context-mode-local-insight` | 兩機同 commit `53bdd6f`，但**遠端有未提交改動**：`bin/agent-sessions.mjs` 把 `hits`/`total` 從裸數字改成嵌套 `{value,method,tier}`，`schema` 字串仍是 `cmli.agent-sessions.v1` | `git status --short`、`git diff` |

**注意 kernel 那列的做法差異**：先算 hash 得到「兩機不同」，若就此下結論就是誤報；
實際 `diff` 後只差一個結尾換行。這正是本輪 P0 議題（grep-and-conclude）的反例對照。

裁決建議：
- **D-1（升級，P1）**：遠端補 `retro-agenda.md`、agent-scripts 拉到最新；skills 六個
  差集逐一決定是「該部署未部署」或「該退未退」。驗收：`diff` 只剩刻意保留項。
- **D-2（升級，P1）**：遠端 collector 未提交改動要嘛提交並**升 schema 版本**
  （形狀變了卻沿用 v1，任何跨機併表的程式都會炸），要嘛還原。本輪併表就是靠特判
  才算得出來。驗收：兩機 `--json` 輸出可被同一支 parser 吃下。
- **D-3（升級，P1）**：collector 加 `--machine` / fleet 併機模式，讓 retro 一次拿雙機。
  這是 C4 的前置，否則量測盲區下週原樣復發。

---

## §1c 可疑名單（Layer 1 覆蓋契約要求，本輪手排補上）

collector 目前只出 rate 不出名單——依 agenda 這要列為 collector backlog（已有 C5）。
本輪手排補出，判準：`no-canary` / `done-no-evidence` / `very-long`(>3000 行) /
`very-short`(<15 行) / `retry-dense`（同一 Bash 指令前 40 字重複 ≥3 次，且這種指令 ≥3 種）。
兩機全掃 `~/.claude/projects/**/*.jsonl`，7 天窗，**合計 40 筆可疑**（本機 23 / 遠端 17）。

**本機頭部（旗標最多者在前）**

| 旗標 | 規模 | session |
|---|---|---|
| no-canary, done-no-evidence, very-short | 14 行 | healthgo-mobile/`f21d54b8` |
| **very-long, retry-dense(13)** | 41.9MB / 5933 行 | healthgo-mobile/**`6bc15b50`** ← 本輪 D1 深挖對象，機器判定同樣把它排第一 |
| no-canary, done-no-evidence ×7 筆（17–22 行，形狀幾乎一致） | 0.1MB 級 | healthgo-mobile/`19d5d8e5`、`2e5e2860`、`74e00b38`、`b15eac84`、`ab85a702`、`b846dcac`、`fd587baf` |
| retry-dense(3) | 4.6MB | agent-scripts/`be456e92` ← **本 retro session 自己** |
| retry-dense(3) / (4) | 4.4 / 3.9MB | healthgo-mobile/`a4d894b5`、core-parking-service/`b449f027` |

**遠端頭部——三筆從未被檢視過的重量級可疑 session：**

| 旗標 | 規模 | session |
|---|---|---|
| very-long, retry-dense(13) | 20.3MB / 5496 行 | healthgo-mobile/`842a6043` |
| very-long, retry-dense(8) | 7.7MB / 3945 行 | **agent-scripts/`cbc898bf`** |
| very-long, retry-dense(6) | 7.9MB / 3982 行 | healthgo-mobile/`c26d3bd2` |
| retry-dense(5) | 5.5MB | healthgo-mobile/`fd7e9719` |
| no-canary ×6 | 0.1–0.6MB | ttpush4-ios ×4、paul-photo-gallery、healthgo-mobile ×2 |

三個觀察：
1. **機器判定與人類判定一致**：使用者點名的 `6bc15b50` 本來就是本機第一名。
   說明這份名單有預測力，值得工具化（C5）。
2. **遠端那三筆 very-long + retry-dense 是下輪 Layer 2 的第一順位**，本輪完全沒碰——
   包括一筆發生在 `agent-scripts` 自己身上的（`cbc898bf`）。明寫：**本週未深挖**。
3. **本機那 7 筆形狀幾乎一致的 17–22 行 session**（同樣 no-canary + done-no-evidence）
   看起來是同一種自動化短 session 被重複產生。若屬實，它們會系統性地污染
   canary 與 done-evidence 的分母——這是 §1 那些 rate 的一個具體偏誤來源，需查明。
4. **本 retro session 自己也上榜**（retry-dense 3）。不豁免自己。

## §2 D1（P0）—— grep-and-conclude 失智迴圈

對象：sid `6bc15b50-ca9d-433c-9b40-50f923457bf1`
（`~/.claude/projects/-Users-paul-yeh-git-healthgo-healthgo-mobile/`，41.7 MB、5847 records、
1587 assistant records、77 則真人訊息）。全檔掃描，非抽樣。

### (a) 迴圈的機械性根因

| 指標 | 值 | 方法 |
|---|---|---|
| Read tool 呼叫 | 95 | tool_use.name === 'Read' |
| Bash 呼叫 | 661 | tool_use.name === 'Bash' |
| 其中含 `cat`/`sed -n`/`head -`/`tail -`/`awk` 的讀檔 | **500** | 對 command 正則 |
| 其中屬**截斷式**讀取（head/tail/sed 範圍） | **483 / 500** | 同上 |
| 其中含 `rg`/`grep` | 354 | 同上 |
| Grep tool 呼叫 | **0** | 專用工具完全沒用 |
| → 讀檔行為走 Bash 的比例 | **84.0%**（500 / 595） | 500/(500+95) |

根因不是態度，是**路徑**：
1. **它幾乎沒有一次看完整個檔案。** 483 次截斷讀取代表判斷建立在片段上——
   「grep 到就下結論」是這個事實的表徵，不是獨立的壞習慣。
2. **這些讀取對工具層完全隱形。** 84% 走 Bash、Grep tool 用 0 次，所以任何掛在
   Read/Grep tool 上的 hook、任何「判定前需附讀檔證據」的檢查，都抓不到它。
   換句話說：**就算現在寫一條「判定類宣稱必附讀檔證據」的規則，也驗不到。**

### (b) 同錯重複的直接證據

真人糾正 8 則 / 77 則（10.4%），其中：

| # | 原文（節錄） | 性質 |
|---|---|---|
| C1 | 「不是 kDebugOutline 你理解到哪去」 | 讀錯目標 |
| C2 | 「你開模擬器幹啥啦 usb 那個裝置測試 腦殘什麼 規範都不看？」 | lessons 2026-07-27 已有規則仍犯 |
| C3 | 「腦殘喔 我們自己簽的 /shared-memory-intake 你幹的事都忘了　專案內也有紀錄吧？」 | 沒查專案記憶 |
| C4/C5/C6 | 「你到底幹啥啦 我們是用自己簽的 你到你在弱智啥 /shared-memory-intake 還以專案記憶不都寫很清楚？」 | **同一句被使用者重貼三次** |
| C7 | 「按刪除也會影響到數量 read 有做嗎」 | 矩陣覆蓋漏項 |
| C8 | 「你 STUB 有點亂寫　解鎖門檻是人生積分 不是剩下多少」 | 領域規則寫反 |

**C4/C5/C6 是同一句糾正被重貼三次**——這是「session 內糾正不成約束」最硬的證據：
使用者不是換句話說，是原句照貼，因為前兩次貼了沒有改變行為。
加上 C3 同主題，`/shared-memory-intake` 這一件被糾正 **4 次**。

C3 之後的動作序列也印證：agent 連下 7 個 Bash（`rg -il`×2 → `rg -n -B3 -A12` → `cat ... | head -90`
→ `sed -n ... | head -70`），然後自己承認「**全部都有紀錄，是我沒查**」。
資料一直都在，缺的是「先讀」這一步。

### (c) 術語過度翻譯（併查案）

assistant 文字段落 218 段中，中譯技術詞出現 **71 次、涉及 16 種**：

`節流`(throttle) ×33 · `旗標`(flag) ×8 · `快取`(cache) ×7 · `編譯` ×4 · `斷言` ×3 ·
`建置` ×3 · `元件` ×3 · `斷點` ×2 · `覆寫`/`非同步`/`部署`/`回呼`/`端點`/`實例`/`執行緒`/`相依` 各 1

「節流」一詞獨佔 33 次，是主要污染源。kernel 明文「code、identifiers、commands、
filenames、API names、technical literals 保留英文」——規則在、未執行，與 canary 53.3%
同一類別。

### D1 建議裁決

- **升級（P0）**：**證據要走得到工具路徑**。對策不是再寫一條規則，而是先解決
  「84% 讀檔隱形」——否則任何證據型檢查都是空轉。最小可行：在 Bash 的
  PreToolUse hook 把 `cat|head|sed|awk` 形式的整檔讀取識別為讀檔事件並記錄，
  讓「判定前讀了什麼」變成可查的機器事實。驗收：對本 sid 重播能算出讀檔覆蓋率。
- **升級（P1）**：**同錯重複要有機器計數**。使用者重貼同一句糾正 ≥2 次，是可偵測訊號
  （相似度比對即可）。collector 出「重複糾正」名單，進 C5 的可疑名單。
  驗收：下週 retro 這份名單非手工翻找。
- **升級（P2）**：術語翻譯做成 stop-slop 級檢查——固定詞表（節流/旗標/快取…）
  在回覆送出前掃描。驗收：下週同類 session 中譯術語次數降到個位數。

---

## §3 D2 —— `--prompt-file` 誤派時間線

**證據不足，且不足本身就是發現。**

- 兩機 `~/.claude/projects` 全掃，含 `--prompt-file` 的 transcript 僅 4 支，且其中
  今日兩支的命中都是**文件內容**（`delegation-templates` 的 SKILL.md、本 retro session
  自己的討論），不是實際誤派的指令。
- `~/.tmux-agent-tools` 在**兩機都不存在**；worker `result.json` 一筆都找不到。

推論（標 `UNCONFIRMED`）：該次誤派發生在 tmux worker 派工路徑上，而該路徑
**不落任何可稽核的 transcript**。這與 W32 的「worker result.json 7d = 0」是同一件事的兩面：
不是沒派工，是派工沒留痕。

- **升級（P1）**：tmux 派工必須落痕（每次派發寫一筆帶指令原文的 record）。
  這同時是 T4 的前置——沒有痕跡，T1 合規曲線永遠零樣本。
  驗收：下週能從機器上重建任一次派發的指令原文。
- 使用者提的「派工步驟化」提案（先起 session 不帶 `--prompt-file` → 確認 ready →
  result init → `send --from-file` → 確認處理中 → 監督）**建議直接升級為 W33 項目**，
  不再等更多證據：規則早已在 lessons（2026-07-28）卻仍踩，屬「規則沒進工具路徑」。

---

## §4 生態採用束（P1–P5 pre-read）

五件全數外派 Agent tool、**全用 opus + effort low**（兼作 sonnet 效益的對照實驗）。

**原始 REPORT 逐字保留在 `pre-reads/` 子目錄**，未經編輯——下方各節是主 session 的摘要與裁決，
兩者刻意分開，好讓「worker 說了什麼」與「我怎麼裁決」可以分別稽核：

| # | 原始檔 | 主題 |
|---|---|---|
| P1 | [`pre-reads/P1-agentplugins.md`](pre-reads/P1-agentplugins.md) | Agent Plugins v1.0.0 規格與治理 |
| P2 | [`pre-reads/P2-kirocrew.md`](pre-reads/P2-kirocrew.md) | KiroCrew 五維對照 |
| P3 | [`pre-reads/P3-advisors.md`](pre-reads/P3-advisors.md) | fable-advisor ＋ sol-advisor |
| P4 | [`pre-reads/P4-mattskills.md`](pre-reads/P4-mattskills.md) | mattpocock/skills 差集（含 5 個 404 發現） |
| P5 | [`pre-reads/P5-codemap.md`](pre-reads/P5-codemap.md) | codemap 手法 |

（同源 transcript 為 `~/.claude/projects/-Users-paul-yeh-git-agent-scripts/be456e92…/subagents/agent-aP*.jsonl`，
會隨 session 輪替消失，故落檔進 repo。）

### P1 Agent Plugins（agent-plugins.org v1.0.0）

- **是什麼**：vendor-neutral 可攜套件格式。一個目錄 + root `plugin.json`（closed schema，
  必填只有 `$schema` 與 `name`）；v1 只定義兩種 component：`skills/`（格式委外給
  agentskills.io）與 `mcp.json`。**commands / hooks / agents / rules 明文排除**，
  client 專屬物只能進 `extensions` 的 reverse-domain namespace，而規格對那裡
  「assigns no portable semantics」。**registry / distribution / installation 刻意不定義**（issue #41 仍 open）。
- **治理事實（決定性）**：TSC 為 Amazon / Cursor / Microsoft / OpenAI / Vercel，**Anthropic 不在名單**；
  官方 compatible clients 五個（VS Code、Cursor、Copilot、ChatGPT & Codex、Kiro），
  **Claude Code 不在其中**。
- **與我們重疊**：只有「目錄佈局」一層——`skills/<name>/SKILL.md` 本來就符合，字面零改動。
  我們真正的資產（`.agents/rules/`、workflows、hooks、`global/`）全在 v1 範圍外。
  相對 Claude Code 的 `.claude-plugin/plugin.json` + marketplace，它**不是 rename，是縮小的重疊子集**。
- **建議裁決：只偷概念**，＋一個 15 分鐘例外。標準化的正好是我們早已對齊的部分，
  痛點全在範圍外且無 registry 可用；主 runtime 之一（Claude Code）未列相容，
  「整套」現在拿不到可驗證的互通性。例外：若要對 VS Code / Cursor / Codex 開放 skills，
  加一個 6 行 root `plugin.json` 即可，不動既有檔案。
  可偷概念兩個：**closed manifest schema**（未知欄位 report-and-ignore、其他違規 fatal）、
  **client 專屬物一律進 reverse-domain namespace** 的隔離紀律。
- UNCONFIRMED：各 client 實際 conformance；Claude Code 是否有未公開支援（CHANGELOG 無字樣屬缺席證據）。

### P2 KiroCrew

- **是什麼**：不是規則庫，是**常駐 Gateway 產品**——單一 asyncio 進程把 dashboard / Slack /
  Telegram / CLI 多工到 `kiro-cli` 的 ACP runtime，自補 session 持久化、六層記憶、
  hooks、cron、subagent 派生、審批仲裁、metrics。**與我們不同層**：我們是 prompt/rules
  治理層，他們是 process/state 基礎設施層。
- **五維對照**：(a) 編組 **我們更好**（他們無 role→model tier 表、無 effort 階梯、無 reviewer
  獨立性規則）；(c) 驗收 **我們明顯更好**（他們的 done 只有 dashboard 圖示，無 verdict schema、
  無 result.json、無「證據須本 session 執行」）；(e) 跨 runtime **我們更好**（他們綁死 kiro-cli，
  「跨」是跨 surface 不是跨 CLI，且明文「Foreign-agent hooks are never imported」）；
  (b)(d) 他們有東西可偷。
- **值得偷的三項**：
  1. **`.kiro/specs/<slug>/{requirements,design,tasks}.md` 三件套**——`requirements.md` 有
     Glossary（把 `Config_Loader` 定成專有名詞）＋ **EARS 句式驗收標準**（`WHEN … THE … SHALL`）
     ＋編號 `Requirement N`；`tasks.md` 每個子任務尾行掛 **`_Requirements: 1.1, 1.2_` 反向追溯**，
     並穿插顯式 **`Checkpoint` 任務**。我們的 `plan.md` 沒有需求編號、沒有 task→requirement
     追溯、驗證點靠自律而非計畫裡的節點。**最高價值。**
  2. **回報截斷的機制化**：截斷時回「短 preview + transcript 路徑」，父 agent 用
     `spawn_status(offset, limit, grep)` 分頁取回，前綴 `showing lines X-Y of N | more available`。
     我們 delegation footer 的「30 行上限 + 長內容寫 artifact」是靠 prompt 請 worker 自律，
     他們是 runtime 強制。
  3. **量測回饋進調度**：`dynamic-subagent-sizing` 取樣 subagent 的 RSS/CPU high-water
     寫 `cost_samples.jsonl`，下次用每 agent 最近 N 筆的 p90 算併發上限
     `clamp(min(mem_term, cpu_term), 3, 32)`。**我們的量測只用來報告，從不回頭改派工決策**——
     這條直接對上 rate-limit 訴求。
  4. 附帶：`no nesting`（subagent 不能再 spawn）他們由 runtime 強制，我們同語意規則只是 prompt 文字。
- **建議裁決：只偷概念**（上列三項），整套與部分皆棄——那是要裝 wheel、開 port、綁 kiro-cli
  的產品，且在三個維度落後我們。
- 誠實度對照：他們的 metrics 有自覺（註明 turn duration 含人類審批等待），但**沒有制度化的
  trust tier**；我們 `metric-contract.mjs` 的 audited/derived/withheld 三層仍領先。

### P3 fable-advisor ＋ sol-advisor

- **不是輕重版本**：同一套 architect doctrine 在兩個 runtime 各自實作。fable = 跨廠商
  （Claude Opus 當 architect，`codex exec --model gpt-5.6-luna` 打字）；sol = 同廠商內分層
  （Sol/High primary → Terra/High implementer → **fresh** Sol/High reviewer，`fork_turns: none`），
  README 自己明言 review「not model-family-independent」。fable 另有 **Lite mode**：
  只複製 advisor agent，session 留在 Sonnet，只在 commitment boundary 找顧問。
- **我們已有的**：五段 spec、lane routing、失敗一次改 spec 兩次升級、reviewer 非作者、
  worker report = claim、structured REPORT——`model-dispatch.md` §1–§8 + delegation-templates
  全部覆蓋，且**我們的 effort 維度他們完全沒有**。
- **我們真的沒有的三條**（全部是 `model-dispatch.md` 約 10 行文字）：
  1. **「architect 不准自己打字」的可判定門檻**：*程式碼區塊長過 interface signature，
     就是一個還沒 delegate 的 spec*；連親手修 lane 的 bug 也算違規（須退回改 spec）。
     我們 §2 預設方向相反（自己做，達標才外派）。
  2. **強制的 end-of-deliverable fresh-eyes review gate**：ALWAYS once at the end，
     讀 diff 對照 stated goal 而非對話，回三值 verdict。我們 §6 是條件式。
  3. **Claude 的 model pin 若帳號沒有該模型會靜默 fallback 到 session model**——
     這條對我們 `fable` tier 是真的補洞。
- **三個訴求逐條回答**：
  - rate-limit：**部分**。降的是 architect 端 token 體積，不是 subagent 數量；
    它反而**多加**一次強制 review 呼叫。零成本數字（唯一量化敘述是「a typical consult costs cents」）。
  - sonnet vs opus-low：**否**。兩 repo 都沒有 effort 維度的成本論證，也沒有 per-success 比較；
    它的答案是「換模型家族」而非「換 effort」。我們 §5 在這件事上更完整。`UNCONFIRMED`：無任何 benchmark。
  - WORKER|REVIEWER：**是**。這是它最明確的貢獻——強制配對、reviewer 一律唯讀絕不自己修、
    必須 fresh context；Lite mode 給了「不搞 orchestration 就只留 advisor」的最小落地形。
- **建議裁決：只偷概念**（偏部分），棄整套。80% 只靠編 `model-dispatch.md` 就拿得到，
  不需要新 agent 檔或 plugin；剩下 20%（routing evidence 稽核、plugin 分發）對我們無價值。

### P4 mattpocock/skills × using-skills 差集

**先講一個比差集更重要的 live-truth 發現，且已由主 session 獨立驗證：**

`skills-lock.json` 的 19 個 mattpocock 條目中 **5 個 skillPath 已 404**——上游又動了一次，
不只是 31c4357 那次搬家。主 session 逐一 `curl -o /dev/null -w '%{http_code}'` 覆驗：

| skill | lock path | HTTP | 接班路徑 | HTTP |
|---|---|---|---|---|
| `wizard` | `skills/in-progress/wizard/` | **404** | `skills/engineering/wizard/` | 200 |
| `writing-great-skills` | `skills/productivity/writing-great-skills/` | **404** | `skills/productivity/writing-for-agents/`（改名） | 200 |
| `batch-grill-me` | `skills/in-progress/batch-grill-me/` | **404** | `productivity/grilling` 等三分家 | 200 |
| `edit-article` | `skills/personal/edit-article/` | **404** | `skills/personal/` 整個目錄消失 | — |
| `obsidian-vault` | `skills/personal/obsidian-vault/` | **404** | 同上（另有 kepano/obsidian-skills 可替代） | — |

**這直接打到 `using-skills/SKILL.md` 兩處**：Grilling 家族說「`batch-grill-me` 是唯一 grill
member」、Fleet meta 說「`writing-great-skills` 在每次 skill 寫作時載入」——兩個名字上游都沒了。
**retro 應先修這個，再談採不採新東西。**

上游 HEAD 現存 35 個活 skill（engineering 18 / in-progress 6 / misc 4 / productivity 7）；
已採用 14 個路徑仍有效。**未採用但有用的（bucket b）**：

| skill | 打到的痛點 | 為什麼有用 |
|---|---|---|
| `productivity/writing-for-agents` | **四個痛點的上游根因** | 整包唯一的理論文件，也是 `writing-great-skills` 死連結的接班人。三個可操作槓桿：**completion criteria 的 clarity vs demand**（vague bound 邀請 premature completion → 直接解釋「無證據宣稱 done」）；**negation 是失敗模式，要 prompt the positive**（我們 CLAUDE.md 大量用禁令句式）；**no-op 測試**（model-relative，靠跑不靠辯，可拿來瘦身我們的 rules）；**cache vs environment**（restate 環境查得到的東西就是 stale cache——與我們 P0 live-truth 同理，但寫成可執行的剪枝規則） |
| `engineering/code-review` | 無證據宣稱 done ＋ grep 不讀 code | 兩軸平行 sub-agent：Standards（照不照 repo 文件化規範）＋ **Spec（有沒有做到 originating issue 要的）**。Spec 軸強迫回去對照原始需求，是我們 `verification-before-completion` 缺的那一半 |
| `productivity/wait-what` | 太多敘述 ＋ 術語亂翻 | 全文一句 slash command，`disable-model-invocation: true` 純人觸發。要偷的是它引的 **ASD-STE100 Simplified Technical English**——航太業受控英語標準，規定術語一詞一義、不換詞，剛好同時治「敘述太多」與「亂翻術語」 |
| `misc/git-guardrails-claude-code` | hard boundaries | 用 Claude Code hooks 在執行前擋掉 `push` / `reset --hard` / `clean` / `branch -D`。我們 CLAUDE.md 說「critical gates 由 tooling 執行，不靠 prompt ceremony」——**這就是那個 tooling，現成的** |
| `productivity/grilling` | — | 純為補 `batch-grill-me` 死連結；`grill-with-docs` 邊問邊產 ADR + glossary，對應我們 `domain-modeling` 的配對用法 |

**taste-skill 家族裁決（回答使用者「我們用哪版？好像改微調一下」）**：上游 `Leonxlnx/taste-skill`
共 13 個、我們已採 5 個，未採 8 個。**這一族完全打不到那四個痛點**——全是視覺方向 skill，
且 `using-skills` 已明訂 design-visual 一律走 `using-design-skills`、預設 `impeccable`，
再加三個風格 skill 只會讓 router 更難仲裁。唯一可考慮的 `redesign-existing-projects`
與 `design-taste-frontend` 已寫的「audit-first on redesigns」重複。
→ **建議：不擴充、不微調 body**（動 body 即成 fork，需 frontmatter 註明偏離）。
若使用者的「微調」指的是別的具體點，請指定。

**不適合我們（bucket c）**：`to-spec` / `to-tickets` / `implement`（綁 issue tracker，
與 `.workflow/<ts>-<slug>/` + codex-dynamic-workflows 直接衝突，別混）、
`handoff` / `claude-handoff`（我們有 session-handoff + session-titles）、
`loop-me`（我們有 `/loop` 與 using-workflows）、`ask-matt` / `setup-matt-pocock-skills`。

**建議裁決**：
- **升級（P0，先做）**：修 `skills-lock.json` 5 個死路徑 ＋ `using-skills/SKILL.md` 兩處失效引用。
  驗收：全 lock 條目 `curl` 回 200。
- **升級（P1）**：採 `writing-for-agents`（整套）——它是四個痛點的共同上游理論。
- **升級（P1）**：採 `git-guardrails-claude-code`（整套）——現成的機器閘門。
- **部分**：`code-review` 的 Spec 軸概念併入我們的 review 流程；`wait-what` 只偷 ASD-STE100。
- **棄**：taste-skill 擴充、issue-tracker 流水線那一族。

### P5 codemap 手法

- **是什麼**（推文本體 402，逐字內容來自搜尋摘要，全文 `UNCONFIRMED`）：讓 Codex 產
  `docs/codemap/codemap.html` + `codemap.json` + `codemap.lock` 三個檔；維持準確的機制不是
  重跑審計，而是在 `AGENTS.md` 加一條「每個改碼任務開始時先把當前 repo 比對 `codemap.lock`」。
- **重要更正**：原文說的是 **changed since the map was generated**，不是「偏離 documented intent」——
  drift 偵測是機械式的快照比對，不是語意判斷。派工 brief 裡的描述比原文強，worker 讀到原文後
  自行更正，這個差別直接改變了結論（從「部分採用」降為「只偷概念」）。
- **公開實作：沒有**。同名但無關的是 `JordanCoin/codemap`（Go CLI）與 Windsurf Codemaps。
- **與我們重疊**：`skills/using-workflows/workflows/docs-vs-code-audit.workflow.js`
  （meta：Truth = code, never old docs）與 `design-vs-code-audit.workflow.js`（7 類 drift 分類、
  對抗式逐項驗證、design-WIP 感知）**都更強**——codemap 只知道「檔案變了」，不知道
  「行為偏離了宣稱」，而後者才是 drift 的貴重部分。
- **建議裁決：只偷概念，且不落在 agent-scripts 本身。** 此 repo 沒有 `src/`、沒有模組呼叫圖，
  「模組」就是 skills 與 workflow recipes，清單已由 `workflow-manifest.workflow.js` 與
  `skills-lock.json` 在管，再蓋一層 `codemap.html` 是純重複。唯一值得偷的是
  **廉價 lock 前置閘**：把「先比對快照、只有標記過期的 group 才進 audit」當取樣器，
  是給現有 recipe 加一個 `changedSince` 入口參數，不是新 recipe。
  **現在不做**，等真的出現「audit 太貴、想只掃變動範圍」的具體痛點再加。完整 HTML 地圖：棄。

---

## §1b 改動配對指標（agenda 要求，補做）

上週每項行為性改動配一個 Layer 1 前後指標。資料源：
`~/.local/share/agent-hooks/bol-prompt-stats.jsonl`（兩機）。

**先講一個量測缺陷**：遠端該檔**混入 pretty-printed 多行 JSON**，破壞 JSONL 格式——
145 行裡 55 行無法逐行 parse。我第一次算出「remote 7d = 85」是**低估的**；
改用括號配對切頂層物件後才得到 93。寫 hook 的那支程式在某些路徑下沒有壓成單行。

| 上週改動 | 配對指標 | W32 基線 | 本輪（雙機 7d） | 判定 |
|---|---|---|---|---|
| A7 bol warn 內嵌 delegation-templates 骨架 | bol pass 率 | 48.6%（18/37，僅本機） | 本機 53.5%（23/43）· 遠端 46.7%（42/90）· **合併 49.2%（65/132）**（exempt 4 筆已排除） | **做了、未達驗收**。A7 驗收寫「> 70%」——差 20 個百分點 |
| 同上（A7 的前提假設） | fail 的 missing 欄位分布 | 「GOAL+ACCEPTANCE 同缺 8/19」 | 合併 fail 68 筆：`ACCEPTANCE+GOAL` **30**、`ACCEPTANCE+GOAL+REPORT` **18**、`GOAL` 11、`ACCEPTANCE` 6、其餘 3 | **前提成立且更嚴重**：48/68（70.6%）是 GOAL 與 ACCEPTANCE 同缺，比 W32 的 42% 上升 |
| judgment-rubrics §2（`8d41919`，verdict 讀 result.json 不讀 exit code） | done-claim 無證據率 | 93.3%（僅本機） | 合併 96.9%（見 §1） | **無法驗證有效性**：改動在 8/7 才進 main，7 天窗內幾乎沒有生效時間。這本身是 finding——規則改動與量測窗口不對齊 |
| bol 豁免 search 型 subagent（`f127f54`） | exempt 筆數 | 未量測 | 本機 1、遠端 3 | **做了、有效但樣本太小**：4 筆無法判斷豁免規則是否過寬 |
| 撤 design-consensus attic 掛牌（A6） | recipe uses | uses=5 | uses=5、`consecutive_zero_weeks=0` | **做了、有效**（見 §6） |

→ **A7 建議：升級並改寫驗收**。目標不該是總 pass 率（分母混了對談型 session），
而是「GOAL 與 ACCEPTANCE 同缺的比例」——那是 warn 訊息直接針對的東西，而它反而惡化了。
這代表 warn 內嵌骨架**沒有進到派工路徑**（與 §4.5 主軸同一根因）。

## §5 循環工具與記憶盤點（agenda 要求，補做 — 兩機都收）

| 項目 | 本機 100.64.190.44 | 遠端 100.77.191.62 | 判定 |
|---|---|---|---|
| `~/.agents/rules/lessons.md` | 4,006 bytes，格式為 `Date:` / `Trigger:` / `Status:` 多行區塊；最新條目 **2026-07-30**；**本週（8 月）新增 0 筆** | 14,143 bytes，格式為 `## YYYY-MM-DD \| scope: … \| trigger: …` + `Rule:` + `Status:` 單行；最早回溯到 2026-07-10；mtime 8/1 | **P0 findings 三個**（見下） |
| `~/.agents/shared-memory-inbox/pending/` | **8 筆**，最舊 2026-07-27（積齡 **11 天**） | **7 筆**，最新 2026-08-04 | 合計 **15 筆積壓**，且**兩機各自積壓、互不相通** |
| `~/.codex/memories/rollout_summaries/` | 94 檔，最新 mtime 8/4 | **184 檔**，最新 mtime 8/3 | 兩機數量差近一倍；官方摘要也沒有跨機同步 |
| `MEMORY.md` | mtime 8/4 10:54 | 未逐項比對 | — |
| hook stats（bol） | 44 筆，格式正常 | 93 筆，**格式破損**（混 pretty-print） | 見 §1b |
| `tmux-agent-tools` repo | **本機不存在**（`~/git` 無此 repo） | 存在，HEAD `f1d7995` | **不變式破口**：agenda 說三 repo 一起看，但本機做不到 |

**P0 findings：**

1. **本機 lessons.md 格式偏離 `maintenance.md §3`。** 遠端用的是檔頭自己宣告的格式
   （`## date | scope | trigger` + `Rule:`），本機用的是另一種。同一個檔名、兩種 schema。
2. **本機 lessons.md 本週新增 0 筆**——而 D1 光一個 session 就抓到 **8 條使用者糾正**，
   agenda §7 的門檻是「使用者糾正一次即記」。**這是本輪最直接的「規則存在但沒執行」**：
   不是規則沒寫清楚，是連寫都沒寫。
3. **lessons.md 是 local-only 設計，代價現在具體化了**：兩機各自累積、格式還不同，
   沒有任何一台看得到全部教訓。本輪 D2 追查的 `--prompt-file` 坑（lessons 2026-07-28
   記載過）——**本機 lessons.md 最新只到 07-30 且沒有這條**，它在遠端。
   派工發生在哪台，教訓就只在哪台，等於循環斷在機器邊界上。

建議裁決：
- **升級 P0**：lessons.md 格式統一到 `maintenance.md §3`，並補記本週糾正（至少 D1 的 8 條去重後）。
- **升級 P1**：lessons.md 的跨機問題要有明確設計——要嘛承認 per-machine 並在 retro 固定合併，
  要嘛改為 repo 內同步（但那與「local-only」的原始理由衝突，需使用者裁決）。
- **升級 P1**：shared-memory-inbox 15 筆積壓兩機分別消化；最舊 11 天。
- **升級 P2**：`bol-prompt-stats.jsonl` 寫入路徑修成嚴格單行 JSONL。
- **升級 P2**：本機補 clone `tmux-agent-tools`，否則三 repo 不變式在本機永遠殘缺。

## §6 死碼盤點（agenda 要求，補做）

`scripts/recipe-usage-stats.sh` 逐支跑完 12 支 recipe（`~/.claude/workflows/*.workflow.js` 全量）：

| recipe | uses | consecutive_zero_weeks |
|---|---|---|
| design-vs-code-audit | 8 | 0 |
| consensus-gate | 7 | 0 |
| design-consensus | 5 | 0 |
| docs-vs-code-audit | 5 | 0 |
| workflow-manifest | 5 | 0 |
| findings-triage / plan-pipeline / spec-implement-dual-review-verify | 4 | 0 |
| feature-lifecycle-auto / feature-plan-consensus / project-direction-review / root-cause-deep-dive-audit | 2 | 0 |

**結論：無死碼**，12/12 皆有使用、零連續零週。A6（撤 design-consensus 掛牌）驗收條件
「uses=5、zero_weeks=0」逐字符合 → **A6 做了且有效**。

兩個誠實註記：
- 這支腳本數的是「recipe 名字在 `.workflow/` 樹裡的檔案命中數」，**不是真實執行次數**。
  本輪的 `pre-reads/P5-codemap.md` 就提到了 `docs-vs-code-audit` 與 `design-vs-code-audit`
  ——**我的報告本身會推高它們的 uses**。這個指標有自我膨脹的結構問題，該記為 collector backlog。
- **skill / rules 的零用量統計仍無工具**（W32 就記過的缺口，本週仍缺）。明寫「本週未量測」。

## §4.5 機器閘門束（建議定為 W33 主軸）

本輪三處證據匯到同一個結論，這一束是本輪最有行動力的產出。

**證據匯流**：
1. D1：84% 讀檔走 Bash、Grep tool 用 0 次 → **證據型規則現在驗不到**。
2. §1：done-claim 無證據率合併 96.9%、遠端 19/19 全中；canary 53.3% → **規則存在但沒執行**。
3. D2：tmux 派工不落痕 → **連要不要罰都無從判斷**。
4. P4：`git-guardrails-claude-code` 是**現成的** Claude Code hook 閘門實作。
5. P2：`no nesting`、回報分頁、量測回饋調度——他們**由 runtime 強制**，我們同語意規則只是 prompt 文字。
6. P3：「code block 長過 interface signature 就該 delegate」是**可判定**的門檻寫法範本。
7. P4：`writing-for-agents` 的 **no-op 測試**（model-relative、靠跑不靠辯）給了刪規則的判準；
   **negation 是失敗模式** 則說明我們大量禁令句式本身在幫倒忙。

**主軸命題**：高頻動作的規則往工具路徑收編（hook / wrapper / validator），
文件只留低頻判斷；且**規則要寫成可判定門檻，不是禁令**。

| 題 | 建議裁決 |
|---|---|
| Osmani constraints 圈（deterministic checks the model can't argue with） | **升級**：定為 W33 主軸的理論框架。落地順序＝先讓讀檔可見（D1）→ 再加閘門 |
| Debug Loop 證據契約（無證據目錄不算完成、regression test 先紅後綠） | **升級 P1**：與 A8 合併為一項。A8 已不必再問 heuristic 是否高估（遠端 19/19），直接設計對策 |
| tmux 派工步驟化（使用者提案） | **升級 P1**：不再等更多證據，收編進 tmux-agent-tools wrapper，含 D2 的落痕要求 |
| A8 done-claim 無證據 | **升級 P0**：合併 96.9%、遠端無一例外，改為分機驗收 |
| 規則文件改不動行為（Claude 自提，三欄稽核提案） | **升級 P1**：三欄稽核（規則 → 有無工具路徑 → 可否機器驗）就是本束的執行清單 |
| `git-guardrails-claude-code` | **升級 P1**：整套採用（見 §4 P4） |
| 七條精簡 AGENTS.md 對照 | **部分**：`no backward compat` / `no stopgap` / `grow in layers` 三條值得吸收；
其餘與現有 kernel 重複。**併入本束**——用 `writing-for-agents` 的 no-op 測試決定刪哪些 |

## §4.6 派工經濟束

| 題 | 建議裁決 |
|---|---|
| rate-limit（sub-agent 開太多） | **升級 P1**：抄 KiroCrew 的**量測回饋調度**（cost_samples p90 → 併發上限）。我們的量測目前只報告不回饋，這是唯一有機制的解法。本輪自己就實測了並行上限 3 可行 |
| sonnet 效益差、opus+low 是否更划算 | **本輪有數據，見 §6**。P3 明確答「否」——兩個 advisor repo 都沒有 effort 維度的成本論證。**建議：以本輪 5/5 一次過的結果先採 opus+low 為 research 型 worker 預設，續累積樣本**；不從外部 repo 找答案 |
| WORKER\|REVIEWER 編組 | **升級 P1**：採 P3 三條（architect 不打字的可判定門檻、收尾強制 fresh-eyes review、model pin 靜默 fallback 警告），全部落在 `model-dispatch.md` 約 10 行 |
| fable-advisor / sol-advisor | **只偷概念**，棄整套（見 §4 P3）。80% 靠編 model-dispatch.md 即可 |
| LOOP 執行姿態訴求（主動推進、完整完成、修根因、安靜等待） | **升級 P1**：與 §4.5 同源——「完整完成」需要可判定的完成定義，否則姿態要求會退化成語氣要求。`writing-for-agents` 的 completion criteria clarity vs demand 是現成理論 |
| KiroCrew `.kiro/specs` 三件套（EARS 驗收 + `_Requirements:` 反向追溯 + Checkpoint 任務） | **升級 P1**：本輪最高價值的外部收穫。我們 `plan.md` 沒有需求編號與 task→requirement 追溯 |
| 非多模態 agent 的視覺任務代理（using-design-skills / writing-artifacts 撞牌風險） | **未研究**：本輪未派工，**不下結論**。留 inbox，下輪定向查（該查的是：text-only worker 收到視覺子任務時的移交契約） |
| Claude Code self-hosted runner | **未研究**：僅知 Team/Enterprise gated。留 inbox；使用者為個人帳號的話這題可能直接棄 |
| agy / grok / build 二線 CLI 的 plugin 支援 | **未研究**：本輪未派工。與 P1 有關聯（Agent Plugins 相容清單含 Codex 不含 Claude Code），下輪與 P1 併案 |
| prompt library 六模式（抑制造輪子） | **部分**：我們已有 ponytail ladder（reuse → stdlib → 既有依賴）在管造輪子。真缺的是**穩定度量測**，不是更多 prompt 指示。建議併入 §4.5——造輪子是「規則在但沒執行」的又一例 |

## §4.7 雜項束

| 題 | 建議裁決 |
|---|---|
| 話少 / stop-slop 訴求（與現行 CLAUDE.md 敘述規則衝突） | **需裁決**：kernel 現行規則要求 tool-call 之間的每段narration 都算 reply、都要守語言與 `✈` 規則，這與「過程話少」直接衝突。建議改為：**narration 只在重要發現或連續失敗時出聲**，`✈` 只在 turn 結尾一次。這要改 kernel，**必須使用者核准**（見 §5） |
| 術語過度翻譯 | **升級 P2**（見 D1）：71 次／16 種，「節流」×33。做成固定詞表的 stop-slop 級檢查；概念偷 ASD-STE100 |
| codex `default_mode_request_user_input` | **✅ 已完成並驗證**（binary feature 清單確認 key 存在 + `codex exec` 冒煙測試）。體感確認後收進 provisioning 標配 |
| Agent Plugins 標準 | **只偷概念** + 6 行 `plugin.json` 例外（見 §4 P1） |
| KiroCrew | **只偷概念**三項（見 §4 P2） |
| mattpocock skills | **P0 先修 5 個死路徑**，再採 `writing-for-agents` 與 `git-guardrails`（見 §4 P4） |
| codemap | **只偷概念，現在不做**（見 §4 P5） |
| taste-skill 微調 | **不擴充、不動 body**；使用者若指的是別的具體點請指定（見 §4 P4） |
| CLAUDE.md routing 行新增 | **待使用者核准**（見 §5） |
| shared-memory-inbox 8 筆 pending ＋ intake 單點依賴（只有 Codex 能 promote） | **升級 P2**：D1 裡 `/shared-memory-intake` 被糾正 4 次，說明這條路徑的可發現性本身有問題。清 pending 之外要處理單點依賴 |
| compaction 吃掉進行中調查（Claude 自提） | **觀察**：本輪自身經歷兩次 compaction 而工作未丟（靠 run dir + handoff），現行機制暫時夠用。若下週再出現丟失再升級 |
| `.workflow/` 目錄治理（本機 14 個 run dir、無封存政策） | **升級 P3**：加封存政策（完成的 run dir 移入 `archive/`，具名子目錄如 `retro/` 例外） |
| E1 拓撲 | **✅ 本輪結案**（見 §0），不需使用者確認 |
| GCP credits | **阻塞**（見 §5） |

## §5 需使用者決策

> **全部待決事項已集中到 [`open-questions.md`](open-questions.md)**（使用者指示：問題丟一處，
> 後續一起處理）。該檔分六組：A 需核准才能動、B 需你提供資訊、C agenda 自列的四個面向、
> D 議程本身裁決、E 未研究題去留、F 主軸確認。下表保留原始脈絡，實際回覆請看該檔。

| # | 事項 | 狀態 |
|---|---|---|
| G1 | GCP credits 活用（$31,283 GenAI App Builder + 月 ~$313–319） | **阻塞**：需 console 存取或 credits CSV |
| — | E1 拓撲 | **本輪已結案**，不需使用者確認 |
| — | agenda v1.3 四個 open questions | 待裁決 |
| — | CLAUDE.md routing 行新增 | 待核准 |
| — | 遠端 skills 六個差集：哪些該補、哪些該退 | 待裁決（見 D-1） |
| — | taste-skill 微調方向未指定（動 body 即成 fork，需 frontmatter 註明偏離） | 待指定 |
| — | **lessons.md 跨機設計**：維持 local-only 並在 retro 固定合併，或改為 repo 內同步（與原始理由衝突） | 待裁決（§5 P1） |
| — | **§6.5 補問**：還有沒有臨時動議或訴求？（本輪裁決前漏問，現在問） | 待回覆 |

## §7b lessons.md proposed 條目（agenda §7 要求，本輪補追加）

依 §7 門檻「使用者糾正一次即記；同摩擦兩次即記」，本輪產生下列提案。
**尚未寫入 `~/.agents/rules/lessons.md`**——該檔是 append-only、local-only，
且 `maintenance.md §1` 是唯一編輯授權，需使用者核准後才寫入，且要先解決格式分歧（§5 P0）：

| # | Trigger（證據） | 提案規則（一行） |
|---|---|---|
| L1 | 使用者「不是 kDebugOutline 你理解到哪去」（sid `6bc15b50`） | 使用者點名某個 identifier 時，先讀該 identifier 的定義處再回答，不以 rg 命中代替 |
| L2 | 「你開模擬器幹啥啦 usb 那個裝置測試 規範都不看」——lessons 2026-07-27 已載仍犯 | 實機任務中每次 `agent-device` 指令後檢查 simulator 狀態（此規則已存在，本次是**執行失敗**而非缺失，應改為工具閘門） |
| L3 | `/shared-memory-intake` 被糾正 4 次，同一句糾正原句重貼 3 次 | 使用者重貼同一句糾正即為「上次沒改」的硬訊號：立刻停止當前路徑，先讀被指名的資產全文，再回答 |
| L4 | 84% 讀檔走 Bash `cat/sed/head`、483/500 截斷（sid `6bc15b50`） | 判定類宣稱前，讀檔須走 Read tool（可稽核）且非截斷；`head/sed` 截斷讀取不構成判定依據 |
| L5 | 中譯技術詞 71 次／16 種，「節流」×33 | 技術術語一律保留英文原文（throttle/cache/flag…），kernel 已有規則，需詞表化為送出前檢查 |
| L6 | `tailscale status` 把本機列為 offline，差點誤判 E1 節點消失 | 節點存活不以 `tailscale status` 為真相源；自身 IP 以 `ifconfig` 對照 |
| L7 | kernel 跨機 hash 不同但 `diff` 只差結尾換行 | 檔案一致性以 `diff` 判定，不以 hash 差異下「drift」結論 |
| L8 | 本輪 D2 只 `rg` 命中就差點認定有派工紀錄，命中其實是文件內容 | grep 命中須確認上下文性質（是實際指令還是文件內容）才可作為證據 |
| L9 | 本機 lessons.md 本週新增 0 筆，而同期至少 8 次使用者糾正 | 糾正發生時當場記 lessons（turn 內），不留到 retro 才回填——回填等於不記 |

L2/L4/L5 三條的共同性質值得特別標注：**規則已經存在，缺的是執行**——
這正是 §4.5 主軸命題的直接證據，也說明再新增規則文字的邊際效益很低。

---

## §6 本輪 meta —— opus + effort low 對照數據

五件 pre-read 全用 opus + effort low，記錄各自申報的重試／自我修正次數：

| # | 任務 | 重試/自我修正 | 性質 | 結果可用？ |
|---|---|---|---|---|
| P1 | Agent Plugins | 2 | 皆環境層：React 渲染頁抓不到完整清單（改讀 site repo 的 `.ts`）；spec 章節 sed 範圍抓不到（改語意搜尋） | ✅ 一次過，含治理層決定性事實 |
| P2 | KiroCrew | 3 | (1) 拉全 git-tree 汙染搜尋（改 fetch 具名 doc）(2) 一個 404 改用替代證據並標明 (3) **snippet window 不足導致誤判他們有更多驗收機制，切換整檔讀取才看清** | ✅ 五維全覆蓋 |
| P3 | advisors | 2 | 皆環境層：zsh glob 吃掉 `?recursive=1`；brief 給的路徑不存在（用 `fd` 定位）——**brief 是我寫錯的** | ✅ 三訴求逐條回答 |
| P4 | mattpocock skills | 1 | **正面樣本**：發現名單比目錄頁少 16 個時**沒有直接下「上游刪了」的結論**，先查 `truncated` 旗標與目錄結構——這一步同時撞出 5 個 404 | ✅ 產出本輪最高價值的即刻可修項 |
| P5 | codemap | 3 | X 回 402、jina 回 403，兩次改走搜尋；**自我修正 1 次：讀到原文後推翻 brief 裡「drifted from documented intent」的說法**，改為「changed since generated」，直接改變裁決 | ✅ 並更正了 brief 的錯誤 |

**結論（樣本 n=5，標 `derived`）**：
- **5/5 一次過交付可用結果**，無一件需要重派。合計 11 次重試中，**8 次是環境層問題**
  （網頁渲染、glob、402/403、brief 路徑錯），只有 3 次是認知層自我修正——而那 3 次全部是
  **朝正確方向的修正**（P2 從片段升級到整檔、P4 拒絕從缺失下結論、P5 推翻 brief 的錯誤前提）。
- 兩件事值得記入：**P3 的兩次重試有一次是我 brief 寫錯路徑**——派工方的錯計進了 worker 的重試數；
  **P5 推翻了 brief 的前提**，這正是我們想要的 worker 行為（不照抄派工方的措辭）。
- 建議：**research 型 worker 預設改為 opus + effort low**，並繼續累積樣本。
  這是對照組不是對照實驗（沒有同題 sonnet 平行組），所以不能宣稱「比 sonnet 好」，
  只能說「opus-low 在這五題上 5/5 可用」。`UNCONFIRMED`：與 sonnet 的直接比較。

### 本輪自身的方法紀律（正負樣本各一）

- **正**：kernel drift 一項先算 hash 得到「兩機不同」，**沒有就此下結論**，`diff` 全文後
  發現只差一個結尾換行——避免了一次誤報。P4 拒絕從缺失下結論、P5 推翻 brief 前提同類。
- **負**：D2 一開始只 `rg` transcript 找 `--prompt-file`，命中的其實是**文件內容**而非實際指令。
  若不細看命中上下文就會誤報「有派工紀錄」——**這正是 D1 那個 grep-and-conclude 模式的縮小版，
  發生在本輪自己身上**。這件事本身就是主軸命題的最好論據：它不是某個 session 的品格問題。
