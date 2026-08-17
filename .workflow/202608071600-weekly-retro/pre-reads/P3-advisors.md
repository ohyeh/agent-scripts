# P3-advisors —— pre-read REPORT（原始版本，未編輯）

來源：本 session subagent transcript `agent-aP3-advisors-024e4dc1c11a43ea.jsonl`（35 records）
派工：Agent tool，opus + effort low，2026-08-07 議題裁決輪 plan.md P 系列
本檔為 worker 最終回報全文逐字保留；經主 session 摘要與裁決的版本見 `../retro-report.md` §4。

---

## 1. 是什麼

- **fable-advisor**（Claude Code plugin，`claude plugin marketplace add DannyMac180/fable-advisor`）：session 跑 Opus 當全職 architect，只出 spec/判斷/驗收。三條 lane — `codex-implementer`（frontmatter `model: sonnet`，實際透過 `codex exec --model gpt-5.6-luna -c model_reasoning_effort=max` 讓 Luna 打字）、`fable-implementer`（`model: fable`，只用於 spec 無法涵蓋判斷的一次性難題）、`fable-advisor`（`model: fable`，唯讀，`tools: Read, Grep, Glob`）。
- 全 repo 只 5 個實質檔案：`agents/{fable-advisor,codex-implementer,fable-implementer}.md` + `skills/orchestration/SKILL.md`。另有 **Lite mode**：只複製 `agents/fable-advisor.md` 到 `~/.claude/agents/`，session 留在 Sonnet，只在 commitment boundary 找顧問。
- **sol-advisor**（Codex plugin，v0.4.0）：primary 是 GPT-5.6 Sol/High；native lane 用 `sol_advisor_terra_implementer`（Terra/High）實作 → 再 spawn 全新 `sol_advisor_sol_reviewer`（fresh Sol/High，`fork_turns: none`）回 `ship|fix-first|rethink`；另有需明示 opt-in 的 **Luna task lane**（Codex app task，Luna/Max，由 primary 自己 review，不走 native reviewer）。
- sol 多了 fable 沒有的工程層：`scripts/install-agents.sh`（byte-exact 安裝 + `--check`）、`scripts/inspect-agent-runtime.sh`（從 rollout 讀 model/effort 當 routing 證據）、`scripts/verify.sh`。
- **兩者不是輕重版本**：同一套 architect doctrine 在兩個 runtime 各自實作。fable = 跨廠商（Claude architect + OpenAI 打字）；sol = 同廠商內分層，review 只做到 context-independent，README 自己明言「not model-family-independent」。
- 兩個 repo 都沒有任何成本數字。唯一量化敘述是 fable README 的「A typical consult costs cents」。

## 2. 與我們何處重疊

`/Users/paul.yeh/git/agent-scripts/.agents/rules/model-dispatch.md` + `/Users/paul.yeh/git/agent-scripts/skills/delegation-templates/SKILL.md` 已覆蓋大部分：

| 他們的元件 | 我們的對應 | 判定 |
|---|---|---|
| 五段 spec（objective/files/interfaces/constraints/verification） | delegation-templates 的 GOAL/CONTEXT/ACCEPTANCE/VERIFY + §3 assignment contract | 已有，等價 |
| lane routing table | §4 Role-first selection | 我們**更細**（有 effort 維度，他們完全沒有） |
| 失敗一次改 spec、兩次升級 | §5 Effort and retry ladder | 已有，幾乎逐字相同 |
| reviewer 不是作者、fresh context | §6 Reviewer independence | 已有 |
| worker report = claim，parent 自己 rerun | §8 + judgment-rubrics §2 | 已有 |
| structured REPORT 欄位（STATUS/CHANGES/VERIFIED/JUDGMENT CALLS/GAPS） | 30 行上限 + `file:line` + `VERDICT: PASS\|BLOCK` | 形狀不同，功能相同 |

**我們真的沒有的只有三條：**
1. **「architect 不准自己打字」的可判定門檻** — 他們寫成硬規則：*程式碼區塊長過 interface signature，就是一個還沒 delegate 的 spec，停下來 delegate*；連「親手修 lane 的 bug」也算違規（必須退回改 spec）。我們 §2 的預設方向相反（自己做，達標才外派）。
2. **強制的 end-of-deliverable fresh-eyes review gate** — 「ALWAYS once at the end」，讀 diff 時對照 stated goal 而非對話，回三值 verdict。我們 §6 是條件式（超過 trivial 門檻才要），沒有「每個 deliverable 收尾必跑一次」。
3. **routing evidence 可稽核** — sol 的 `inspect-agent-runtime.sh` 真的去 rollout 驗證 child 跑在 pin 的 model/effort。我們 §7 dispatch records 是自我申報。

## 3. 建議採用層級：**只偷概念**（偏「部分」），棄整套

整套棄：fable 的省錢核心是把打字外包到 Codex CLI，而我們早就有 Codex/Terra/Luna lane 與 tmux worker，plugin 本身沒帶新機制；sol 的 install/inspect 腳本是為了 plugin 分發，我們自己維護 rules，沒這問題。

要偷的三條，全部是 `model-dispatch.md` 的文字（約 10 行）：
- §2 加一條可判定的 architect 輸出限制（code block > signature ⇒ 該 delegate；不得親手修 worker 的 bug）。
- §6 加「每個非 trivial deliverable 收尾前一次 fresh-context review，三值 verdict，reviewer 不得動手修」。
- §1 加警告：**Claude 的 model pin 若帳號沒有該模型，Claude Code 會靜默 fallback 到 session model**（README 明寫）。這條對我們 `fable` tier 的 §8 是真的補洞。

**三個 grievance 逐條：**
- **(1) subagent 燒額度、撞 rate limit — 部分。** 概念上有解（貴模型只出判斷、探索外包唯讀 agent、context 精簡、reason once then hand off），但零數字，而且它反而**多加**一次強制 Fable review 呼叫。它降的是 architect 端 token 體積，不是 subagent 數量。
- **(2) sonnet one-shot 差、opus+low-effort 是否更划算 — 否。** 兩個 repo 都沒有 effort 維度的成本論證，也沒有 per-success 比較。fable 的答案是「換模型家族」而不是「換 effort」。我們 §5 在這件事上比他們完整。UNCONFIRMED：無任何 benchmark 或成功率數據存在。
- **(3) WORKER|REVIEWER 配對 vs 單 session 全包 — 是。** 這是它們最明確的貢獻：強制配對、reviewer 一律唯讀絕不自己修、必須 fresh context。sol 還誠實標出侷限（Sol review Sol 只是 context-clean）。fable 的 Lite mode 直接給了「不搞 orchestration 就只留 advisor」的最小落地形。

**80% 能否只靠編 model-dispatch.md 拿到？可以。** 上面三條不需要新 agent 檔、新 skill 或 plugin。剩下 20%（routing evidence 稽核、plugin 分發）對我們無價值。

## 4. 證據

Fetched：
- https://github.com/DannyMac180/fable-advisor（README via `gh api repos/.../readme`）
- https://raw.githubusercontent.com/DannyMac180/fable-advisor/main/agents/fable-advisor.md
- https://raw.githubusercontent.com/DannyMac180/fable-advisor/main/agents/codex-implementer.md
- https://raw.githubusercontent.com/DannyMac180/fable-advisor/main/agents/fable-implementer.md
- https://raw.githubusercontent.com/DannyMac180/fable-advisor/main/skills/orchestration/SKILL.md
- https://github.com/DannyMac180/sol-advisor（README）
- https://raw.githubusercontent.com/DannyMac180/sol-advisor/main/plugins/sol-advisor/skills/orchestration/SKILL.md
- https://raw.githubusercontent.com/DannyMac180/sol-advisor/main/plugins/sol-advisor/skills/orchestration/references/role-contracts.md
- https://raw.githubusercontent.com/DannyMac180/sol-advisor/main/plugins/sol-advisor/skills/orchestration/references/luna-task-lane.md
- 兩份 git tree（`gh api '.../git/trees/HEAD?recursive=1'`）

Local（實讀）：
- `/Users/paul.yeh/git/agent-scripts/.agents/rules/model-dispatch.md`（§1–§8）
- `/Users/paul.yeh/git/agent-scripts/skills/delegation-templates/SKILL.md`（全檔）

UNCONFIRMED：兩 repo 的成本/成功率數字（不存在）；`sol-advisor-sol-reviewer.toml`、`terra-implementer.toml`、`verify.sh` 我抓了但未逐行核對，effort pin 以 README 表格與 role-contracts 為據；fable-advisor 的 repo 版本號。另：brief 給的 `.agents/skills/delegation-templates/SKILL.md` 在此 repo 不存在，真實路徑是 `skills/delegation-templates/SKILL.md`（`~/.agents/skills/delegation-templates/` 是部署後位置）。

## 5. 自評

Retry 2 次：`gh api` 的 `?recursive=1` 被 zsh glob 吃掉（改單引號）；brief 給的 delegation-templates 路徑不存在（用 `fd` 定位）。兩次都是環境層問題，沒有推翻任何已提出的判斷。

✈
