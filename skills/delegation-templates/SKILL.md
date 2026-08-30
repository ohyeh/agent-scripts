---
name: delegation-templates
description: Fill-in-the-blank prompt templates for delegating work to subagents or tmux workers - SEARCH/LOCATE, IMPLEMENT, REFACTOR, RESEARCH, REVIEW/VERIFY. Invoke BEFORE writing any delegation prompt (Agent tool, agent-tmux worker, or fanout task) so the prompt ships with explicit GOAL, ACCEPTANCE, and REPORT sections instead of a vague ask. Not for deciding WHETHER to delegate or for driving workers after launch (see the tmux-delegate agent and the tmux-agent-tools skill for those).
---

# Delegation Prompt Templates

Fill every `{blank}`. Delete a line only if truly inapplicable — never skip the
ACCEPTANCE or REPORT sections. A delegation without objective acceptance
criteria is a guess you outsourced.

REFERENCES (optional, prefer when they exist): paths to code, tests, rubrics, or
HTML/specs that DEFINE done — a rich reference beats prose restating it. Add a
`REFERENCES:` line to any template below when the task has one.

For non-trivial work, add these filled lines before ACCEPTANCE:

> BUDGET: `{max turns/time/tokens}`. Stop at `{stop condition}`; escalate on
> `{escalation condition}`.
> EXCLUDED PATHS: `{attempted or ruled-out approaches + evidence}`.
> MAIN VERIFICATION: `{fresh evidence the delegator must reproduce before
> accepting done}`.

Common footer — include in EVERY delegation:

> REPORT: return ONLY short conclusion bullets + `file:line` per claim +
> verification evidence if you changed anything. Hard cap 30 lines. Long
> artifacts → write to `{artifact_path}` and return the path. Do not paste file
> contents or logs.
> If you cannot meet an acceptance criterion, say which one and why — do not
> fake it.

## 1. SEARCH / LOCATE  (cheapest capable tier; read-only agent type if available)

```
GOAL: Find {what} in {repo/dir}. This will be used to {why}.
SCOPE: Look in {paths/globs}; also consider {alternative naming/conventions}.
ACCEPTANCE:
- Every match listed as file:line with a one-line role description.
- Explicitly state "no other occurrences" only after checking {N} naming variants: {variants}.
- Zero-result duty: before reporting zero matches, prove each search pattern works on a known positive (or synthetic sample); an unproven zero = UNCONFIRMED, not zero.
NON-GOALS: Do not review quality, do not propose fixes.
```

## 2. IMPLEMENT  (default worker tier)

```
GOAL: Implement {feature/change} in {files/module}. Motivation: {why}.
CONTEXT: {key constraints, existing helpers to reuse, style notes}. Read {files} first.
ACCEPTANCE:
- {objective condition, e.g. "`{test command}` exits 0"}.
- {behavioral condition, e.g. "endpoint returns 403 for expired tokens"}.
- No placeholder text; new non-trivial logic ships with one runnable check.
- Surgical diff: nothing outside {scope} touched.
VERIFY BEFORE REPORTING: run {command}; include exit code + key lines in the report.
```

## 3. REFACTOR  (default worker tier)

```
GOAL: Refactor {target} to {shape}, behavior UNCHANGED. Motivation: {why}.
BASELINE FIRST: run {test command} before touching anything; record the result.
ACCEPTANCE:
- Same test results after as before (attach both).
- Public API/signatures unchanged unless listed here: {allowed changes}.
- No new dependencies; dead code your change created is removed.
STOP CONDITION: if behavior must change to proceed, stop and report — do not decide alone.
```

## 4. RESEARCH  (default worker tier)

```
GOAL: Answer: {question}. The answer will drive {decision}.
SOURCES: prefer {official docs/repo/spec}; treat blogs/forums as secondary.
ACCEPTANCE:
- Every claim cited (URL or file:line). Uncited = label UNCONFIRMED.
- Distinguish "documented" vs "inferred" vs "not found".
- "Not found" duty: prove each search pattern/query works on a known positive before reporting absence; an unproven "not found" = UNCONFIRMED.
- If sources conflict, present both sides — do not silently pick one.
OUTPUT: findings to {artifact_path}; return path + a ≤10-bullet summary.
```

## 5. REVIEW / VERIFY  (fresh context; stronger tier when the change is risky; NEVER the author)

```
GOAL: Adversarially review {diff/files/claim}. Assume it is broken until proven otherwise.
CHECK:
- Claims vs reality: for each stated behavior, find the code or run the command that proves it.
- {task-specific checks: edge cases, error paths, security, contradictions between docs}.
- Files: read back in full; flag truncation, placeholders, broken paths/references.
ACCEPTANCE:
- Verdict per item: PASS / FAIL / UNCONFIRMED + one-line reason + file:line.
- Overall verdict on the last line, exactly one of: VERDICT: PASS | VERDICT: BLOCK.
Do not fix anything; report only.
```

## Dispatch shape A — in-process subagent (Agent tool)

```
Agent({
  subagent_type: "Explore" | "general-purpose" | ...,
  model: "sonnet" | "opus",   // cheapest tier that can pass ACCEPTANCE (haiku retired 2026-08-01; former haiku roles = sonnet at effort low)
  description: "{3-5 words}",
  prompt: "{filled template + common footer}"
})
```

Parallelize independent delegations in one message. Wait for results before
dispatching anything that depends on them.

## Dispatch shape B — tmux worker (agent-tmux <cli>)

```sh
agent-tmux claude assign {safe-name} {repo-dir} {prompt-file}
```

When the delegate is a tmux worker, ADD these lines to the filled template
(they replace nothing — the common footer still applies):

> Do not spawn additional tmux sessions or delegate further.
> WORKER_ARTIFACT: {absolute path} — write your findings to this file.
> When done, write the structured completion (result.json contract,
> schema_version 1) to {absolute result path} — do not rely on
> `$TMUX_AGENT_RESULT` inside tool sandboxes. Put the REPORT bullets in its
> `summary` field.
> If the dispatcher gives an overall deadline, write that valid result at least
> 120 seconds before it; an artifact without it remains UNCONFIRMED.

Embed BOTH paths literally, resolved before dispatch (`agent-tmux <cli> result
--path <name>` computes the result path without starting anything). Do not write
"the path injected into this prompt": prefix injection is best-effort and CAN be
dropped during CLI boot — on 2026-08-30 agy submitted from `# GOAL` alone, never
learned its result path, and its `pending` was therefore permanent.

## Dispatch shape C — supervision proxy brief (typed contract)

The subagent that HOSTS the one blocking `assign` gets this brief verbatim. It is
a fixed schema, not prose; `check-bol-prompt.sh` validates the three declared
fields and nothing else.

```text
PROXY_MODE: agent-tmux-assign
WORKER_ARTIFACT: {absolute path the WORKER writes — the parent reads it, you do not}

GOAL
Run exactly one blocking `agent-tmux {cli} assign {name} {dir} {prompt-file}` call, then report.

ACCEPTANCE
That one call returns. No status/capture/probe/result/second-wait call is made.

REPORT
exit code + status/summary only; do not read or reproduce worker output.
```

This schema is COMPLETE verbatim: no common footer, no tmux addendum, nothing
after the REPORT block (the addendum belongs in the worker packet, shape B).
The REPORT block is FIXED — any edit is denied, including "return the worker's
answer verbatim", which §4 forbids the proxy from doing and which is anyway
unsatisfiable while `result.json` is `pending` (the 2026-08-30 incident).
Findings flow WORKER → `WORKER_ARTIFACT` → parent, never through the proxy.
Known ceiling: an UNMARKED brief bypasses this gate entirely (deliberate — the
alternative denies runbook, review, and debugging briefs that merely quote an
`assign` command). Rule text is the ceiling there.

Write the filled template to a prompt file and pass its path to `assign` — never
interpolate raw task text into the command line. `assign` owns start, submission,
supervision, canonical-result validation, and stop; do not hand-chain them.
Ownership boundaries: this skill owns the prompt body (templates + footers +
addendum). The dispatch shapes above are illustrative carriers showing where
the filled prompt lands — the authoritative rules for deciding WHETHER to
delegate, constructing invocations, and supervising workers after launch live
in the tmux-delegate agent and the tmux-agent-tools skill, and are not
restated here.
