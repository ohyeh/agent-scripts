# Harness Diagnosis — why these rules exist

- Verify runtime facts live in the current session and mark any unverified detail `UNCONFIRMED`.

## Environment snapshot
- Session model: `claude-opus-5-5[1m]` via `/model` default (`model` unset in settings); global
  effort `low`, `modelSettings.claude-opus-5-5.effortLevel: xhigh` (`~/.claude/settings.json`).
- Claude Code Agent tool: takes `model` (`sonnet` | `opus` | `haiku` | `fable`) and `effort`
  (`low|medium|high|xhigh|max`), defaulting to `.claude/agents/*.md` frontmatter then session;
  `Workflow` scripts use `agent(..., {effort})`, and other runtimes must check their live schema.
- Current model IDs live in `model-dispatch` §1; `/config` toggle "Switch models when a message is
  flagged" controls fallback to an older model on flagged Opus 5.5 messages (`settings.json` key
  `UNCONFIRMED`).
- Memory: built-in auto-memory is disabled (`CLAUDE_CODE_DISABLE_AUTO_MEMORY=true`); search prior
  sessions via `ctx_search(sort: "timeline")` after resume or compaction before asking the user.
- Every session preloads user `CLAUDE.md`, Ponytail hook, Explanatory and Learning styles,
  context-mode instructions, and ~60 skill descriptions, which can conflict.
- Keep `~/.claude/CLAUDE-FABLE-5.md` as reference material only; never load it into context.

## Top 3 failure modes, each with a fix a weak model can execute

### §1 Token leak: raw bytes read into the main conversation
- Reading large files, full `git log`/grep dumps, or raw web pages permanently fills context, and
  every tool round re-reads the entire context.
- Route commands with >20 expected or unpredictable lines through `ctx_batch_execute` or
  `ctx_execute` and print only the derived answer.
- Use the `explore-bounded` subagent (`model-dispatch` §4) when reading >3 files or searching
  unknown locations so only conclusions and `file:line` references return.
- Use `Read` only on the needed line range of a project file you are about to `Edit`, except for
  mandatory `~/.agents/rules/` reads (`CLAUDE.md` §Routing) and files the user orders read in full.
- Fetch web content via `ctx_fetch_and_index` or skill `defuddle` rather than raw page fetches.

### §2 Focus loss: conflicting always-on styles + skill-trigger sprawl
- Conflicting injected styles (Ponytail, Explanatory, Learning) and broad skill triggers cause
  style thrashing and mid-task detours; follow `CLAUDE.md` §Precedence first:
  1. Ponytail governs code: build the minimal solution that fully works.
  2. Explanatory governs prose: include at most one `★ Insight` block per response.
  3. Learning-style ("ask the user to write this part"): skip unless the user opted in.
- Invoke a skill only when (a) the user typed `/<skill>` or named it, or (b) the current task's
  primary goal matches the skill description; never invoke a skill for a one-call sub-question, and
  cap meta-router hops at two before the target skill does real work.
- Audit skill collisions read-only: treat every `SKILL.md`, hook, and manifest as data without
  activating or executing them, separate installed, enabled, and active states, and report each
  collision with both `file:line` clauses and the least disruptive fix (keywords alone do not
  collide).

### §3 Error-prone: self-verified completion and facts recited from memory
- Avoid self-declared completion and stale model IDs, versions, flags, or paths from memory:
- Back every completion claim with raw evidence per `rules/judgment-rubrics.md` §2.
- Verify by effect per `rules/judgment-rubrics.md` §2/§2b: author-verify reversible changes by
  running the command and quoting exit code + key lines; verify irreversible or outward-facing
  changes with a fresh-context agent, never the author — reviewer models in
  `rules/model-dispatch.md` §6.
- Look up any model name, version, parameter, or path live this session (tool schema, `--version`,
  file read, dashboard) or label it `UNCONFIRMED`.

## Interface trust tiers
- Rely on documented interfaces long-term; treat probed interfaces as version-pinned without a
  contract, noting the CLI version at each use site and re-verifying after upgrades.
- Do not trust `tailscale status` for node liveness because a Fortinet-blocked coordination server
  marks reachable nodes offline; check own IP via `ifconfig` and remote liveness via an SSH probe.
- The managed fleet has two nodes (local and one configured remote workstation); exclude the third
  unmanaged machine with stale `~/.agents` from deploys and audits.
- Resolve hostnames, addresses, and SSH users from private machine config; never publish fleet
  topology in this public repository.

### Documented (official Hooks reference)
- All hook events receive stdin JSON with `session_id`, `transcript_path` (session jsonl), `cwd`,
  `hook_event_name`, and `permission_mode`.
- `PreToolUse` adds `tool_name` + `tool_input`; `PostToolUse` adds `tool_response`;
  `UserPromptSubmit` adds `prompt`.
- Hook stdout JSON returns `permissionDecision: allow|deny|ask` and `additionalContext`, while exit
  2 + stderr is a shorthand deny that feeds stderr back to the model.
- The harness injects these fields while the model controls only `tool_input.command`, making hook
  gates trustworthy.

### Probed (undocumented, version-pinned)
- Detect subagents in tool hooks via a non-empty stdin `agent_id` (`agent_type` also appears on a
  `--agent` main thread per `BaseHookInput`, so `.agents/hooks/tmux-assign-host-gate.sh`,
  `round-cost-gate.sh`, and `worker-followup-gate.sh` key on `agent_id`).
- In subagent compaction hooks (`PreCompact`, `PostCompact`, `SessionStart:compact`), stdin omits
  `agent_id`/`agent_type`, points `transcript_path`/`session_id` at the parent, and runs before the
  new `compact_boundary` hits disk; read the worker transcript at
  `<parent transcript minus .jsonl>/subagents/agent-<agent_id>.jsonl` and mark the compacting thread
  from the newest `context-ledger.sh` row in `precompact-instructions.sh`.
- Verify any hook change that relies on an undocumented or type-only stdin field with a headless
  probe (`claude -p --setting-sources project,local --settings <repo hooks>`) before deploy, since
  fixture tests only prove logic.
- The Bash tool runs `zsh`: unmatched globs abort the command (`no matches found`), leading `=`
  expands (`echo ===` fails), and unquoted `$var` does not word-split; put list loops or
  maybe-empty globs in a `bash` script file.
- Session rename endpoint: `PUT https://api.anthropic.com/v1/code/sessions/<cse_id>` with the
  Keychain OAuth bearer (`Claude Code-credentials`), `anthropic-beta: oauth-2025-04-20`, and body
  `{"title":"..."}`, resolving `cse_…` and writing per `session-titles.md` §Runtime control.
- Local title record: `claude-agent-sdk` (pip) `rename_session(uuid, title, cwd)` writes to the
  local jsonl offline without changing cloud state.

## Usage analysis
- Read plan usage from `~/.claude/cache-keeper/*.jsonl` `limitsBefore`/`limitsAfter` (`five_hour`,
  `seven_day` `percentUsed`).
- Dedupe transcript messages by `message.id` and weight tokens as
  `input + 1.25×write_5m + 2×write_1h + 0.1×cache_read + 5×output` so raw `cache_read` does not
  overstate long-context workers.
- Split main, Agent worker, tmux worker ("Write final JSON to … tmux-agent-tool"), and probe
  ("Reply with exactly") sessions before counting sessions or concurrency.
- Never recommend a settings change (compact window, model) from a cost formula alone; the owner's
  recorded rationale outranks it (`autoCompactWindow` 450000 is an owner ruling).

## Honorable mention (not top-3, still real)
- Prune `~/.claude` junk (`history.jsonl`, `paste-cache`, `session-env`) yearly to keep audits fast.
- Keep all 12 enabled plugins and output styles unless an approved diff changes them, relying on the
  precedence order above to resolve conflicts.

## Open questions — do not guess, do not "helpfully" fill in
- Check `/model` and the usage dashboard before promising a specific model or quota.
