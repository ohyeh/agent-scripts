# 前情提要 · <YYYY-MM-DD HH:MM> · handoff <file> · run dir <dir>

<!-- The catch-up subagent writes this file in <run-dir>/catchup.md and rewrites it after each source group,
     so its own compaction loses nothing. Every item line ends with its source: path:line, commit sha,
     user.txt line, or a dated user quote. The main session reads this file whole and replies from it;
     node details stay in <pack>/<sid8>/timeline.md. -->

## 1. 要解決什麼問題
- 「<user quote>」— <date or user.txt line>

## 2. 之前怎麼做
| 做法 | 有效/失敗 | 日期 | 成立條件 | 紀錄 |
|---|---|---|---|---|

## 3. 相關規範、記憶、工具
- <path> — <why the next step needs it>

## 4. 交接注意事項
- <Mistakes and Corrections / Important Context / Standing Authorizations / Blockers item> — <effect on this task> — <source>

## 5. 停在哪、下一步
- 檢查點：<last proven result> — <evidence>
- 下一步：<one action> — 出處：「<user quote>」<date> / <record path:line>
- 主線的現場查核（R5）：`<read-only command>` — 預期 <output>
- 未定：<what cannot be decided yet> — 缺 <source>

## 6. 讀取狀態
- handoff <file> full | partial (<range>) | not read (<reason>)
- artifact <path or URL> read | not read (<reason>)
- <sid8> · COUNT <n> · TOOLS <n> · pack <pack>/<sid8> · user.txt <read>/<total> pages · footprints.txt <read>/<total> pages
- timeline：<pack>/<sid8>/timeline.md
- 子代理 log：<absolute path of this subagent's own session log, if known>
