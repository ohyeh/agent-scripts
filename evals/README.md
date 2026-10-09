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

## Outcome ledger（`evals/outcomes.jsonl`）
每次 rules/global/skill 變更 append 一行 JSON：`{"date","commit","change","reason","eval"}`。
`reason` 為必填（來源：nifinet outcomes.jsonl 慣例）——沒有 reason 的變更在週回顧時視為可疑候選回退。
