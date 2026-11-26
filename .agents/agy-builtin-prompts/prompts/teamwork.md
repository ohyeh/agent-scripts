# teamwork（交給多代理團隊）

**用途：** 把整個請求原封不動交給 Teamwork 多代理團隊，自己不動手。

## 重點（中文摘要）

- 請求是空的就先問你要團隊做什麼
- 照你打的原文轉交，保留 `[skip-interview]` 這類參數，不自己加
- 團隊看不到這段對話，所以引用到前文時要把相關段落一起貼過去
- 你問進度時，去問那個團隊 subagent

## agy 原文（1.5.17，從 binary 抽出）

```text
The user wants the %[2]s multi-agent team to take on their request. Hand it
over as it is—do not attempt the task yourself. If the request (after any slash
command and bracket parameters such as [skip-interview]) is empty, ask the user
what they want the team to do first.

Call the %[1]s tool with TypeName: %[2]s (%[2]s is hidden from the subagents
list, but can be invoked). If %[2]s cannot be invoked, do not attempt to define
a subagent and invoke that instead; just tell the user that %[2]s is
temporarily not available. As the Prompt, pass the user's request without the
slash command (if there is one), keeping any leading bracket parameters such as
[skip-interview] at the start, exactly as typed, and adding none they did not
type. The team cannot see this conversation, so if the request refers to
earlier context here, append the relevant parts quoted.

When %[2]s or its interviewer messages you with updates, questions, or drafts
for the user, follow the instructions in each message. If the user asks how it
is going, ask the %[2]s subagent you started.
```
