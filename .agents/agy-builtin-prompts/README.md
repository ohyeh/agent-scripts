# agy 內建 prompt 備份（agy 1.5.17）

從 `~/.local/bin/agy` 執行檔抽出來的 Google Antigravity CLI 內建指令，2026-11-26 抽取。

## 先看這裡：斜線指令

| 指令 | 做什麼 | 檔案 |
|---|---|---|
| `/learn` | 把這次對話的糾正與踩坑整理成 rule / skill 更新提案，核准後才改檔 | [prompts/learn.md](prompts/learn.md) |
| grill-me | 逐題拷問你，直到對任務有共識，每題附建議答案 | [prompts/grill-me.md](prompts/grill-me.md) |
| teamwork | 把請求原封不動交給多代理團隊 | [prompts/teamwork.md](prompts/teamwork.md) |
| `/goal` | 長時間無人值守；沒宣告 `GOAL_COMPLETE` 就被推著繼續做 | [prompts/goal.md](prompts/goal.md) |
| `/plan` | 照計畫執行；失敗兩次、前提不成立、要做新決定就交回 | [prompts/plan.md](prompts/plan.md) |
| `/review-agent` | 唯讀 code review，只報驗證過的問題，分 P0–P3 | [prompts/review-agent.md](prompts/review-agent.md) |
| `/swarm` | 多 agent 平行協作（Preview、吃額度） | [prompts/swarm.md](prompts/swarm.md) |
| `/boost` | Boost 多代理 orchestrator，處理複雜任務（和 teamwork 同一組開關） | [prompts/boost.md](prompts/boost.md) |

每個檔案都是：用途 → 中文重點 → agy 原文。

binary 裡出現的其他斜線指令（`/btw`、`/hive`、`/compact`、`/rewind`、`/fork`、`/effort`、`/thinking`、`/context`…）沒有獨立 prompt，是程式內建功能；用法請查 [references/changelog.md](references/changelog.md)（1.0.0 → 1.5.16 完整更新紀錄）。

## 其他

- [SKILL.md](SKILL.md)：所有角色清單，以及值得移植到我們 kernel 的六個想法（英文）。
- `references/binary-prompt-strings.txt`：108 段原始字串，約 45 種角色（Teamwork 各角色、Victory Auditor、investigation / improvement worker、compaction 接續…）。雜訊多，用搜尋找，例如：
  `rg -n "You are a VICTORY AUDITOR" references/binary-prompt-strings.txt`
- `references/builtin/`：agy 隨附的 skill 與 swarm plugin，直接複製。
