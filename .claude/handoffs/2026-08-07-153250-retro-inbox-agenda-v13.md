# Handoff: retro-inbox 常設化 + agenda v1.3（§6.5 臨時動議）+ 一下午的議題收集

**Created**: 2026-08-07 15:32
**Project**: /Users/paul.yeh/git/agent-scripts
**Branch**: main
**Session**: https://claude.ai/code/session_01NVrq44qQRu4YvnYau2Xgtj
**Continues from**: 2026-08-07-113945-w32-retro-agenda-handoff.md

## Current State Summary

前一份 handoff 之後，本 session 續作了三件事：
1. **agenda 升 v1.3.0-draft**：新增 §6.5 臨時動議與使用者訴求（retro 開跑與裁決前各問一次；
   訴求不需 collector 佐證即成案；全部落成 backlog/lessons 格式，不准只記「已討論」）。
2. **常設 retro inbox**：`.workflow/retro/inbox.md`（比照 `.workflow/recipes/` 的具名子目錄
   慣例，跨週存活）。兩節：待討論議題＋本週隨手記。R2（weekly-retro recipe 化）已註明
   inbox 為正式輸入。
3. **使用者一口氣灌了十幾條議題**（見 inbox），全數收錄並附評估點與關聯。

另外完成一件實作：codex `~/.codex/config.toml` `[features]` 加了
`default_mode_request_user_input = true`（先驗證 key 存在於 0.146.1 binary 的 feature
清單，`codex exec` 冒煙測試通過）。

## Important Context

1. **inbox 是下次 retro §6.5 的直接輸入**——執行 session 開跑第一步就讀
   `.workflow/retro/inbox.md`，倒空處理：議題逐條裁決、隨手記餵 Layer 2 當線索。
   處理完清空條目、留檔（位址固定，歷史在 git）。
2. **本週最大的橫向 pattern：「規則存在但沒執行」**，至少四個獨立案例——
   tmux `--prompt-file` 坑（lessons 已載仍踩）、done-claim 93.3%、✈ canary 43%、
   術語過度翻譯（CLAUDE.md 已有規則）。對策方向已在 inbox：高頻動作的規則往
   工具路徑收編（hook/wrapper/validator），文件只留低頻判斷。
3. **使用者三大訴求互相咬合**：rate-limit（sub-agent 開太多）×
   sonnet 效益差（提議 opus low）× WORKER|REVIEWER 編組——fable-advisor /
   sol-advisor 兩個 repo 是現成答案範本（architect pattern），研究時三題併案。
4. **「機器閘門」doctrine 成形中**：Addy Osmani constraints 圈（deterministic checks
   the model can't argue with）＋ Debug Loop 證據契約（無證據目錄不算完成）——
   與步驟化派工提案、A8 done-claim 複核同一條線，可定為 W33 主軸。
5. 使用者溝通偏好已明確表達（也收進 inbox 為訴求）：過程話少、嚴格 stop-slop、
   只在重要發現/連續失敗時出聲、術語保留英文。**本 handoff 之後的 session 應直接
   照此執行，不必等 retro 裁決。**

## Decisions Made

- inbox 檔案每週清空**條目**、不刪**檔案**（位址固定防呆；歷史靠 git）。
- inbox 位置走 `.workflow/` 具名子目錄慣例（`retro/`），比照 `recipes/`。
- 訴求（使用者對 agent 行為的不滿）定位為最高優先體驗訊號，免數據佐證直接成案。
- codex `default_mode_request_user_input` 直接套用（key 經 binary 驗證），
  不等 retro——體感確認後再收 provisioning 標配。

## Immediate Next Steps

1. （執行 session）照 `~/.agents/rules/retro-agenda.md` v1.3 跑下一輪 retro；
   §1 吃 `.workflow/202608071000-weekly-retro/next-week-backlog.md`，
   §6.5 吃 `.workflow/retro/inbox.md`（現有使用者約 14 題＋Claude 4 題）。
2. inbox 裡標「前置：逛 repo 帶結論來」的題目（Agent Plugins、KiroCrew、
   fable-advisor/sol-advisor、mattpocock skills、codemap）需要 pre-read，
   適合派 research 型 worker 先做摘要。
3. 前份 handoff 的待使用者事項不變：E1 拓撲、agenda 四題、CLAUDE.md routing 行。

## Critical Files

- `.workflow/retro/inbox.md` — 常設臨時動議收件匣（本次核心產出）
- `.agents/rules/retro-agenda.md` — v1.3.0-draft（§6.5 新增；deployed 至 ~/.agents 同步）
- `.workflow/202608071000-weekly-retro/next-week-backlog.md` — R2 補 inbox 輸入
- `~/.codex/config.toml` — `[features]` 加 default_mode_request_user_input（不在 repo）

## Potential Gotchas

- inbox 條目多為「收錄＋評估點」，尚未裁決——不要當成已核准的 backlog 執行。
- `default_mode_request_user_input` 只做過 exec 冒煙測試，互動式 Multiple Choice
  體感未驗證。
- 前份 handoff 的 gotchas（lessons.md append-only、100.64.190.44、
  recipe-usage-stats.sh 參數）仍有效。
