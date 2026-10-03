# Model Dispatch Rules

Read this BEFORE any NEW/FOLLOW-UP delegation or reviewer-profile change; a follow-up under the
same role, rubric, and acceptance needs no re-read.

## §1 Live model contract

Tier aliases are the policy contract; IDs below are a dated snapshot. A later same-tier
successor is valid only after live verification per §8.

| Claude tier | Current ID | Role |
|---|---|---|
| `opus` | `claude-opus-5-5` (live 2026-09-24; API default effort `medium`, effort sweep pending) | DEFAULT worker at effort `medium` (user ruling 2026-09-02): implementation, refactor, research, first review; `high` for architecture, hard debugging, adversarial review |
| `sonnet` | `claude-sonnet-5-5` (live 2026-10-01) | only by explicit arg: implementation or read-only data gathering; effort floor `medium` (user ruling 2026-10-01: at `low` it skips instructions); mechanical search, read-back, solved-pattern batches at `medium` |
| `fable` | `claude-fable-5-1` | scarce; at `low` often beats opus/sonnet on cost per task — include in any sweep; picker rejection falls back to `opus` |

`haiku` RETIRED 2026-08-01 (user decision; repeated miscounts): former haiku roles run as
`sonnet` effort `medium`; where only `model` is accepted, pass `sonnet`. Claude Agent calls take
`model`, not `effort` (plain calls inherit session effort); effort exists in agent frontmatter
and Workflow `agent(prompt, {effort})`.

| Codex role | Model | Start effort | Ceiling/contract |
|---|---|---|---|
| commander | `gpt-6.1-sol` | `medium` | `xhigh` only for materially large/hard work |
| plan | `gpt-6-astra` | `medium` | `high`; `xhigh` only for major architecture/security/ambiguity |
| review/judgment | fresh `gpt-6-astra` | `medium` | reviewer is not the author |
| execution | `gpt-6-luna`; explicit Sol; or external | Luna `xhigh`/`max`; Sol low/medium | Sol workers stop at `medium` |

Codex models: `gpt-6.1-sol`, `gpt-6-astra`, `gpt-6-luna` — no others. `ultra` is forbidden. Keep `service_tier=default`; `priority` only
for an explicit latency need. Sol `max` needs concrete evidence. Never hard-code context-window
values; the live catalog is authoritative.

### Codex multi_agent_v2 spawn contract

Routine delegation spawns with `fork_turns="none"` or bounded history, so the child takes the
`[agents]` defaults. Use `fork_turns="all"` ONLY when the child genuinely needs the whole
conversation: a full-history fork inherits the parent's model AND reasoning effort and cannot
override either — it silently bypasses the defaults. `max_concurrent_threads_per_session` COUNTS
THE ROOT, so the deployed cap of 2 means one root plus one child; raise both the `[agents]` and
`[features]` values together if a task truly needs a concurrent implementer and reviewer.

A tmux worker is NOT a v2 child: `agent-tmux <cli> …` launches a fresh CLI root reading the
machine's own config, so `fork_turns` does not apply and per-run `-c` overrides are for
deliberately departing from that config, never for restating it.

### Cross-family equivalence (user ruling 2026-09-11)

Use when a recipe or brief names one family and the runtime only has the other.
Same row = interchangeable at the stated effort; do not cross rows to "save" cost.

| Codex | Claude | Tier word |
|---|---|---|
| `gpt-6-astra` low / medium | `fable` low / medium | best |
| `gpt-6.1-sol` medium+ | `opus` medium+ | better |
| `gpt-6.1-sol` low · `gpt-6-luna` xhigh / max | `sonnet` high / xhigh / max | basic |
| — | `sonnet` medium | cheap |

### Role tiers (user ruling 2026-09-25)

- Advisor: only `fable` 5.1, `gpt-6-astra`, `opus` 5.5 medium+; prefer them for planning and review.
- Execution: `grok-4.7-xhigh-fast` (Cursor quota) or `opus` 5.5 low/medium (Claude Code or Cursor quota); pick by the quota left.
- Sol, Luna, grok: one-shot output is suspect, 2–3 rounds may fix it; grok opinions carry low weight.

## §2 Delegate only when it buys leverage

The commander decomposes, decides, integrates, and talks to the user. Delegate or sandbox when
any applies: more than three files must be read, ownership is unknown, or synthesis needs an
isolated context; output is unpredictable/over 20 lines; one solved edit repeats across at least
three files; verification exceeds the trivial single-file threshold.

Do not delegate one-tool-call facts or work whose coordination costs exceed execution. Project
files read in full are files about to be edited; gate files and user-mandated reads are exempt.

## §3 Assignment and report contract

Every task uses the matching `delegation-templates` shape and contains: (1) GOAL + WHY;
(2) objectively checkable ACCEPTANCE; (3) REPORT destination and format; (4) runtime-native model
plus the applicable §4 row — nearest row requires a deviation. Never claim the user authorized a
model unless their quoted message names it.

Two packet-shape hard rules (each learned from a real delegation failure):
- A packet that rewrites tests puts per-test assertion count and a zero-`fetch` (no
  source-substring-grep) check in ACCEPTANCE, and states that a DROPPING test count beats a hollow shell.
- A packet that deletes or replaces a file enumerates the behaviours that file owned, as items
  to port or explicitly retire — "route move" is not a description.

> REPORT: short conclusions only; `file:line` per claim; fresh command + exit code + key lines for
> changed work; longer material goes to the declared artifact. Missing
> acceptance is reported, never concealed.

Subagents cannot delegate further unless the task explicitly authorizes it.

## §4 Role-first selection

| Task | Claude | Codex |
|---|---|---|
| locate/inventory | `sonnet` medium; `sonnet` high for synthesis | Luna xhigh |
| read-only search, both factions | `explore-bounded` (sonnet, effort high, maxTurns 60, Bash write-gate hook): Agent tool `subagent_type`, recipe `agentType`. Never bare `Explore`. | — |
| implement/refactor/research | `opus` medium (`sonnet` only by explicit arg, §1) | Luna xhigh |
| review/verification | fresh `opus` medium; risky=`opus` high | fresh Astra medium |
| hard debugging after two evidenced failures / architecture | `opus` | Sol high |
| apply solved pattern | `sonnet` medium | Luna xhigh |
| dispatch external CLI worker | `tmux-agent` mod loaded: `mcp__tmux-agent__assign`, no proxy (`using-tmux-agent-tools` §COLLECTOR). No mod: proxy runs `assign --detach`, the parent owns the wait (`using-tmux-agent-tools` §ONE OWNER) | same |

Workflow recipes (`~/.claude/workflows/*.workflow.js`) override the table above (user ruling
2026-09-02, after the quick-share plan run: 32 agents, 182M input tokens, 64 KB plan, no code in
3.5 h): every recipe agent runs at least `opus` effort `low`; planning, synthesis, revision,
critique, review, and verdicts NEVER run on `sonnet`. `sonnet` is allowed in a recipe only for
implementation or read-only data gathering, and only by explicit arg. The second-model CLI
(`cli`) is optional and NOT codex-specific: any agent-tmux profile (codex, claude fable/opus,
cursor grok, agy) qualifies as the review gate, provided it differs from the author; absent, a
fresh Claude `opus` agent is the second brain. The commander calls `advisor` before launch, at every gate, and before any
resume (skill `using-workflows` §ADVISOR GATE).

`tmux-agent` mod loaded (the tool `mcp__tmux-agent__assign` exists; 2026-10-01 user ruling): dispatch
and wait exactly as `using-tmux-agent-tools` §COLLECTOR says (owner). No proxy, no parent listener.
The deadline, cancel and concurrency rules below bind both.

No mod: dispatch, wait, `pending` handling and teardown follow `using-tmux-agent-tools`
§ONE OWNER (owner). Under local Claude Code (a foreground call is reaped at ~600s) a
`general-purpose` proxy subagent runs `agent-tmux <cli> assign --detach` after `setup`, and the
PARENT owns the wait with bounded background `result wait-required` calls. Parent foreground
`assign`, any form, is gate-denied (`tmux-assign-host-gate.sh`). Incidents behind these rules:
c48c0d3a (2h40m orphaned wait; proxy stood down 12s too late), 2026-08-30 (foreground reaped at
600s, exit 143; agy never saw its result path, so its `pending` was permanent).

Every delegated wait MUST have an explicit terminal condition and an enforced
wall-clock deadline before its first wait or poll call. Prefer a blocking/event-driven
wait; if the tool has none, poll only that condition within the same deadline.
An attempt count alone is not a deadline. Expiry ends that wait; starting it
again with materially identical inputs is a retry.

A user instruction to cancel named work takes effect at once: end its process and its
identified descendants, verify termination, report the result, and only then look at
secondary problems. Preserve unrelated work; never relaunch cancelled work without
renewed authorization.

Concurrency cap (2026-08-21 user ruling; dispatch itself is the top friction source on
record — sessions that delegated drew 26× the corrections of sessions that did not): at most
3 live subagents per session before a warning, hard stop at 5, enforced by the
`subagent-concurrency-gate.sh` PreToolUse hook against the SubagentStart/Stop ledger; a
separate hook, `bol-prompt-gate.sh`, denies any Agent brief missing GOAL/ACCEPTANCE/REPORT.
Ask "must this be delegated?" first.

Host load gate (2026-10-03 user ruling; basic overload control, not a count cap): session
caps do not add up across CLIs and sessions; the machine does. `host-load-gate.sh` checks
host load and memory pressure before a new local worker, wired by `deploy.sh` into every
parent CLI's own hook system. On a deny or warning, in this order: feed a live worker; do it
inline if small; offload with `agent-tmux <cli> start-ssh` (not gated: the CLI runs remote);
show the listed top CPU and memory processes to the user and ask which to stop — some are
needed (simulators, a live browser), never kill without approval; retry once later, never in
a loop. Per-host tuning: `HOST_LOAD_WARN`, `HOST_LOAD_DENY` (× cores),
`HOST_LOAD_OFFLOAD_HOST` (ssh target named in the offload hint); `HOST_LOAD_GATE=off`
disables it.

| Parent CLI | native subagent | `agent-tmux` start/resume/assign in a shell |
|---|---|---|
| Claude | `Agent` (PreToolUse) | `Bash` (PreToolUse) |
| Codex | `collaborationspawn_agent` (PreToolUse `*`) | `Bash` (PreToolUse `*`) |
| Cursor | `preToolUse` Task via cursor-adapt (the CLI never fires `subagentStart`) | `preToolUse` Shell via cursor-adapt |
| agy | `invoke_subagent` via agy-adapt | `run_command` via agy-adapt |

Not covered: the tmux-agent mod/MCP `assign` (mod tools never reach hooks), Grok Bot (work
runs on its box or cloud; local execution is approved per call in the app), launches from a
plain terminal, and load that running workers add later. A warning reaches the model on
Claude, Codex and Cursor; agy PreToolUse has no context channel, so there only the deny
shows. Thresholds come from the env the CLI started with (Cursor hooks also source
`~/.zshenv`): export them before launching it. On the cursor-agent CLI `subagentStart` never
fires, so `bol-prompt-gate` also runs on `preToolUse` Task there; the concurrency cap still
cannot count Cursor subagents (its ledger needs `subagentStart`).

Worker lifecycle (2026-08-18 user ruling): workers are SESSION TEAMMATES, not disposables — they live and die with the session. Team slot cap (user ruling 2026-08-18): at most 3 persistent named workers per session TOTAL across all CLIs — opening more requires the user's explicit request. Bring a worker up once (first task via `assign`), feed every later task to the SAME worker with `send-wait` (each dispatched the same way), `stop` only at session end. Per-task start/stop churn is a defect: it burns bring-up cost and amplifies the upstream Codex FD-leak (lessons 2026-08-18 EMFILE). One-shot throwaway workers are the EXCEPTION, only for isolation (different repo/trust scope) or genuine parallel fanout.

tmux worker mechanics (highest-frequency real-world failure, re-hit by ≥4 sessions):
- Dispatch is `assign` — never hand-chain the steps. A worker started with `--prompt-file` sits idle with no task; the symptom mimics an account/auth hang (`assign` makes that shape impossible and catches "task never reached the CLI").
- Before declaring any profile/worker unusable: read `skills/tmux-agent-tools/scripts/profiles/README.md` (bin= may need a bare env override such as `CLAUDE="$(command -v claude)"`).
- Headless codex: always `codex exec … < /dev/null` (add `--skip-git-repo-check` outside a trusted repo) or it hangs on stdin.
- A worker stuck longer than ~15 min escalates to the user as a blocker.

## §5 Effort and retry ladder

| Effort | Use |
|---|---|
| `low` | `opus`/`fable` mechanical execution (never `sonnet`: floor `medium`, §1) |
| `medium` | default implementation, refactor, research, first review |
| `high` | planning, risky/adversarial review, root-cause convergence |
| `xhigh`/`max` | only after two evidenced lower-tier failures or explicit user choice |

`model` on an `Agent` call, two cases (both measured 2026-09-04):
- Built-in `subagent_type` (`general-purpose`, `Explore`, `Plan`): `model` is REQUIRED.
  Omitting it does NOT inherit the parent (fable parent, four omitted `Explore` calls,
  opus children); it silently resolves to opus.
- Custom definition (`explore-bounded`, anything under `global/agents/claude/`): OMIT
  `model`. The definition binds model/effort/maxTurns; an explicit `model` on the call
  OVERRIDES it (probe: `explore-bounded` + `model: 'opus'` ran opus). Pass it only to
  upgrade deliberately, never as the "不知道先 opus" default.

Effort names are NOT equivalent across models (Fable 5.1 guide): re-run the sweep when the model
changes. Default worker = `opus` `medium`. Raise one step from failure evidence; first
repair decomposition or missing context. Before `xhigh`/`max`, prefer bounded same-tier sampling
plus a judge when cheaper. Workflow `agent()` calls set effort explicitly. Sol workers never
exceed `medium`; Sol high+ is reserved for the commander.

Same approach: three rounds total, each one tier UP — worker low/medium → worker high (or a
stronger model) → advisor (second model, e.g. `consensus-gate`) with the full trail. The same
tier never runs twice on the same approach. EVERY call at the same goal counts as round N of
that approach — agent, worker, advisor, or `codex exec`, whatever its name (no shopping —
`judgment-rubrics.md` §4). A third failure triggers `judgment-rubrics.md` §4 (new hypothesis),
not a fourth retry. Once the hard part is solved, drop to the cheap execution tier with one worked example.

## §6 Reviewer independence

Above the trivial single-file/low-risk threshold, the author is not the verifier. Files need
fresh read-back (Claude `sonnet` medium; Codex cheap fresh worker); code needs the real
test/build/flow; high-risk judgment needs Claude `opus`, Codex fresh Astra, or 2–3 candidates plus
an independent judge. At the trivial threshold, the author's real command with quoted exit
code/key lines suffices. Completion/quality criteria: `judgment-rubrics.md` §2/§5, read before reporting.

## §7 Dispatch records

Dispatch decisions (role, model, brief, acceptance) live in workflow/dispatch artifacts. Surface
to the user only deviations, approval boundaries, BLOCK/escalations, or explicit requests.

## §8 Re-verification

On the first session of each quarter or any unknown-model error, inspect the live Agent/tool
schema and model catalog. Update the snapshot only from live evidence and record the proposed
lesson; never fill IDs or context limits from memory.
