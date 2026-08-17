# Findings：遠端全量補掃（取代抽 6，2026-08-01）

腳本掃 100%（169 claude + 37 codex），完整排名留在遠端 /tmp/sweep_out.txt、/tmp/sweep_codex_out.txt。

## 乾淨分母重切（top-level only, n=47）——關鍵修正
- ✈ canary：17/47 = **36.2%**
- GOAL/ACCEPTANCE/REPORT 共現：2/47 = **4.3%**（比抽樣估的 35-42% 低一個量級——先前抽的是 subagent transcripts，母體不同）
- done-claim 無證據：115/140 = **82.1%**（heuristic 上界：只看同訊息內有無 exit code/``` 標記，未做 adjacent tool_result 嚴格版）

## Friction 全量
- Claude 169 檔：interrupted 31、correction 命中 222、error 命中 389。
- ⚠ correction 數字是全 role 上界：對 top session cc654ee4 覆核，42 命中僅 6 次真的來自 user role，其餘是 assistant 自己文字含「不要/不對」。精確 user-pushback 率需只算 user 訊息（方法已驗證可行，未全量重跑）。
- Top friction：cc654ee4 score 206（真 user 糾正 6 次，多為多 subagent 協作雜訊）＞94818414（yunlin-portal-app）＞db9613b7＞a08c439b＞e938aee3。
- Codex 最高 rollout-2026-06-29（score 86）為跨窗邊界案例（first_ts 窗外）。

## Tool-call 統計（遠端 Claude 全量）
Bash 3261、Edit 907、Read 874、chrome computer 309、ctx_execute 194、SendMessage 139、ToolSearch 137、Agent 106（共 60 種，無截斷，留遠端 txt）。
Codex（INFERRED，非官方 schema）：exec 599、exec_command 369、js 62。

## agy 時區疑雲結案
非 clock/timezone 問題（remote TZ 正確 CST）。兩種篩法互證：遠端窗內真實對話就是 1 個（176abd7b, healthgo-mobile, 07-30）；history.jsonl 另 4 行是無 conversationId 的 /usage /model 指令紀錄。

## 殘留
逐字全文深讀未做（metadata 層分析）；correction 精確版與 adjacent-tool_result 嚴格版 done-claim 未全量重跑。
