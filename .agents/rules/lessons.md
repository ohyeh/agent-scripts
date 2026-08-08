# Lessons (append-only; format per rules/maintenance.md §3 — NON-NORMATIVE: no entry overrides CLAUDE.md or rules/*.md)

Synced via repo since 2026-08-08 (W32 ruling A-3): canonical copy lives at
`.agents/rules/lessons.md` in ohyeh/agent-scripts and deploys to
`~/.agents/rules/lessons.md` on every machine. Entry format:
`## <date> | scope: <x> | trigger: <y>` / `Rule: <one line>` / `Status: proposed|adopted|retired`.

## 2026-07-10 | scope: system | trigger: institution created by the one-time Fable 5 session
Rule: (superseded 2026-07-10 v5.1 revision) edit permissions are defined solely by maintenance.md §1; this file grants nothing.
Status: retired

## 2026-07-10 | scope: system | trigger: codex consensus review BLOCKed v5.0 (2 blockers, 7 major)
Rule: rule-system changes ship only through the canonical repo + install.sh + a second-model gate; any deploy must cover BOTH ~/.claude and ~/.codex and pass install.sh verification.
Status: proposed

## 2026-07-10 | scope: provisioning | trigger: runbook cited a nonexistent ~/.agents/workflows repo (copied forward without live check)
Rule: every path/command written into rules/companion docs must be live-verified at write time (judgment-rubrics §5); fix stale copies at the source, never propagate them.
Status: proposed

## 2026-07-17 | scope: system | trigger: worldview audit found stale v5-era refs (install.sh/symlinks/~/.claude/rules/NOVA) in 5 rules files + both global files
Rule: after any institution pivot, grep every rules/global file for the old mechanism's tokens and fix them in one pass; bump Version in both global files.
Status: proposed

## 2026-07-18 | scope: codex-cli | trigger: `codex exec "<prompt>"` hangs waiting on stdin in headless runs
Rule: always run `codex exec ... < /dev/null` (and `--skip-git-repo-check` outside a trusted repo).
Status: proposed

## 2026-07-18 | scope: scrub | trigger: scrub.sh run with default evidence dir created .scrub-evidence/ inside the repo, dirtying the worktree and self-BLOCKing (happened twice: W4 era and 2026-07-18)
Rule: always pass an EXTERNAL evidence dir as `$2`.
Status: proposed

## 2026-07-18 | scope: git | trigger: push rejected because local checkout sat on a staging branch while local main was stale; the "conflict" was a fast-forward
Rule: before diagnosing push rejection, check current branch and whether `HEAD:main` is a fast-forward.
Status: proposed

## 2026-07-18 | scope: scrub | trigger: history-wide scrub BLOCKs on teaching placeholders (fictional paths, AWS docs example key) baked into an init commit
Rule: scrub findings in history need triage into real-secret vs documented-placeholder before escalating; placeholders get a policy decision, not a pattern weakening.
Status: proposed

## 2026-07-18 | scope: gates | trigger: fresh Claude subagent cited the retired ~/.agents/rules/delegation-templates.md path from memory and planned to proceed after the file was missing
Rule: gate texts must forbid quoting paths from memory; on missing gate file, the gated action stops.
Status: proposed

## 2026-07-18 | scope: skills-cli | trigger: `npx skills@1.5.18 update --help` executed a real update of 3 global skills instead of printing help
Rule: never pass `--help` to `skills update`; probe unknown CLI syntax with `npx skills --help` (top-level) or read docs, and treat any `update`-family subcommand as mutating.
Status: proposed

## 2026-07-19 | scope: docs-drift | trigger: W20 found workflow-manifest still asserting recipe aggregate hash 0bdca2c4 after commit 6c9f644 changed a recipe file (real hash a5f8770f)
Rule: a static manifest embedding a computed fingerprint (aggregate hash) rots silently on the exact fact that matters; when any hashed input changes, re-derive and update the fingerprint in the same commit, or the snapshot becomes a false convergence baseline.
Status: proposed

## 2026-07-21 | scope: delivery | trigger: user rejected minimal-first framing for multi-machine aggregation
Rule: completeness comes before minimality; do not substitute an MVP or workaround for the requested end-to-end outcome and root-cause fix.
Status: proposed

## 2026-07-22 | scope: rules-drift | trigger: deploying v4.6.10 found native ~/.codex/AGENTS.md line 58 verbosity default (V=0) diverged from repo/global + ~/.claude/CLAUDE.md (V=1)
Rule: the two native main files are maintained separately and drift silently; a deploy that only patches the target lines will not reconcile pre-existing divergence — periodically diff native vs repo/global (not just Version+the touched line) and flag mismatches for a user ruling.
Status: proposed

## 2026-07-22 | scope: dispatch | trigger: user ruling — Claude external-worker supervision proxy is MUST, encapsulated as a trackable general-purpose sub-agent on haiku, mounted unconditionally
Rule: on Claude, every authorized async external CLI worker gets exactly one general-purpose/haiku supervision-only sub-agent (event-driven via the tool-layer blocking supervisor, never polling); one-week trial from 2026-07-22 — review real-worker usage and stable triggering before folding as permanent.
Status: proposed

## 2026-07-22 | scope: tmux-agent-tools dispatch | trigger: gave up on GLM profile as "missing binary" without reading profiles/README.md
Rule: before declaring a tmux-agent-tools profile/worker unusable, read skills/tmux-agent-tools/scripts/profiles/README.md — bin= may need a bare <env_ns> env var override (e.g. CLAUDE=/path) and the profile filename itself is the <cli> arg (agent-tmux <profile-name> ...), not agent-tmux claude --profile.
Status: proposed

## 2026-07-25 | scope: delegation | trigger: a worker faked test coverage twice by keeping the test() count while hollowing assertion bodies into source-substring greps
Rule: packets that rewrite tests must make per-test assertion count and a zero-`fetch` check part of ACCEPTANCE, and state that a DROPPING test count beats a hollow shell.
Status: proposed

## 2026-07-25 | scope: delegation | trigger: a cutover packet described deleting a 2829-line page as a "route move", so that page's client-side asset interception was lost and raw image bytes began bypassing a hardened share guard
Rule: a packet that deletes or replaces a file must enumerate the behaviours that file owned, as items to port or explicitly retire.
Status: proposed

## 2026-07-25 | scope: evidence | trigger: four rounds accepted "canvas.html untouched (git diff --stat)" for a file that was not in the index, so the check could never fail
Rule: file-level claims need `git ls-files` / `git log -- <path>`; `git diff --stat` alone cannot prove anything about an untracked file.
Status: proposed

## 2026-07-25 | scope: tmux-agent-tools dispatch | trigger: declared the glm profile UNAVAILABLE ("bin claude-fable-gate not found") — the 2026-07-22 lesson had already recorded the fix and I did not read it
Rule: an unread proposed lesson is a repeat failure — before declaring any worker/profile unusable, grep lessons.md for that profile name first; correct form is `CLAUDE="$(command -v claude)" agent-tmux <profile-filename> start ...`.
Status: proposed

## 2026-07-25 | scope: evidence | trigger: a hardened share projection silently no-op'd on ALL real data for three review rounds because its tests hand-built a snapshot shape the library never emits ({store} vs {document:{store}})
Rule: when code consumes a library's serialized output, at least one test must build the fixture WITH that library and assert the transform actually happened (e.g. output record count strictly less than input) — a hand-written literal tests the fixture, not the contract.
Status: proposed

## 2026-07-25 | scope: evidence | trigger: my verification `npm test` raced a worker's concurrent build over the shared dist/, producing 89 fake failures (missing __vite_rsc_assets_manifest.js)
Rule: never run a build-producing test suite while a delegated worker may be building the same tree — confirm the worker is idle first, and on a mass failure with missing-artifact errors, clean the build dir and re-run before treating it as a defect.
Status: proposed

## 2026-07-26 | scope: dispatch | trigger: Claude commander drove tmux workers directly with send-wait because the proxy mandate lived under a "CODEX VISIBILITY" heading and read as Codex-only
Rule: a cross-runtime mandate must never be scoped under one runtime's heading — name every runtime's concrete shape in the skill that teaches the operation, or the other runtime treats it as inapplicable (fixed in tmux-agent-tools v0.37.0).
Status: proposed

## 2026-07-27 | scope: fleet | trigger: CLAUDE.md loads stop-slop but it was missing from skills-lock.json, surviving on all three machines only as a hand-copied folder
Rule: every skill named in the global files or routed rules must have an entry in the fleet skills-lock.json; a rule pointing at an unlocked skill is broken on any fresh deploy.
Status: proposed

## 2026-07-27 | scope: kernel | trigger: 48h session telemetry — 66% 儀式閱讀 / 69% 測試重跑 / edit 僅佔 9.7%
Rule: entry gates bind only to multi-phase/irreversible/delegated work; evidence is idempotent on an unchanged tree.
Status: proposed

## 2026-07-27 | scope: agent-device | trigger: 使用者第 N 次糾正「不要因為用 agent-device 又莫名開啟模擬器」；16:30 檢查為空、16:40 已有 iPhone 17 Pro booted（原 remote L001）
Rule: 實機任務中，每次 `agent-device` 指令後（不只任務開始時）必須跑 `xcrun simctl list devices | rg -i booted`，非空即立刻 shutdown 並回報——前置檢查擋不住工具的後置副作用。
Status: proposed

## 2026-07-27 | scope: refactor | trigger: 拆分共用元件時沿用原元件 enum，帶入不可達狀態與無依據文案（原 remote L002）
Rule: 拆分共用元件時，新元件的狀態集合必須從呼叫路徑重新推導；沿用原 enum 即為「複製後改名」。
Status: proposed

## 2026-07-27 | scope: evidence | trigger: 驗收本機服務時 port 在 LISTEN 但服務的是舊內容（原 remote L003）
Rule: 「port 在 LISTEN」不等於「服務的是最新內容」；重建輸出目錄前必須先收掉 cwd 位於該目錄的舊 process。
Status: proposed

## 2026-07-27 | scope: reporting | trigger: 元件型錄（Widgetbook/Storybook）增減用散文描述，難以核對（原 remote L004）
Rule: 討論元件型錄增減時一律以 tree 形式呈現，且從機器產出的路徑清單 dump，不手打。
Status: proposed

## 2026-07-27 | scope: evidence | trigger: `Restarted application` 出現在 log 但新程式沒在跑（原 remote L005）
Rule: 驗證裝置上的行為改動時，證據必須是畫面上可辨識的差異（或重新安裝後的首次啟動），不是熱重啟成功訊息；同族：port LISTEN ≠ 最新內容、exit 0 ≠ 成功、use case 存在 ≠ 狀態被渲染。
Status: proposed

## 2026-07-28 | scope: delegation-templates | trigger: dispatch shape B 用 `--prompt-file` 啟動被拒，worker 空轉無 result.json
Rule: tmux delegation MUST use `start` → `result init` → `send --from-file <abs>` → one blocking `supervise`（shape B 的 `--prompt-file` 寫法已 stale）。
Status: proposed

## 2026-07-28 | scope: tmux-agent-tools | trigger: `result init` 疑似 seed success 使 `supervise --result-required` 提早返回
Rule: （已在 tmux-agent-tools #317 root-cause：init seeds pending、terminal 需非空 summary，原疑慮不成立）
Status: retired

## 2026-07-28 | scope: workflows | trigger: run `wf_d5d63a82-868`：`read-job` agent 的鬆散 schema（additionalProperties: true）使 StructuredOutput 把整個 job 包成單一字串屬性，後續 guard 誤報 "missing arg: repoPath"
Rule: workflow agent 讀取結構化 payload 時 schema 必須宣告真實形狀（required + typed properties），否則 structured-output 層會多包一層、guard 的錯誤訊息指向錯誤原因；abort 訊息須區分「檔案不存在」與「解析後為空」。
Status: proposed

## 2026-07-28 | scope: kernel | trigger: user correction — agents keep proposing/coding fallbacks instead of failing first
Rule: fail first — surface error class + evidence before any fallback; a fallback is opt-in, adopted only on explicit user acceptance for that context.
Status: adopted   # folded into kernel v4.11.0 (commit a02906a), user-approved 2026-07-28

## 2026-07-28 | scope: kernel | trigger: user correction — minimal-diff habit trumping solid root-cause fixes
Rule: solid completion first — finish the whole requested task with root-cause fixes; minimal diff is only a tie-breaker among equally solid fixes, never a reason to bypass or trim.
Status: adopted   # folded into kernel v4.11.0 (commit a02906a), user-approved 2026-07-28

## 2026-07-28 | scope: global output | trigger: user required the retired every-reply canary
Rule: keep the every-reply ✈ canary and its regression checks aligned; retirement requires an approved migration updating every validator and eval fixture.
Status: retired   # superseded by kernel v4.17.0 (W32 ruling A-5): narration optional, ✈ binds to the turn's final message only

## 2026-07-30 | scope: global output | trigger: sid `7afcf7fb` 27 個文字回合中 25 個無 `✈`、19 個全英文——「reply」是否涵蓋工具鏈旁白定義不明（原 remote L006）
Rule: （原提案「每段旁白都算 reply」曾折入 kernel 4.14.0，W32 裁決 A-5 認定為改壞並回退；現行規則見 kernel v4.17.0：旁白選擇性、`✈` 綁回合結尾）
Status: retired

## 2026-08-01 | scope: measurement/inventory tasks | trigger: user rejected sampling in weekly retro log analysis (「在這抽樣沒意義」); sampled subagent transcripts gave 35-42% compliance vs true top-level 4.3%
Rule: log/usage measurement is script-full-coverage only — sampling is forbidden at the measurement layer; LLM deep-read processes the COMPLETE script-flagged set (triage, not sampling); every reported number carries its producing command; conflicting "full" sweeps are adjudicated by the commander re-running one shared口徑, never by picking a report.
Status: adopted   # folded into judgment-rubrics.md §5, user-approved 2026-08-01 (R1)

## 2026-08-07 | scope: retro/對帳 | trigger: insight repo 本地 clone 落後，A1+C1+C2 已上 GitHub 卻被判「未做」
Rule: 對帳或審計跨 repo 進度時，真相源是 remote（gh api / fetch 後的 log），本地 clone 的 git log 只是 lead。
Status: proposed

## 2026-08-07 | scope: retro/量測 | trigger: 手排路徑查 agy 得 0，collector 查真 store（~/.gemini/antigravity-cli/conversations）得 10
Rule: 量測層一律先跑 agent-sessions collector（cmli.agent-sessions.v1）；手排 fd/jq 只補 collector 未覆蓋的面，不得重算它已覆蓋的數字。
Status: proposed

## 2026-08-08 | scope: evidence | trigger: W32 L1 — 使用者「不是 kDebugOutline 你理解到哪去」（sid `6bc15b50`）
Rule: 使用者點名某個 identifier 時，先讀該 identifier 的定義處再回答，不以 rg 命中代替。
Status: proposed

## 2026-08-08 | scope: agent-device | trigger: W32 L2 — 「你開模擬器幹啥啦 usb 那個裝置測試 規範都不看」——2026-07-27 條目已載仍犯
Rule: simulator 後置檢查規則已存在，本次是執行失敗而非缺失——應改為工具閘門（hook/wrapper），列入 W33 機器閘門主軸。
Status: proposed

## 2026-08-08 | scope: correction-handling | trigger: W32 L3 — `/shared-memory-intake` 被糾正 4 次，同一句糾正原句重貼 3 次
Rule: 使用者重貼同一句糾正即為「上次沒改」的硬訊號：立刻停止當前路徑，先讀被指名的資產全文，再回答。
Status: proposed

## 2026-08-08 | scope: evidence | trigger: W32 L4 — 84% 讀檔走 Bash `cat/sed/head`、483/500 截斷（sid `6bc15b50`）
Rule: 判定類宣稱前，讀檔須走 Read tool（可稽核）且非截斷；`head/sed` 截斷讀取不構成判定依據。
Status: proposed

## 2026-08-08 | scope: global output | trigger: W32 L5 — 中譯技術詞 71 次／16 種，「節流」×33
Rule: 技術術語一律保留英文原文（throttle/cache/flag…）；kernel 已有規則，需詞表化為送出前檢查（機器閘門候選）。
Status: proposed

## 2026-08-08 | scope: fleet | trigger: W32 L6 — `tailscale status` 把本機列為 offline，差點誤判 E1 節點消失
Rule: 節點存活不以 `tailscale status` 為真相源；自身 IP 以 `ifconfig` 對照、遠端存活以 SSH 實測。
Status: proposed

## 2026-08-08 | scope: evidence | trigger: W32 L7 — kernel 跨機 hash 不同但 `diff` 只差結尾換行
Rule: 檔案一致性以 `diff` 判定，不以 hash 差異下「drift」結論。
Status: proposed

## 2026-08-08 | scope: evidence | trigger: W32 L8 — D2 只 `rg` 命中就差點認定有派工紀錄，命中其實是文件內容
Rule: grep 命中須確認上下文性質（是實際指令還是文件內容）才可作為證據。
Status: proposed

## 2026-08-08 | scope: lessons-process | trigger: W32 L9 — 本機 lessons.md 本週新增 0 筆，而同期至少 8 次使用者糾正
Rule: 糾正發生時當場記 lessons（turn 內），不留到 retro 才回填——回填等於不記。
Status: proposed
