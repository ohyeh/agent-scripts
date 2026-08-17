# Context Engineering 改進來源材料（2026-07-25 彙整）

供獨立評估用。閱讀者任務：從這些材料出發，對本 repo（agent-scripts：global/CLAUDE.md、global/AGENTS.md、.agents/rules/、skills/）提出改進提案清單。

## 1. Anthropic 官方 blog（可直接 fetch 全文）
URL: https://claude.com/blog/the-new-rules-of-context-engineering-for-claude-5-generation-models
重點：Claude 5 世代砍掉 Claude Code system prompt 80% 而 eval 無退步。新原則：
- Let Claude use judgment：把僵硬規則換成高階指引（例：不再說 "never write comments"，改成 "match surrounding code's comment density"）
- Progressive disclosure：規則/skill 拆成需要時才載入的檔案樹；tools 用 deferred loading
- Simple tool descriptions：指引放在 tool description，不在 system prompt 重複
- Rich references：spec 用 code / test suite / HTML mockup / rubric，不用描述性文字；rubric + verifier agents（dynamic workflows）驗 taste
- CLAUDE.md：輕量，只寫 repo 特有 gotchas，不寫 Claude 自己看得出來的東西
- Auto-memory 可取代 CLAUDE.md 的持久資訊角色
- Claude Code 有 `/doctor` 指令可幫忙 rightsize skills 與 CLAUDE.md

## 2. Thariq「A Field Guide to Fable: Finding Your Unknowns」（X article，全文抽取）
- 核心：map（prompt/context）vs territory（codebase/現實），差距 = unknowns；Fable 品質瓶頸在使用者澄清 unknowns 的能力
- 四象限：known knowns（prompt 裡的）、known unknowns、unknown knowns（顯而易見沒寫下、看到才認得）、unknown unknowns
- 技法（pre-implementation）：Blindspot pass（字面用 "blindspot pass"/"unknown unknowns" 請 Claude 找盲點）；brainstorm + prototype（HTML artifact 多方向草案）；interview（一次一題，優先問會改架構的）；references（最好的 reference 是 source code，指向資料夾即可，跨語言也行）；implementation plan（把最可能改的決策放最前面：data model、type interfaces、UX）
- 技法（during）：implementation-notes.md 記 deviation，保守選項 + 記錄後繼續
- 技法（post）：pitch/explainer artifact 給 reviewer；quiz（Claude 出題，perfect pass 才 merge）
- 案例：Fable launch video 全由 Claude Code 剪輯，透過「教我 color grading 找我的 unknowns」

## 3. Nicolas Finet「Self-Improving Outbound System on Codex」（X article，全文已讀，要點）
Karpathy loop 工程化模板：任何能便宜評估的指標都能交給 agent 自我改進。
- Step 1 先寫 AGENTS.md 當法律：never send / never self-merge / 一次改一個概念 / 每個改動必須引用 outcomes 證據 / eval 沒進步就 revert；「law 需要目錄時就已太大」
- Step 2 判斷邏輯放 config YAML（可逐行吵架），不藏在程式裡
- Step 3 outcomes.jsonl 當記憶，reason 欄位是重點（"no_reply" 無資訊，"content-only intent" 才有）；validator 先於 improver
- Step 4 eval gate：fixtures.yaml + score.py，1.00 才 exit 0；「fixture 只放明顯的贏 = 每個魯莽改動都過」
- Step 5 improver 一次提一個 scoring 改動，引用 outcome rows，eval 沒進步 revert；第一版 improver 追最漂亮的信號被 gate 擋下 = gate 的價值
- Step 7 一切以 PR 交付人審：「給 agent merge 權限那一分鐘，系統從 improve 變 drift」
- Step 8 週節奏，不要每回覆就調（overfit 單一樣本）；前兩次手動跑、讀每個 diff

## 4. LangChain「Eval Engineering Skill」（Vtrivedy，全文已讀，要點）
- Skill 讀 repo + agent traces，自動提出要測的 abilities，「interview the user」迭代核准每個 eval，輸出 Harbor 格式（task.toml + instruction.md + environment/ + tests/：instruction + Dockerfile 環境 + verifier）
- 驗 verifier 的方法：同時看 agent trajectory 和 verifier trajectory，抓 reward hacking（過度引用無關來源拿滿分、宣稱沒做過的動作、利用暴露的答案）
- 「evals are training data for agents」：mine traces → identify failure → build eval → improve agent → rerun
- Repo: langchain-ai/langchain-skills，可裝在 Codex 或 Claude Code

## 5. 其他（低優先）
- Raft「Don't talk to me, talk to my agents」：跨公司 joint channel 產品宣傳，無方法論
- Noisy「Kimi K3 + Graph Engineering」：knowledge-graph RAG 成長文，行銷味重；graph memory 當觀察項
- TheVixhal「State Machines: From Loops to Graphs」：FSM 科普，論點 = chains/loops/graphs 都是 FSM 換皮
- 圖解（使用者提供）：loop engineering = agent loop 外再套父 loop；graph engineering = 多 agent 有向圖（可有環，更像 FSM）——非新概念
