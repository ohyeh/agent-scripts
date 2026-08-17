# P1-agentplugins —— pre-read REPORT（原始版本，未編輯）

來源：本 session subagent transcript `agent-aP1-agentplugins-3c2ee1c88eabc3fe.jsonl`（51 records）
派工：Agent tool，opus + effort low，2026-08-07 議題裁決輪 plan.md P 系列
本檔為 worker 最終回報全文逐字保留；經主 session 摘要與裁決的版本見 `../retro-report.md` §4。

---

**1. 是什麼**

Agent Plugins v1.0.0（Status: Published）是一份 vendor-neutral 的「可攜套件格式」規格：一個 plugin 就是一個目錄，根目錄必須有 `plugin.json`，components 只放在固定位置。v1 只定義兩種 component：`skills/`（格式完全委外給 agentskills.io 規格）與 `mcp.json`（stdio / Streamable HTTP / legacy SSE，含 `${PLUGIN_ROOT}`、`${PLUGIN_DATA}` 插值）。manifest 是 closed schema，只允許 `$schema`、`name`、`version`、`description`、`author`、`homepage`、`repository`、`license`、`keywords`、`extensions`；必填只有 `$schema`（值必須是 `https://agent-plugins.org/schemas/1.0.0/plugin.schema.json`）與 `name`（1-64 字、僅 `a-z0-9-.`、首尾須 alphanumeric、不得 `--`/`..`）。commands、hooks、agents、rules、LSP 明文排除於 v1；client 專屬物一律進 `extensions` 的 reverse-domain namespace 或同名 top-level 目錄（`com.example.client/hooks/`）。**Discovery/registry 刻意不定義** — distribution、installation、permissions、UX 全留給各 client，無 registry、無 index 格式、無 marketplace catalog（issue #41 仍 open）。schema 版本與 spec 版本綁定（`mcp.json` 的 `$schema` 版本必須等於 `plugin.json` 的）。TSC：Clare Liguori (Amazon)、Roshan Sadanani (Cursor)、Harald Kirschner (Microsoft)、Gav Verma (OpenAI)、Jonathan Hefner (Vercel, Lead) — **Anthropic 不在名單**。官方 compatible clients 共 5 個：VS Code、Cursor、GitHub Copilot、ChatGPT & Codex、Kiro — **Claude Code 不在其中**。

**2. 與我們何處重疊**

本 repo 的 skills 已在 `skills/<name>/SKILL.md`，正是規格的 fixed location，字面上零改動。目前無任何 `plugin.json` / `marketplace.json`（find 無輸出），部署走 `scripts/deploy.sh` / `scripts/fleet-deploy.sh` + `skills-lock.json`。重疊只有「目錄佈局」一層；規格對 deploy script 完全沒有意見，`skills-lock.json` 這類 root 級檔案也不受管（closed schema 只管 `plugin.json` 內部）。不重疊的是我們真正的資產：`.agents/rules/`、workflows、hooks、`global/` — 全是 v1 明文排除的類型，只能寄生在 `extensions` namespace，而規格對那裡「assigns no portable semantics」，等於零標準化收益。

與 Claude Code 現有格式的關係：**不是 rename，是縮小版的重疊子集**。Claude Code 的 `.claude-plugin/plugin.json` + marketplace 是「manifest 位置不同 + 多管 commands/hooks/agents/marketplace」；Agent Plugins 把 manifest 搬到 root、component 砍到 2 種、marketplace 整塊丟掉。相對「純 skills 目錄」則是 superset：多一個 `plugin.json`。

**3. 建議採用層級**

**只偷概念**，外加一個 15 分鐘的低成本例外 —— 因為 v1 標準化的正好是我們早已對齊的部分（`skills/<name>/SKILL.md`），而我們真正的痛點（rules、workflows、hooks、fleet deploy）全在 v1 範圍外且無 registry 可用；主 runtime 是 Claude Code + Codex，Claude Code 未列 compatible client，採「整套」現在拿不到可驗證的互通性。例外：若要對 VS Code / Cursor / Copilot / Codex 開放 skills，加一個 root `plugin.json`（6 行，照 `agent-plugins-example` 抄）即可，不動既有檔案、不影響現行 deploy。可偷的概念兩個：closed manifest schema（未知欄位 report-and-ignore、其他違規 fatal）與「client 專屬物一律進 reverse-domain namespace」的隔離紀律。

**4. 證據**（皆為本次實際 fetch）

- https://agent-plugins.org/
- https://agent-plugins.org/compatible-clients
- https://raw.githubusercontent.com/agentplugins/agent-plugins-site/HEAD/lib/compatible-clients.ts
- https://raw.githubusercontent.com/agentplugins/agent-plugins-spec/HEAD/spec/1.0.0.md（§4-§11 + Design Decisions + Appendix A）
- https://raw.githubusercontent.com/agentplugins/agent-plugins-spec/HEAD/schemas/1.0.0/plugin.schema.json
- https://raw.githubusercontent.com/agentplugins/agent-plugins-spec/HEAD/schemas/1.0.0/mcp.schema.json
- https://raw.githubusercontent.com/agentplugins/agent-plugins-spec/HEAD/GOVERNANCE.md
- https://raw.githubusercontent.com/agentplugins/agent-plugins-spec/HEAD/MAINTAINERS.md
- https://raw.githubusercontent.com/agentplugins/agent-plugins-example/HEAD/plugin.json
- https://raw.githubusercontent.com/agentplugins/agent-plugins-example/HEAD/skills/migrate-agent-plugin/references/migration-guide.md
- https://api.github.com/orgs/agentplugins/repos（僅 4 repos：spec 339★/18 forks、site 66★、example 17★、.github）
- https://api.github.com/repos/agentplugins/agent-plugins-spec/issues?state=all（open：#41 marketplace guidance、#40 workspace root、#19/#18 icon、#8 directory rules、#7 remote MCP、#6 invocation format、#5 skill-only packages、#4 way forward）

UNCONFIRMED：各 client 實際 conformance 程度（只讀官方宣稱表，未驗任一 client 原始碼）；Claude Code 是否有未公開支援（`anthropics/claude-code` CHANGELOG 無 `agent-plugins` 字樣，但該 repo 不含實作原始碼，屬缺席證據非否證）；`FUTURE_CONSIDERATIONS.md` 與 client-implementers 文件未讀。roadmap 不推測。

**5. 自評**

2 — 一次是 compatible-clients 頁面由 React component 渲染、`.md` 版只有 `<CompatibleClients />` 佔位，靠 HTML 正則抓名字漏掉 logo-only 的「ChatGPT & Codex」，改讀 site repo 的 `lib/compatible-clients.ts` 才拿到完整 5 個；另一次是 spec 的 scope 章節用 sed 範圍抓不到，改用語意搜尋才確認「registry 不在規格內」。

✈
