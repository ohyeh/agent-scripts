# Handoff: Retro W32 open-questions 全數裁決完成 — 待執行已核准項目

## Session Metadata
- Created: 2026-08-07 21:02:13
- Project: /Users/paul.yeh/github/agent-scripts
- Branch: main
- Session duration: ~1.5h（互動裁決為主）

### Recent Commits (for context)
  - 528f752 Squashed commit of the following:
  - 8d41919 feat(rules): judgment-rubrics §2 — delegated-worker verdicts read result.json, never exit codes
  - f127f54 fix(delegation): exempt search-shaped subagents from bol warn; purge retired-haiku directives
  - 31c4357 revert(skills): un-vendor 8 matt skills — upstream only moved paths; prune 3 deprecated
  - 32e1f03 fix(deploy): prune skills removed from lock roster

## Handoff Chain

- **Continues from**: [2026-08-07-153250-retro-inbox-agenda-v13.md](./2026-08-07-153250-retro-inbox-agenda-v13.md)
  - Previous title: retro-inbox 常設化 + agenda v1.3（§6.5 臨時動議）+ 一下午的議題收集
- **Supersedes**: None（前一份仍有議題收集脈絡價值）

## Current State Summary

本 session 把 `.workflow/202608071600-weekly-retro/open-questions.md` 的 A–F 六組**全部逐條裁決完畢**（AskUserQuestion 四批），使用者最後以「ok」核准 D-1（agenda v1.4 轉正式）。裁決已完成但**執行才剛開始**：正要動手做 A-5 kernel diff、agenda v1.4、lessons 統一＋追加時被中斷建 handoff。所有已核准的編輯**尚未落地**。

重要環境事實：本 session 跑在 **ohYEHs-MBP-14（100.77.191.62）**；retro 報告產出於 **100.64.190.44**（tailscale status 顯示 offline 但 SSH 實測可通——不要信 status）。`retro-agenda.md` 與規範格式的 lessons.md **只在 .44 上**。

## 裁決總表（本 session 的核心產出）

| # | 裁決 |
|---|---|
| F-1 | ✅ W33 主軸＝機器閘門（規則收編成 hook/validator 可判定門檻） |
| F-2 | ⏳ M1（Bash PreToolUse 讀檔稽核 hook）**先出設計＋效能評估**，核准後才實作 |
| A-1 | ✅ lessons 追加 L1–L9（retro-report.md §7b），用遠端規範格式 |
| A-2/A-3 | ✅ lessons 統一遠端格式（`## date \| scope \| trigger` + `Rule:`）＋**改 repo 同步**（棄 local-only；kernel「lessons.md local-only」句要一併改） |
| A-4 | ❌ 不加 CLAUDE.md routing 行；retro 由使用者自己發起 |
| A-5 | ✅ 修 kernel narration 規則（9c0d9a1 於 2026-08-01 改壞）：narration 選擇性（僅重要發現/連續失敗出聲）、`✈` 只在回合結尾一次；diff 已給使用者過目核准 |
| B-1 | 使用者會給 GCP console 存取，屆時再裁 credits 用途 |
| B-2 | 改題：探勘 Leonxlnx taste-skill 全家族，逐個定置換/升級/不動 → 排 W33 |
| B-3 | skills 差集**先盤點**（本機獨有 5＋遠端獨有 1 逐個過）再裁去留 |
| C-1 | ✅ collector 加 token/成本欄 |
| C-2 | ✅ 糾正事件輕量關鍵詞粗篩（collector 欄位，不建大系統） |
| C-3 | ✅ 產品 repo（healthgo 等）算範圍但**次要**；retro 主軸是「與 agent 協作的過程與循環」 |
| C-4 | ✅ 維持手動觸發，不排程 |
| D-1 | ✅ agenda v1.4 轉正式（含 C 組四點套入＋範圍句改寫＋收進 repo 兩機部署） |
| D-2 | 無新動議 |
| D-3 | ✅ **兩個都現在補**：本輪 Layer 2 重跑（含 unknowns-discovery）＋A7 驗收改寫（GOAL+ACCEPTANCE 同缺比例） |
| D-4 | inbox：裁完＋各項有對應處置政策或部署後才清 |
| E-1～E-5 | ✅ 全排下輪（E-2 帳號夠格 Team/Enterprise、E-4 三筆巨型 session 深挖第一順位、E-3 併 K4、E-5 異常 session 查源） |

## Pending Work

## Immediate Next Steps

（以下全為已核准、待執行項目）

1. **A-5 kernel diff**：改 `global/CLAUDE.md` + `global/AGENTS.md`（byte-identical），narration 段改為「optional，僅重要發現/連續失敗出聲；任何有出聲的段落守語言規則」、`✈` 改為「turn 最終訊息結尾一次」；同時依 A-3 把「with `lessons.md` local-only」句移除；版號 bump（現 4.16.0 → 4.17.0）；部署到本機與 .44 的 `~/.claude/CLAUDE.md`、`~/.codex/AGENTS.md`
2. **agenda v1.4**：從 .44 取 `~/.agents/rules/retro-agenda.md`（本 session scratchpad 已有副本），套入 C-1～C-4 裁決（成本欄、糾正粗篩、範圍句改「以 agent 協作過程與循環為主軸，產品 repo 次要輕量」、手動觸發明定）、刪尾節四題、版號 1.4.0 轉正式；收進 repo `.agents/rules/retro-agenda.md`，部署兩機
3. **lessons.md 統一＋追加**：本機 `~/.agents/rules/lessons.md`（`Date:/Trigger:/Status:` 區塊格式，偏離方）改寫成遠端規範格式；合併遠端條目（L001–L006）；追加本輪 L1–L9（見 retro-report.md §7b）；收進 repo 隨 git 同步；改 maintenance/kernel 中 local-only 相關句
4. **F-2 M1 設計文件**：hook 設計＋效能影響評估，交使用者核准
5. **D-3 補作**：本輪 Layer 2 重跑含 unknowns-discovery；A7 驗收改寫進 backlog
6. 以上入 repo 後 commit（需出示 git status/diff；**使用者已說 "and push"——本 handoff 連同已核准編輯可 push**）
7. 全部部署完成後依 D-4 清 `.workflow/retro/inbox.md`
8. 更新 `open-questions.md`：逐條標上裁決結果

### Blockers/Open Questions

- [ ] B-1 等使用者給 GCP console 存取
- [ ] F-2 M1 實作卡在設計文件核准

## Context for Resuming Agent

## Important Context

- **A-5 diff 已核准的方向**（憑此重建即可）：刪除 9c0d9a1 加入的「"Reply" covers every assistant text segment…」整段，換成「Narration between tool calls is optional — speak up mid-turn only for an important finding or consecutive failures. Any text segment you do emit follows the language rules above.」；`✈` 句改成綁 turn 的最終訊息
- **格式基準**：lessons 規範格式見 .44 的檔案與本機檔案既有條目（`## <date> | scope: <x> | trigger: <y>` / `Rule: …` / `Status: proposed`）
- retro-report §7b 有九條 L1–L9 lessons 提案全文；scratchpad 有 agenda v1.3 副本（`/private/tmp/claude-501/...9ad022ff.../scratchpad/retro-agenda.md`）
- session title 已設：`🚨 Weekly retro W32 — open-questions A–F 待使用者裁決（F-1/F-2 主軸優先）`——執行開始後應改 `⏳ … — 執行已核准項目`

### Assumptions Made

- 版號 bump 到 4.17.0（依 maintenance 慣例，未再確認）
- lessons repo 落點假設為 `.agents/rules/lessons.md`（與 kernel「Canonical routed rules live in … `.agents/rules/`」一致）

### Potential Gotchas

- **兩機身分**：報告視角的「本機」是 .44；不要照抄報告的本機/遠端稱謂
- `tailscale status` 不可當存活真相源（本 session 再度驗證：.44 標 offline 10h 但 SSH 可通）
- 本 repo 目前沒有 `.agents/` 目錄——rules 收進 repo 是新建路徑，deploy 機制（install/lock roster）要跟著看 32e1f03 那套 deploy 邏輯
- context-mode hook 會攔 curl/wget——外部 HTTP 走 `ctx_execute`
- kernel 兩檔（CLAUDE.md/AGENTS.md）必須 byte-identical（只差檔名），改一個就要同步另一個

## Environment State

- 工作機：ohYEHs-MBP-14（100.77.191.62）；.44 可 SSH（BatchMode 可用）
- git tree clean @ 528f752（handoff 檔為唯一新增）
- 無 active processes

## Related Resources

- `.workflow/202608071600-weekly-retro/open-questions.md`（裁決標的）
- `.workflow/202608071600-weekly-retro/retro-report.md` §4.5（機器閘門七證據）、§7b（L1–L9）
- `.workflow/202608071600-weekly-retro/next-week-backlog.md`（M1–M6 執行清單）
- `.workflow/retro/inbox.md`（待清）
- commit `9c0d9a1`（A-5 要修復的來源）
