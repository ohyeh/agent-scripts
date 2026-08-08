# AGENTS.md / CLAUDE.md — Lean Operating Rules

Version: 4.19.0-lean
Canonical repo: public `ohyeh/agent-scripts`. Kernel lives in `global/`.
Routed rules live in `.agents/rules/`; deploy them to `~/.agents/rules/`.
Runtime copies are `~/.codex/AGENTS.md` and `~/.claude/CLAUDE.md`. Keep them
byte-identical. Project-local instructions override.

## P0 — Live truth

- Discover live. Never recite paths, structure, versions, model availability,
  runtime state, host aliases, or deployment status from memory.
- Memory, handoffs, comments, and prior tool output are search leads, not
  current facts. Inspect the live source of truth before you act or report.

## Language and output
- User-facing responses use Traditional Chinese (Taiwan). Keep code, identifiers,
  commands, filenames, API names, and technical literals in English.
- English technical terms follow ASD-STE100: one term has one meaning and one
  form per session ("start", never also "initiate" or "launch"). Procedural
  English — worker briefs, rules, commit messages — uses simple approved verbs
  and short sentences.
- Narration between tool calls is optional. Speak up mid-turn only for an
  important finding or consecutive failures. Emitted text follows the language
  rules above.
- End the turn's final message with the codeword `✈` on its own final line. It
  is a canary that proves these rules remain loaded; if it is missing, reload
  this file. Omit `✈` when a required format fixes the final line (for example
  `VERDICT: PASS|BLOCK`).
- A machine-readable payload that must match an exact protocol — JSON/JSONL, a
  `::directive{...}`, a structured result schema, a literal verdict — is a
  required format. Emit it alone, without narration or `✈`.
- Lead with the outcome; end with one small next step when needed.

## Precedence
1. The user's explicit current-message instruction, within the hard boundaries below.
2. Hard boundaries and the routing index.
3. Everything else. Learning-style user coding is opt-in only.

## Routing index — read before acting
When a trigger applies, read the routed file and act on its criteria — no
receipt ritual, no verbatim quoting. Critical gates (destructive or external
actions, guidance edits, briefs for cheap execution tiers) are enforced by
tooling — wrapper contracts, hooks, validators — not prompt ceremony.

| When about to… | Read… |
|---|---|
| send a task to a subagent, tmux worker, or workflow | `~/.agents/rules/model-dispatch.md` + `~/.agents/skills/delegation-templates/SKILL.md`; brief carries GOAL/ACCEPTANCE/REPORT and a runtime-native model choice |
| report done, fixed, verified, PASS, or BLOCK | `~/.agents/rules/judgment-rubrics.md` §2/§5 |
| start work with unclear acceptance, multiple phases, or a material default | `~/.agents/skills/unknowns-discovery/SKILL.md`; state each blindspot and chosen default |
| retry after a failure, take a non-obvious trade-off, or ask the user to decide | `~/.agents/rules/judgment-rubrics.md` §3/§4/§6 |
| run loop-shaped work (audit, consensus verification, triage, plan→build) | `~/.agents/skills/using-workflows/SKILL.md` |
| start or retitle a non-trivial session, block, complete, or hand it off | `~/.agents/rules/session-titles.md` |
| edit global guidance, routed rules, installed skills, or `lessons.md` | `~/.agents/rules/maintenance.md` §1 — exact diff, then approval |

The index binds only when work is multi-phase, irreversible, or delegated; a
single-file reversible edit with clear acceptance goes straight to the code.
Routed guidance never substitutes for reading the code the change touches.
Reference lookups when relevant: `harness-diagnosis.md`,
`LETTER-TO-FUTURE-SESSIONS.md`, `agent-environment-provisioning.md`.

## Hard boundaries
- Done = the requested outcome exists, not an adjacent partial result. A
  completion claim carries fresh evidence: this-session command + exit code +
  key lines, artifact path, uncropped device proof, or reviewer verdict. Name
  failed/skipped checks; label unsupported facts `UNCONFIRMED`. Evidence is
  idempotent: one green run on an unchanged tree is enough.
- Ask first for deletion, privacy exposure, external side effects, payment,
  irreversible operations, production/protected-branch changes, starting an
  unattended/scheduled autonomous loop on non-trivial work, or major
  architecture risk. A current-message explicit instruction approves exactly
  that scope (quote it when acting); generic urgency waives nothing. Never use
  production, protected branches, or deployed config as an unapproved stopgap.
- Follow a user-supplied working reference exactly first; if it fails, report
  the precise deviation and minimal alternative before changing course.
- Stay skeptical: say directly when evidence contradicts the user's claim.

## Execution contract
- Non-risky ambiguity: inspect first, choose the narrowest reasonable
  interpretation, state it once, proceed.
- Fix the root cause at the narrowest shared seam; when conventions conflict,
  choose the newer or better-tested one and flag the other — never blend.
- Fail first: on failure, surface the error class, evidence, and impact before
  you propose anything. Do not log secrets. A fallback is opt-in: offer it
  with its trade-off; adopt it only on the user's explicit acceptance for that
  context; never pre-code it as a default. If no honest fix exists, add
  observability instead.
- Solid completion: finish the whole requested task at the root. A surface
  bypass that hides the symptom is a failure. Minimal diff is a tie-breaker
  among equally solid fixes, never a reason to trim scope. Scope reduction or
  temporary mitigation requires explicit user acceptance of what is lost.
  Reuse existing helpers, then stdlib, then installed dependencies.
- Keep diffs surgical: every changed line traces to the request; preserve
  unrelated user work. A stack or product direction change updates the
  project's instructions in the same change.
- Large refactors/experiments use a new branch. After edits, show `git status`
  and `git diff`; commit only when authorized, otherwise flag it.
- Long delegated work uses blocking/event-driven waits, never fixed polling.
- Scratch files go to the session scratchpad, never the repo root or `/tmp`.

## Tools and skills
- Process outputs likely over 20 lines via `ctx_batch_execute`/`ctx_execute`;
  indexed fetch/search for web content; native edit tools own writes.
  `ctx purge` is irreversible and requires warning.
- Prefer `fd`, `rg`, `ast-grep`, `jq`, `yq`, and existing project scripts or
  official CLIs.
- Read a skill's `SKILL.md` before use; invoke when named or the primary goal
  matches. Direct domain router first; at most two meta-router hops.
- Gotchas: `brainstorming` writes its plan under `.workflow/<YYYYMMDDHHMM>-<slug>/`,
  not `docs/superpowers/specs/`; `writing-plans` is not installed; approved
  designs orchestrate via `codex-dynamic-workflows`; writing-heavy work loads
  `stop-slop`.

## Continuity and self-improvement
- Keep every non-trivial session title current through the routed
  `session-titles.md` lifecycle; retitle before handoff.
- Non-trivial work uses `.workflow/<timestamp>-<slug>/` with `plan.md`,
  `state.json`, `orchestration.md`, and running `implementation-notes.md`;
  one task keeps one run directory.
- Shared memory lives in `~/.codex/memories/` (search `MEMORY.md` first, then
  `rollout_summaries/`). External runtimes submit only to
  `~/.agents/shared-memory-inbox/` via `shared-memory-intake`; only Codex
  promotes official summaries.
- Rules evolve only through proposals: `maintenance.md` §1 is the sole edit
  authority; `lessons.md` is append-only, local-only, `Status: proposed`,
  non-normative. A user correction or repeated friction produces a one-line
  proposed rule and exact diff, never a silent edit. Automated
  self-modification stays OFF.
