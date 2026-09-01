# Repo-level evals

## Static invariants（現行）
`node scripts/check-rules-invariants.mjs` — 全 PASS 才 exit 0。涵蓋：
global 兩檔 byte-identical、Gates 表引用的 rule 檔存在（lessons.md 為
local-only 豁免）、✈ canary 條款存在、deploy 的 pinned-SHA 流程、fixture
schema、public 檔不含私有 fleet 字面值。

大小不設限：行數上限 2026-08-25 退役，byte budget 2026-09-01 退役
（bytes 只是 context 成本的代理，runtime 已直接回報真實 token；且
`rulesBytes` 計入的 routed 檔是按需讀取，不佔每 session 成本）。成長由
review 把關，不由數字。

## Behavioral fixtures（schema 已定，runner 未實作）
放 `evals/fixtures/*.json`，一檔一案：

目前只收最高頻的 `model-dispatch` 與 `judgment-rubrics`，各一個正例與
負例。`check-rules-invariants.mjs` 只驗證 JSON schema；行為 runner 尚未實作，
因此不得把 schema PASS 宣稱為 routing behavior PASS。

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
