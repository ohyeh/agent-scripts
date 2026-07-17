# Agent 環境 Provisioning（跨機重建）

在另一台機器重建 AI workflow 環境（rules 制度、skills、plugins、workflow recipes）的 runbook。任務執行期不需要讀這份；只在 provision 新機器或災難復原時使用。此檔為唯一 truth，所有路徑 2026-07-10 live 驗證。

## Agent Skills

- **Layout**: skills live in `~/.agents/skills/<name>/` (each with `SKILL.md`); `~/.claude/skills/<name>` symlinks → `../../.agents/skills/<name>`.
- **Provenance**: managed by `npx skills` (vercel-labs/skills CLI); lockfile `~/.agents/.skill-lock.json` records `source`/`sourceUrl`/`skillPath`. Check with `npx skills list -g`（global skills 必須帶 `-g`，不帶只看專案層）.
- **Rebuild (preferred = 下方 offline tar)**: 唯一 live 驗證過能完整還原 global skills（含 local renames）的路徑。網路替代：逐 repo `npx skills add <repo> -g`（以 repo 原名安裝，local renames 需照下表手動改名）。`npx skills experimental_install` 經 live 測試（2026-07-10）只讀專案層 `skills-lock.json`（輸出「No project skills found」），是否支援 global lockfile UNCONFIRMED — 勿當 global 還原手段。
- **Offline tar（preferred）**:

  ```bash
  # source machine
  tar -czf agent-skills.tgz -C ~/.agents skills .skill-lock.json
  # target machine
  mkdir -p ~/.agents && tar -xzf agent-skills.tgz -C ~/.agents
  mkdir -p ~/.claude/skills
  for d in ~/.agents/skills/*/; do n=$(basename "$d"); ln -sfn "../../.agents/skills/$n" ~/.claude/skills/"$n"; done
  ```

- Other skills: `npx skills list -g`; process-type skills mostly from `vercel-labs/skills`; the lockfile is authoritative.

## Rules / Institution（規範制度）

- **Canonical**: routed rules 在 `~/.agents/rules/`（兩個 runtime 依全域檔路由表 on-demand 讀取）；全域檔為 native 雙份 `~/.claude/CLAUDE.md` 與 `~/.codex/AGENTS.md`（內容相同、分別維護、無 symlink）。（v5 的 install.sh/symlink 制度已於 2026-07-17 廢棄刪除——勿再引用。）
- **Rebuild**: rules 目前未版控——從既有機器複製 `~/.agents/rules/` 整目錄 + 兩個全域檔。計畫家（ADR-0001）：public `agent-scripts` repo 的 `.agents/rules/`，屆時 deploy = `rsync -a --delete repo/.agents/rules/ ~/.agents/rules/`（`lessons.md` local-only，不入公開 repo）。
- **Verify**: `~/.agents/rules/` manifest 與全域檔路由表一致、兩個全域檔 `Version:` 相同；新 session 首則回覆以 `✈` 結尾為最終煙霧測試。

## Plugins / Marketplaces

From `~/.claude/plugins/known_marketplaces.json`; install: `/plugin marketplace add <repo>` → `/plugin install <name>@<marketplace>`:

| marketplace | GitHub repo |
| --- | --- |
| claude-plugins-official | `anthropics/claude-plugins-official` |
| context-mode | `mksglu/context-mode` |
| openai-codex (codex CLI integration) | `openai/codex-plugin-cc` |
| claude-hud | `jarrodwatts/claude-hud` |

## Skills used by the docs HTML-ification task (commit 6f5ed3b)

| skill | role | 現況 per `~/.agents/.skill-lock.json`（2026-07-10 live 核對） |
| --- | --- | --- |
| `codex-dynamic-workflows` | workflow orchestration (plan/state/approval gate) | `dannymac180/skills` ✓ installed |
| `html` / `html-plan` / `html-diagram` | designed pages & interactive SVG | `plannotator/effective-html` ✓ installed |
| `design-taste-frontend` | visual taste | `nexu-io/open-design`（skillPath `skills/taste-skill` → local 改名）✓ installed |
| `impeccable` | detail-quality gatekeeping | `pbakaus/impeccable` ✓ installed |

> 該任務當時另用過 `high-end-visual-design` / `minimalist-ui` / `brandkit`，現已不在本機（lockfile 無條目、`~/.agents/skills/` 無目錄，2026-07-10 live 核對）——重建時**不需**還原它們。`design-taste-frontend` 是 local 改名（repo 資料夾為 `taste-skill`）：faithful restore = offline tar（保留改名）；`npx skills add nexu-io/open-design -g` 會以 repo 原名重裝，需手動改名。

## Dynamic Workflow Recipes（live-verified 2026-07-10）

Reusable cross-project Workflow scripts. **The Workflow tool's per-run script copies under `~/.claude/projects/<slug>/<session-id>/workflows/` are run artifacts, never the source of truth.**

- **Source of truth**: the `using-workflows` skill bundle — `~/.agents/skills/using-workflows/workflows/*.workflow.js`（含 `_lib/` 與 `README.md`），由 `npx skills` 管理，lockfile source = `https://github.com/ohyeh/tmux-agent-tools.git`。（早期文件宣稱的 `~/.agents/workflows/` git repo 在本機不存在，該敘述作廢——勿再引用。）
- **Deployed / invocation**: recipes 必須放在 `~/.claude/workflows/`（regular files）才會被 Claude Code 探索、可用 `/<name>` 或 `Workflow({name})` 叫用；專案層 `.claude/workflows/` 會 shadow 同名 recipe → 新 recipe 命名避開專案已用的名字。細節見 bundle 內 `workflows/README.md`。
- **Rebuild**: 先照上方 Agent Skills 流程還原 skills（preferred = offline tar）→ 依 bundle `workflows/README.md` 把 `*.workflow.js` + `_lib/` 佈署到 `~/.claude/workflows/`。
- **Parameters**: run targets（repoPath/appId/deeplink/flavor/…）+ flags + 非機密 config → `args`。**Secrets never enter `args`/prompt/transcript** — 傳 `args.credsFile` 路徑與 env key 名稱；機器本地值（Xcode/UDID/FVM path）→ env/config。
