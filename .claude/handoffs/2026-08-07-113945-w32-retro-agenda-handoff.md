# Handoff: W32 weekly retro 完成 + retro-agenda v1.2 draft，等執行 session 開跑 W33 流程

**Created**: 2026-08-07 11:39
**Project**: /Users/paul.yeh/git/agent-scripts
**Branch**: main
**Session**: https://claude.ai/code/session_01NVrq44qQRu4YvnYau2Xgtj

## Current State Summary

W32 weekly retro 已完成並經 GitHub 對帳修正；retro 議程首次文件化為
`~/.agents/rules/retro-agenda.md`（v1.2.0-draft，repo canonical 在
`.agents/rules/retro-agenda.md`）。使用者已看過流程圖，計畫由**另一個 session**
照議程執行下一輪 retro，報告出來後回原 session（或任一 session）與使用者討論裁決。

## Important Context

1. **對帳真相源是 GitHub remote，不是本地 clone**。W32 初版曾因
   context-mode-local-insight 本地落後而誤判 A1+C1+C2「未做」——實際已在
   GitHub（05b56ff agent-sessions collector）。lessons.md 已記兩條 proposed。
2. **量測主來源**：`node ~/git/context-mode-local-insight/bin/cli.mjs agent-sessions --days 7`
   （每個數字自帶 {value, method, tier}）。手排只補 tmux worker result.json 數與
   `~/.local/share/agent-hooks/bol-prompt-stats.jsonl` 兩面，不得重算。
3. **W32 關鍵數字**：Claude top-level 30（另 113 subagent）、Codex 7（去重後）、
   agy 10；bol 合規 18 pass/19 fail；done-claim 無證據 93.3%（14/15，derived，
   W33 A8 要先複核再定調）；tmux worker 完結 0。
4. **拓撲異變（E1，未解）**：100.64.190.44 現在 `uname -n` 回本機
   25006931Paul.local，host key 已換。遠端節點是否存在待使用者確認；確認前
   不動 fleet 跨機相關項目。
5. **shared-memory-inbox 積壓**：`~/.agents/shared-memory-inbox/pending/` 有
   8 筆未消化（7/27–7/30，agent-device iOS legacy / Widgetbook 主題），
   下輪 retro §5 直接列 finding；消化要走 shared-memory-intake（Codex promote）。
6. `evals/recipe-usage-stats.json` 是跑 `scripts/recipe-usage-stats.sh
   design-consensus` 的副產物，非手寫。

## Decisions Made

- A2 bol hook 維持 warn-only 不升 hard block（fail 率仍 51%；先做 W33 A7
  把 delegation-templates 骨架嵌進 warn 訊息）。
- design-consensus attic 掛牌應撤（W32 uses=5，死碼假設被推翻）→ W33 A6。
- retro 執行模式：agenda 文件化 + 圖示化，執行可交任何 session，裁決留使用者。
- `/wayfinder` 不在本機 Claude skill 清單（unknowns-discovery 有）；議程寫成
  「兩者的精神」，wayfinder 定位待使用者說明後把引用寫準。

## Immediate Next Steps

1. （執行 session）讀 `~/.agents/rules/retro-agenda.md` v1.2，照議程跑下一輪
   retro；§1 對帳吃 `.workflow/202608071000-weekly-retro/next-week-backlog.md`。
2. 開跑前先做 W33 C5 前置：collector 出「可疑名單附路徑」（目前只出 rate），
   否則 Layer 2 深挖沒名單可吃。
3. 裁決回報使用者：W33 backlog 執行順序建議 A8 → A7 → C4 → R2。
4. 待使用者答覆：E1 拓撲、agenda「待使用者補的面向」四題（token 面、糾正事件
   工具化程度、產品 repo 是否入範圍、要不要固定排程）、CLAUDE.md routing 加一行
   `| 執行 weekly retro | ~/.agents/rules/retro-agenda.md |`（global 檔需核准）。

## Critical Files

- `~/.agents/rules/retro-agenda.md` — 議程 v1.2.0-draft（deployed；repo 同步）
- `.workflow/202608071000-weekly-retro/` — retro-report.md（含勘誤）、
  next-week-backlog.md（W33，A6/A7/A8/C4/C5/T4/R2/E1）、retro-flow.html（流程圖）、plan.md
- `~/.agents/rules/lessons.md` — 新增兩條 2026-08-07 proposed（remote 真相源；
  collector 優先）
- `~/git/context-mode-local-insight/bin/agent-sessions.mjs` — Layer 1 collector

## Potential Gotchas

- lessons.md 是 local-only、append-only；`Status: proposed` 以外的寫法違反
  maintenance §1。
- 100.64.190.44 的 ssh known_hosts 本 session 已 accept-new 過一次；若它其實是
  被重配的 IP，不要再當遠端機隊節點用。
- recipe-usage-stats.sh 需要位置參數 `<recipe-name>`，無參數會 exit 1。
