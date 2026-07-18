# Worker doctrine — canonical COMMON preamble blocks

Prompt fragments for multi-agent implementation workflows. Not importable (workflow
scripts are self-contained): copy the relevant blocks into your recipe's `COMMON`
template string and fill the `<...>` slots. Harvested from the proven room-* run
family (room-feature-implementation / room-phase2-backends, v0.19→0.20 era).

## 1. Anchoring (start of every worker prompt)

```
Repo: <ROOT>, branch <BRANCH> (already checked out — do NOT switch branches).
AUTHORITATIVE SPEC: <spec path> — read it FULLY before coding; where sections
conflict, the newer/harder section overrides.
```

Key point: pin the branch down with "already checked out, do not switch" language;
the rule for resolving spec conflicts is written into the preamble, not left for
the worker to guess.

## 2. Hard tool mapping

```
HARD tool mapping: file discovery=fd, text search=rg, JSON=jq, YAML=yq.
NEVER use find/grep/sed/awk/ag/ack.
All JSON output strictly via jq -n --arg/--argjson (printf-assembled JSON is forbidden).
```

## 3. Language traps (zsh version; list "known pitfalls hit before" in this format for other languages)

```
Known zsh traps you MUST respect:
(1) never re-declare 'local' inside a loop; hoist above the loop.
(2) under set -e, 'out=$(cmd); rc=$?' never runs the error path — use:
    out="$(cmd)" && rc=0 || rc=$?
(3) guard every flag parser taking a value:
    (( $# < 2 )) && { echo "...requires a value" >&2; return 2; }
(4) empty-dir globs need (N) nullglob.
```

Key point: these traps are **pitfalls actually hit in this codebase**, not generic
lint rules — every time you harvest a new one, add it to that language's trap list.

## 4. Scope fence

```
Hard invariants: surgical changes only; no new deps (<allowed list> allowed, already
deps); do not touch <protected code paths>; exit codes <the repo's contract>.
Do NOT edit <out-of-scope area>; if you find a bug there, report it in
decisions_not_in_spec instead of fixing.
```

Key point: "found a bug out of scope → report it, don't fix it" is the key sentence
that guards against scope creep.

## 5. Report contract (worker's final output)

```
Your final text is data for the orchestrator, not a human-facing message. Report:
(1) what you changed (files + commit hash),
(2) DECISIONS-NOT-IN-SPEC: bullet list of any judgment calls, deviations, or
    tradeoffs you made that the spec did not dictate,
(3) how you self-verified (commands + results).
```

Paired with a schema (forces the worker to account for out-of-spec decisions, which the orchestrator then audits):

```js
const REPORT_SCHEMA = {
  type: 'object',
  required: ['summary', 'decisions_not_in_spec', 'verification'],
  additionalProperties: false,
  properties: {
    summary: { type: 'string' },
    decisions_not_in_spec: { type: 'array', items: { type: 'string' } },
    verification: { type: 'string' },
  },
}
```

Key point: `decisions_not_in_spec` is the soul of the whole doctrine — no matter how
frozen the spec is, implementation always involves judgment calls; without forcing
the worker to confess them, those deviations slip silently into main.

## 6. Verify wrap-up (fixed shape for the last agent in the chain)

```
Run <all relevant smoke/lint suites>, capturing pass/fail counts. If something
fails, FIX it (respecting the traps above) and re-run until green, committing
fixes. Report final per-suite counts + git log --oneline <base>..HEAD.
```

## Assembly example

```js
const COMMON = `
Repo: ${ROOT}, branch ${BRANCH} (already checked out — do NOT switch branches).
AUTHORITATIVE SPEC: ${SPEC} — read it FULLY before coding.
HARD tool mapping: file discovery=fd, text search=rg, JSON=jq, YAML=yq. NEVER use find/grep/sed/awk/ag/ack.
${ZSH_TRAPS}
Hard invariants: surgical changes only; ${SCOPE_FENCE}
Commit on the current branch with a conventional-commit message; report the commit hash.
Your final text is data for the orchestrator: report changes, DECISIONS-NOT-IN-SPEC, and self-verification.
`
```
