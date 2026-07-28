# Handoff: tmux-agent-tools v0.38.0 — shim 退役、plugin hook、runtime-agnostic gate、fleet 全同步

## Session Metadata
- Created: 2026-07-28 20:23:47
- Project: /Users/paul.yeh/github/agent-scripts
- Branch: main
- Session duration: ~1 full day (48h usage audit → kernel v4.11.0 → audit action items → v0.38.0)

### Recent Commits (for context)
  - 175be93 refactor: hand tmux-dispatch-gate to the tmux-agent-tools plugin; sweep to agent-tmux <cli> spelling
  - ebbb273 feat(hooks): tmux dispatch gate (receipt + review-loop workflow escalation)
  - 55b2bc2 chore(skills): register second-model-consensus in fleet lock
  - 1a20c99 feat(skills,deploy): second-model-consensus skill + fleet-deploy verify script
  - a02906a feat(kernel): fail first, solid completion over minimal diff (v4.11.0)

## Handoff Chain

- **Continues from**: [2026-07-22-010401-deterministic-worker-supervision.md](./2026-07-22-010401-deterministic-worker-supervision.md)
  - Previous title: Deterministic external-worker supervision closeout
- **Supersedes**: None

## Current State Summary

雙 repo 已全部落地、push、三機部署驗證完畢，無未收尾工作。ohyeh/tmux-agent-tools
釋出 v0.38.0（commit 3351d7f）：per-CLI shim（claude-tmux/codex-tmux/agy-tmux）
進入 deprecation（stderr 警告，v0.39 移除）、全 repo 統一 `agent-tmux <cli>
<command>` 拼法（~217 處）、dispatch-gate hook 以 Claude Code plugin 形式出貨、
wrapper 原生 gate（AGENT_TMUX_REQUIRE_GATE_RECEIPT）補 Codex/agy 覆蓋，並順手修了
兩個既存 bug（awk -v secret 洩漏、tmux ls pipefail 殺掉 sessions watch）。
ohyeh/agent-scripts（commit 175be93）退役 .agents/hooks 舊 hook、skills 拼法同步，
fleet-deploy 三機 PASS。Claude plugin `tmux-agent-tools@tmux-agent-tools` 0.38.0
已在三機安裝並 enable（inventory：2 skills + 1 PreToolUse hook）。

## Codebase Understanding

## Architecture Overview

- 兩層 skill 架構是刻意設計：`using-tmux-agent-tools` 是薄的 forcing-gate
  router（唯一入口）；`tmux-agent-tools` 是 mechanics library（wrapper scripts
  本體 + references 住在裡面，是跨 runtime 部署載體，不能刪）。
- skill 發佈是「單一 canonical + symlink」：`~/.agents/skills/` 為跨 runtime
  canonical（Codex/agy 直讀），`~/.claude/skills/*` 全是 symlink 進去。
  Claude Code plugin 的 skills 只有 Claude 看得到，因此 plugin 在 fleet 的
  角色只是 hook 載體，skill 仍由 skills-lock 裝。
- Dispatch gate 三層分工：Claude Code 用 plugin hook（宣告式攔截）、
  Codex/agy 用 wrapper 內建 gate（執行期攔截，env: AGENT_TMUX_REQUIRE_GATE_RECEIPT
  + AGENT_TMUX_GATE_RECEIPT），兩者可共用 receipt state 檔。
- deploy 鏈：agent-scripts scripts/fleet-deploy.sh → 各機 curl deploy.sh →
  5 層（global md5 / rules rsync / workflows hash / skills-lock npx restore /
  hooks rsync）。skills-lock Layer 4 會從各 skill 的 GitHub main 重抓，
  所以 tmux-agent-tools push 後跑 fleet-deploy 就會刷新 ~/.agents/skills。

## Critical Files

| File | Purpose | Relevance |
|------|---------|-----------|
| ~/github/tmux-agent-tools/skills/tmux-agent-tools/scripts/agent-tmux | 8k 行統一 wrapper 引擎（v0.38.0） | 本次主要改動點：gate guard、redaction 修復、版本 |
| ~/github/tmux-agent-tools/hooks/{hooks.json,tmux-dispatch-gate.sh} | plugin 出貨的 PreToolUse hook | GATE 1 receipt + GATE 2 review-loop 升級 workflow |
| ~/github/tmux-agent-tools/skills/tmux-agent-tools/scripts/tmux-agent-sessions | inventory/watch | tmux ls pipefail 修復點（list_owned_sessions） |
| ~/github/agent-scripts/scripts/{deploy.sh,fleet-deploy.sh} | 5 層部署 + 多機 orchestrator | fleet 同步的唯一正路 |
| ~/github/tmux-agent-tools/scripts/test-{gate-receipt,dispatch-gate-hook,start-readiness}-smoke | 新增的 smoke | 改 gate/hook/readiness 前先跑 |

### Key Patterns Discovered

- `awk -v` 對值做 C-escape 處理：把任意字面值（尤其 secret）傳進 awk 必須走
  `ENVIRON[]`，否則 `\d` 之類會被吃掉、literal match 靜默失敗。
- `tmux ls` 在 server 無 session 時 exit 1：任何 `set -euo pipefail` 腳本裡
  以它開頭的 pipeline 都要 `{ tmux ls 2>/dev/null || true; }` 包起來。
- smoke「全綠」可能被環境掩護：長駐 tmux session 曾讓 pipefail 地雷永不引爆。
  重跑要先 `tmux kill-server` 從空 server 起跑；`suite | tail -N` 的 exit code
  是 tail 的，不能當套件通過的證據。
- zsh 裡 `===` 開頭的 echo 參數會觸發 =cmd expansion；`local path=` 會綁到
  PATH（腳本內已有註解警告）。

## Work Completed

### Tasks Finished

- [x] shim deprecation（警告 + AGENT_TMUX_SUPPRESS_DEPRECATION）+ 全 repo 拼法掃換
- [x] fanout/sessions 內部改直呼 `agent-tmux <cli>`（v0.39 刪 shim 不會斷）
- [x] hub SKILL.md 降為 library 定位；router 為唯一入口
- [x] dispatch-gate hook 移入 plugin（hooks/hooks.json），GATE 2 regex 補強 `--exact`
- [x] wrapper 原生 gate（AGENT_TMUX_REQUIRE_GATE_RECEIPT / AGENT_TMUX_GATE_RECEIPT）
- [x] 修 secret redaction 洩漏（awk -v → ENVIRON）與 sessions watch pipefail 死亡
- [x] 三機安裝並 enable plugin 0.38.0；agent-scripts 舊 hook 退役；fleet-deploy PASS
- [x] shared-memory intake 提交（awk-v / tmux-ls / 環境掩護三教訓，validator PASS）

## Files Modified

| File | Changes | Rationale |
|------|---------|-----------|
| tmux-agent-tools 36 檔（commit 3351d7f） | v0.38.0 全套 | 見上 |
| agent-scripts 10 檔（commit 175be93） | hook 退役 + 拼法掃換 | plugin 先裝好才刪，無覆蓋空窗 |

## Decisions Made

| Decision | Options Considered | Rationale |
|----------|-------------------|-----------|
| shim 兩階段退役（v0.38 警告、v0.39 刪除） | 立即刪除 | 舊拼法散佈於 MEMORY/習慣；deprecation 期抓漏 |
| hook 走 plugin 而非手改 settings.json | settings.json hooks 段（§1 鎖定、三機各改） | 註冊隨 plugin enable，版本隨 plugin 更新 |
| skill 仍由 skills-lock 裝，plugin 只當 hook 載體 | plugin 全接管 skill | ~/.agents/skills 是跨 runtime canonical，plugin skills 只有 Claude 看得到 |
| sessions JSON `wrapper` 顯示欄位保留舊名 | 一併改 canonical | 有 test/consumer 依賴，屬 v0.39 移除範圍 |
| 修 pre-existing 雙 bug 而非繞過 | 標記 known-failure | kernel「solid completion」；且 secret 洩漏是安全問題 |

## Pending Work

## Immediate Next Steps

1. （排程 v0.39）刪除三支 shim + `wrapper` 顯示欄位/`tmux-agent-sessions` 說明文字
   改 canonical + Formula 更新 + smoke tests 全面改呼 `agent-tmux <cli>`。
2. 觀察 plugin/symlink 雙份同名 skill 是否干擾 Claude 的 skill 觸發
   （目前同版本、視為無害；有干擾再處理，選項：fleet 端讓 plugin 只留 hook）。
3. Codex curator 促銷兩份 pending shared-memory 提交
   （2026-07-28-agy-startup-prompt-swallow-confirmed、2026-07-28-awk-v-secret-leak-and-tmux-ls-pipefail）。

### Blockers/Open Questions

- [ ] 無 blocker。

### Deferred Items

- v0.39 shim 正式移除（見上）；mcp-adapter 套件名 `codex-tmux-agent-adapter`
  含舊字樣但屬套件識別，改名是 breaking change，未動。
- profiles/{claude,codex,agy}.conf 與內建 preset 內容重複（雙來源），
  未動——僅記錄，改動屬 preset 載入行為風險。

## Context for Resuming Agent

## Important Context

- **hook 的生效面**：plugin hook 只覆蓋 Claude Code；Codex/agy 靠 wrapper 原生
  gate，且那是 opt-in（要 export AGENT_TMUX_REQUIRE_GATE_RECEIPT 才會擋）。
  目前 fleet 尚未在任何 shell profile 預設開啟該 env——若要強制，需另行決策。
- **hook 尚未在真實 session 內驗證過 fire**（plugin details 顯示已註冊、
  hook script 有 9-check smoke；下個新開的 Claude session 內第一次 tmux
  dispatch 就是 live 驗證點——預期先被 GATE 1 擋、寫 receipt 後放行）。
- deprecation 警告會出現在所有 shim 呼叫的 stderr；smoke 套件已在
  run-all-smokes 統一 export AGENT_TMux… （正確名：AGENT_TMUX_SUPPRESS_DEPRECATION=1）。
- kernel 現為 v4.11.0-solid-and-fail-first（fail first + solid completion 兩條
  已由 Sol review PASS 後落地）；lessons.md 兩條已 flip 為 adopted。

## Assumptions Made

- skills-lock experimental_install 從各 skill repo 的 GitHub main 重抓
  （已由三機 agent-tmux md5 = v0.38 repo md5 驗證成立）。
- eval prompts 裡使用者口語的舊拼法（「用 codex-tmux 開 worker」）刻意保留，
  測 router 能把舊稱路由到 canonical。

## Potential Gotchas

- `run-all-smokes ... | tail` 會吃掉套件 exit code——判定以套件自身 exit 為準。
- 跑 sessions/watch 相關 smoke 前先 `tmux kill-server`，才是最嚴苛前置。
- `claude plugin` CLI 非互動可用（marketplace add ohyeh/tmux-agent-tools →
  install tmux-agent-tools@tmux-agent-tools）；remotes 需 PATH 補
  `$HOME/.local/bin:/opt/homebrew/bin`。

## Environment State

### Tools/Services Used

- claude plugin CLI（marketplace: tmux-agent-tools，三機已加）
- fleet-deploy.sh（SHA-pinned verify；本次 FLEET OK @ 175be93）
- shared-memory-intake validator（兩份 pending 提交 PASS）

### Active Processes

- 無（背景 smoke/deploy 均已完成；無殘留 tmux session）

### Environment Variables

- AGENT_TMUX_SUPPRESS_DEPRECATION（smoke 靜音用）
- AGENT_TMUX_REQUIRE_GATE_RECEIPT / AGENT_TMUX_GATE_RECEIPT（wrapper gate，opt-in）
- AGENT_TMUX_START_READY_TIMEOUT（start readiness，預設 45s）

## Related Resources

- ohyeh/tmux-agent-tools@3351d7f（v0.38.0；CHANGELOG.md 有完整條目）
- ohyeh/agent-scripts@175be93
- .workflow/202607261830-dispatch-gate-enforcement/plan.md（含 v0.38 pivot 註記）
- ~/.agents/shared-memory-inbox/pending/2026-07-28-awk-v-secret-leak-and-tmux-ls-pipefail.md
