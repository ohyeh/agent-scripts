# W33 backlog（2026-08-07 議題裁決輪產出）

承接同日早輪的 `.workflow/202608071000-weekly-retro/next-week-backlog.md`（A6–A8/C3–C5/T2–T4/R2/E1），
本檔只列**本輪新增或修訂**的項目。每項有證據、落點、驗收。下輪 retro 逐項對帳。

**W33 主軸建議：機器閘門**——高頻規則往工具路徑收編，且規則寫成可判定門檻而非禁令。
理由與七處證據見 `retro-report.md` §4.5。

## 修訂既有項

| # | 變更 | 證據 |
|---|---|---|
| A7 | **改寫驗收**（W32 裁決 D-3 已採用）：目標從「總 pass 率 > 70%」改為「GOAL 與 ACCEPTANCE 同缺的比例下降」，且**分機驗收**（合併數字會掩蓋兩機差異，§1 解讀 1） | 合併 pass 率 49.2%（65/132）遠未達標；但 fail 中 48/68（70.6%）是兩者同缺，比 W32 的 42% **惡化** → warn 內嵌骨架沒進派工路徑（§1b） |
| A8 | **升 P0，改分機驗收** | done-claim 無證據率合併 96.9%（31/32），**遠端 19/19 無一例外**（§1）。已不必再問 heuristic 是否高估 |
| E1 | **結案，撤項** | `100.64.190.44` 就是本機（§0） |
| C5 | **範圍擴大**：可疑名單須跨機，且判準含 retry-dense；**加自動 session 分桶**（依首則 user message 模板辨識 security-review 等自動觸發 session，rate 計算排除——E-5 結案發現，canary/done 指標分母被污染，下輪需以新口徑重算） | 本輪手排出 40 筆、判定與人類點名一致（§1c）；.44 短 session 群 8 筆全為自動 security-review（layer2-rerun.md） |
| N1 | Layer 2 新增：worker 逾時 N 分鐘即升級為 blocker 回報使用者，禁止靜默 fixed polling | c26d3bd2：H1 卡 2.5h、polling ×10、使用者爆點後手停 18 agents |
| N2 | Layer 2 新增：session-handoff resume 段補 acceptance-echo（複誦唯一驗收物＋確認 cwd/worktree）；validate_handoff.py regex 修 `##?` → `#{1,6}` | fd7e9719 開場目標認錯＋worktree 沒切；validator 假 FAIL 兩獨立 session 各 ×4 與 ×1 |
| N3 | Layer 2 新增（2026-08-08 更正根因）：agy「卡帳號驗證」實為 `start --prompt-file` 任務未送達＋folder-trust 關卡，**非認證問題**——併入 M5 wrapper（使用者六步序列：start→就緒確認含 capture+enter→result init→send --from-file→capture 確認處理中→阻塞 supervise；wrapper 上線後撤 per-worker proxy）。artifact publish 前強制讀最新版 merge 另留 | 842a6043、c26d3bd2（誤判）；使用者實測修正流程重派成功；cbc898bf 409×3＋SVG 誤刪 |

## 新增：機器閘門（主軸）

| # | 優先 | 項目 | 證據 | 驗收 |
|---|---|---|---|---|
| M1 | **P0** | **讓讀檔可稽核**：Bash PreToolUse hook 識別 `cat/head/sed/tail/awk` 形式的讀檔並記錄（含是否截斷），使「判定前讀了什麼」成為機器事實 | sid `6bc15b50`：84% 讀檔走 Bash（500 次，483 截斷）、Grep tool 用 0 次（§2） | 對該 sid 重播能算出讀檔覆蓋率；此後證據型檢查有東西可驗 |
| M2 | P1 | 採 `misc/git-guardrails-claude-code`（整套）——執行前擋 `push` / `reset --hard` / `clean` / `branch -D` | kernel 明寫「critical gates 由 tooling 執行」；這是現成實作（§4 P4） | 危險指令被 hook 攔下的實測記錄一筆 |
| M3 | P1 | **同錯重複偵測**：使用者重貼相似度高的糾正 ≥2 次即為訊號，進 collector 可疑名單 | 同一句糾正原句重貼 3 次、`/shared-memory-intake` 被糾正 4 次（§2） | 下輪此名單非手工翻找 |
| M4 | P1 | **三欄稽核**：現行高頻規則 → 有無工具路徑 → 可否機器驗；無工具路徑且高頻者提對策，低頻者留文件 | L2/L4/L5 三條皆「規則已存在、缺執行」（§7b） | 一張表覆蓋 kernel 全部硬邊界條目 |
| M5 | **P0**（Layer 2 重跑升級：同坑 ≥4 筆 session 重踩，見 layer2-rerun.md 收斂訊號 1） | tmux 派工步驟化 ＋ **落痕**：收編進 tmux-agent-tools wrapper 成強制序列；每次派發寫一筆含指令原文的 record | lessons 2026-07-28 已載仍踩；且兩機皆無 `~/.tmux-agent-tools`、worker result.json 一筆都沒有（§3） | 能從機器上重建任一次派發的指令原文；T4 合規曲線開始有樣本 |
| M6 | P2 | 術語詞表化檢查（throttle/cache/flag/payload…）在回覆送出前掃描 | 中譯術語 71 次／16 種，「節流」×33（§2c） | 下輪同類 session 中譯術語降到個位數 |

## 新增：循環工具修復（§5 三個 P0）

| # | 優先 | 項目 | 證據 | 驗收 |
|---|---|---|---|---|
| S1 | **P0** | 本機 `lessons.md` 格式統一到 `maintenance.md §3`（現為另一種 schema），並補記本輪 L1–L9 | 本機 4KB 用 `Date:/Trigger:` 區塊、遠端 14KB 用 `## date \| scope \| trigger` + `Rule:`（§5） | 兩機同格式；`maintenance.md §1` 核准後才寫入 |
| S2 | **P0** | 本機 `lessons.md` 本週新增 0 筆的斷鍊修好（L9：糾正當場記，不回填） | 同期至少 8 次使用者糾正（§2b） | 下輪本週新增筆數 > 0 且對得上糾正事件 |
| S3 | P1 | `lessons.md` 跨機設計裁決（維持 local-only + retro 固定合併，或改 repo 同步） | 兩機各自累積、格式不同；D2 追的 `--prompt-file` 教訓只存在遠端（§5） | 使用者裁決後落成一條 rule |
| S4 | P1 | shared-memory-inbox 15 筆積壓消化（本機 8 最舊積齡 11 天／遠端 7），並處理「只有 Codex 能 promote」的單點依賴 | §5 盤點 | pending 兩機皆 < 3 筆 |
| S5 | P2 | `bol-prompt-stats.jsonl` 寫入路徑修成嚴格單行 JSONL | 遠端 145 行中 55 行無法逐行 parse（混 pretty-print），害我第一次算出低估值（§1b） | `while read` 逐行 parse 零失敗 |
| S6 | P2 | 本機補 clone `tmux-agent-tools` | 本機 `~/git` 無此 repo，三 repo 不變式殘缺（§5） | 本機可對三 repo 全做對帳 |
| S7 | P2 | 遠端補 `retro-agenda.md`、agent-scripts 拉最新；六個 skills 差集逐一決定補或退 | 遠端 rules 8 檔缺 retro-agenda、HEAD 落後 4 commits（§1 drift 表） | `diff` 只剩刻意保留項 |
| S8 | P1 | collector 加 `--machine` / fleet 併機模式 | 遠端工作量是本機 7–10 倍，過去只量本機（§1） | 下輪 retro 一次拿雙機，無手排併表 |
| S9 | P1 | 遠端 collector 未提交改動：提交並**升 schema 版本**，或還原 | `hits/total` 改成嵌套卻沿用 `cmli.agent-sessions.v1`，本輪靠特判才併得出來（§1 drift 表） | 兩機輸出可被同一 parser 吃下 |

## 新增：派工經濟

| # | 優先 | 項目 | 證據 | 驗收 |
|---|---|---|---|---|
| W1 | P1 | 抄 KiroCrew 的**量測回饋調度**：取樣 worker 資源 high-water → p90 → 算併發上限 | 使用者 rate-limit 訴求；我們的量測只報告不回饋（§4 P2） | 併發上限由數據算出，非人工填 3 |
| W2 | P1 | `model-dispatch.md` 加三條（約 10 行）：architect 不打字的可判定門檻、收尾強制 fresh-eyes review、**Claude model pin 帳號無該模型會靜默 fallback** 警告 | §4 P3 | 三條落文；fallback 警告對 fable tier 補洞 |
| W3 | P1 | 採 KiroCrew 的 spec 三件套要素：EARS 句式驗收＋`_Requirements: N.N_` 反向追溯＋顯式 Checkpoint 任務，併入 `plan.md` 範式 | 我們 plan 無需求編號與追溯（§4 P2） | 下輪 plan.md 每個任務可追溯到編號需求 |
| W4 | P2 | research 型 worker 預設改 opus + effort low，續累積樣本 | 本輪 5/5 一次過；11 次重試中 8 次為環境層（§6） | 樣本累到 n≥15 再判定；不得宣稱優於 sonnet（無平行對照） |

## 新增：生態採用

| # | 優先 | 項目 | 證據 | 驗收 |
|---|---|---|---|---|
| K1 | **P0** | 修 `skills-lock.json` 五個 404 路徑 ＋ `using-skills/SKILL.md` 兩處失效引用（`batch-grill-me`、`writing-great-skills`） | 主 session 逐一 `curl` 覆驗：5 個 404、3 個接班路徑 200（§4 P4） | 全 lock 條目回 200 |
| K2 | P1 | 採 `productivity/writing-for-agents`（整套） | 四個痛點的共同上游理論：completion criteria clarity vs demand、negation 是失敗模式、no-op 測試、cache vs environment（§4 P4） | 落入 skills 並用其 no-op 測試篩一次現有 rules |
| K3 | P2 | `code-review` 的 Spec 軸概念併入現有 review 流程；`wait-what` 只偷 ASD-STE100 受控英語 | §4 P4 | 兩者各落一行規則或 skill 修訂 |
| K4 | P3 | Agent Plugins：加 6 行 root `plugin.json`（僅為對 VS Code/Cursor/Codex 開放 skills） | v1 只管 skills+mcp，Claude Code 未列相容、無 registry（§4 P1） | 加檔後既有 deploy 不受影響 |
| K5 | P3 | `.workflow/` 封存政策（本機 14 個 run dir） | §4.7 | 完成的 run dir 入 `archive/`，具名子目錄例外 |

## 留 inbox、本輪未研究（不下結論）

- 非多模態 agent 的視覺任務代理（using-design-skills / writing-artifacts 撞牌風險）
- Claude Code self-hosted runner（僅知 Team/Enterprise gated）
- agy / grok / build 二線 CLI 的 plugin 支援（與 K4 併案）
- **遠端三筆 very-long + retry-dense session 的 Layer 2 深挖**：`842a6043`（20.3MB）、
  `cbc898bf`（agent-scripts 自身，7.7MB）、`c26d3bd2`（7.9MB）——下輪第一順位
- 本機那 7 筆形狀一致的 17–22 行 session 來源查明（會系統性污染 rate 分母）

## 阻塞使用者

→ 全部集中在 `open-questions.md`（A–F 六組）。下列為摘要索引：

- G1 GCP credits（需 console 存取或 CSV）
- 話少/stop-slop 訴求與 kernel narration 規則衝突 → 要改 kernel，需核准
- CLAUDE.md routing 行新增
- S3 lessons.md 跨機設計裁決
- taste-skill「微調」具體指什麼
- §6.5 補問：還有沒有臨時動議或訴求？

執行順序建議：M1 → S1/S2 → K1 → A8 → M5 → S8/S9 → 其餘按優先。
