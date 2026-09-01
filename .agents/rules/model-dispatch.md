# Model Dispatch Rules

Read this BEFORE any NEW/FOLLOW-UP delegation or reviewer-profile change; a follow-up under the
same role, rubric, and acceptance needs no re-read.

## §1 Live model contract

Tier aliases are the policy contract; IDs below are a dated snapshot. A later same-tier
successor is valid only after live verification per §8.

| Claude tier | Current ID | Role |
|---|---|---|
| `sonnet` | `claude-sonnet-5` | default implementation, refactor, research, first review; at effort `low` also covers mechanical search, read-back, solved-pattern batches |
| `opus` | `claude-opus-4-8` | architecture, hard debugging, adversarial review |
| `fable` | `claude-fable-5` | scarce; picker rejection falls back to `opus` |

`haiku` RETIRED 2026-08-01 (user decision; repeated miscounts): former haiku roles run as
`sonnet` effort `low`; where only `model` is accepted, pass `sonnet`. Claude Agent calls take
`model`, not `effort` (plain calls inherit session effort); effort exists in agent frontmatter
and Workflow `agent(prompt, {effort})`.

| Codex role | Model | Start effort | Ceiling/contract |
|---|---|---|---|
| commander | `gpt-5.6-sol` | `medium` | `xhigh` only for materially large/hard work |
| plan | `gpt-5.6-sol` | `medium` | `high`; `xhigh` only for major architecture/security/ambiguity |
| review/judgment | fresh `gpt-5.6-sol` | `medium` | reviewer is not the author |
| execution | `gpt-5.6-terra`; CLI `gpt-5.6-luna`; explicit Sol; or external | Terra/Luna low/medium; Sol low/medium | Terra/Luna may rise to `max`; Sol workers stop at `medium` |

Native collaboration exposes Terra and Sol. Luna is the Codex CLI spawned-child default
(`[agents] default_subagent_model`, verified live at codex-cli 0.149.0) — read the live catalog
before requesting it elsewhere. `ultra` is forbidden. Keep `service_tier=default`; `priority` only
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
> changed work. Hard cap 30 lines; longer material goes to the declared artifact. Missing
> acceptance is reported, never concealed.

Subagents cannot delegate further unless the task explicitly authorizes it.

## §4 Role-first selection

| Task | Claude | Codex |
|---|---|---|
| locate/inventory | `sonnet` low; `sonnet` medium for synthesis | Terra low |
| implement/refactor/research | `sonnet` | Terra low/medium; Luna medium |
| review/verification | fresh `sonnet`; risky=`opus` | fresh Sol medium |
| hard debugging after two evidenced failures / architecture | `opus` | Sol high |
| apply solved pattern | `sonnet` low | Terra low |
| dispatch external CLI worker | supervision proxy: `general-purpose` subagent on `sonnet` low hosting the ONE blocking `assign` call | same (proxy hosts the one `assign`) |

Before dispatch, resolve the wrapper bundle, run its `agent-tmux <cli> setup`, stop on failure.
Then dispatch external asynchronous workers with ONE `agent-tmux <cli> assign <name> <dir>
<prompt-file>` call; the sequence it encodes (start → result init → send --from-file → confirm
the pane is processing → one blocking supervise --result-required) IS the supervision. Canonical
host (2026-08-17 user ruling): a supervision proxy — ONE `general-purpose` subagent on `sonnet`
low — owns that single `assign` call, holds its stepwise output, and reports exit code +
status/summary only. Its brief MUST order: run the command FIRST, then report; no
status/capture/probe/result, no reading or judging the worker's output. Proxy failure is judged
ONLY by its terminal report or by evidence the assign never launched the worker (no state dir);
idle/'finished' mailbox heartbeats DURING the blocking assign are noise, never failure
(misread by two sessions, 2026-08-18). Parent foreground `assign` (ALL forms, `--detach`
included — the gate cannot verify the reaping premise) and parent foreground
`status`/`capture`/`probe`/`result` polling are gate-denied (per-worker polling proxy RETIRED
2026-08-08, W32 M5); a fallback harvest runs as a background task, reason logged. Inside a proxy
or background fallback, judge `result --json` as `.present` → `.valid` → `.body.status`, then `stop`.

Every delegated wait MUST have an explicit terminal condition and an enforced
wall-clock deadline before its first wait or poll call. Prefer a blocking/event-driven
wait; if the tool has none, poll only that condition within the same deadline.
An attempt count alone is not a deadline. Expiry ends that wait; starting it
again with materially identical inputs is a retry.

Backgrounded is NOT terminal (measured 2026-08-30): the harness reaps a foreground Bash call at
~600s, and the reaped proxy cannot wait on the task — a subagent has no `TaskOutput` — so it can
only report in-flight. Any non-terminal proxy report is a dispatch PROTOCOL FAILURE, never
supervision and never a reason to idle: the parent OWNS the wait and MUST open the listener
itself, `run_in_background` with `result wait-required <name> --fields <csv> --wait <N> --json`.
Ownership IS the mechanism — a parent-launched background task re-invokes the session on exit,
one orphaned by a terminated subagent notifies nobody (c48c0d3a: 2h40m dead). Measured 2026-08-30:
a parent-owned background task ran 781s to completion, exit 0, and did notify the session, while a
foreground call was reaped at exactly 600s (exit 143) — the ~600s limit binds the FOREGROUND call
only, so a bounded listener longer than 10 minutes is legitimate as a background task. Never pipe the
listener: a trailing `| tail` reports `tail`'s status, so `exit 2` reads as success — judge it by
validated JSON, never by exit code.

`pending` is neither proof of failure nor licence to wait forever; it is a TERMINATING
PROCEDURE. Within the bound, keep waiting. Bound expires still `pending` → re-prompt the worker
ONCE with the literal path from `result --path <name>`, then one more bounded wait. Only then may
a pane capture stand in, always labelled UNCONFIRMED — a scrape is never a verified answer and
never a basis for shipping. `assign` warns `result-path delivery UNCONFIRMED` when it could not
confirm the worker was told that path; a worker that never learned it can NEVER write result.json,
so its `pending` is permanent (2026-08-30: agy dropped both injected prefixes during a 95s boot,
its own transcript proving it never saw the path, and the answer existed only in the pane).
Teardown order is fixed: stand the proxy DOWN BEFORE stopping the worker it supervises — stopping
first strands the proxy on a signal that can no longer arrive (c48c0d3a, 12s apart). And never
brief a proxy to return the worker's output verbatim: §4 forbids it from reading that output, and
when result.json is `pending` the brief is unsatisfiable by any legal means. Have the WORKER write
findings to a declared artifact path and read that file yourself.

Concurrency cap (2026-08-21 user ruling; dispatch itself is the top friction source on
record — sessions that delegated drew 26× the corrections of sessions that did not): at most
3 live subagents per session before a warning, hard stop at 5, enforced by the
`bol-prompt-gate.sh` PreToolUse hook against the SubagentStart/Stop ledger; the same hook
denies any Agent brief missing GOAL/ACCEPTANCE/REPORT. Ask "must this be delegated?" first.

Worker lifecycle (2026-08-18 user ruling): workers are SESSION TEAMMATES, not disposables — they live and die with the session. Team slot cap (user ruling 2026-08-18): at most 3 persistent named workers per session TOTAL across all CLIs — opening more requires the user's explicit request. Bring a worker up once (first task via `assign`), feed every later task to the SAME worker with `send-wait` (each hosted the same way — proxy), `stop` only at session end. Per-task start/stop churn is a defect: it burns bring-up cost and amplifies the upstream Codex FD-leak (lessons 2026-08-18 EMFILE). One-shot throwaway workers are the EXCEPTION, only for isolation (different repo/trust scope) or genuine parallel fanout.

tmux worker mechanics (highest-frequency real-world failure, re-hit by ≥4 sessions):
- Dispatch is `assign` — never hand-chain the steps. A worker started with `--prompt-file` sits idle with no task; the symptom mimics an account/auth hang (`assign` makes that shape impossible and catches "task never reached the CLI").
- Before declaring any profile/worker unusable: read `skills/tmux-agent-tools/scripts/profiles/README.md` (bin= may need a bare env override such as `CLAUDE="$(command -v claude)"`).
- Headless codex: always `codex exec … < /dev/null` (add `--skip-git-repo-check` outside a trusted repo) or it hangs on stdin.
- A worker stuck longer than ~15 min escalates to the user as a blocker; the proxy's blocking wait IS the mechanism.

## §5 Effort and retry ladder

| Effort | Use |
|---|---|
| `low` | mechanical execution, read-back, solved pattern, supervision proxy |
| `medium` | default implementation, refactor, research, first review |
| `high` | planning, risky/adversarial review, root-cause convergence |
| `xhigh`/`max` | only after two evidenced lower-tier failures or explicit user choice |

Start at the lowest tier that can pass acceptance. Raise one step from failure evidence; first
repair decomposition or missing context. Before `xhigh`/`max`, prefer bounded same-tier sampling
plus a judge when cheaper. Workflow `agent()` calls set effort explicitly. Sol workers never
exceed `medium`; Sol high+ is reserved for commander/plan/review.

Same approach: two rounds total across all models, counting every agent dispatched at the same
goal whatever its name (no shopping — `judgment-rubrics.md` §4). Sonnet `low` fails once → Sonnet
`medium`; fails twice → Opus with the full trail; a third failure triggers `judgment-rubrics.md`
§4, not another retry. Once the hard part is solved, drop to the cheap execution tier with one worked example.

## §6 Reviewer independence

Above the trivial single-file/low-risk threshold, the author is not the verifier. Files need
fresh read-back (Claude `sonnet` low; Codex cheap fresh worker); code needs the real
test/build/flow; high-risk judgment needs Claude `opus`, Codex fresh Sol, or 2–3 candidates plus
an independent judge. At the trivial threshold, the author's real command with quoted exit
code/key lines suffices. Completion/quality criteria: `judgment-rubrics.md` §2/§5, read before reporting.

## §7 Dispatch records

Dispatch decisions (role, model, brief, acceptance) live in workflow/dispatch artifacts. Surface
to the user only deviations, approval boundaries, BLOCK/escalations, or explicit requests.

## §8 Re-verification

On the first session of each quarter or any unknown-model error, inspect the live Agent/tool
schema and model catalog. Update the snapshot only from live evidence and record the proposed
lesson; never fill IDs or context limits from memory.
