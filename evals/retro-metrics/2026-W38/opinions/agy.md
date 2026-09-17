# agy 審閱 W38

| F | 判定 | 證據 file:line | 理由 |
|---|---|---|---|
| F1 | 同意 | `evals/retro-metrics/2026-W38.json:13,15,20,126,128,133,234,236,241,304-311`；`evals/retro-metrics/2026-W38/retro-report.md:12-19,48,134` | 三機 Claude 127 場（66+58+3）、846 turns（395+448+3）、2.35B 去重 tokens（651M+1,697M+17k）與費用當量 $1,552.62（每輪 $1.835）數據完全吻合；每輪成本與 W37（$1.75）持平，§10 建議「觀察」合理。 |
| F2 | 同意 | `evals/retro-metrics/2026-W38.json:13,15,24,80,82,126,128,137`；`evals/retro-metrics/2026-W38/retro-report.md:25-29,49,135` | .62 turns 818→448、subagents 100→49，.44 turns 172→395、sessions 26→66 數據準確；.44 場次集中於 tmux-agent-tools（24 場）與 yunlin-portal-app（15 場），屬工作重心自然移轉，§10 建議「觀察」合宜。 |
| F3 | 同意 | `evals/retro-metrics/2026-W38.json:72-76,79-86,668-671`；`evals/retro-metrics/2026-W38/retro-report.md:31-34,50,127,136` | .44 canary（27.9%）、triplet（47.1%）、correction（4 場）數據皆符；逐專案分解證實 tmux worker（0/24）與 yunlin（2/15）為拉低主因，同 kernel 的 agent-scripts 仍達 57%（13/23），且抽樣對照組顯示真糾正被低估（漏抓 2 場）；§10 建議「升級（X10 worker 載 kernel）」因果論證充分。 |
| F4 | 同意 | `evals/retro-metrics/2026-W38.json:23,136,170-178,188,244`；`evals/retro-metrics/2026-W38/retro-report.md:30,51,137` | 三機 cache break >100k 合計 39 筆（.44 10、.62 29、.47 0），.62 專案分佈（terrain 12、agent-scripts 12）與 loop 相關 10 筆皆核實無誤；idle ≥60 分撞 1h TTL 屬模型端限制且 kernel 已禁溫快取，§10 建議「觀察」符合現狀。 |
| F5 | 同意 | `evals/retro-metrics/2026-W38.json:92-102,201-210,271`；`evals/retro-metrics/2026-W38/backlog-reconciliation.md:27`；`evals/retro-metrics/2026-W38/retro-report.md:41,52,138` | 三機 Codex 總量 50.2M（.44 34.2M、.62 16.0M、.47 0M）及 cached 比例（.44 93%、.62 88%）、主力模型分佈（.44 luna 14 場、.62 astra 17 場）皆完全相符；換用 `codex-tokens.py` 新口徑且未做 reasoning effort 欄，建議「觀察」待下週累積趨勢切合實際。 |
| F6 | 同意 | `evals/retro-metrics/2026-W38.json:105-107,111-114,213-215,219-222,293-295`；`evals/retro-metrics/2026-W38/retro-report.md:42-44,53,139` | agy 軌跡（.44 19、.62 7）、cursor 統計（.62 15 chats，5 無 meta、3 unreadable）與 grok VM seats 16（child 331、orphan 41）皆與機器數據一致；對 orphan 連續增加設定量化門檻（>50 升級），建議「觀察」處置妥當。 |
| F7 | 同意 | `evals/retro-metrics/2026-W38.json:338,370,415,447,492,524,549,694`；`evals/retro-metrics/2026-W38/loops-inventory.md:9-16`；`evals/retro-metrics/2026-W38/retro-report.md:54,140` | grok VM kernel 停留在 4.29.0，.62 與 .47 缺 clone（agent_scripts_clone: null），且 .47 的 lessons.md sha 分歧（2939e283 缺 09-15 條目）皆有實測支持；涉及外部主機部署側效，§10 建議「升級（X12 fleet-deploy）交 Paul」正確。 |
| F8 | 證據不足 | `evals/retro-metrics/2026-W38.json:408,485,573-623,634`；`evals/retro-metrics/2026-W38/loops-inventory.md:10,13,49`；`evals/retro-metrics/2026-W38/retro-report.md:55,141`；`.workflow/retro/inbox.md:12-19`；`~/.agents/rules/lessons.md:9,13,17` | repo 11 skills 中 3 支零用量（ask-nova、defect-first-review、writing-artifacts）與 retro inbox 兩節皆空屬實；但 §3 第 55 行宣稱之 `lessons.md 46 proposed / 3 adopted / 2 pending` 中，「2 pending」缺乏證據支持——實際檔案與 `loops-inventory.md:13` 載明總數 49 條僅由 46 proposed 與 3 adopted 組成（無任何 pending 狀態），§10 第 141 行表格自身亦已剔除此數字（疑似將 pending_decision_endings 的 2 筆混入）。 |
| F9 | 不同意 | `evals/retro-metrics/probe.py:1-66`；`evals/retro-metrics/2026-W38.json:332-553`；`evals/retro-metrics/2026-W38/backlog-reconciliation.md:37`；`evals/retro-metrics/2026-W38/retro-report.md:56,107-119,142,154` | §3 第 56 行宣稱「機器層 probe.py 仍未重建」與事實及報告後續內容直接矛盾。事實上 `evals/retro-metrics/probe.py` 已經實作完成並於 09-17 成功採集三機資料填入 `2026-W38.json:332-553`；報告自身之 §8、§10（行 142 明記「→ 本輪 probe.py 重建」）與 §11（行 154）均證實 probe.py 已補齊重建，且 `backlog-reconciliation.md:37` 表明做了 6/9，0.5/7 之陳述已失真且資料不支持。 |

## 遺漏

1. **Layer 2 A 類真實違規（10 筆）未被提煉至 §3 Findings 與 §10 裁決升級**：`retro-report.md:64-77` 與 `layer2.json:4-9` 挖掘出 10 筆實質違規（涵蓋 Live truth 誤判 2 筆、done 無證據 4 筆、等待協定 2 筆、過度設計 2 筆），但 §3 Findings 僅著重於宏觀量化比率，未包含具體的行為違規主題；§10 亦未列入正式裁決升級，僅作為文末未寫入的 lessons 草稿。
2. **W37 最高優先級 P0 項目 Y4（Stop hook claim-evidence matcher）整週未動，未在 Findings 列為核心缺口**：依 `backlog-reconciliation.md:13,37`，Y4 為 W37 唯一的 P0 項目卻完全未做；且本週機器層數據（`2026-W38.json:399,476`、`retro-report.md:113`）顯示 Stop hook 在兩機擋下 48 與 61 次（Layer 2 證實誤判率高達 51/56），此嚴重阻礙工作流的關鍵缺口未在 §3 獨立成項。
3. **shared-memory pending inbox 長期積壓（最舊達 27 天）且 .44 memories 擷取停擺未被揭露**：`loops-inventory.md:23-27,44` 指出兩機 pending 共有 34 筆且自 W34 以來持續堆積無人消化；同時 .44 產生了 17 場 / 34M Codex tokens，但 `~/.codex/memories/` 新增 summary 卻為 0 筆，顯示跨 session 長期記憶學習鏈路存在停滯與斷鏈風險，報告未予點名。

VERDICT: BLOCK
