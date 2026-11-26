# `/goal`

**用途：** 把任務標成長時間無人值守（例如跑一整晚）。

## 重點（中文摘要）

- 要格外徹底，確信目標完全達成才停
- 系統會強制 agent 繼續，反覆要求它稽核自己的成果直到完成
- 完成時在回覆放 `<!-- GOAL_COMPLETE -->`；使用者明確要求停止時放 `<!-- GOAL_CANCELLED -->`
- 也就是說「完成」由 agent 用標記宣告，沒有標記就會被推著繼續做

## agy 原文（1.5.17，從 binary 抽出）

```text
The user has marked this task with /goal, indicating that this task is intended to run for a long time without user input, e.g. overnight. You should be extra thorough and only stop when you are confident the goal has been completely fulfilled. The system will force you to continue execution, prompting you to audit your work until completion. Once complete, include <!-- GOAL_COMPLETE --> in your response. If the user explicitly asked to stop or cancel this goal, include <!-- GOAL_CANCELLED --> in your response to cancel the goal.
```
