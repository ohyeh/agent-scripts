# Rules Eval Gate（批次 1）+ Global 瘦身（批次 2）+ 排隊項（批次 3）

來源：2026-07-25 context-engineering 整合提案（我 6 項 × Codex 10 項，見
`../202607241500-weekly-retro/codex-context-eng-proposals.md`）。使用者核准三批全做（「但看起來你說的 1 2 3 都要做吧」）。

## 批次 1（本 run）：可執行 eval gate — P0
交付：`scripts/check-rules-invariants.mjs` + `evals/context-budget-baseline.json` + 行為型 fixture schema（`evals/README.md`）。

靜態 invariants（FAIL 級）：
1. `global/CLAUDE.md` 與 `global/AGENTS.md` byte-identical
2. global 檔 ≤150 行；`.agents/rules/*.md` 每檔 ≤150 行（maintenance §5 上限）
3. global Gates 表引用的 rule 檔都存在於 `.agents/rules/`
4. ✈ canary 規則仍在 global（覆蓋 check-canary.sh 的意圖，statically）
5. context budget：global bytes + rules bytes + skills SKILL.md frontmatter description bytes ≤ baseline；要增加須同 PR 更新 baseline（= 證據）

行為型 fixture（本批只定 schema）：prompt + machine-checkable labels（must_route / must_not / required_tokens），runner 旗標留白。

Acceptance：runner 對當前 repo 執行、正確抓出 model-dispatch.md 超行（預期 FAIL），其餘全 PASS；`node scripts/check-rules-invariants.mjs` exit code 反映結果。

## 批次 2（eval 保護下進行，逐 section、出 diff 待核准）：
- global 縮 boot contract（每次搬一個 section 到 routed rule，跑 runner）
- 修 model-dispatch.md 超行（拆分或精簡）
- 順手：tool-economy 規則去重（H）

## 批次 3（排隊）：
- lessons outcome ledger（C）· delegation REFERENCES 欄（D）· deploy.sh 輸出 SHA（F）· unknowns-discovery 對照原文補強 + opt-in eval interview（Codex #10）
