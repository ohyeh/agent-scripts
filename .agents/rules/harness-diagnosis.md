# Harness Diagnosis — why these rules exist

Verified: 2026-07-10 on Claude Code 2.1.205 (macOS). Facts below were
looked up live this session, not recited from memory. Anything a future session cannot
re-verify must be treated as UNCONFIRMED, not repeated as fact.

## Environment snapshot (verified 2026-07-10)

- Session model setting: `claude-fable-5[1m]`; session effort: `high`
  (`~/.claude/settings.json`).
- Agent tool `model` parameter accepts exactly: `sonnet` | `opus` | `haiku` | `fable`.
  The Agent tool has NO `effort` parameter — effort comes from the agent definition
  (`.claude/agents/*.md` frontmatter) or `Workflow` script `agent(..., {effort})`
  (`low|medium|high|xhigh|max`), otherwise it inherits the session effort.
- Current model IDs: `claude-fable-5`, `claude-opus-4-8`, `claude-sonnet-5`,
  `claude-haiku-4-5-20251001`.
- Memory: built-in auto-memory is DISABLED (`CLAUDE_CODE_DISABLE_AUTO_MEMORY=true`).
  The real memory layer is the context-mode plugin: `ctx_search(sort: "timeline")`
  spans prior sessions. After resume/compaction, search it before asking the user.
- Injected into EVERY session before the user types anything: user CLAUDE.md +
  Ponytail hook (minimalism) + Explanatory output style + Learning output style +
  context-mode instructions + ~60 skill descriptions. Several of these conflict.
- `~/.claude/CLAUDE-FABLE-5.md` (120KB) is a saved copy of the claude.ai system
  prompt — reference material only, never load it into context.

## Top 3 failure modes, each with a fix a weak model can execute

### §1 Token leak: raw bytes read into the main conversation
Symptom: `Read` on large files, full `git log`/grep dumps, raw web pages. Every byte
permanently occupies the context window and degrades all later reasoning.
Fix — mechanical routing, no judgment needed:
- Command output expected > 20 lines, or unpredictable → `ctx_batch_execute` /
  `ctx_execute`; print only the derived answer.
- Need content from > 3 files, or unsure which file → `Explore` subagent
  (`model: "sonnet"` — haiku is retired per model-dispatch §1); its report must
  be ≤ 30 lines of conclusions + `file:line` references.
- `Read` is ONLY for a PROJECT file you are about to `Edit`, and only the needed line
  range. Exempt: routed rules files under `~/.agents/rules/` (mandatory reads per
  CLAUDE.md §Routing) and files the user explicitly orders read in full.
- Web content → `ctx_fetch_and_index` or the `defuddle` skill, never a raw fetch of
  a large page into the conversation.

### §2 Focus loss: conflicting always-on styles + skill-trigger sprawl
Symptom: Ponytail demands minimal output, Explanatory demands teaching insights,
Learning demands pausing to let the user write code; some skill descriptions say
"invoke even at 1% chance". A weak model thrashes between styles or detours into
skills mid-task.
Fix — precedence order, first match wins (canonical wording lives in CLAUDE.md §Precedence; summary):
1. The user's explicit instruction in the current message (acts as a per-case waiver/approval for Hard Rules' ask-first cases; never silently disables evidence rules).
2. Hard Rules in CLAUDE.md.
3. Ponytail governs CODE: build the minimal thing that fully works.
4. Explanatory governs PROSE: at most one `★ Insight` block per response.
5. Learning-style "ask the user to write this part": skip unless the user opted in.
Skill invocation rule: invoke a skill only when (a) the user typed `/<skill>` or named
it, or (b) the CURRENT task's primary goal matches the skill description. Never invoke
a skill for a sub-question answerable with one tool call. At most one meta-router hop
(a router skill may route once; the target skill must then do real work).

### §3 Error-prone: self-verified completion and facts recited from memory
Symptom: the model that wrote a change declares it works; model IDs, versions, flags,
paths filled in from training memory (frequently stale — e.g. assuming a Sonnet model
ID without checking).
Fix:
- Completion claims require raw evidence (CLAUDE.md Hard Rules); the executable
  checklist is `rules/judgment-rubrics.md` §2.
- Above model-dispatch §7's triviality threshold (multi-file / risky / user-facing),
  verification is performed by a FRESH-context subagent, never the author; trivial
  single-file changes may be author-verified by running the real command and quoting
  exit code + key lines — see `rules/model-dispatch.md` §7.
- Any model name, version, parameter, or path stated to the user must come from a
  lookup made THIS session (tool schema, `--version`, file read, dashboard). If it
  cannot be looked up, write `UNCONFIRMED` next to it. No exceptions.

## Interface trust tiers (verified 2026-07-30 on Claude Code 2.1.220, macOS)

Documented interfaces may be relied on long-term; probed interfaces work today
but carry no contract — note the verified CLI version at every use site and
re-verify after a CLI upgrade.

Not a truth source: `tailscale status` node liveness (a Fortinet-blocked
coordination server lists reachable nodes — including this machine itself — as
"offline"). Own IP: `ifconfig`; remote liveness: an actual SSH probe.

Managed fleet is exactly two nodes: the local workstation and one configured
remote workstation. A third, rarely used machine has a stale `~/.agents` but
is NOT managed — deploys and audits exclude it (user ruling 2026-08-08).
Resolve hostnames, addresses, and SSH users from private machine config; never
publish fleet topology in this public repository.

### Documented (official Hooks reference)
- Hook stdin JSON, all events: `session_id`, `transcript_path` (the session's
  own jsonl), `cwd`, `hook_event_name`, `permission_mode`.
- PreToolUse adds `tool_name` + `tool_input`; PostToolUse adds `tool_response`;
  UserPromptSubmit adds `prompt`.
- Hook stdout JSON controls the harness: `permissionDecision: allow|deny|ask`,
  `additionalContext`; exit 2 + stderr is the shorthand deny (stderr is fed
  back to the model).
- These fields are harness-injected — the model only controls
  `tool_input.command`, which is what makes hook gates trustworthy.

### Probed (undocumented, version-pinned)
- Hook stdin `agent_type`: present only when the Bash call runs inside a
  subagent context; absent in the parent session. Basis of the
  tmux-dispatch-gate subagent pass-through. Probe: tmux-agent-tools
  `.workflow/202607261830-dispatch-gate-enforcement/`, CLI 2.1.220.
- Session rename endpoint: `PUT https://api.anthropic.com/v1/code/sessions/
  <cse_id>` with subscription OAuth bearer from Keychain
  (`Claude Code-credentials`) + `anthropic-beta: oauth-2025-04-20`; body
  `{"title":"..."}`. The `cse_…` id lives in the session's own transcript
  jsonl (also reachable via the documented `transcript_path`). Recipe:
  `session-titles.md` §Runtime control, verified against CLI 2.1.220.
- Local title record: `claude-agent-sdk` (pip) `rename_session(uuid, title,
  cwd)` writes the rename into the local jsonl; offline, no cloud effect.

## Honorable mention (not top-3, still real)
- `~/.claude` accumulates junk (5MB `history.jsonl`, paste-cache, session-env).
  Harmless to context but slows audits; prune yearly.
- 12 plugins enabled; user chose to keep all (2026-07-10). Do not disable any
  plugin/output style without an approved diff — the precedence order above is the
  agreed mitigation.

## Open questions — do not guess, do not "helpfully" fill in
- Whether requests auto-routed to Opus 4.8 consume the Fable quota: UNCONFIRMED —
  measure on the claude.ai usage dashboard.
- Post-Fable model lineup and quotas: check `/model` and the usage dashboard at the
  start of any session after 2026-07 before promising the user a specific model.
