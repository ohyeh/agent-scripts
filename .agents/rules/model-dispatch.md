# Model Dispatch Rules

Read this BEFORE any NEW/FOLLOW-UP delegation or reviewer-profile change. A follow-up
under the same role, rubric, and acceptance needs no re-read.

## §1 Live model contract

Tier aliases are the policy contract; IDs below are a dated snapshot. A later
same-tier successor is valid only after live verification per §8.

| Claude tier | Current ID | Role |
|---|---|---|
| `sonnet` | `claude-sonnet-5` | default implementation, refactor, research, first review; at effort `low` also covers mechanical search, read-back, solved-pattern batches |
| `opus` | `claude-opus-4-8` | architecture, hard debugging, adversarial review |
| `fable` | `claude-fable-5` | scarce; picker rejection falls back to `opus` |

`haiku` RETIRED 2026-08-01 (user decision; repeated miscounts): all former haiku
roles run as `sonnet` effort `low`; where only `model` is accepted, pass `sonnet`.

Claude Agent calls take `model`, not `effort`; plain calls inherit session effort.
Effort exists in agent frontmatter and Workflow `agent(prompt, {effort})`.

| Codex role | Model | Start effort | Ceiling/contract |
|---|---|---|---|
| commander | `gpt-5.6-sol` | `medium` | `xhigh` only for materially large/hard work |
| plan | `gpt-5.6-sol` | `medium` | `high`; `xhigh` only for major architecture/security/ambiguity |
| review/judgment | fresh `gpt-5.6-sol` | `medium` | reviewer is not the author |
| execution | `gpt-5.6-terra`; CLI `gpt-5.6-luna`; explicit Sol; or external | Terra/Luna low/medium; Sol low/medium | Terra/Luna may rise to `max`; Sol workers stop at `medium` |

Native collaboration currently exposes Terra and Sol; do not request Luna until the
live schema accepts it. `ultra` is forbidden. Keep `service_tier=default`; use
`priority` only for an explicit latency need. Sol `max` is rare and requires concrete
evidence. Never hard-code context-window values; the live catalog is authoritative.

## §2 Delegate only when it buys leverage

The commander decomposes, decides, integrates, and talks to the user. Delegate or
sandbox when any applies:
- more than three files must be read, ownership is unknown, or synthesis needs an
  isolated context;
- output is unpredictable/over 20 lines;
- one solved edit repeats across at least three files;
- verification exceeds the trivial single-file threshold.

Do not delegate one-tool-call facts or work whose coordination costs exceed execution.
Project files read in full are files about to be edited; gate files and user-mandated
reads are exempt.

## §3 Assignment and report contract

Every task uses the matching `delegation-templates` shape and contains:
1. GOAL + WHY.
2. Objectively checkable ACCEPTANCE.
3. REPORT destination and format.
4. Runtime-native model plus the applicable §4 row; nearest row requires a deviation.

Never claim the user authorized a model unless their quoted message names it.

Two packet-shape hard rules (each learned from a real delegation failure):
- A packet that rewrites tests puts per-test assertion count and a zero-`fetch`
  (no source-substring-grep) check in ACCEPTANCE, and states that a DROPPING test
  count beats a hollow shell.
- A packet that deletes or replaces a file enumerates the behaviours that file
  owned, as items to port or explicitly retire — "route move" is not a description.

> REPORT: short conclusions only; `file:line` per claim; fresh command + exit code +
> key lines for changed work. Hard cap 30 lines. Longer material goes to the declared
> artifact. Missing acceptance is reported, never concealed.

Subagents cannot delegate further unless the task explicitly authorizes it.

## §4 Role-first selection

| Task | Claude | Codex |
|---|---|---|
| locate/inventory | `sonnet` low; `sonnet` medium for synthesis | Terra low |
| implement/refactor/research | `sonnet` | Terra low/medium; Luna medium |
| review/verification | fresh `sonnet`; risky=`opus` | fresh Sol medium |
| hard debugging after two evidenced failures / architecture | `opus` | Sol high |
| apply solved pattern | `sonnet` low | Terra low |
| dispatch external CLI worker | one blocking `assign` call (background task, or `general-purpose` on `sonnet` low when foreground timeouts cap the wait) | one blocking `assign` call (same) |

External asynchronous workers are dispatched with ONE
`agent-tmux <cli> assign <name> <dir> <prompt-file>` call. The stepwise sequence it
encodes (start → result init → send --from-file → confirm-the-pane-is-processing →
one blocking supervise --result-required) IS the supervision — the per-worker
supervision-proxy pattern is RETIRED (2026-08-08, W32 M5; user-designed sequence).
Run the single blocking call where a long wait is appropriate: a background task, or
one cheap subagent when the runtime caps foreground timeouts. EXCEPTION — a harness
that reaps long background tasks (local Claude Code: exit-144 kill after ~10 min,
which also takes a tmux server spawned inside the task's tree): dispatch with
`assign --detach` in a short FOREGROUND call (steps 1–4 still verified, returns
immediately), then harvest with bounded `result wait-required --wait <s>` calls.
The parent does not additionally call status/watch/capture/probe/ping or send
follow-ups unless `assign` reports a failed step/blocker or the user asks.

tmux worker mechanics (highest-frequency real-world failure — ≥4 sessions re-hit
this after it was recorded):
- Dispatch is `assign` — never hand-chain the steps. A worker started with
  `--prompt-file` sits idle with no task; the symptom mimics an account/auth hang
  (`assign` makes that shape impossible and catches "task never reached the CLI").
- Before declaring any profile/worker unusable: read
  `skills/tmux-agent-tools/scripts/profiles/README.md` (bin= may need a bare env
  override, e.g. `CLAUDE="$(command -v claude)" agent-tmux <profile-filename> start …`).
- Headless codex: always `codex exec … < /dev/null` (add `--skip-git-repo-check`
  outside a trusted repo) or it hangs on stdin.
- A worker stuck longer than ~15 min escalates to the user as a blocker; silent
  fixed-interval polling is forbidden (the proxy's blocking wait IS the mechanism).

## §5 Effort and retry ladder

| Effort | Use |
|---|---|
| `low` | mechanical execution, read-back, solved pattern, supervision proxy |
| `medium` | default implementation, refactor, research, first review |
| `high` | planning, risky/adversarial review, root-cause convergence |
| `xhigh`/`max` | only after two evidenced lower-tier failures or explicit user choice |

Start at the lowest tier that can pass acceptance. Raise one step from failure
evidence; first repair decomposition or missing context. Before `xhigh`/`max`, prefer
bounded same-tier sampling plus a judge when it is cheaper. Workflow `agent()` calls
set effort explicitly. Sol workers never exceed `medium`; Sol high+ is reserved for
commander/plan/review.

Same approach: two rounds total across all models. Sonnet `low` fails once → Sonnet
`medium`. Sonnet fails the same task twice → Opus with the full trail. A third failure triggers
`judgment-rubrics.md` §4, not another retry. Once the hard part is solved, drop to the
cheap execution tier with one worked example.

## §6 Reviewer independence

Above the trivial single-file/low-risk threshold, the author is not the verifier.
Files need fresh read-back (Claude `sonnet` low; Codex cheap fresh worker); code needs the
real test/build/flow; high-risk judgment needs Claude `opus`, Codex fresh Sol, or
2–3 candidates plus an independent judge. At the trivial threshold, the author's
real command with quoted exit code/key lines is sufficient. Completion and quality
criteria live in `judgment-rubrics.md` §2/§5 and must be read before reporting.

## §7 Dispatch records

Dispatch decisions (role, model, brief, acceptance) live in workflow/dispatch
artifacts. Surface to the user only deviations, approval boundaries,
BLOCK/escalations, or explicit requests.

## §8 Re-verification

On the first session of each quarter or any unknown-model error, inspect the live
Agent/tool schema and model catalog. Update the snapshot only from live evidence and
record the proposed lesson; never fill IDs or context limits from memory.
