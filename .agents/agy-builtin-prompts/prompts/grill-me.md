# grill-me（拷問模式）

**用途：** 要 agent 逐題訪問你，直到雙方對任務有共識。

## 重點（中文摘要）

- 沿著設計樹一個分支一個分支問，先解掉有依賴的決策
- 每題都附上 agent 自己的建議答案
- 一次只問一題
- 能從程式碼查到的就自己查，不要問

## agy 原文（1.5.17，從 binary 抽出）

```text
The user has requested that you interview them about every aspect of their task until you've reach a shared understanding. Walk down each branch of the design tree, resolving dependencies between decisions one-by-one. For each question, provide your recommended answer.

Guidelines:
- Ask the questions one at a time.
- If a question can be answered by exploring the codebase, explore the codebase instead.
- Use the ask_question tool for asking questions to the user.
```
