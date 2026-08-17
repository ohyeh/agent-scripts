# Handoff: Weekly retro W31 — 三 repo 修繕 merge/push/部署完成；#2 diff 待核准

## Session Metadata
- Created: 2026-08-01 16:25:50
- Project: /Users/paul.yeh/github/agent-scripts
- Branch: main
- Session duration: ~5.5 小時（11:05 起，含一次 compaction）

### Recent Commits (for context)
  - a7f75a8 feat(rules): R1 — measurement full-coverage rule folded into judgment-rubrics §5
  - 209c33f merge retro/2026-08-01: A2 bol validator+hook, A3 attic tag+usage stats (post-review fix 8e1b527), A5 context ledger hook
  - 8e1b527 fix(recipe-usage-stats): tolerate zero grep matches under set -euo pipefail
  - 6b1b3b5 feat(rules): retire haiku tier — sonnet effort-low takes over all former haiku roles
  - 17c4a4b feat(workflows): A3 design-consensus attic tag + recipe usage stats

## Handoff Chain

- **Continues from**: [2026-07-28-202347-v038-shim-retirement-plugin-hook-gate.md](./2026-07-28-202347-v038-shim-retirement-plugin-hook-gate.md)
  - Previous title: tmux-agent-tools v0.38.0 — shim 退役、plugin hook、runtime-agnostic gate、fleet 全同步
- **Supersedes**: None

## Current State Summary

2026-08-01 weekly retro（run dir `.workflow/202608011105-weekly-retro/`）已完整閉環：雙機三 CLI 全量掃描 → retro-report v4 → backlog 10 項 → 本週批次以 dynamic workflow `wf_144a561d-ad8`（9 agents，Opus×2/Sonnet×7）執行完畢。三 repo 全部 merge 到 main、push、雙機部署完成。剩餘唯一待使用者決定：issue #2 的 global CLAUDE.md exact diff（工具鏈旁白也算 reply）核准後落地。

## Codebase Understanding

### Architecture Overview

- 三 repo 分工：agent-scripts（rules/skills/hooks canonical + deploy.sh）、tmux-agent-tools（8161 行 zsh 單體 CLI `skills/tmux-agent-tools/scripts/agent-tmux`）、context-mode-local-insight（本地 session 分析，metric-contract 信任分級）。
- deploy.sh 以 `rsync --exclude lessons.md` 佈 rules，lessons.md 永遠 local-only 且有消失即 FAIL 保護；skills 佈到 `~/.agents/skills/`（`~/.claude/skills` 是 symlink）。
- agent-tmux profile 解析順序：`--profile-dir` > `$AGENT_TMUX_PROFILE_DIR` > `~/.config/agent-tmux/profiles/` > bundled——**user override 會遮蔽 bundled**，修 bundled profile 必須同步檢查 override。

### Critical Files

| File | Purpose | Relevance |
|------|---------|-----------|
| .workflow/202608011105-weekly-retro/ | retro 全部產出（report、findings、backlog、drafts） | 下週 retro 對帳基準 |
| .workflow/202608011105-weekly-retro/drafts-issue2-issue3.md | #2 exact diff（待核准）＋#3 上游 issue（已裁決不發，轉 fork 需求清單）＋防衛註記草稿 | 唯一 open decision |
| .workflow/202608011105-weekly-retro/next-week-backlog.md | 10 項 backlog＋執行紀錄＋R2 recipe 化範圍 | 下週開工清單 |
| .agents/rules/model-dispatch.md | haiku 已退役（6b1b3b5），sonnet low 接手 | 派工前必讀 |
| context-mode-local-insight bin/agent-sessions.mjs | 新 collector：claude/codex/agy 三 store 全量量測 | 下週 retro 量測層，取代手刻 jq |
| tmux-agent-tools scripts/agent-tmux `brief` 子指令 | GOAL/ACCEPTANCE/REPORT prompt 編譯器（T1） | 追蹤合規曲線用 |

### Key Patterns Discovered

- multi-repo-fix workflow 骨架實戰成立：per-repo 串行 implement 鏈疊同一 branch（`retro/2026-08-01`）+ worktree 隔離 + fresh Sonnet review VERDICT + 指揮者終審。踩點：Workflow 的 `isolation:'worktree'` 綁 caller repo，跨 repo worker 需自建 worktree。
- merge commit 訊息含 `fix #NNN` 會被 GitHub 自動關單（#317/#318 即如此）；想後關用 `(#NNN)`。
- dispatch gate 擋 parent session 直呼 `agent-tmux start`（連 --dry-run 也擋）——驗證交 subagent。
- JSONL transcript 的換行存成字面 `\n` 兩字元，regex `\bGOAL` 永遠不中；全檔掃 evidence 關鍵字必然誤判——per-assistant-line 才準（已編碼進 agent-sessions collector 的 method 字串）。

## Work Completed

### Tasks Finished

- [x] GH issues：tmux-agent-tools #317（result init 假完成，修在 `canonical_status_of`+新 `result_terminal_ready` seam）、#318（agy profile headless/effort flags）——push 時自動關單
- [x] Backlog：T1（`brief` 子指令）、A2（bol validator+warn hook）、A3（design-consensus 掛牌+`consecutive_zero_weeks`，review 抓到 pipefail bug 已修 8e1b527）、A5（context ledger hook）、A1+C1（CMLI `agent-sessions` collector，23/23 tests）、C2（--help exit 0）
- [x] 三 repo merge→push：agent-scripts `209c33f`→`a7f75a8`、tmux-agent-tools `e3a7040`、CMLI `53bdd6f`
- [x] 本機部署：deploy.sh 全層 PASS；`~/.config/agent-tmux/profiles/agy.conf` override 補三鍵；subagent 實測 5/5 綠
- [x] haiku 退役（`6b1b3b5`，使用者明令「放棄HAIKU了 sonnet low 取代」）
- [x] R1 收編：量測禁抽樣 → judgment-rubrics.md §5（`a7f75a8`），雙機部署 SHA 一致；lessons.md 對應條目標 adopted、result-init 條目標 retired
- [x] #3 裁決：不發上游 issue，轉「fork mksglu/context-mode 自理」方向（issue #3 有 comment 記錄）

### Files Modified

| File | Changes | Rationale |
|------|---------|-----------|
| 見上方 commits | 全部經 branch→review→merge 流程 | 詳見各 commit message |
| ~/.config/agent-tmux/profiles/agy.conf | 補 effort_flags/headless_flags/headless_prompt_flag | override 遮蔽 bundled，不補則 #318 白修 |
| ~/.agents/rules/lessons.md | 兩條 Status 更新（adopted/retired） | R1 帳目 |

### Decisions Made

| Decision | Options Considered | Rationale |
|----------|-------------------|-----------|
| haiku 全面退役 → sonnet low | 保留 haiku 做純機械工作 | 使用者明令；盤點計數錯兩量級前科 |
| #3 不發上游 | 發 issue / fork 自理 | 使用者裁決：傾向 fork；草稿轉需求清單 |
| T1 子指令命名 `brief` 非 `dispatch` | dispatch | repo 內 dispatch 已指 PreToolUse gate，避免混淆 |
| A1 實作為 CMLI collector 而非獨立腳本 | agent-scripts 獨立腳本 | 一石三鳥：量測工具化＋CMLI 復活＋跨機 fleet 現成 |
| R1 落點 judgment-rubrics §5 | 新獨立 rule 檔 | 格式吻合 quality-floor 檢查表，避免 rules 檔數膨脹 |

## Pending Work

## Immediate Next Steps

1. **#2 global CLAUDE.md diff 等使用者核准**（`drafts-issue2-issue3.md` Draft 1）——核准後：改 repo `global/CLAUDE.md`、版本 bump（草稿假設基底 4.13.0，落地前 live 重驗）、同步 `~/.claude/CLAUDE.md`+`~/.codex/AGENTS.md`、雙機部署。
2. 使用者若確認 fork mksglu/context-mode → `gh repo fork` → 首批需求見 drafts Draft 2。
3. 下週 retro：用 `node bin/cli.mjs agent-sessions --days 7`（CMLI）做量測層；對帳 backlog 10 項；讀 A2 warn 統計（`~/.local/share/agent-hooks/bol-prompt-stats.jsonl`）與 T1 `brief` 使用曲線。

### Blockers/Open Questions

- [ ] #2 diff 核准（唯一 open decision）
- [ ] fork context-mode 與否（使用者「可能」，未定案）

### Deferred Items

- A4 做市商試跑（等真任務）、T2 RMA schema、T3 post-result hook ADR、R2 recipe 化（multi-repo-fix + weekly-retro 兩支；骨架已實戰驗證，入 bundle 前需 consensus-gate）
- 殘餘 proposed lessons 升格候選：遠端 L005 證據族、本機 2026-07-25 兩條 delegation 防造假、2026-07-22 proxy 條目的 haiku 字樣更新（dispatch gate 提示文字同樣殘留 haiku 引用）

## Context for Resuming Agent

## Important Context

- **全程指揮模式**是使用者的固定要求：指揮者只盤點/決策/派發/復驗/定奪，不親寫產品 code。分級：調查=Explore、實作=Sonnet（機械類 sonnet low）、hard 兩單=Opus、review=fresh Sonnet、終審=指揮者。
- retro 是三 repo 持續優化引擎；所有數字必附產生指令（judgment-rubrics §5 新條目，違者即量測債）。
- workers 常被 harness 擋寫 repo 外 .md——固定流程：worker 回傳文字、指揮者代存。
- agy = Google Antigravity CLI，store 在 `~/.gemini/antigravity-cli/`（protobuf blob，只有 trajectory_meta 可讀）。

### Assumptions Made

- retro branch `retro/2026-08-01` 三 repo 皆保留未刪（merge 已完成，branch 留作追溯）。
- CMLI 部署=直接跑 repo（無安裝步驟）。

### Potential Gotchas

- `~/.config/agent-tmux/profiles/*.conf` user override 遮蔽 bundled——改 bundled profile 必查 override。
- invariants `rulesBytes` baseline 需在 rules 實質新增時 `--accept`（本 session 兩次）。
- Workflow script 內禁 `Date.now()`/`Math.random()`；`isolation:'worktree'` 綁 caller repo。
- context-mode plugin 會攔 curl/WebFetch——需要時走 `ctx_execute`（language 用 `shell` 非 `bash`）。

## Environment State

### Tools/Services Used

- dynamic Workflow（run wf_144a561d-ad8，journal 在 session transcript dir）、gh CLI、ssh/scp 100.64.190.44
- 新 hooks 已註冊 `~/.claude/settings.json`：bol-prompt-warn（PreToolUse/Agent）、context-ledger（PostToolUse/*）

### Active Processes

- 無（workflow 與 subagents 皆已完成；worktrees 已清理，兩 repo `git worktree list` 各剩主 checkout）

### Environment Variables

- 無新增

## Related Resources

- `.workflow/202608011105-weekly-retro/`（retro-report.md、next-week-backlog.md、drafts-issue2-issue3.md、findings-*.md）
- GH：ohyeh/tmux-agent-tools #317/#318（closed）、ohyeh/agent-scripts #2（open，等核准）/#3（open，fork 方向）
