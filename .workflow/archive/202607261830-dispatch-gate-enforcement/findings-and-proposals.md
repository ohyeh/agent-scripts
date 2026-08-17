# Dispatch gate 失守調查與執法強化提案

Date: 2026-07-26
Trigger: Claude session `772d38ce-6b6c-4bce-a432-9cc004c306b6`（paul-photo-gallery）
在 `/loop` 指揮模式下，P0 階段由 parent 直接以 `agent-tmux ... send-wait` 驅動
worker 與 reviewer，未讀 model-dispatch.md、無 GATE receipt，直到使用者糾正
（transcript line 161「採納」）才自 P1 起改走 proxy。

## 調查結論（證據見 transcript）

1. 不是措辭問題。kernel 已用 MUST read / fail closed / STOP；語氣已到 prompt 層天花板。
2. 直接根因：proxy 規範在 skill 文件裡被框成 Codex 專屬 —
   `using-tmux-agent-tools` 章節名「CODEX VISIBILITY」、hub SKILL.md
   「Long-running external CLI worker **under Codex**?」、core-workflow.md
   「**Codex** native proxy」。Claude commander 合理判定不適用。
3. 放大因素：
   - `/loop` 注入 ~150KB skill 內容（單筆最大 76KB），全是 parent 直接
     `send-wait` 的操作範例；CLAUDE.md 全文僅 8.6KB。就近具體範例 > 遠端抽象規則。
   - user prompt「不准跟我交談、節省 token」被解讀為可砍 gate read 的授權。
   - Canary 如實失效（/loop 後 0 則回覆帶 ✈），但「missing → reload」的執行者
     是已失憶的模型本身，閉環斷在最後一哩。
4. 澄清：transcript jsonl 不記錄 CLAUDE.md 注入，`claudeMd=0` 不能當作
   「規則未載入」的證據（多 session 對照確認）。

## 已完成（本 session，使用者明示授權）

- tmux-agent-tools repo `32a4940`，release v0.37.0（workflow run 30198139325）：
  proxy 規範改為 runtime-neutral —
  - `skills/using-tmux-agent-tools/SKILL.md`：章節改名
    「NATIVE PROXY (ALL RUNTIMES)」，新增 parent MUST NOT run
    start/send-wait/supervise 硬邊界，Claude 形態 = `general-purpose` on `haiku`。
  - `skills/tmux-agent-tools/SKILL.md` fast path：「(Codex or Claude Code)」+
    Claude 形態 + 新 anchor。
  - `references/core-workflow.md`：標題改「Native proxy for an external CLI
    worker」，開頭明示適用所有 runtime。
  - 版本：CHANGELOG v0.37.0、三個 plugin.json、AGENT_TMUX_VERSION 同步 bump；
    test-version-sync-smoke 3/3、test-agent-delegate-packaging-smoke 33/33。
  - 本機 `~/.agents/skills/{tmux-agent-tools,using-tmux-agent-tools}` 已 rsync
    部署，`agent-tmux --version` = 0.37.0。

## 待議提案（需 Codex/使用者核准後才實作；hooks 屬 maintenance §1 全鎖項目）

### 提案 1 — PreToolUse hook 機械閘門（根治）
`~/.claude/settings.json` PreToolUse hook（matcher: Bash），script 邏輯：
- command 匹配 `(agent|agy|claude|codex)-tmux\s+(\S+\s+)*(start|send|send-wait)\b`
  且當前非 subagent context（判準：`CLAUDE_AGENT_TYPE` / transcript sidechain
  標記，實作時驗證可用訊號）→ deny，訊息：
  "Read ~/.agents/rules/model-dispatch.md §4 first; drive external workers via
  one general-purpose supervision proxy."
- 逃生口：session scratchpad 存在 gate marker 檔（gate read 步驟建立）時放行，
  讓合規流程零摩擦。

### 提案 2 — Canary 閉環（Stop hook）
Stop hook 檢查最後一則 assistant 訊息是否以 `✈` 結尾；缺席時以
`additionalContext` 注入一行：「canary missing — reload ~/.claude/CLAUDE.md
before the next action」。把 kernel 的 "If it is missing, reload this file"
從自律變 hook 觸發。

### 提案 3 — Skill 內建約束
已於 v0.37.0 完成（見上）。

Status: proposals 1–2 proposed；未經核准不得動 settings.json/hooks。
