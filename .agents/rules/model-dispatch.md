# Model Dispatch Rules

Read this BEFORE any delegation, model choice, or verification. Written for weak
models: follow it literally; do not improvise around it.

## §1 Verified model table (2026-07-10, Claude Code 2.1.205 — re-verify per §8)

| Agent `model` value | Model ID | Role in this system |
|---|---|---|
| `haiku` | `claude-haiku-4-5-20251001` | Mechanical work: known-pattern batch edits, file listing, read-back checks, format conversion |
| `sonnet` | `claude-sonnet-5` | DEFAULT worker: search, implementation, refactor, research, first-pass review |
| `opus` | `claude-opus-4-8` | Escalation target: hard debugging, design decisions, adversarial review, second opinions |
| `fable` | `claude-fable-5` | Scarce/possibly unavailable later. If the picker rejects it, fall back to `opus` silently — do not stall |

- The Agent tool takes `model` but has NO `effort` parameter. Effort options exist
  only in: (a) `.claude/agents/*.md` frontmatter, (b) `Workflow` scripts via
  `agent(prompt, {effort})` with `low|medium|high|xhigh|max`. Plain Agent calls
  inherit the session effort — that is fine; do not invent an effort field.
- Useful built-in agent types: `Explore` (read-only search), `general-purpose`,
  `Plan`, `pr-review-toolkit:code-reviewer`, `fork` (inherits your full context).
- Codex runtime: the `model` column above is Claude-specific. To pass the
  delegation gate, Codex names its session-native model (e.g. `gpt-5.6-sol`)
  and quotes the applicable §5 task-type row — the task-shape → tier logic is
  runtime-agnostic. If §5 has no exactly-applicable row either, quote the
  nearest row + a one-line deviation note.

## §2 The commander does not do grunt work
The main conversation exists to: decompose tasks, make judgment calls, integrate
results, talk to the user. It does NOT execute bulk work. Delegate or sandbox when
ANY of these is true:
- Reading > 3 files, or you don't know which file holds the answer → `Explore` agent.
- Command output > 20 lines or unpredictable → `ctx_batch_execute` / `ctx_execute`.
- Same edit pattern across ≥ 3 files → one `haiku`/`sonnet` agent per batch.
- Web reading → `ctx_fetch_and_index` or a `sonnet` research agent.
- Non-trivial verification (per §7 threshold) → a fresh agent, never inline "looks good".
Anti-pattern: "it's faster to just read it myself" — that trades permanent context
space for one-time convenience. The only PROJECT files the main conversation reads in
full are files it is about to Edit. Exempt from this economy rule: the routed files
under `~/.agents/rules/` (reading them is mandatory per CLAUDE.md), and any file the
user explicitly tells you to read fully.

## §3 Every delegation carries the assignment triad
Never send a bare instruction. Every subagent prompt contains:
1. GOAL + WHY — what to produce and what the result will be used for (one or two sentences; the "why" lets the agent make sane micro-decisions).
2. ACCEPTANCE CRITERIA — objectively checkable conditions ("all call sites updated and `npm test` exits 0", not "make it work").
3. REPORT FORMAT — exactly what to return (see §4) and where to write artifacts.
Templates with these blanks: `~/.agents/skills/delegation-templates/SKILL.md`.

Never claim that the user requested or explicitly authorized a model unless the
exact model appears in a quoted user message. Naming a runtime or worker
authorizes that runtime only. Reusing an existing teammate authorizes context
reuse, not its current model; an explicit user model choice overrides reuse.
Otherwise describe the worker model as observed state, never user intent.

## §4 Report contract (paste into every subagent prompt)
> Return ONLY: (a) conclusions as short bullets, (b) `file:line` references for every
> claim, (c) verification evidence (command + exit code + key lines) if you changed
> anything. Hard cap 30 lines. Write any longer artifact to a file and return its
> path. Do NOT paste file contents, diffs, or logs into your reply.
Subagents may not spawn further subagents unless told to. If a subagent replies with
a wall of text anyway, extract what you need and do not quote the wall back to the user.

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
| Execution worker | `gpt-5.6-terra`; CLI `gpt-5.6-luna`; explicitly chosen `gpt-5.6-sol`; or an external worker | Terra/Luna start `low`/`medium`, up to `max`; Sol `low`/`medium` only | Keep Sol worker effort below the Sol commander/plan/review tier; increase Terra/Luna effort only while the task remains bounded and well specified |

- Start execution workers at the cheapest capable `low`/`medium` combination.
  Increase Terra/Luna effort one step at a time; `max` is allowed when lower
  effort proved insufficient or the bounded task clearly benefits from deeper
  execution without paying for a Sol worker.
- A blocked worker reports evidence to the Sol commander instead of changing
  its own model tier. The commander first repairs task decomposition or missing
  context, then may raise Terra/Luna effort or choose another external worker.
- A Sol execution worker never exceeds `medium`; Sol `high` and above are
  reserved for commander, plan, and review judgment.
- Native collaboration currently exposes only Terra and Sol. Never request Luna
  there until the live tool schema accepts it; Luna remains valid for CLI workers.
- `ultra` is forbidden. Sol normally stays at `medium`/`high`; use Sol `xhigh`
  only for genuinely major problems, and Sol `max` only rarely with concrete evidence.
- Keep `service_tier=default`; use `priority` only for an explicit latency need.
- Asynchronous external CLI workers MUST transfer wrapper ownership to exactly
  one cheap native supervision sub-agent — Claude: a `general-purpose` sub-agent
  on `haiku` (always mount one); Codex: a native `spawn_agent` sub-agent on
  `gpt-5.6-terra` (`low`/`medium`). Luna is a CLI-worker execution model and is
  not exposed to native collaboration, so the proxy itself never runs Luna.
  Native Agent/sub-agent work needs no proxy (it already has a visible lifecycle
  and completion wakeup). The parent does not poll the worker; the proxy waits on
  the tool-layer blocking supervisor.
  Routine gate receipts are recorded in the workflow/dispatch artifact and are
  user-facing only for a deviation, approval boundary, BLOCK/escalation, or an
  explicit request. Follow-ups under the same role, rubric, and acceptance reuse
  the existing receipt.

Plain Claude Agent calls inherit session effort (no field exists — §1). Where
effort is settable, start low and raise one step at a time from evidence.

## §6 Escalation / de-escalation ladder
- `haiku` errs ONCE on a subtask → redo on `sonnet`. Do not debug haiku's attempt.
- `sonnet` fails the SAME subtask TWICE → escalate to `opus`, passing the complete
  failure trail: what was tried, exact error output, what was ruled out. Never make
  opus rediscover from scratch.
- The moment the hard part is SOLVED (pattern found, root cause identified) →
  de-escalate: hand the recipe + one worked example to `haiku`/`sonnet` for batch
  application. Expensive models never do repetitive application.
- Retry budget: the same approach gets at most 2 rounds total across all models.
  Third failure → stop, apply `rules/judgment-rubrics.md` §4 (wrong-direction
  signals); replan or ask the user. Do not retry a third time with minor tweaks.

## §7 Verification is never done by the author
- Triviality threshold: a single-file, low-risk change is verified by running the
  real command/test and quoting exit code + key lines — no fresh agent needed.
  Everything below applies to multi-file, risky, or user-facing work.
- Files created/edited → read-back by a FRESH agent (`haiku`): confirm each file
  exists, is complete (no truncation, no placeholder text), and matches the stated
  intent. Checklist output: per file PASS/FAIL + reason.
- Code changes → run the tests / build / actual command; quote exit code and key
  lines. If no test exists, run the real flow once (use a verification skill if the
  session's skill list offers one — e.g. Claude Code's `verify` — else drive the flow
  manually; do not assume any skill exists without checking the session's list).
- High-risk judgment (architecture, irreversible ops, user-visible claims) →
  second opinion from a different fresh agent (`opus`), or generate 2–3 candidate
  answers and have a judge agent pick with reasons.
- Above the triviality threshold, the author agent's own "I verified it" claim is NOT
  evidence — fresh context or it didn't happen. (For trivial single-file changes per
  the threshold above, the author-run real command WITH quoted exit code + key lines
  IS the evidence; an unquoted "I verified it" never is, at any threshold.)

## §8 Re-verification of this table
At the first session of each quarter (or when any model call errors with "unknown
model"): check the Agent tool schema enum and `/model`, update §1, and log the change
in `rules/lessons.md`. Never fill model names from memory — Hard Rule.
