寫入失敗：sandbox 拒絕唯一指定檔案寫入；`REPORT_EXISTS_EXIT=1`。依 fallback，完整報告如下。

# Context Engineering 獨立改進提案

日期：2026-07-25  
角色：Codex 獨立評審  
範圍：來源材料、`global/AGENTS.md`、`global/CLAUDE.md`、`.agents/rules/*.md`、`skills/` 與相關 deploy/check scripts

## 結論

本 repo 已採用 progressive disclosure、router、workflow artifact、evidence gate 與人工核准等正確方向。主要問題有三個：

- 啟動層仍承擔太多通用操作規則。
- 規則與 skill 的品質多靠文字約束，缺少可執行的整體 eval。
- release policy 與實際 deploy script 互相矛盾。

建議先做三個 P0：固定 release ref、建立 rules/skills eval gate、縮減 global 啟動內容。

本報告共提出 **10 項改進提案**；未讀取或推測其他 agent 的提案。

## 現況摘要

- `global/AGENTS.md` 與 `global/CLAUDE.md` 目前 byte-identical，本次 `cmp -s` exit 0，各 103 行。兩份檔案同時包含啟動契約、Hard Rules、Working Discipline、Code Discipline、Simplicity、Tools、Continuity 與 Self-Improvement Loop（`global/AGENTS.md:1-103`；`global/CLAUDE.md:1-103`）。
- `.agents/rules/` 有 6 個 tracked Markdown 檔，共 586 行；`model-dispatch.md` 已達 177 行，超過 maintenance 自訂的每檔 150 行上限（`.agents/rules/maintenance.md:48-52`；`.agents/rules/model-dispatch.md:1-177`）。
- repo 自有 5 個 skill directory。三個 router 已有 `evals/evals.json`，但 repo 沒有 runner 執行這些 routing cases；現有 checks 集中在 canary、router adoption、execution frontier 與單一 workflow smoke test（`skills/using-design-skills/evals/evals.json:1`；`skills/using-skills/evals/evals.json:1`；`skills/using-workflows/evals/evals.json:1`；`scripts/check-canary.sh:8-23`；`scripts/test-review-gate-smoke.mjs:3-24`）。
- `using-skills` 已把自己定位為 curated first-hop map，要求 live discovery，並限制兩層 router hop（`skills/using-skills/SKILL.md:8-20,75-80`）。`using-workflows` 也有 bounded-task BYPASS，避免所有工作都進 recipe（`skills/using-workflows/SKILL.md:11-15`）。這兩項應保留。

## 改進提案

### 1. 讓 deploy 遵守 immutable release ref

**優先級／工作量：P0 / S**

來源依據：

- 自我改進系統應以 PR 交付人審，避免 agent 直接把變更推進正式使用（`context-eng-sources.md:30-32`）。
- 本 repo 的 project policy 要求消費者使用 pinned CLI version 與 gated release ref，預設為 immutable tag。

repo 證據：

- `scripts/deploy.sh` 下載 moving `main` tarball（`scripts/deploy.sh:26-32`）。
- provisioning fast path 也直接執行 `main` 上的 script（`.agents/rules/agent-environment-provisioning.md:9-25`）。
- 未經 release gate 的 merged HEAD 因此可直接成為 fleet deploy source，與 repo release policy 衝突。

提案：

- `deploy.sh` 接受 release ref；fleet 預設只接受 tag。
- bootstrap URL 固定到該 tag，下載後驗證 archive 對應的 ref／commit。
- 若 protected `main` 是核准的 fallback，script 必須輸出 channel 與 commit SHA，不能將 moving HEAD 描述為 immutable release。

完成條件：

- 測試證明 tag path 可 deploy，moving ref 在 immutable mode fail closed。
- provisioning 文件、README 與 script 使用同一個 release channel 定義。

### 2. 建立 rules／skills 的可執行 eval gate

**優先級／工作量：P0 / M**

來源依據：

- validator 應先於 improver；每次只改一個概念，eval 沒改善就 revert（`context-eng-sources.md:26-31`）。
- eval 應從 traces 找 failure，並同時檢查 agent trajectory 與 verifier trajectory，防止 reward hacking（`context-eng-sources.md:34-37`）。

repo 證據：

- 三個 router 已有 routing cases，但 `evals.json` 只有 prompt 與自然語言 expected output，沒有 repo-level runner 或 score threshold（各 router 的 `evals/evals.json:1`）。
- `judgment-rubrics.md` 是 executable checklist 的文字版本，沒有 fixture 驗證 global/rules 改動是否破壞 ask-first、evidence、routing 或 completion 行為（`.agents/rules/judgment-rubrics.md:20-30,64-71`）。
- 現有 smoke test 只鎖定 dual-review workflow 的局部 invariant（`scripts/test-review-gate-smoke.mjs:3-24`）。

提案：

- 新增 repo-level evaluator，先覆蓋可確定判分的 invariant：router route/bypass、Hard Rule ask-first、`UNCONFIRMED`、completion evidence、禁止 silent self-merge、global 兩份檔案一致。
- 每個 case 保存 prompt、machine-checkable labels、禁止行為與 reason，不比對整段生成文字。
- judgment/taste 類 case 保留 reviewer rubric；評審同時檢查 agent output 與 evaluator reasoning。
- rules、router skill 或 workflow behavior 變更的 PR 必須附 before/after score 與失敗 case。

完成條件：

- 故意破壞 routing 的 fixture 會令 runner exit non-zero。
- 無關引用、宣稱未執行 command 等 reward-hacking case 會被 verifier 擋下。

### 3. 把 global 檔縮成 boot contract

**優先級／工作量：P0 / M**

來源依據：

- Claude 5 context engineering 建議讓模型運用 judgment、採 progressive disclosure，並讓 `CLAUDE.md` 只保留 repo gotchas（`context-eng-sources.md:7-14`）。
- 來源案例在 system prompt 減少 80% 後 eval 沒退步（`context-eng-sources.md:5-12`）。

repo 證據：

- global 檔雖自稱 minimal，仍把通用 Working Discipline、Code Discipline、Simplicity、tool mapping、workflow artifact 格式與 self-improvement 細節全部 eager-load（`global/AGENTS.md:48-103`）。
- 同一檔要求詳細規則只在 gate 觸發時讀取（`global/AGENTS.md:13-28`），與 eager-loaded 通用規則形成內部張力。
- `LETTER-TO-FUTURE-SESSIONS.md` 已記錄 always-on injections 與 style conflicts 是固定 context tax（`.agents/rules/LETTER-TO-FUTURE-SESSIONS.md:19-29`）。

提案：

- global 只保留 language/canary、最高風險 Hard Rules、gate routing table、precedence、live-discovery 原則與 project-local override。
- 將 task execution、code quality、tool economy、continuity、自我改進細節移到既有 routed rule 或 skill；global 留一行 trigger。
- 先建立提案 2 的 eval baseline，再逐段刪減。每次只移一個 section，以便定位 regression。

保留邊界：

- 不刪 raw evidence、production/protected branch、privacy/payment、irreversible action 等 safety invariants。
- 不改變兩個 runtime-native global 檔 byte-identical 的 deploy contract。

### 4. 為整個 always-on context 設總預算

**優先級／工作量：P1 / S**

來源依據：

- context 是長期瓶頸；規則需要目錄時，law 已可能過大（`context-eng-sources.md:24-27`）。
- progressive disclosure 的目標是降低啟動固定載入量（`context-eng-sources.md:7-10`）。

repo 證據：

- maintenance 只限制 global ≤150 行、每個 rule ≤150 行，沒有總 injected bytes/tokens 或 skill-description 預算（`.agents/rules/maintenance.md:48-58`）。
- `model-dispatch.md` 已有 177 行，現行上限沒有自動檢查。
- harness snapshot 指出 session 啟動時還會載入 output styles、context-mode 與大量 skill descriptions（`.agents/rules/harness-diagnosis.md:17-24`）。

提案：

- 新增只讀 check，輸出 global bytes、routed-rules bytes、always-on skill-description bytes、重複段落及相較上一 release 的 delta。
- 先採「不得無證據增加」的 regression budget；累積數週資料後才制定 hard limit。
- 同時自動檢查每檔 150 行限制。

完成條件：

- CI 能指出造成 budget regression 的檔案或 description。
- check 只計算 runtime 真正 eager-load 的 surface，不載入 skill body。

### 5. 合併重複的 context/tool economy 規則

**優先級／工作量：P1 / S**

來源依據：

- tool description 應承載操作指引，system prompt 不應重複（`context-eng-sources.md:9-10`）。

repo 證據：

- `>20 lines → context-mode` 與 raw-output economy 同時出現在 global Tools、`model-dispatch.md` 與 `harness-diagnosis.md`（`global/AGENTS.md:76-80`；`.agents/rules/model-dispatch.md:34-47`；`.agents/rules/harness-diagnosis.md:28-41`）。
- 三處文字可能漂移；harness 應是 diagnosis reference，model dispatch 應管 staffing。

提案：

- runtime tool description 或 context-mode skill 作為 mechanics owner。
- global 只保留「large output 走 available context-preserving tool」的 trigger。
- `model-dispatch.md` 只保留何時 delegate；harness 保留 symptom 與 owner link。

完成條件：

- 搜尋同一 threshold／command mapping 時，只找到一個 normative 定義，其餘都是引用。

### 6. 將 lessons 升級成 outcome-linked experiment ledger

**優先級／工作量：P1 / M**

來源依據：

- outcome 記憶需要可分析的 reason；週節奏能降低單一樣本 overfit（`context-eng-sources.md:28-32`）。
- eval engineering 應從 agent traces 採礦，再建立 failure case（`context-eng-sources.md:34-37`）。

repo 證據：

- `lessons.md` 現行格式只有 scope、trigger、Rule、Status，沒有 trace/artifact、reason code、對應 eval 或結果（`.agents/rules/maintenance.md:25-46`）。
- periodic review 已有 monthly／50 sessions 節奏，沒有 before/after eval evidence 欄位（`.agents/rules/maintenance.md:48-60`）。

提案：

- 保持 `lessons.md` 三行、local-only、non-normative；另加 local structured ledger，例如 JSONL。
- 每筆記錄 trace pointer、failure reason、proposed rule/eval id 與採納結果。
- weekly review 只將重複或高影響 failure 轉成 eval；一次處理一個 policy concept。
- adopted rule 必須引用 outcome 與 regression case；無改善則撤回候選變更。

完成條件：

- 能從 lesson 追到原始 trace、fixture、before/after 結果與人工決定。
- ledger 不進 public repo，不保存 secrets 或完整私人 transcript。

### 7. 使用版本／hash 簡化 gate receipt

**優先級／工作量：P1 / M**

來源依據：

- 高階指引應取代低層次僵硬規則；progressive disclosure 應只載入需要的內容（`context-eng-sources.md:7-10`）。

repo 證據：

- 現行 gate 要求在 active context 重讀、逐字引用 criterion；compaction 後若不能逐字背出就必須重讀（`global/AGENTS.md:13-18`）。
- routine receipt 仍會寫入 workflow artifact，增加 context 與 artifact 噪音（`global/AGENTS.md:16-18`；`.agents/rules/model-dispatch.md:115-119`）。

提案：

- 保留 gate fail-closed 與 task binding，但 receipt 改成 rule path、section、content hash/version、task binding、decision。
- 只有 deviation、BLOCK 或 audit dispute 才保存 criterion 原文。
- validator 驗證 receipt hash 對應本次 canonical rule；rule 變更後才要求重讀。

風險：

- 人眼無法直接從 receipt 看到 rubric 原句。先在一個 gate 試行，量測漏讀率、artifact bytes 與 review 誤判。

### 8. 統一跨 context 的 observation handoff schema

**優先級／工作量：P1 / M**

來源依據：

- implementation 期間應記錄 deviation；outcome reason 與 agent/verifier trajectories 是後續改進的核心資料（`context-eng-sources.md:20-21,28-30,35-37`）。

repo 證據：

- global 要求 workflow state、orchestration、implementation notes 與 rollout summaries，但沒有共同的 observation 最小欄位（`global/AGENTS.md:90-103`）。
- delegation contract 要 `file:line` 與 evidence，workflow runner 又使用 schema-v1 `result.json`（`skills/delegation-templates/SKILL.md:12-19,105-112`；`skills/using-workflows/SKILL.md:96-101`）。

提案：

- 定義共通 schema：`claim`、`evidence_ref`、`status`、`reason`、`unknowns`、`next_decision`。
- raw logs 留在 artifact；跨 agent/context 只傳 schema 與 pointer。
- workflow、delegation 與 session handoff 共用欄位名稱，不另建服務或 graph database。

完成條件：

- resume 時只讀 summary schema 就能定位 raw evidence，無須將完整 log 載回 context。

### 9. 把 rich references 納入 delegation 與 review template

**優先級／工作量：P2 / S**

來源依據：

- 高品質 reference 應優先使用 code、tests、HTML mockup 與 rubric；source directory 本身就是有效 reference（`context-eng-sources.md:11,19`）。

repo 證據：

- delegation template 有通用 `CONTEXT` 與 `SOURCES`，但沒有區分 authoritative example、negative example、executable reference（`skills/delegation-templates/SKILL.md:33-44,58-68`）。
- review template 已要求 claims vs reality 與 task-specific checks，可直接擴充（`skills/delegation-templates/SKILL.md:71-83`）。

提案：

- 在現有 template 加可選 `REFERENCES`：canonical implementation、tests/verifier、negative example、rubric。
- reference 已存在時只傳 path 與選擇理由，不複製內容進 prompt。

完成條件：

- implementation fixture 能證明 worker 先讀指定 code/test，再依現有 convention 工作。

### 10. 為 eval 設計提供 opt-in interview mode

**優先級／工作量：P2 / S**

來源依據：

- Eval Engineering Skill 透過 interview 逐項取得使用者對 eval 的核准（`context-eng-sources.md:34-36`）。
- unknowns 方法建議一次只問一題，先問最可能改變架構的決策（`context-eng-sources.md:17-21`）。

repo 證據：

- 現行 rubric 與 unknowns skill 只允許 user-invoked interview；未獲邀時，每個問題都要另行符合 stop condition（`.agents/rules/judgment-rubrics.md:32-46`；`skills/unknowns-discovery/SKILL.md:27-48,85-93`）。

提案：

- 不放寬一般 task 的 ask-first 規則。
- 使用者明確要求「設計 eval／建立 acceptance suite」時，將其視為 opt-in eval interview。
- 一次核准一個 ability／fixture group，記錄 accepted/rejected 理由。
- 小型 deterministic eval 仍可直接建立，不強迫 interview。

完成條件：

- 文件清楚區分一般 discovery、user-invoked interview 與 eval-design interview。

## 材料與現行規則的衝突

1. **judgment vs literal compliance**

   來源建議用高階指引讓模型判斷（`context-eng-sources.md:7-9`）；`judgment-rubrics.md` 明定 checklist 與直覺衝突時服從 checklist（`.agents/rules/judgment-rubrics.md:1-5`），global gate 也要求 verbatim criterion（`global/AGENTS.md:16-18`）。安全與外部副作用仍應 literal；一般工作方式應由 eval 驗證 outcome。

2. **lightweight CLAUDE.md vs 103-line cross-project institution**

   來源要求 `CLAUDE.md` 只留 repo gotchas（`context-eng-sources.md:12-13`）；global 實際承載大量跨 project 操作規則（`global/AGENTS.md:48-103`）。低於自訂 150 行上限不代表已 rightsized。

3. **auto-memory replacement vs deterministic cross-runtime policy**

   來源認為 auto-memory 可取代 `CLAUDE.md` 的持久資訊角色（`context-eng-sources.md:13`）；本機 snapshot 顯示 Claude auto-memory disabled，實際依賴 context-mode 與 rollout summaries（`.agents/rules/harness-diagnosis.md:17-19`）。deploy、安全與 edit authority 仍需要 deterministic、可 review 的 source of truth。

4. **eval interview vs ask-first restriction**

   Eval Engineering 建議逐項 interview 核准（`context-eng-sources.md:34-36`）；現行規則只有 user-invoked 或 hard-stop 條件才能問（`.agents/rules/judgment-rubrics.md:32-46`）。提案 10 用 opt-in scope 化解。

5. **1.00 eval gate vs judgment/taste tasks**

   self-improving 案例使用 `1.00` 才 exit 0（`context-eng-sources.md:28-30`）；design router 包含視覺 taste 與 fresh reviewer judgment（`skills/using-design-skills/SKILL.md:86-110`）。確定性 invariant 可要求 100%，主觀品質不應使用虛假的 deterministic score。

6. **release policy vs moving main deploy**

   project release policy 要求 gated immutable ref；`scripts/deploy.sh:26` 與 provisioning fast path（`.agents/rules/agent-environment-provisioning.md:9-16`）仍使用 `main`。這是可直接修正的 repo 內部衝突。

## 不建議做

1. **不新增 `context-engineering` mega-skill 或第三層 meta-router。**

   `using-skills` 已限制兩層 hop，並要求 owner 明確時直接進 domain（`skills/using-skills/SKILL.md:19-20,98-119`）。新 router 會增加 eager description 與 routing ambiguity。

2. **不啟用 autonomous self-modification、auto-merge 或直接 deploy。**

   來源要求 PR 人審並警告 merge 權限造成 drift（`context-eng-sources.md:30-32`）；現行 proposal-only、user-approved diff 與 auto hooks OFF 是正確約束（`global/AGENTS.md:96-103`；`.agents/rules/maintenance.md:9-23`）。

3. **不把 canonical safety、deploy 或 edit-authority 規則搬進 auto-memory。**

   auto-memory 在目前 Claude snapshot 為 disabled，且 memory 無法提供 immutable、可 review 的跨-runtime contract（`.agents/rules/harness-diagnosis.md:17-19`）。

4. **不因低優先材料導入 knowledge graph 或新的 FSM framework。**

   材料把 graph memory 列為觀察項，並指出 loops/graphs 多為 FSM 表達差異（`context-eng-sources.md:40-44`）。現有 workflow recipes 已涵蓋 loop 與 convergence。

5. **不把所有 eval 硬設為 `1.00` 自動 PASS/FAIL。**

   deterministic safety/routing invariant 可要求全過；taste、architecture 與 source conflict 需要 rubric、trajectory review 與 `UNCONFIRMED`。自然語言 exact-match 會鼓勵 reward hacking。

6. **不刪除兩份 runtime-native global 檔或改成 symlink。**

   可以縮內容，但目前架構要求 Claude 與 Codex 各自保有 native main file、repo 版本 byte-identical、deploy 後驗 hash（`global/AGENTS.md:3-7`；`.agents/rules/maintenance.md:62-76`）。

7. **不把 plugin／output-style 關閉包進本 repo 的直接修改。**

   companion docs 指出 always-on style 有 context cost，也記錄使用者先前選擇保留 plugin set，任何變更需要核准（`.agents/rules/LETTER-TO-FUTURE-SESSIONS.md:19-29`；`.agents/rules/harness-diagnosis.md:74-79`）。應先量測，再提出獨立 settings diff。

## 建議執行順序

1. P0/S：修正 immutable release ref。
2. P0/M：建立可執行 eval baseline。
3. P0/M：以 eval 保護逐段縮減 global。
4. P1/S：加入 context budget 與 single-owner checks。
5. P1/M：試行 hashed receipt、outcome ledger、observation schema。
6. P2：只在已有失敗案例時擴充 template／interview mode。

最先驗證的假設：刪減 global 通用 section 後，routing、safety 與 completion-evidence eval 是否維持全數通過。若失敗，應回復該單一 section，將缺失改成更窄的 routed trigger。

✈


