# Model Dispatch Rules

- Read before new or follow-up delegation or reviewer-profile changes.
- Skip a reread only when role, rubric, and acceptance stay the same.

## §1 Live model contract

- Resolve tier aliases for the target runtime; verify its model meets the same-line version floor.
- Accept later versions of that model line without a table edit; never dispatch an older version.
- For an unavailable qualifying version, choose another runtime or a same-tier model family.
- `opus` floor: `claude-opus-5-5`; Claude Code alias `opus`.
  Cursor ID: `claude-opus-5-5-<effort>`; agy ID: `claude-opus-5-5-<low|medium|high>`.
- `sonnet` floor: `claude-sonnet-5-5`; Claude Code alias `sonnet`.
  agy ID: `claude-sonnet-5-5-<low|medium|high>`; Cursor's `claude-sonnet-5` does not qualify.
- `fable` floor: `claude-fable-5-1`; Claude Code alias `fable`; no qualifying agy version.
  Cursor's `claude-fable-5` does not qualify and has no ZDR.
- `haiku` floor: `claude-haiku-5-5`; Claude Code alias `haiku`; no Cursor or agy version.
- Use agy only as backup quota for opus and sonnet.
- Default Claude worker: opus high for implementation, refactor, research, and first review.
- Start architecture, hard debugging, and adversarial review at opus high; use xhigh only under §5
  (effort and retry ladder).
- Sonnet 5.5+ and haiku 5.5+: commander may choose implementation, gathering, search, read-back,
  or solved batches; haiku also handles bulk tags, extraction, and web/community scans.
- Keep sonnet and haiku at medium or above; neither may plan, synthesize, revise, or issue verdicts.
- Include scarce fable at low in cost sweeps; use opus if its picker rejects it.
- Do not use haiku 4.x; where haiku is not chosen, use sonnet medium for its former roles.
- For former haiku roles where haiku is not chosen, pass `sonnet` if only `model` is accepted.
- Claude Agent calls accept `model` and `effort` from CC 2.1.292; omitted effort inherits session.
  Agent frontmatter and Workflow `agent(prompt, {effort})` also support effort.
- For phone or device UI work, the commander relays only secrets and hard-stop steps.
- Codex commander: `gpt-6.1-sol` medium; xhigh only for materially large or hard work.
- Codex plan: `gpt-6-astra` medium, ceiling high; xhigh only for major architecture,
  security, or ambiguity.
- Codex review: §4 ladder; Luna xhigh/max at L1 on request, Astra low/medium or Sol medium+ at L2.
  Keep reviewer separate from author; use the seat's tier effort without step-up.
- Codex execution: Luna xhigh/max, explicit Sol medium+, or external.
- Dispatch only `gpt-6.1-sol`, `gpt-6-astra`, or `gpt-6-luna` from the Codex catalog.
- Do not dispatch `gpt-6.1-terra`, other catalog models, or `ultra` effort.
- Keep `service_tier=default`; use `priority` only for an explicit latency need.
- Require concrete evidence for Sol max; never run Sol below medium.
- Read context limits from the live catalog; do not hard-code them.

### Codex multi_agent_v2 spawn contract

- Use `fork_turns="none"` or bounded history for routine delegation to take `[agents]` defaults.
- Use `fork_turns="all"` only for necessary full context; it inherits model and effort,
  cannot override either, and bypasses defaults.
- Count the root in `max_concurrent_threads_per_session`; cap 2 permits one root and one child.
- If concurrent implementer and reviewer are needed, raise `[agents]` and `[features]` together.
- A tmux worker is a fresh CLI root that reads machine config; `fork_turns` does not apply.
- Use per-run `-c` only to depart from machine config, never to restate it.

### Tiers

- When a recipe or brief names a family the runtime lacks, substitute within the same tier
  at the stated effort.
- Do not cross tier rows to save cost.
- A model may occupy several tiers at different efforts; `medium+` means medium or above.
- Best, preferred for plan/verdict: fable low/medium, `gpt-6-astra` low/medium,
  or `gemini-4-argon-low`/`-medium` or later.
- Better, plan/verdict: opus high+ or `gpt-6.1-sol` medium+.
- Exec: opus high, sonnet high+, Sol medium+, Luna xhigh/max,
  `gemini-3.8-flash-medium` or later, or Cursor `grok-4.7-xhigh-fast` or later.
- Basic gathering/mechanical: sonnet medium, haiku high+, Sol medium, or Luna xhigh/max.
- Cheap gathering/mechanical: haiku medium.
- Keep opus high/xhigh for best and sonnet xhigh/max for better inactive until a §8 sweep passes.
- Choose exec seats by remaining Claude Code, Codex, and Cursor quota; agy is backup only.
- Get current-task user approval once for any best-tier seat, including L2, before launch.
  A profile file is not approval; best-tier seats never implement.
- Treat one-shot Sol, Luna, and Grok output with caution; 2–3 rounds may help.
- Give Grok opinions low weight.

## §2 Delegate only when it buys leverage

- The commander decomposes, decides, integrates, and talks to the user.
- Delegate or sandbox for more than three file reads, unknown ownership, isolated synthesis,
  unpredictable output or output over 20 lines, one solved edit across three or more files,
  or independent verification under §6 (reviewer independence).
- Do not delegate one-call facts or work whose coordination costs more than execution.
- Read project files in full only before editing; gate files and user-mandated reads are exempt.
- Run a user-named tool, app, host, or access path in this session, not through a worker that turn.
- For research facts, prices, or sources, keep the commander role even with a named tool;
  route through using-decision-tree loops → `haiku-research-round`.

## §3 Assignment and report contract

- Use the matching delegation-templates shape: GOAL + WHY, checkable ACCEPTANCE, REPORT destination
  and format, runtime-native model, and applicable §4 row; record any nearest-row deviation.
- Claim model authorization only when a quoted user message names it.
- Test rewrite briefs require per-test assertion counts and a zero-`fetch` check in ACCEPTANCE.
  Reject source-substring-grep tests; fewer tests beat hollow shells.
- File deletion or replacement briefs list every behavior to port or explicitly retire.
- Report short conclusions with `file:line` for each claim and a fresh command, exit code,
  and key output for changed work; put longer material in the declared artifact.
- Report unmet acceptance; never conceal it.
- Subagents may delegate only with explicit task authorization.
- For Agent-tool workers, use one worker per round; commit at round end and start a new Agent
  with only the prior REPORT and commit sha.
- Use `SendMessage` only for same-round corrections; stop and replace after a third follow-up.
  `worker-followup-gate.sh` nudges at that threshold.
  Fix rechecks return to the same reviewer under the review ladder.
- Do not continue a worker above 200K context after its current round.
- Use a new visual or end-to-end verifier each round.
- Keep the separate §4 tmux persistent-session contract.

## §4 Role-first selection

- Locate/inventory: sonnet medium gathers, opus/fable synthesizes; Codex uses Luna xhigh.
- Read-only search: use `explore-bounded`, sonnet high, maxTurns 60, with its Bash write gate.
  Set Agent `subagent_type` or recipe `agentType`; never use bare `Explore`.
- Implement/refactor/research: opus high; sonnet/haiku 5.5+ at commander's choice (§1);
  Codex uses Luna xhigh.
- For many-turn implement/refactor work, use `impl-bounded` at opus high with 200K compaction.
  Pass `model` only to change tier.
- Review/verification: use the review ladder below, then stop and ask at its cap.
- Architecture or hard debugging after two evidenced failures: opus or Sol high.
- Apply a solved pattern: sonnet medium or Luna xhigh.
- With the tmux-agent mod, use `mcp__tmux-agent__assign` and §COLLECTOR; no proxy.
- Without it, a proxy runs `assign --detach`; the parent owns the wait under §ONE OWNER.
- Workflow recipes in `~/.claude/workflows/*.workflow.js` override these role choices.
- Except workers, L1/TK, and mechanical seats below, recipe agents use at least opus high.
- Mechanical L0 runners and CLI conduits use sonnet medium; L1/TK uses sonnet high.
- Do not use sonnet/haiku for planning, synthesis, revision, or verdicts.
  Sonnet 5.5+ may run the L1 pre-filter.
- Either 5.5+ tier may implement or gather by commander's call.
- The optional second-model CLI may use any agent-tmux profile different from the author.
  Without it, use a fresh Claude opus agent as the second brain.
- Call advisor before launch, at every gate, and before resume under using-decision-tree
  `references/loops.md` §Contracts.

### Review ladder

- Use the ladder in `consensus-gate` (`layer`, `round`, `freeze`, `l0`) and the build review
  of `spec-implement-dual-review-verify`.
- Other recipes keep their loops pending the designated retro decision; do not claim the ladder.
- L0: run test/build/lint/scrub/grep/checksum only after a tree change since green L0, then hash it.
  Pass L0 before the round; a hash change voids the round; run old-code negative cases once.
- L1: use sonnet high (`pr-review-toolkit:code-reviewer` for code),
  `gemini-3.8-flash-medium` or later, Cursor `grok-4.7-xhigh` or later,
  or Luna xhigh/max on request; cap at two rounds.
- Converge each layer before the next; zero L1 blockers passes with L2 off, else admits work to L2.
- TK, code only: seat `silent-failure-hunter`, `pr-test-analyzer`, `type-design-analyzer`,
  and `comment-analyzer` on sonnet high beside the code reviewer in L1 round 1; cap at one round.
- TK gives a fixed-form full suggestion report; add findings to the ledger for one fixer response.
  TK never passes work; ask `pr-test-analyzer` for tests to merge or delete (Test cost).
- L2: use the commander advisor gate; in-script use best tier low/medium with approval,
  else opus high+ or Sol medium+; code uses `pr-review-toolkit:code-reviewer`.
- L2 gives the final verdict, on request (`l2: true`) or for high risk; cap at three rounds.
- Do not add L3; after L2 round 3 still blocks, stop the gate and ask the user.
- Set risk from all committed, staged, unstaged, and untracked paths against the repo path list.
- Use the highest tier for mixed changes; unknown paths are high; authors may only raise tiers.
- High uses the full ladder, L2 security review, and user approval of the exact diff.
- Normal uses the full ladder; without a path list, treat all work as normal.
- Low is prose docs only; executable, test, skill, rule, and config files cannot be low.
- Keep the full ladder for low until workload evidence supports L0 + L2; cite it before reduction.
- Run the full code ladder once per PR or push checkpoint on the accumulated diff; use L0 between.
- Only L0 agents run checks; reviewers read the output; fixers run the narrowest edit check.
- Finalize reuses the last L0.
- Use a PR or push checkpoint as the review container; freeze `origin/<base>..HEAD` before push.
- Treat merge, push, tag push, release, and deploy as separate events with their own authorization
  and evidence under kernel scope rules; approval covers only named actions and targets.
- Do not ask again for an approved scope.
- Before each event, pass local checks on the candidate repository, commit, and clean tree.
  A later edit voids those checks; checkpoint remote CI never replaces local checks.
- After each event, read its destination and check the remote commit, tag target, release artifact,
  or repo deploy check; record failures as failures.
- Before a second-model gate, read the worker's reviewed commit diff and cite checked `file:line`;
  then call advisor and assign the gate.
- Use `skills/using-workflows/workflows/_lib/worker-doctrine.md` §7–§9.
- Keep one finding ledger across layers and rounds; resolve or retain each finding and judge
  fixer rejections; keep a finding open when L1 reviewers disagree.
- Return fixes to the same reviewer within a layer; tmux keeps its session; in-script agents
  receive the ledger and before/after diff instead of retained context.
- Do not shop for a fresh recheck reviewer (§5); escalation to a new layer is allowed.
- Review of a revised artifact is not a retry of one approach (§5).
- Rerun a void round once; stop with cause after two consecutive voids or two L0 failures.
- Count void rounds and L0 fixes in task calls and tokens.
- Seat Sol only at better-tier L2; keep every seat at its tier effort without a Codex step-up.
- This roster supplies tmux-agent-tools §Safety approval for listed worker tool/model/effort.
  Ask for unlisted choices and for best-tier seats (§1 Tiers) once per task before launch.
- Measure each gate's whole accepted-task cost, latency, L2 rounds, and escaped findings.
  Include all layers, fixers, L0, void rounds, and advisor.
- Compare L1 on/off with the same contracts and L0; use older unmatched evidence as direction only.
- Drop L1 for a gate type if it does not reduce whole-task cost.
- With `mcp__tmux-agent__assign`, follow using-tmux-agent-tools §COLLECTOR for dispatch and wait.
  Use no proxy or parent listener; deadline, cancel, and concurrency rules still apply.
- Without the mod, follow §ONE OWNER for dispatch, wait, pending, and teardown.
- In local Claude Code, a `general-purpose` proxy runs `agent-tmux <cli> assign --detach`
  after setup; the parent uses bounded background `result wait-required` calls.
- Account for local Claude Code foreground calls being reaped at about 600 seconds.
- Do not use parent foreground assign; `tmux-assign-host-gate.sh` denies it.
- Before any delegated wait or poll, set a terminal condition and enforced wall-clock deadline.
- Prefer event-driven or blocking waits; otherwise poll only that condition within the deadline.
- An attempt count is not a deadline; expiry ends the wait; identical restart inputs are a retry.
- On user cancellation, stop named processes and identified descendants, verify, and report first.
- Preserve unrelated work; do not restart cancelled work without renewed authorization.
- Ask whether delegation is needed before launch; warn at over three live subagents, stop at five.
  `subagent-concurrency-gate.sh` uses the SubagentStart/Stop ledger.
- Keep GOAL/ACCEPTANCE/REPORT in Agent briefs; `bol-prompt-gate.sh` enforces them.
- `host-load-gate.sh` checks host load before a local worker; `deploy.sh` wires it into CLI hooks.
- On load warning or denial, first feed a live worker, then do small work inline, then offload
  through `agent-tmux <cli> start-ssh`; remote CLI work bypasses this local gate.
- Next show top CPU/memory processes and ask which to stop; never kill without approval.
- Retry load once later, never in a loop.
- Tune `HOST_LOAD_WARN`, `HOST_LOAD_DENY` as core multiples, and `HOST_LOAD_OFFLOAD_HOST`;
  `HOST_LOAD_GATE=off` disables the load gate.
- Prefer native subagents; use tmux only for another family, an unavailable seat, or a long job
  that must outlive this session.
- Cap live tmux workers at three per host across sessions (`TMUX_WORKER_MAX`).
  `host-load-gate.sh` enforces this on agent-tmux launches and mod assign.
- Stop a worker after reading its result if no follow-up is planned.
- Claude hooks: native `Agent`, shell `Bash`, both PreToolUse.
- Codex hooks: native `collaborationspawn_agent`, shell `Bash`, both PreToolUse `*`.
- Cursor hooks: Task and Shell through cursor-adapt `preToolUse`; no `subagentStart` event.
- agy hooks: `invoke_subagent` and `run_command` through agy-adapt.
- Hook coverage excludes mod/MCP assign, Grok Bot, plain terminals, and later worker load.
  Grok Bot work runs on its box/cloud; approve local execution per app call.
- Load warnings reach Claude, Codex, and Cursor; agy has no context channel and shows only denial.
- Export load thresholds before CLI launch; Cursor hooks also source `~/.zshenv`.
- On Cursor, run bol-prompt-gate on preToolUse Task; its missing start event prevents ledger counts.
- Keep at most three named persistent tmux workers per session across CLIs; ask before more.
- Start each once with assign, send later tasks through the same worker with `send-wait`,
  and normally stop at session end; dispatch each through the same path.
- Use throwaway workers only for trust/repo isolation or genuine parallel fanout.
- Dispatch with assign; do not hand-chain steps or use `--prompt-file` as task delivery.
- Before calling a profile or worker unusable, read
  `skills/tmux-agent-tools/scripts/profiles/README.md`.
  A profile `bin=` may need a bare env override such as `CLAUDE="$(command -v claude)"`.
- Run headless Codex as `codex exec … < /dev/null`.
- Add `--skip-git-repo-check` outside trusted repos.
- Escalate a worker stuck beyond about 15 minutes to the user as a blocker.

## §5 Effort and retry ladder

- Start opus at high, floor high, ceiling high without evidence.
- Start fable at low, floor low, ceiling high without evidence.
- Start sonnet and haiku at medium, floor medium, ceiling high without evidence.
- Adjust effort per task one step at a time; record why under §7 (dispatch records).
- Raise one step for planning, architecture, risky/adversarial review, or root-cause convergence.
  Stop Claude tiers at high unless the xhigh/max condition below holds.
- After an evidenced failure, fix decomposition or missing context first; raise effort only
  as the retry ladder permits, including its required worker-high or advisor jump.
- Lower one step for a solved mechanical batch with a worked example, never below the floor.
  If still too costly at the floor, move to a cheaper tier.
- Use Claude xhigh/max only after two evidenced failures at high or explicit user choice.
  This permits neither a repeated tier nor a fourth round; keep explicit Codex and review efforts.
- Built-in Agent types (`general-purpose`, `Explore`, `Plan`) require explicit `model`;
  omission resolves to opus instead of inheriting the parent.
- For custom definitions, omit `model` to keep model/effort/maxTurns; pass it only for a deliberate
  upgrade, since it overrides the definition.
- Do not treat effort names as equivalent across models; rerun the sweep after a model change.
- Before xhigh/max, prefer bounded same-tier samples plus a judge when cheaper.
- Set effort explicitly in Workflow `agent()` calls; keep Sol medium+ and use the retry ladder.
- Limit one approach to three rounds: worker low/medium → worker high or stronger → second-model
  advisor, such as consensus-gate, with the full trail.
- Never repeat a tier on one approach; count every call toward that goal, regardless of tool name
  (judgment-rubrics §4).
- After a third failure, use judgment-rubrics §4 for a new hypothesis, not a fourth retry.
- Once the hard part is solved, use the cheap execution tier with one worked example.

## §6 Reviewer independence

- For irreversible or outward-facing effects, use an independent verifier under
  judgment-rubrics §2/§2b; classify by effect, not file count.
- File changes need fresh read-back: Claude sonnet medium or a cheap fresh Codex worker.
- Code needs the real test, build, or flow.
- For high-risk judgment, use Claude opus, fresh Codex Astra,
  or 2–3 candidates with a separate judge.
- For reversible changes, the author's real command with quoted exit code and key output suffices
  (judgment-rubrics §2b).
- Read judgment-rubrics §2/§5 before completion or quality reports.

## §7 Dispatch records

- Store role, model, brief, and acceptance in workflow or dispatch artifacts.
- Show users only deviations, approval boundaries, blocks/escalations, or requested details.

## §8 Re-verification

- On each quarter's first session or an unknown-model error, inspect live tool schema and catalog.
- Update the snapshot only from live evidence and record the proposed lesson.
- Never fill model IDs or context limits from memory.
