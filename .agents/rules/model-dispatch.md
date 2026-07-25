# Model Dispatch Rules

Read this BEFORE any delegation, model choice, or verification. Follow it literally.

## §1 Verified model table (2026-07-10, Claude Code 2.1.205 — re-verify per §8)

| Agent `model` value | Model ID | Role in this system |
|---|---|---|
| `haiku` | `claude-haiku-4-5-20251001` | Mechanical work: known-pattern batch edits, file listing, read-back checks, format conversion |
| `sonnet` | `claude-sonnet-5` | DEFAULT worker: search, implementation, refactor, research, first-pass review |
| `opus` | `claude-opus-4-8` | Escalation target: hard debugging, design decisions, adversarial review, second opinions |
| `fable` | `claude-fable-5` | Scarce/possibly unavailable later. If the picker rejects it, fall back to `opus` silently — do not stall |

- Tier aliases (`haiku`/`sonnet`/`opus`/`fable`) are the contract; exact IDs are a
  dated snapshot. A LATER same-tier successor satisfies its row once live-verified
  per §8. Never stall on — or "correct" back to — an outdated pinned ID, and never
  hand-edit an ID without live verification. Same successor rule for §5 Codex names.
- The Agent tool has NO `effort` parameter — effort exists only in
  `.claude/agents/*.md` frontmatter and Workflow `agent(prompt, {effort})` calls
  (`low|medium|high|xhigh|max`). Plain Agent calls inherit session effort; do not
  invent an effort field.
- Useful built-in agent types: `Explore` (read-only search), `general-purpose`,
  `Plan`, `pr-review-toolkit:code-reviewer`, `fork` (inherits your full context).
- Codex runtime: the `model` column is Claude-specific. To pass the delegation gate,
  Codex names its session-native model (e.g. `gpt-5.6-sol`) and quotes the applicable
  §5 task-type row; no exactly-applicable row → nearest row + one-line deviation note.

## §2 The commander does not do grunt work
The main conversation decomposes tasks, makes judgment calls, integrates results,
and talks to the user — it does NOT execute bulk work. Delegate or sandbox when ANY:
- Reading > 3 files, or you don't know which file holds the answer → `Explore` agent.
- Command output > 20 lines or unpredictable → `ctx_batch_execute` / `ctx_execute`.
- Same edit pattern across ≥ 3 files → one `haiku`/`sonnet` agent per batch.
- Web reading → `ctx_fetch_and_index` or a `sonnet` research agent.
- Non-trivial verification (per §7 threshold) → a fresh agent, never inline "looks good".
Anti-pattern: "it's faster to just read it myself" — that trades permanent context
space for one-time convenience. The only PROJECT files read in full are files about
to be Edited. Exempt: `~/.agents/rules/` files and user-mandated full reads.

## §3 Every delegation carries the assignment triad
Never send a bare instruction. Every subagent prompt contains:
1. GOAL + WHY — what to produce and what the result will be used for (one or two sentences; the "why" lets the agent make sane micro-decisions).
2. ACCEPTANCE CRITERIA — objectively checkable conditions ("all call sites updated and `npm test` exits 0", not "make it work").
3. REPORT FORMAT — exactly what to return (see §4) and where to write artifacts.
Templates with these blanks: `~/.agents/skills/delegation-templates/SKILL.md`.

Never claim the user requested or authorized a model unless the exact model
appears in a quoted user message. Naming a runtime or worker authorizes that runtime only;
reusing a teammate authorizes context reuse, not its current model (explicit user
model choice overrides reuse). Otherwise: observed state, never user intent.

## §4 Report contract (paste into every subagent prompt)
> Return ONLY: (a) conclusions as short bullets, (b) `file:line` references for every
> claim, (c) verification evidence (command + exit code + key lines) if you changed
> anything. Hard cap 30 lines. Write any longer artifact to a file and return its
> path. Do NOT paste file contents, diffs, or logs into your reply.
Subagents may not spawn further subagents unless told to. If one replies with a
wall of text anyway, extract what you need; never quote the wall back to the user.

## §5 Role-first model and effort contract

Claude Code uses this task table:

| Task type | Model | Notes |
|---|---|---|
| Locate code / sweep repo / inventory | `haiku`; `sonnet` if synthesis needed | Explore agent type |
| Implement, refactor, or research | `sonnet` | acceptance includes tests or cited sources |
| Review / verification | fresh `sonnet`; risky change `opus` | never the author above §7's triviality threshold |
| Hard debugging (2 failed attempts) or architecture decision | `opus` | include full failure trail |
| Batch-apply a solved pattern | `haiku` | give one worked example in the prompt |
| Supervise an authorized external CLI worker | `general-purpose` sub-agent on `haiku` — always mount exactly one dedicated supervision-only proxy | owns the wrapper; event-driven via the tool-layer blocking supervisor, never polls; escalate to `sonnet` only for live diagnosis (trial from 2026-07-22, review after one week) |

Codex uses this role contract (CLI catalog verified 2026-07-21; native tool
availability must still be checked live):

| Role | Model | Effort | Contract |
|---|---|---|---|
| Main commander | `gpt-5.6-sol` | start `medium` | Integrate, decide, and supervise; reserve `xhigh` for materially large or hard problems |
| Plan | `gpt-5.6-sol` | start `medium` | Raise to `high`; use `xhigh` only for major architecture, security, or ambiguity |
| Review / judgment | fresh `gpt-5.6-sol` | start `medium` | Reviewer is not the author; raise effort only when risk or contradictory evidence requires it |
| Execution worker | `gpt-5.6-terra`; CLI `gpt-5.6-luna`; explicitly chosen `gpt-5.6-sol`; or an external worker | Terra/Luna start `low`/`medium`, up to `max`; Sol `low`/`medium` only | Keep Sol worker effort below the Sol commander/plan/review tier |

- Start workers at the cheapest capable `low`/`medium`; raise Terra/Luna one step
  at a time from evidence, only while the task stays bounded and well specified;
  `max` once lower effort proved insufficient or the bounded task clearly benefits
  from deeper execution without paying for a Sol worker. Sol workers never exceed
  `medium` — Sol `high`+ is reserved for commander/plan/review. A blocked worker
  reports evidence to the commander, who first repairs decomposition or missing
  context, then may raise Terra/Luna effort or choose another external worker.
- Native collaboration exposes only Terra and Sol; never request Luna there until
  the live tool schema accepts it — Luna remains valid for CLI workers. `ultra` is
  forbidden; Sol `xhigh` only for genuinely major problems, `max` only rarely with
  concrete evidence. Keep `service_tier=default`; `priority` only for explicit latency need.
- Asynchronous external CLI workers transfer wrapper ownership to exactly one
  cheap native supervision sub-agent — Claude: `general-purpose` on `haiku`
  (always mount one); Codex: `spawn_agent` on `gpt-5.6-terra` (`low`/`medium`);
  the proxy itself never runs Luna. Native Agent/sub-agent work needs no proxy.
  The parent does not poll; the proxy waits on the tool-layer blocking supervisor.
  Routine gate receipts live in the workflow/dispatch artifact; user-facing only
  for deviation, approval boundary, BLOCK/escalation, or explicit request — and
  then only in the COMPACT one-line form defined in the global Gates section.
  Follow-ups under the same role, rubric, and acceptance reuse the receipt.

## §5.1 Effort ladder (runtime-agnostic, resource-optimization first)

| Tier | Use for | Examples |
|---|---|---|
| `low` | Mechanical execution: batch edits, format conversion, runner/supervision proxies, read-back checks, applying an already-solved pattern | `haiku`+low, Terra low |
| `medium` | Default working tier: implement, refactor, research, first-pass review | `sonnet` (session default), Terra/Sol medium |
| `high` | Judgment tier: planning, risky review, adversarial verification, root-cause convergence | `opus`, Sol high |
| `xhigh`/`max` | Evidence tier: only after low/medium failed twice with a full failure trail, or the user names it | Sol xhigh, Workflow `agent()` effort max |

Rules: start at the LOWEST tier that can pass ACCEPTANCE; each raise is one step,
justified by the previous tier's failure evidence; once the hard part is solved,
drop back down for batch application (§6). Workflow recipe scripts set `effort`
EXPLICITLY on every `agent()` call — inheriting the session tier is forbidden.
Before `xhigh`/`max`, try SAME-tier sampling first: N independent `medium`/`high`
attempts + a judge — often beats one max-effort shot at lower cost (Raschka 2026-07-18).

## §6 Escalation / de-escalation ladder
- `haiku` errs ONCE on a subtask → redo on `sonnet`. Do not debug haiku's attempt.
- `sonnet` fails the SAME subtask TWICE → escalate to `opus` with the complete
  failure trail (what was tried, exact errors, what was ruled out) — never make
  opus rediscover from scratch.
- The moment the hard part is SOLVED (pattern found, root cause identified) →
  de-escalate: hand the recipe + one worked example to `haiku`/`sonnet` for batch
  application. Expensive models never do repetitive application.
- Retry budget: the same approach gets at most 2 rounds total across all models;
  a third failure → stop, apply `rules/judgment-rubrics.md` §4, replan or ask.

## §7 Verification is never done by the author
- Triviality threshold: a single-file, low-risk change is verified by running the
  real command/test and quoting exit code + key lines — no fresh agent needed.
  Everything below applies to multi-file, risky, or user-facing work.
- Files created/edited → read-back by a FRESH agent (`haiku`): each file exists,
  complete (no truncation/placeholders), matches intent; per-file PASS/FAIL + reason.
- Code changes → run the tests / build / actual command; quote exit code and key
  lines. No test → run the real flow once (a session-listed verification skill if
  one exists, else manually — never assume a skill exists without checking).
- High-risk judgment (architecture, irreversible ops, user-visible claims) →
  second opinion from a different fresh agent (`opus`), or generate 2–3 candidate
  answers and have a judge agent pick with reasons.
- Above the triviality threshold, the author's own "I verified it" is NOT
  evidence — fresh context or it didn't happen. (At the trivial threshold the
  author-run command WITH quoted exit code + key lines IS; an unquoted claim never is.)

## §8 Re-verification of this table
First session of each quarter (or on any "unknown model" error): check the Agent
tool schema enum and `/model`, update §1, log the change in `rules/lessons.md`.
Never fill model names from memory — Hard Rule.
