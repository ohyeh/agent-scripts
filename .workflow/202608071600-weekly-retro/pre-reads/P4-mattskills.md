# P4-mattskills —— pre-read REPORT（原始版本，未編輯）

來源：本 session subagent transcript `agent-aP4-mattskills-74b83bae71364b62.jsonl`（49 records）
派工：Agent tool，opus + effort low，2026-08-07 議題裁決輪 plan.md P 系列
本檔為 worker 最終回報全文逐字保留；經主 session 摘要與裁決的版本見 `../retro-report.md` §4。

---

REPORT

**1. 是什麼 — the skill set in 4 lines**

mattpocock/skills（"Skills for Real Engineers"，skills.sh 目錄頁掛 51 skills / 14.1M installs）是他個人 `.agents/` 目錄的公開版。上游 HEAD 實際只有 **35 個活的 skill**，分四類：`engineering/`(18)、`in-progress/`(6)、`misc/`(4)、`productivity/`(7)；`skills/deprecated/` 已清空只剩 README。骨幹是一條 issue-tracker-centric 的工程流水線（grill → to-spec → to-tickets → implement → code-review），外圈是溝通／寫作 skill。procedural 佔絕大多數；真正 behavioral（改變 agent 怎麼講話、怎麼判斷 done）只有 `writing-for-agents`、`wait-what`、`grilling`、`teach` 四個。

**先報一個比 diff 更急的 live-truth 發現**：`skills-lock.json` 的 19 個 mattpocock 條目，**5 個 skillPath 已 404** — 上游在 31c4357 之後又動了一次：

| skill | lock path | 上游現況 |
|---|---|---|
| `wizard` | `skills/in-progress/wizard/` | 已移到 `skills/engineering/wizard/` |
| `writing-great-skills` | `skills/productivity/writing-great-skills/` | 已不存在，同位置改名 `writing-for-agents` |
| `batch-grill-me` | `skills/in-progress/batch-grill-me/` | 拆成 `productivity/grilling` + `productivity/grill-me` + `engineering/grill-with-docs` |
| `edit-article` | `skills/personal/edit-article/` | `skills/personal/` 整個目錄消失 |
| `obsidian-vault` | `skills/personal/obsidian-vault/` | 同上（另有 kepano/obsidian-skills 可頂）|

這直接打穿 `using-skills/SKILL.md` 兩處敘述：Grilling 段寫「`batch-grill-me` 是唯一 grill member」、Fleet meta 段寫「`writing-great-skills` 在每次 skill 寫作時載入」——兩個名字上游都沒了。retro 該先修這個再談採不採新東西。

**2. 與我們何處重疊**

**(a) 已採用**（14 個路徑仍有效）：`codebase-design`、`diagnosing-bugs`、`domain-modeling`、`improve-codebase-architecture`、`migrate-to-shoehorn`、`prototype`、`research`、`resolving-merge-conflicts`、`tdd`、`triage`、`wayfinder`、`writing-beats`、`writing-fragments`、`writing-shape`。另 5 個概念已採用但路徑失效（見上表）。

**(b) 未採用但對我們有用** — skill → 痛點 → 為什麼

| skill | 痛點 | 為什麼有用 |
|---|---|---|
| `productivity/writing-for-agents` | 四個痛點的**上游根因** | 整包唯一的理論文件，也正好是 `writing-great-skills` 死連結的接班人。可操作的槓桿有四個：**completion criteria 的 clarity vs demand**（"vague bound 邀請 premature completion"）— 這是「無證據宣稱 done」的機制解釋；**negation 是失敗模式，要 prompt the positive**（"Don't think of an elephant"）— 我們 CLAUDE.md 大量用禁令句，這條說禁令反而讓被禁行為更 available；**no-op 測試**（model-relative 不是 reader-relative，靠跑不靠辯）— 可直接拿來瘦身我們的 rules；**cache vs environment**（restate 環境查得到的東西就是 stale cache）— 跟我們 P0 live-truth 同一道理，但寫成了可執行的剪枝規則 |
| `engineering/code-review` | 無證據宣稱 done ＋ grep 不讀 code | 兩軸平行 sub-agent：Standards（照不照 repo 文件化規範）＋ Spec（有沒有做到 originating issue 要的）。Spec 軸強迫回頭對照原始需求，是 `verification-before-completion` 缺的那半邊 |
| `productivity/wait-what` | 太多敘述 | 全文就一句人觸發的 slash command（`disable-model-invocation: true`）：「Stop. 那句話沒 land。Re-pitch：給一點 context，用 **ASD-STE100 Simplified Technical English**，用 `CONTEXT.md` 的 ubiquitous language」。ASD-STE100 值得偷 — 航太業的受控英語標準，規定術語一詞一義、不換詞，同時治「敘述冗長」和「亂翻術語」 |
| `misc/git-guardrails-claude-code` | （不在四大痛點，但對上 hard boundaries）| Claude Code hooks 在執行前擋 push / reset --hard / clean / branch -D。我們 CLAUDE.md 說「critical gates 由 tooling 執行，不靠 prompt ceremony」——這就是那個 tooling，現成的 |
| `productivity/grilling`（＋`grill-with-docs`）| — | 純為補 `batch-grill-me` 死連結。`grilling` 是 model-invocable 版，`grill-me` / `grill-with-docs` 是人觸發版；`grill-with-docs` 邊問邊產 ADR + glossary，對應我們 `domain-modeling` 的配對用法 |

**taste-skill 家族**（`Leonxlnx/taste-skill`，我們已採 5：`design-taste-frontend`、`high-end-visual-design`、`image-to-code`、`imagegen-frontend-web`、`imagegen-frontend-mobile`）。上游 13 個，未採 8：`taste-skill-v1`（v1 向後相容存檔）、`gpt-tasteskill`、`redesign-existing-projects`、`brandkit`、`industrial-brutalist-ui`、`minimalist-ui`、`stitch-design-taste`。這族**完全打不到那四個痛點** — 全是視覺方向 skill；而 `using-skills` 已明訂 design-visual 一律走 `using-design-skills`、預設 `impeccable`，再塞三個風格 skill 只會讓那個 router 更難仲裁。唯一堪考慮的 `redesign-existing-projects`（audit-first 改造既有站），但 `design-taste-frontend` 描述裡已含 "audit-first on redesigns"，重複。

**(c) 不適合我們**：`ask-matt` / `setup-matt-pocock-skills`（他自己的 router 與一次性設定，我們有 `using-skills`）、`to-spec` / `to-tickets` / `to-questionnaire` / `implement`（綁 issue tracker 的流水線，跟我們 `.workflow/<ts>-<slug>/` + `codex-dynamic-workflows` 直接衝突，別混）、`handoff` / `claude-handoff`（我們有 `session-handoff` + `session-titles.md`）、`loop-me`（我們有 `/loop` 與 `using-workflows`）、`setup-pre-commit` / `setup-ts-deep-modules` / `scaffold-exercises`（他的 TS 課程／repo 專屬）、`teach`（跟 Explanatory output style 重疊）、taste-skill 未採那 8 個。

**3. 建議採用層級**

| skill | 層級 | 理由 |
|---|---|---|
| `writing-for-agents` | **整套** | 直接替掉 `writing-great-skills` 的 404，順便當我們自己 rules 的剪枝依據。改 lock path ＋ 改 `using-skills` Fleet meta 那一行 |
| `grilling`（＋`grill-with-docs`）| **整套** | 修 `batch-grill-me` 404 的唯一乾淨路徑。`grilling` 進 model-invocable，`grill-with-docs` 配 `domain-modeling` |
| `code-review` | **部分** | 只偷 Spec 軸（回頭對照 originating spec）＋雙 sub-agent 平行結構，接進 `verification-before-completion` / `judgment-rubrics.md` §2。整套會拖進他的 issue tracker 假設 |
| `wait-what` | **只偷概念** | 七行的東西不值一個 lock 條目。偷兩樣進 CLAUDE.md「Language and output」：ASD-STE100 受控英語（治冗長＋術語一詞一義／不亂翻），以及 CONTEXT.md ubiquitous language 的回指 |
| `git-guardrails-claude-code` | **只偷概念** | 讀它的 hook 設定寫進我們自己的 `settings.json`（走 `update-config`）。他的 setup script 假設乾淨的 Claude Code 設定，我們已有大量 hooks |
| `wizard` 路徑 | **修 lock** | 非採用決策，純 path 修正：`in-progress/` → `engineering/` |
| `edit-article` / `obsidian-vault` | **棄（上游已死）** | `skills/personal/` 整個沒了。`obsidian-vault` 改指 `kepano/obsidian-skills`（lock 已有此來源）；`edit-article` 由 `stop-slop` + `writing-artifacts` 覆蓋 |
| taste-skill 未採 8 個 | **棄** | 打不到痛點，且惡化 `using-design-skills` 的仲裁 |

一個誠實的缺口：**「過度把技術術語翻成中文」上游沒有任何 skill 處理**。ASD-STE100 是最接近的槓桿，但那是我偷概念的推論、不是上游宣稱的用途 — 標 UNCONFIRMED，要靠我們自己在 CLAUDE.md 立規則。

**4. 證據**

- https://www.skills.sh/mattpocock/skills — 目錄頁，51 個名稱（含已下架者），"51 skills / 14.1M total installs"
- https://api.github.com/repos/mattpocock/skills/git/trees/HEAD?recursive=1 — `truncated: false`，240 entries，35 個活 SKILL.md；`skills/deprecated/` 僅 README.md；`.out-of-scope/` 三份範圍外筆記
- `https://raw.githubusercontent.com/mattpocock/skills/HEAD/skills/<cat>/<name>/SKILL.md` — bucket (b)/(c) 每個 skill 的 description 逐個實抓；`wait-what` 與 `writing-for-agents` 抓全文
- https://api.github.com/repos/Leonxlnx/taste-skill/git/trees/HEAD?recursive=1 — 13 個 SKILL.md
- `/Users/paul.yeh/git/agent-scripts/skills-lock.json` — 19 個 mattpocock 條目，逐條 HTTP 驗證（14×200 / 5×404）
- `/Users/paul.yeh/git/agent-scripts/skills/using-skills/SKILL.md` — "Adopted families beyond the table"（Grilling 段、Fleet meta 段）、"Dormant — installed, not routed"、"Curated map vs live availability"
- `git -C /Users/paul.yeh/git/agent-scripts log -1 --stat 31c4357` — 8 個 repoint、3 個 prune（`design-an-interface` / `qa` / `request-refactor-plan`，lock 70→67）；本報告不重提這三個

**5. 自評**

retry / self-correction：1。第一次抓 GitHub tree 只 grep `SKILL.md`，發現名單比 skills.sh 少 16 個 — 沒直接下「上游刪了」的結論，先查 `truncated` 旗標與目錄結構才確認 35 是真的活體數量；那一步同時撞出 5 個 404 的 lock 條目，是本次最有價值的產出。因 skills.sh 目錄頁與上游 HEAD 不一致，每個進 bucket 的名字都用 raw.githubusercontent 逐個 200 驗證，沒有任何名稱是推論來的。

✈
