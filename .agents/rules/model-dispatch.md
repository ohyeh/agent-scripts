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
Templates with these blanks: `rules/delegation-templates.md`.

## §4 Report contract (paste into every subagent prompt)
> Return ONLY: (a) conclusions as short bullets, (b) `file:line` references for every
> claim, (c) verification evidence (command + exit code + key lines) if you changed
> anything. Hard cap 30 lines. Write any longer artifact to a file and return its
> path. Do NOT paste file contents, diffs, or logs into your reply.
Subagents may not spawn further subagents unless told to. If a subagent replies with
a wall of text anyway, extract what you need and do not quote the wall back to the user.

## §5 Model selection per task type

| Task type | Model | Notes |
|---|---|---|
| Locate code / sweep repo / inventory | `haiku`; `sonnet` if synthesis needed | Explore agent type |
| Implement a scoped change | `sonnet` | acceptance = tests/build pass |
| Refactor with behavior preserved | `sonnet` | must run existing tests before+after |
| Research / docs reading | `sonnet` | sources cited with URLs or file:line |
| Review / verification | `sonnet` fresh context; `opus` if the change is risky | never the author (above §7's triviality threshold) |
| Hard debugging (2 failed attempts) or architecture decision | `opus` | include full failure trail |
| Batch-apply a solved pattern | `haiku` | give one worked example in the prompt |

Effort: plain Agent calls inherit the session effort (no field exists — §1). Where
effort IS settable (Workflow `agent()`, agent frontmatter): `low` for mechanical
batch stages, `high`/`xhigh` for verify/judge stages.

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
