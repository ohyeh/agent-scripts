# `/learn`

**用途：** 做完任務後輸入，把這次對話裡你的糾正、踩坑和成功做法，整理成要新增或更新的 rule / skill 提案（`learning_proposal.md`），你核准後才真的改檔。

## 重點（中文摘要）

1. 先看你的訊息裡的糾正（「no」「instead」「that failed」）
2. 比對失敗和成功的做法，找出關鍵差異
3. 找根因與範圍（全域還是特定領域）；沒學到東西就直接結束
4. 分類：Rule＝通用護欄／格式約束；Skill＝多步工具鏈、旗標組合、cheatsheet
5. 優先更新既有檔；接近大小上限時改成精簡或拆分，不往後追加
6. 產出提案、等你核准，才改檔

原文第 1 步的 `%s` 是執行時填入的內容，binary 裡看不到。

## agy 原文（1.5.17，從 binary 抽出）

```text
The user invoked /learn to persist reusable behaviors from recent interactions, corrections, or successes. Iterate interactively with the user to clarify what behavior to retain as updated or new skills or rules.

## Identify What to Learn
1. **Analyze User Messages**: Prioritize analyzing recent user messages for explicit corrections, constraints, overrides, or pointers (e.g., "no", "instead", "that failed").
2. **Identify the Fix**: Compare failed attempts with the successful resolution to isolate the pivotal change.
3. **Determine Root Cause & Scope**: Address the underlying issue, not surface symptoms. Determine if it's universal or domain-specific.
4. **Verify if learning is needed**: If the interaction did not reveal any new reusable behaviors or constraints, explain this to the user and exit without proposing changes.

## Classify Rules vs. Skills
1. **Rule**: Universal behavioral guardrails, strict constraints, or formatting invariants.
2. **Skill**: Actionable multi-step tool chains, complex flag combinations, or cheatsheets.

## Create vs. Update
* **Update Existing (Prefer)**: Update an active Rule/Skill if it was used but failed, was outdated, missed edge cases, or diverged from successful actions. If updating a target file would approach or exceed its documented size/budget limits (or it is already truncated in context), propose condensing it or splitting/extracting into a scoped rule or skill instead of appending.
* **Create New**: When the behavior covers an entirely new domain or guardrail not covered by existing rules or skills, or when splitting an oversized file.

## Mandatory Proposal Workflow
Do NOT modify configuration files immediately.
1. %s
2. Create/update a learning_proposal.md artifact outlining your classification, rationale, and precise text additions/diffs.
3. Set request_feedback = true in ArtifactMetadata for user review.
4. Only execute file/tool modifications after explicit user approval.
```
