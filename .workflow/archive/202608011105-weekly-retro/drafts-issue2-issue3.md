# Draft-only 產物（issues #2/#3，Status: proposed，待使用者核准後才落地）

> 2026-08-01 使用者裁決：Draft 2（上游 issue）**先不發**；傾向改為 fork
> mksglu/context-mode 自行整理。Draft 2 內容保留作為 fork 後的第一批
> 修改需求清單（decision.action / source_hook 結構欄位）。Draft 1/3 仍待核准。

來源：wf_144a561d-ad8 draft worker（Sonnet, read-only）。三份皆未寫入任何 repo/rules 檔。

## Draft 1 — global/CLAUDE.md exact diff（issue #2，選項 1：工具鏈旁白也算 reply）

```diff
--- a/global/CLAUDE.md
+++ b/global/CLAUDE.md
@@ -1,6 +1,6 @@
 # AGENTS.md / CLAUDE.md — Lean Operating Rules

-Version: 4.13.0-quality-gates-and-loop-signoff
+Version: 4.14.0-reply-scope-tool-chain-narration
 Provenance: repo-canonical shared kernel; detailed policy is routed on demand.
 Runtime files remain native: Codex uses `~/.codex/AGENTS.md`; Claude Code uses
 `~/.claude/CLAUDE.md`. Keep them byte-identical. Project-local instructions override.
@@ -11,6 +11,10 @@
 - User-facing responses use Traditional Chinese (Taiwan). Keep code, identifiers,
   commands, filenames, API names, and technical literals in English.
+- "Reply" covers every assistant text segment in a tool-call chain, including
+  narration between tool calls ("Let me check...", "The screenshot rendered,
+  viewing it now") — not only the final turn. Each such segment follows the
+  language and `✈` rules below. Only turns with zero text content (a bare tool
+  call, nothing else) are exempt.
 - End every reply with the codeword `✈` on its own final line — a canary proving
   these rules remain loaded. If it is missing, reload this file. If a required
   format fixes the final line (for example `VERDICT: PASS|BLOCK`), omit `✈`.
```

註：worker 取的 Version 基底（4.13.0-quality-gates-and-loop-signoff）以 repo 現況為準，落地前需對 live 檔重驗行號與版本字串。

## Draft 2 — 上游 mksglu/context-mode issue（issue #3 發現一）

Title: rejected-approach category conflates UX-suggestion "modify" actions with real "deny" blocks

Body:

## Summary
The `rejected-approach` analytics category (written by pretooluse.mjs /
routing.mjs and aggregated by analytics-core.mjs) stores two semantically
different hook outcomes under one bucket with no field distinguishing them:

1. `action: "modify"` — the tool call is NOT blocked, it still executes;
   the hook just appends a suggestion text (e.g. "Redirected to context-mode
   sandbox", nudging toward ctx_execute/ctx_batch_execute).
2. `action: "deny"` — the tool call IS blocked, either by
   `security.evaluateCommand` hitting a real deny pattern, or by the
   unconditional WebFetch → ctx_fetch_and_index redirect in routing.mjs.

Both land in the same `category = 'rejected-approach'` row, distinguished
only by free-text `data` content, not a structured field.

## Local evidence (one machine, 92 rejected-approach rows)
- 88 rows: fixed string "Redirected to context-mode sandbox" — action:"modify",
  tool executed anyway (Agent 41, ctx_execute 25, ctx_batch_execute 16, Bash 6)
- 4 rows: WebFetch forced redirect (action:"deny", unconditional in routing.mjs)
- 0 rows: "Blocked by security policy" — i.e. zero real security-policy blocks
  ever recorded in this category on this machine

## Why it matters
`analytics-core.mjs`'s `governance.totalRejections` cannot distinguish "we
politely suggested a better tool" from "we actually blocked a dangerous
operation." With the observed ratio (88 modify : 4 deny-redirect : 0
security-deny), a single real security block would be statistically
invisible inside the aggregate — the metric can't surface the one case it
should be raising loudest.

## Proposed fix
Add a structured field to the rejected-approach record instead of relying on
free-text `data`, e.g.:
- `decision.action` ("modify" | "deny")
- `source_hook` (which hook/branch produced the decision, e.g.
  "pretooluse.suggest" vs "security.evaluateCommand" vs "routing.webfetch_redirect")

This lets analytics-core.mjs (and any downstream dashboard) split
"suggestions accepted/ignored" from "real security blocks" without parsing
free text, and would make a genuine security-policy hit visible instead of
diluted into routine UX nudges.

Happy to share the raw local dataset (92 rows) if useful for a repro.

## Draft 3 — ~/.agents/rules/ 防衛註記（issue #3 發現二；落點交 maintenance.md §1 審）

WebFetch / context-mode interaction: when the context-mode plugin is active,
its PreToolUse hook (routing.mjs) unconditionally intercepts every WebFetch
call and returns action:"deny", redirecting to ctx_fetch_and_index instead.
This happens even though the platform's own system prompt says to always use
web_fetch when the user references a URL. The hook wins at execution time, so
a session that never actually invokes WebFetch — because ctx_fetch_and_index
ran instead — has not violated the web_fetch rule; it was substituted
upstream of the model's control. When judging a session's compliance with
web-fetch handling, check whether context-mode was active before treating a
missing WebFetch call as a rule violation.
