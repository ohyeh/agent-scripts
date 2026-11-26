# `/boost`

**用途：** 叫出 Boost 多代理 orchestrator，處理複雜任務。

## 重點（中文摘要）

- binary 裡的指令說明只有一句（offset 64143314）：`Invoke the Boost multi-agent orchestrator for complex tasks.`
- 管理員可以關掉：`MultiagentControls.boost_command_disabled`，跟 `teamwork_preview_command_disabled` 是同一組開關，所以 Boost 和 teamwork 是同一套多代理機制底下的兩個入口。
- changelog 有一筆：「Fixed /boost failing at runtime by improving worker tool configurations.」
- 我們的 `~/.config/agent-tmux/profiles/agy-flash.conf` 啟動時帶 `-i /boost`，flash worker 一開就進 Boost 模式。
- Boost 的編排 prompt 很可能就是 `references/binary-prompt-strings.txt` 裡的 Teamwork 角色群（orchestrator、dispatcher、critic、victory_verifier…），以及 [teamwork.md](teamwork.md) 的交接 prompt；binary 沒有直接把 Boost 這個名字和那些 prompt 綁在一起，這點是 UNCONFIRMED。

## agy 原文（1.5.17，從 binary 抽出）

```text
Invoke the Boost multi-agent orchestrator for complex tasks.
```
