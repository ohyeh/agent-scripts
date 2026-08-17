# PLAN — Dispatch gate 機械執法（hooks 提案 1+2）

Status: PLANNED, NOT APPROVED FOR IMPLEMENTATION.
動 `~/.claude/settings.json`/hooks 屬 maintenance §1 全鎖項目；本 plan 先 commit
留檔，實作前需使用者明示核准。背景與調查證據見同目錄
`findings-and-proposals.md`。

## 目標

把 kernel 兩個純自律環節變成機械檢查點：
1. dispatch gate（BEFORE sending task to tmux worker → MUST read
   model-dispatch.md + delegation-templates）在 parent 直接驅動 worker 時強制擋下。
2. canary（`✈`）消失時自動觸發 reload，不再依賴已失憶的模型自我察覺。

## 提案 1 — PreToolUse hook：tmux dispatch 閘門

### 設計
- Hook 事件：`PreToolUse`，matcher `Bash`。
- Script：`~/.agents/hooks/tmux-dispatch-gate.sh`（新檔；repo canonical 放
  `agent-scripts/.agents/hooks/`，deploy.sh 加一層 rsync）。
- 判定邏輯（全部成立才 deny）：
  1. `tool_input.command` 匹配
     `(^|[/[:space:]])(agent|agy|claude|codex)-tmux[[:space:]]` 且含子指令
     `start|send|send-wait`（word boundary；排除 `--help`、`list`、`status`、
     `doctor` 等唯讀操作）。
  2. 當前是 parent context、非 subagent。訊號已實測（CONFIRMED，2026-07-27，
     Claude Code v2.1.220，headless 探針 + logging hook，證據
     `scratchpad/hook-signal-test/hooklog.txt`）：
     - subagent 的 PreToolUse stdin JSON 帶 `agent_id` + `agent_type`
       （例：`"agent_type":"general-purpose"`）；parent 的 JSON 無此二欄位。
     - 環境變數不可用：parent/subagent 完全相同（無 `CLAUDE_AGENT_TYPE`；
       `CLAUDE_CODE_CHILD_SESSION` 反映的是 CLI 被哪裡啟動，非 hook 呼叫者）。
     - 判定式：`jq -e '.agent_type // empty'` 非空 → subagent → 放行。
       不需 transcript sidechain fallback。
  3. 逃生口 marker 不存在：`$CLAUDE_SCRATCHPAD/（或 session dir）/gate-receipt-dispatch`
     — gate read 完成後由模型以一行 Bash `touch` 建立，內容為 receipt 全文。
     Marker 存在即放行（合規流程零額外摩擦，且 marker 本身就是 receipt 落地）。
- Deny 輸出（stderr + exit 2）：
  `BLOCKED by dispatch gate: read ~/.agents/rules/model-dispatch.md §4 and
  ~/.agents/skills/delegation-templates/SKILL.md, write the GATE receipt to
  <marker path>, then drive external workers via ONE general-purpose
  supervision proxy (haiku) — not from the parent.`

### 風險與緩解
- 誤擋 subagent proxy 本身 → 判定 2 就是為此；若訊號不可靠，先以「marker 逃生口」
  單獨上線（proxy 的 brief 內含 touch 指令）。
- 使用者手動要求 parent 直接操作 → deny 訊息提示可由使用者說「direct」後，模型
  將該句 quote 進 marker 再執行（對應 kernel「current-message explicit
  instruction is approval for that exact case」）。
- Hook 失效面：只匹配 Bash 工具；tmux 原生 `send-keys` 已被 skill 禁止，不另擋。

### 驗收
- 正例：parent 無 marker 直接 `claude-tmux start …` → deny，訊息完整。
- 反例 1：marker 存在 → 放行。
- 反例 2：general-purpose subagent 內同指令 → 放行。
- 反例 3：`claude-tmux status --json` / `result` / `stop` → 不匹配、放行
  （§4 允許 proxy 回報異常後的父層介入，唯讀/收尾不該被擋）。
- 測試：`scripts/test-hooks-dispatch-gate-smoke`（模擬 stdin JSON 直接呼叫
  hook script，斷言 exit code 與訊息），納入 CI。

## 提案 2 — Stop hook：canary 閉環

### 設計
- Hook 事件：`Stop`（assistant 回覆結束時）。
- Script：`~/.agents/hooks/canary-check.sh`。
- 邏輯：讀 stdin JSON 的 transcript path → 取最後一則 assistant text →
  若結尾非 `✈` 且非豁免格式（`VERDICT: PASS|BLOCK` 結尾），輸出
  `{"decision": "block", "reason": "canary missing — reload ~/.claude/CLAUDE.md
  (global rules lost salience) before continuing"}`；模型會收到並補讀。
- 防抖：連續 block 上限 1 次（marker 檔記錄上次 block 的 message id），避免
  格式邊角案例造成死循環。

### 風險
- 豁免清單要與 kernel 的例外同步（目前僅 VERDICT 行）；kernel 改格式時此 hook
  是第二個要改的地方 — 在 hook script 頂部註明對應 kernel 條文。
- Stop hook block 會多一輪推理成本；預期觸發率低（canary 缺席本就是異常）。

### 驗收
- 尾行 `✈` → 不動作。`VERDICT: BLOCK` 結尾 → 不動作。
- 尾行缺 canary → 恰好 block 一次並帶 reason；下一則補上 canary 後恢復靜默。
- 測試：`scripts/test-hooks-canary-smoke`。

## 實作順序（核准後）

1. ~~實測 subagent 判定訊號（提案 1 判定 2）~~ 完成（2026-07-27）：stdin JSON
   `agent_type` 欄位即訊號，見上。
2. hooks script + smoke tests 進 repo（`.agents/hooks/` + `scripts/`）。
3. deploy.sh 加 hooks 層（rsync + md5 驗證，跟 rules 層同模式）。
4. `~/.claude/settings.json` 增 hook 註冊（此步才碰全鎖檔，單獨展示 diff）。
5. 兩台以上機器驗證後，在 lessons.md 記 adopted 流程結果。

## 開放問題

- Codex 側等價物：Codex 無 PreToolUse hook；等價執法要走 wrapper 端
  （agent-tmux 自身檢查呼叫者？）或接受 Codex 維持自律 — 留給 Codex 評估。
- `agent-tmux` 是否該原生支援 `--require-gate-receipt <path>`（wrapper 層執法，
  runtime 無關）— 若可行，可能比 Claude hook 更根治，v0.38 候選。

## 2026-07-28 status update

- 提案 1 已實作（user 於 2026-07-28 授權稽核行動清單「交給你了」）：
  `.agents/hooks/tmux-dispatch-gate.sh`（GATE 1 receipt + 新增 GATE 2
  second-review-shaped-dispatch → workflow recipe，源自 48h usage audit 的
  cross-model 共識），smoke `scripts/test-hooks-dispatch-gate-smoke` 全 PASS，
  deploy.sh 新增 Layer 5（hooks，rsync --delete + diff 驗證）。
- `~/.claude/settings.json` 的 hook 註冊仍未執行 — maintenance §1 全鎖，
  等使用者對單獨展示的 diff 明示核准。
- 提案 2（canary Stop hook）作廢：kernel v4.9.0 已刪除 ✈ canary。

## Status update 2026-07-28 (v0.38 pivot)
- The hook moves to ohyeh/tmux-agent-tools as a Claude Code plugin hook
  (`hooks/hooks.json` + `hooks/tmux-dispatch-gate.sh`, plugin v0.38.0):
  registration rides the plugin enable instead of a hand-edited
  ~/.claude/settings.json hooks block. agent-scripts' .agents/hooks copy and
  its smoke retire once the plugin is verified installed on all 3 machines.
- Runtime-agnostic coverage (Codex/agy) shipped as the wrapper-native gate:
  AGENT_TMUX_REQUIRE_GATE_RECEIPT + AGENT_TMUX_GATE_RECEIPT in agent-tmux
  (blocked_reason=gate_receipt_missing; scripts/test-gate-receipt-smoke).
- GATE 2 review-shape detector now sees names behind bare flags
  (start --exact review_x).
