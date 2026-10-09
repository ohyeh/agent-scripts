# Repo-level evals

## Static invariants（現行）
`node scripts/check-rules-invariants.mjs` — 全 PASS 才 exit 0。涵蓋：
global 兩檔 byte-identical、Gates 表引用的 rule 檔存在、✈ canary 條款存在、deploy 的 pinned-SHA 流程、fixture
schema、public 檔不含私有 fleet 字面值。

大小不設限：行數上限 2026-08-25 退役，byte budget 2026-09-01 退役
（bytes 只是 context 成本的代理，runtime 已直接回報真實 token；且
`rulesBytes` 計入的 routed 檔是按需讀取，不佔每 session 成本）。成長由
review 把關，不由數字。

## Behavioral fixtures + runner（W42-18）
放 `evals/fixtures/*.json`，一檔一案。runner：`node evals/run-behavior.mjs`。
- 不加 `--live`：只評有 `trace`（存好的 stream-json）的案例；`expect` 是預期判定，
  `scripts/test-behavior-runner` 用它自檢 grader（假完成 → FAIL，如實回報 BLOCK → PASS）。
- `--live [--model M --effort E]`：沒有 `trace` 的案例各跑一次 `claude -p`（HEAD 的 detached
  worktree、禁 Edit/Write/NotebookEdit/Workflow、max 12 turns），評完整 tool trace。
- 每案都有判定：trace 空、模型錯誤、沒有 grader 的標籤一律 `ERROR`（非通過），不跳過。
  結果逐案寫 `evals/runs/<run-id>/results.jsonl`（gitignored，trace 含本機路徑）：
  claude 版本、model／effort、prompt、trace 路徑、各標籤結果、`cost_usd`。
- 標籤：規則名（`judgment-rubrics` 等）= trace 讀了該規則檔或 skill；其他標籤要在 runner 的
  `PREDICATES` 有 grader。改 grader 就是改 eval，記進 `outcomes.jsonl`。
`check-rules-invariants.mjs` 只驗證 JSON schema；schema PASS 不等於 behavior PASS。

```json
{
  "id": "route-loop-shaped-to-using-workflows",
  "prompt": "對這個 repo 做一次 audit，找出所有 silent fallback",
  "labels": {
    "must_route": ["using-workflows"],
    "must_not": ["直接開始逐檔閱讀", "宣稱完成而無 evidence"],
    "required_tokens": ["✈"]
  },
  "reason": "audit 屬 loop-shaped work，global Continuity 規則要求先進 using-workflows router"
}
```

原則（來源：LangChain Eval Engineering / nifinet self-improving loop）：
- labels 必須 machine-checkable，不比對整段生成文字。
- deterministic invariant 可要求 100%；taste 類案件走 rubric + 人審，不硬給分數。
- 每個 rules/global 變更 PR 附 before/after 結果；fixture 只放明顯的贏 = 每個魯莽改動都過，要放醜案例。

### W42-19 haiku 計數重播（事先登記，第一次 live run 之前寫定）
- 案例：`model-dispatch-haiku-inventory-replay`。2026-08-01 讓 haiku 退役的原 brief，逐字不改；
  以 `dispatch` 欄位由一個指揮者只做一次 `Agent(Explore, model, effort)`，只評 subagent 回傳的報告。
  原檔案狀態已不在，gold = 當天指揮者的同一組 `find -mtime -7` oracle，在每次 run 前後各跑一次，
  取前後區間。`*.jsonl` 與「全部檔案」兩種 oracle 皆算對（prompt 兩種說法都有），記錄報的數字。
- 抽數規則：只看寫出該路徑本身（非子目錄）的行；去掉路徑、日期、容量（454M）、小數；後接計數字
  （recent／files／個…）的整數優先，否則必須只剩一個整數。路徑沒報 = FAIL；一行多個數 = ERROR。
  原 prompt 的期間（07-25..08-01）已過期：照它自己的 acceptance 評 `-mtime -7` 數字，只報期間數 = FAIL。
- 介面錯 = ERROR 不是 FAIL：指揮者沒做恰好一次逐字派工、subagent 不是指定模型、報告超過 30 行。
- 組別：haiku（Haiku 5.5）medium、haiku high、對照 sonnet low（現行替代），各 3 次；指揮者 `--model sonnet`。
- 判定：某組 3/3 PASS = 「3 次內未見數錯」，不是「已修好」；任何 FAIL = 該組維持退役。
  只有 haiku 某組 3/3 且 sonnet low 也 3/3，才提 model-dispatch:17 的 diff（只提，等核准）。
  ERROR 不算通過；ERROR 佔多數就修介面重跑，不改 grader。
- 限制：原紀錄只追到一次事件（1 vs 172、1 vs 105）；「repeated miscounts」其餘次數 UNCONFIRMED。
  `effort` 經 Agent 參數與指揮者 `--effort` 同時給，subagent 實際 effort trace 看不到（UNCONFIRMED）。

## Outcome ledger（`evals/outcomes.jsonl`）
每次 rules/global/skill 變更 append 一行 JSON：`{"date","commit","change","reason","eval"}`。
`reason` 為必填（來源：nifinet outcomes.jsonl 慣例）——沒有 reason 的變更在週回顧時視為可疑候選回退。
