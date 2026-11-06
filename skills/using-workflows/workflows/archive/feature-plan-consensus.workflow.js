// Reusable recipe: turn a NEW-FEATURE brief into a first-version implementation PLAN,
// run as a SUPERVISED agent orchestration with an escalation ladder and a hard
// evidence/correctness doctrine, gated by two consensus loops before commit.
//
//   Step 0 Orchestrate  -> establish the operating contract (doctrine below)
//   Decompose -> Discover(parallel read-only) -> Synthesize(v1 draft)
//     -> InternalConsensus   (claude critics, adversarial, loop-until-consensus)    <- internal loop
//     -> ExternalReview        (args.cli counterpart second brain, adversarial, loop-until-consensus) <- external loop
//     -> Commit                (write plan; commit/push ONLY when consensus + approved)
//
// ───────────────────────── OPERATING DOCTRINE (Step 0) ─────────────────────────
// ORCHESTRATION: the workflow runtime ("you", the orchestrator brain) delegates each task to a
//   worker, MONITORS the result, and corrects course. Workers are not trusted blindly.
// ESCALATION LADDER (try cheapest capable tier first; climb on repeated failure):
//   opus worker  ->  orchestrator self  ->  args.cli (optional second brain)  ->  surface to USER
//   Authority/trust ranking (high→low):  USER > EXTERNAL(args.cli, when given) >= ORCHESTRATOR(self) > workers.
//   If the top automated tier still cannot satisfy the monitor, DO NOT force-proceed —
//   return needsUser:true and stop short of any commit.
// MODEL POLICY (owner ruling 2026-10-30): floor = opus effort high. Planning, synthesis, revision,
//   critique, and review NEVER run on sonnet. sonnet is allowed ONLY for read-only data gathering
//   (Discover) runs on the explore-bounded definition (sonnet, maxTurns 60, read-only gate) by default; discoverModel overrides it.
//   The second-model CLI is OPTIONAL: no cli → the external loop runs a fresh Claude opus reviewer.
// CORRECTNESS (non-negotiable): truth = source code, logs, and real command output observed THIS run.
//   Memory, existing .md/.html docs, comments, and prior plans are NOT truth — they may be stale;
//   use them only as leads to verify against code. Unverifiable claims become OPEN QUESTIONS, never assertions.
// ───────────────────────────────────────────────────────────────────────────────
//
// Pairs with the `codex-dynamic-workflows` skill: produces a `.workflow/<YYYYMMDDHHMM>-<slug>/` artifact,
// uses disjoint discovery packets, and gates git operations behind explicit args (approval rule).
//
// Invoke reliably via absolute scriptPath (independent of discovery/name):
//   Workflow({ scriptPath: "~/.claude/workflows/feature-plan-consensus.workflow.js", args: {
//     repoPath:   "/abs/path/to/repo",
//     featureBrief: "What the new feature is + goals + product decisions/links (multi-line).",
//     slug:       "coin-wallet-rename",          // .workflow/<YYYYMMDDHHMM>-<slug>/ dir (default 'feature-plan')
//     designRefs: "Figma node-ids / URLs / decisions (optional)",
//     areas:      [{ key, scope }],               // optional: skip auto-decompose
//     maxInternalRounds: 3, maxExternalRounds: 2, // optional
//     workerTries: 1, selfTries: 1,               // optional: per-task escalation budget
//     cli:        "codex",                        // OPTIONAL second-model CLI; absent → fresh Claude opus reviewer
//     escalateExternal: true,                     // optional, default true; only effective when cli is given
//     commit:     false, push: false,             // optional: git gate (= the human approval)
//     model:      "opus", effort: "high",         // optional worker floor (never below opus high)
//     reviewEffort: "high",                       // optional: critics / external reviewer effort
//     discoverModel: "opus"                       // optional: overrides the explore-bounded definition's model for Discover only
//   }})
//
// NOTE: workflow scripts have no FS/shell — only agents do. All reads, writes, git happen in agent() prompts.

export const meta = {
  name: 'feature-plan-consensus',
  description: 'Supervised orchestration: new-feature brief -> v1 plan via escalation ladder + evidence doctrine + internal/second-model consensus, then gated commit',
  whenToUse: 'When a NEW-feature brief must become a v1 implementation plan whose claims are code-verified and double-gated (internal adversarial critics + a second review loop: args.cli when given, else a fresh Claude opus reviewer), with an escalation ladder that surfaces needsUser instead of force-proceeding. Exploratory counterpart of plan-pipeline.',
  phases: [
    { title: 'Orchestrate', detail: 'Step 0: establish supervision doctrine + escalation ladder' },
    { title: 'Decompose', detail: 'split the feature into disjoint discovery areas', model: 'opus' },
    { title: 'Discover', detail: 'parallel read-only Explore per area (code/logs are truth)' },
    { title: 'Model', detail: 'current system state/data flow before the plan', model: 'opus' },
    { title: 'Synthesize', detail: 'merge findings into a v1 plan draft', model: 'opus' },
    { title: 'InternalConsensus', detail: 'adversarial claude critics, revise until consensus', model: 'opus' },
    { title: 'ExternalReview', detail: 'second adversarial review (args.cli if given, else fresh Claude opus), revise until consensus' },
    { title: 'Commit', detail: 'write plan; commit/push only when consensus + approved' },
  ],
}

// NESTING: this is a mid-level stage — do NOT call workflow() here (1-level nesting cap). Drive the
// second model via inline agent() + the tmux-agent mod tools, never via workflow() or a harness agent type.
const a = typeof args === 'string' ? (() => { try { return JSON.parse(args) } catch { return {} } })() : (args || {})
for (const k of ['repoPath', 'featureBrief']) if (!a[k]) return { aborted: true, reason: `missing arg: ${k}` }

const repo = a.repoPath
const model = a.model || 'opus'     // worker floor (user ruling 2026-09-02: never sonnet for plan/synth/revise)
const effort = a.effort || 'high'    // worker effort (default and floor: opus high)
const reviewEffort = a.reviewEffort || 'high'   // critics + second reviewer
const discoverModel = a.discoverModel  // undefined by default: the explore-bounded definition binds model (sonnet); an explicit arg OVERRIDES it (measured 2026-09-04)
// Official agent() opts, listed on every call. Both default OFF:
const isolation = a.isolation === 'worktree' ? 'worktree' : undefined  // spec: only 'worktree' enables; off = omit
const agentType = a.agentType || undefined  // off = default workflow agent (portable; missing custom agentType = HARD error #20931)
const slug = a.slug || 'feature-plan'
if (!/^[a-zA-Z0-9._-]+$/.test(slug) || slug.includes('..')) return { aborted: true, reason: `invalid slug '${slug}' (alnum/._- only, no path traversal)` }
// NOTE: slug is expected to already carry the <YYYYMMDDHHMM>- run-creation-timestamp
// prefix, supplied by the orchestrator via args (Workflow scripts must stay
// deterministic/replayable — Date.now() is banned in-script).
const outDir = `${repo}/.workflow/${slug}`
const planPath = `${outDir}/plan.md`
const maxInternal = Number.isInteger(a.maxInternalRounds) ? a.maxInternalRounds : 3
const maxExternal = Number.isInteger(a.maxExternalRounds) ? a.maxExternalRounds : 2
const workerTries = Number.isInteger(a.workerTries) ? a.workerTries : 1
const selfTries = Number.isInteger(a.selfTries) ? a.selfTries : 1
const lenses = Array.isArray(a.internalLenses) && a.internalLenses.length
  ? a.internalLenses
  : ['completeness (missing areas/tasks/edge cases)', 'sequencing & dependencies', 'risk & blast-radius', 'effort realism']
const designRefs = a.designRefs ? `\nDesign refs / decisions (LEADS to verify, not truth):\n${a.designRefs}` : ''

// The second-model reviewer, WHEN a.cli is given, is a tmux-agent mod worker (assign/tell + await),
// NOT a harness agentType; completion is the mod's await, then the OUT file is read — never the tmux pane.
// cli is OPTIONAL and neutral (user ruling 2026-09-02: never depend on codex). Absent → the external
// loop runs a fresh Claude opus reviewer (independent context, same adversarial prompt).
// charset guard blocks shell injection (cli is interpolated into commands).
if (a.cli != null && !/^[a-z0-9][a-z0-9._-]*$/i.test(a.cli)) return { aborted: true, reason: "invalid arg: cli ('codex' | 'claude' | any agent-tmux profile name, or omit)" }
const cli = a.cli || null
const externalTier = cli || 'claude-opus'
const escalateExternal = !!cli && a.escalateExternal !== false
const cliTimeout = Number.isInteger(a.timeoutSec) ? a.timeoutSec : 900
const cliSession = `fpc-${cli}-${slug}`
const REVIEW_MARKER = '=== SECOND-MODEL REVIEW END ==='
if (a.launchEnv != null) return { aborted: true, reason: 'launchEnv is gone: put the flags in an agent-tmux profile .conf (launch_flags / effort_flags) and pass its name as cli' }
// One CLI worker driven through the tmux-agent mod tools (needs the mod at tmux-agent-tools >= a68ecd4:
// assign/tell + await). Kept byte-close in consensus-gate, plan-pipeline and feature-plan-consensus (scripts
// cannot import). worker = the name an earlier call returned; absent = start a new worker. Launch and effort
// flags live in the agent-tmux profile `profile` names (launch_flags / effort_flags in its .conf).
let dispatchModel = 'none — pre-model code discovery and goal scoping; no product changes'
const modConduit = ({ profile, base, dir, worker, out, marker, timeout, task }) =>
  `Drive a ${profile} worker ONLY with the tmux-agent mod tools: ToolSearch "select:mcp__tmux-agent__assign,mcp__tmux-agent__tell,mcp__tmux-agent__await". Never run agent-tmux through Bash.\n` +
  `The worker's instruction: write the full response to ${out}, ending the file with a line exactly: ${marker}; the result.json summary is one line.\n` +
  (worker
    ? `1. mcp__tmux-agent__tell {name: "${worker}", text: the task below plus that instruction}. worker = "${worker}".\n`
    : `1. mcp__tmux-agent__assign {profile: "${profile}", name: "${base}", dir: the absolute path of ${dir}, brief: "GOAL: " + the task below + that instruction + "\\nMODEL: ${dispatchModel}\\nACCEPTANCE: ${out} ends with the marker line.\\nREPORT: a one-line summary."}. worker = the name the receipt returns (with its suffix).\n`) +
  `2. Call mcp__tmux-agent__await {name: worker, max_seconds: ${Math.min(540, timeout)}} until it returns status success, failed or blocked; after ${Math.max(1, Math.ceil(timeout / 540))} pending calls, stop and report the timeout.\n` +
  `3. Read ${out}; it must end with the marker line. Return worker in the worker field.\n\nTASK:\n${task}`
// One cli worker for the run (escalation rung and external review alike): later calls tell it, so it keeps context.
// null = not started; false = a call returned no worker name, so a second assign would orphan the first.
let cliWorker = null
const cliLost = () => cliWorker === false && (log(`${cli} worker name lost (an earlier call returned none); not assigning a second worker. Check tmux for an orphan.`), true)
// One worker serves one episode at a time: every cli call waits in one queue (in-script tiers stay parallel).
// prompt is a thunk so it reads cliWorker when the call runs. Resolves { lost } or { res }.
let cliQueue = Promise.resolve()
const cliCall = (prompt, o) => {
  const run = cliQueue.then(async () => {
    if (cliLost()) return { lost: true }
    const res = await agent(prompt(), o).catch(e => { cliWorker = cliWorker || false; throw e })
    cliWorker = res?.worker || cliWorker || false
    return { res }
  })
  cliQueue = run.catch(() => {})
  return run
}
const withWorker = (schema) => ({ ...schema, properties: { ...schema.properties, worker: { type: 'string', description: 'the cli worker name' } } })
const driveCli = (taskForCli, out) =>
  `Get a genuine SECOND-MODEL (${cli}) verdict from a tmux-agent mod worker — do NOT use any harness agent type.\n` +
  modConduit({ profile: cli, base: cliSession, dir: repo, worker: cliWorker, out, marker: REVIEW_MARKER, timeout: cliTimeout, task: taskForCli }) +
  `\nBase your answer STRICTLY on ${cli}'s OUT content (you are a conduit, not the reviewer). Keep raw tmux scrollback out.`

// Step 0 — the doctrine, injected into every worker/reviewer prompt.
const EVIDENCE = `CORRECTNESS DOCTRINE (non-negotiable): truth = source code, logs, and real command output you observe THIS run. ` +
  `Do NOT trust memory, existing .md/.html docs, code comments, or prior plans as fact — they may be stale; treat them only as leads to verify against code with rg/fd/Read (and logs/real runs where relevant). ` +
  `If you cannot verify a claim in code/logs, label it an OPEN QUESTION — never assert it.`

const CONTEXT = `Repo: ${repo}.\n${EVIDENCE}\n\nNEW FEATURE BRIEF (a goal to plan toward; verify all "current state" against code):\n${a.featureBrief}${designRefs}`

phase('Orchestrate')
log(`Step 0 doctrine active — ladder: ${model}→self→${externalTier}→user (budget: worker x${workerTries}, self x${selfTries}, external rung ${escalateExternal ? 'on' : 'off'}); models: workers=${model}/${effort}, discover=${discoverModel || 'explore-bounded (def)'}, review=${model}/${reviewEffort}; truth = code/logs only.`)
if (!a.orchestratorModel) log(`note: orchestratorModel unset — the "self" rung inherits the main-loop model; it is a real capability step only if the main loop runs a model above ${model} (else it is a same-model retry).`)

// ───────────────────────── escalation ladder ─────────────────────────
// Delegate a task; MONITOR via verify(); on rejection, climb the ladder, feeding the
// monitor's correction into the next attempt. Returns {result, tier, attempt, ok, needsUser}.
async function runEscalated(label, phaseName, makePrompt, opts = {}) {
  const { schema, verify, workerModel, workerAgentType } = opts
  const rungs = [
    ...Array(workerTries).fill({ tier: workerModel || (workerAgentType || model), model: workerModel || (workerAgentType ? undefined : model), agentType: workerAgentType }),
    ...Array(selfTries).fill({ tier: 'self', model: a.orchestratorModel }), // undefined -> inherit main-loop (you)
  ]
  if (escalateExternal) rungs.push({ tier: cli, driveCli: true })
  let feedback = ''
  let last = null
  for (let i = 0; i < rungs.length; i++) {
    const r = rungs[i]
    const o = { label: `${label}:${r.tier}#${i + 1}`, phase: phaseName, isolation, agentType: r.agentType || agentType }
    if (!r.agentType) o.effort = effort   // a custom definition carries its own effort/model/maxTurns; do not override it here
    if (schema) o.schema = r.driveCli ? withWorker(schema) : schema
    if (r.model) o.model = r.model   // per-tier model (worker / self / cli-driven) — intentionally varies
    const p = makePrompt(feedback, r.tier)
    let res
    if (r.driveCli) {
      const c = await cliCall(() => driveCli(p, `/tmp/${cli}-${label.replace(/[^a-zA-Z0-9._-]/g, '_')}-${i + 1}.md`), o)
      if (c.lost) break
      res = c.res
    } else res = await agent(p, o)
    const v = verify ? await verify(res) : { ok: res != null, feedback: 'empty result' }
    if (v.ok) { log(`${label}: accepted via ${r.tier} (attempt ${i + 1})`); return { result: res, tier: r.tier, attempt: i + 1, ok: true, needsUser: false } }
    last = res
    feedback = `MONITOR REJECTED the previous attempt (tier=${r.tier}): ${v.feedback}\nCorrect course and fix exactly this; do not drift.`
    log(`${label}: ${r.tier} attempt ${i + 1} rejected — ${v.feedback}`)
  }
  log(`${label}: escalation exhausted (top rung ${rungs.at(-1).tier} could not satisfy monitor) — surfacing to user.`)
  return { result: last, tier: 'exhausted', attempt: rungs.length, ok: false, needsUser: true }
}
// P5 quality gate: enforce PLAN_SECTIONS as SECTION LINES (markdown headings / numbered / bold lead),
// not loose body keywords — a plan that merely mentions the words in prose must NOT pass. Paired
// concepts are checked CONJUNCTIVELY (Goal AND success, Scope AND non-goals, Risks AND open-questions).
const sectionLines = (md) => md.split('\n').filter(l => /^\s{0,3}(#{1,6}\s|\d+[.)]\s|\*\*)/.test(l)).join('\n')
const REQUIRED_SECTIONS = [
  { name: 'Goal & success criteria', ok: h => /goal/i.test(h) && /success/i.test(h) },
  { name: 'Scope / non-goals', ok: h => /scope/i.test(h) && /non-?goal/i.test(h) },
  { name: 'Work breakdown (tasks/effort/files)', ok: h => /breakdown|work|task/i.test(h) },
  { name: 'Risks & open questions', ok: h => /risk/i.test(h) && /open question/i.test(h) },
  { name: 'Phased implementation sequence', ok: h => /sequence|phase/i.test(h) },
]
const planOk = (res) => {
  if (typeof res !== 'string' || res.trim().length < 300)
    return { ok: false, feedback: 'plan must be substantial markdown (>=300 chars), grounded in code (not docs).' }
  const h = sectionLines(res)
  const missing = REQUIRED_SECTIONS.filter(s => !s.ok(h)).map(s => s.name)
  if (missing.length)
    return { ok: false, feedback: `plan missing required SECTION(s) (must be markdown headings/numbered, with paired concepts together): ${missing.join('; ')}.` }
  return { ok: true }
}

// ───────────────────────── schemas ─────────────────────────
const DECOMPOSE_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['areas'],
  properties: { areas: { type: 'array', items: {
    type: 'object', additionalProperties: false, required: ['key', 'scope'],
    properties: { key: { type: 'string' }, scope: { type: 'string' }, rationale: { type: 'string' } },
  } } },
}
const DISCOVERY_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['area', 'existing', 'gaps', 'risks'],
  properties: {
    area: { type: 'string' },
    existing: { type: 'array', items: {
      type: 'object', additionalProperties: false, required: ['item', 'files', 'status'],
      properties: { item: { type: 'string' }, files: { type: 'array', items: { type: 'string' } }, status: { type: 'string', enum: ['done', 'partial', 'stub', 'missing'] } },
    } },
    gaps: { type: 'array', items: {
      type: 'object', additionalProperties: false, required: ['task', 'effort'],
      properties: { task: { type: 'string' }, effort: { type: 'string', enum: ['S', 'M', 'L'] }, depends_on: { type: 'string' } },
    } },
    risks: { type: 'array', items: { type: 'string' } },
    open_questions: { type: 'array', items: { type: 'string' }, description: 'claims that could NOT be verified in code/logs' },
  },
}
const CRITIQUE_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['consensus', 'verified_against_code', 'blocking_issues'],
  properties: {
    consensus: { type: 'boolean' },
    verified_against_code: { type: 'boolean', description: 'true only if you checked the plan claims with rg/Read/logs this pass; false otherwise (the gate then rejects consensus).' },
    blocking_issues: { type: 'array', items: {
      type: 'object', additionalProperties: false, required: ['issue', 'severity', 'evidence', 'fix'],
      properties: { issue: { type: 'string' }, area: { type: 'string' }, severity: { type: 'string', enum: ['blocker', 'major', 'minor'] }, evidence: { type: 'string', description: 'REQUIRED: file:line or log excerpt proving the issue (no code evidence = not a valid issue)' }, fix: { type: 'string' } },
    } },
    notes: { type: 'string' },
  },
}
const PLAN_SECTIONS = `Sections: (1) Goal & success criteria, (2) Scope / non-goals, (3) Per-area work breakdown — ordered tasks with effort (S/M/L), touched files, dependencies, (4) Cross-cutting risks & OPEN QUESTIONS, (5) Suggested phased implementation sequence. Every "existing" claim must cite real files; unverifiable items go under Open Questions.`

// ───────────────────────── 1. Decompose ─────────────────────────
phase('Decompose')
let areas = Array.isArray(a.areas) && a.areas.length ? a.areas : null
if (!areas) {
  const dec = await runEscalated('decompose', 'Decompose',
    (fb) => `${CONTEXT}\nScope this feature for parallel discovery. Read the repo's real entry points / route table / module layout (read-only, verify in code) and split into 3-6 DISJOINT, non-overlapping work-areas. Return key + scope (+ rationale).\n${fb}`,
    { schema: DECOMPOSE_SCHEMA, verify: (r) => (r && (r.areas || []).length >= 2) ? { ok: true } : { ok: false, feedback: 'need >=2 disjoint areas grounded in the real module layout.' } }
  )
  if (!dec.ok) return { aborted: true, stage: 'decompose', needsUser: true, dec }
  areas = dec.result.areas
}
log(`areas: ${areas.map(x => x.key).join(', ')}`)

// ───────────────────────── 2. Discover (parallel, read-only) ─────────────────────────
phase('Discover')
async function discoverArea(area) {
  return runEscalated(`discover:${area.key}`, 'Discover',
    (fb) => `READ-ONLY discovery (do NOT edit; use rg/fd/Read on actual code, and logs if relevant).\n${CONTEXT}\n` +
      `Your area: ${area.key} — ${area.scope}\n` +
      `Map from CODE (not docs): existing (item, files, status), gaps (task, effort, depends_on), risks, and open_questions for anything unverifiable. Return the schema.\n${fb}`,
    { schema: DISCOVERY_SCHEMA, verify: (r) => {
      if (!r || !r.area) return { ok: false, feedback: 'missing result — re-probe this area in code.' }
      const ex = r.existing || [], gp = r.gaps || [], oq = r.open_questions || []
      // EVERY claimed "existing" item MUST cite at least one non-empty real file path — no fileless/empty-path claims.
      if (ex.length && !ex.every(e => (e.files || []).some(f => typeof f === 'string' && f.trim().length))) return { ok: false, feedback: 'EVERY "existing" item must cite at least one non-empty real file path found via rg/Read; fileless or empty-path existing claims are ungrounded — fix each, or move it to open_questions.' }
      // greenfield is allowed: existing may be empty as long as gaps or open_questions explain the work/unknowns.
      if (ex.length || gp.length || oq.length) return { ok: true }
      return { ok: false, feedback: 'all sections empty — actually probe the code (rg/fd/Read) and report existing/gaps, or list explicit open_questions for what you could not verify.' }
    }, workerModel: discoverModel, workerAgentType: 'explore-bounded' }   // read-only data gathering: sonnet + maxTurns via global/agents/claude/explore-bounded.md
  ).then(x => x.ok ? x.result : null)
}
const rawFindings = await parallel(areas.map(area => () => discoverArea(area)))
const findings = rawFindings.filter(Boolean)
if (!findings.length) return { aborted: true, stage: 'discover', needsUser: true }
// A failed area is unknown, not empty: keep it visible so the plan cannot silently skip it.
const undiscoveredAreas = areas.filter((x, i) => rawFindings[i] == null).map(x => x.key)
if (undiscoveredAreas.length) log(`WARNING: discovery failed for ${undiscoveredAreas.join(', ')} — passed to synthesis as open questions`)

phase('Model')
const systemModelPath = `${outDir}/system-model.json`
const modelContext = `${CONTEXT}\nDISCOVERY:\n${JSON.stringify(findings)}`
const modelSchema = { type: 'object', additionalProperties: false,
  required: ['path', 'diagram', 'transitions', 'invariants', 'assumptions'],
  properties: { path: { type: 'string' }, diagram: { type: 'string' },
    transitions: { type: 'array', items: { type: 'string' } },
    invariants: { type: 'array', items: { type: 'string' } },
    assumptions: { type: 'array', items: { type: 'string' } } } }
let systemModel = null, modelFeedback = ''
// Same retry in both recipes: worker tier, then opus xhigh; stop before planning on exhaustion.
for (const [attempt, tier] of [{ model, effort }, { model: 'opus', effort: 'xhigh' }].entries()) {
  try {
    systemModel = await agent(
      `${modelContext}\nModel the CURRENT system from code. Return a Mermaid state or data-flow diagram. ` +
      `Give transition IDs, actors, events, guards, effects and file:line. List invariants and assumptions. ` +
      `Include a normal path and a race/failure path. Separate atomic steps from await boundaries. ` +
      `Create the parent directory. Write this JSON result to ${systemModelPath}. Read it back before returning. ` +
      `Overwrite this run artifact on retry. Do not change product code or run a model checker.\n${modelFeedback}`,
      { label: `system-model#${attempt + 1}`, phase: 'Model', ...tier, agentType, schema: modelSchema }
    )
  } catch (error) {
    log(`Model attempt ${attempt + 1} threw: ${error}`)
    systemModel = null
  }
  const text = x => typeof x === 'string' && x.trim().length > 0
  if (systemModel?.path === systemModelPath && text(systemModel.diagram) &&
      [systemModel.transitions, systemModel.invariants].every(xs => Array.isArray(xs) && xs.length && xs.every(text)) &&
      Array.isArray(systemModel.assumptions) && systemModel.assumptions.every(text)) break
  systemModel = null
  modelFeedback = 'Previous Model attempt failed or returned incomplete data. Check code and write every required field.'
  log(`Model attempt ${attempt + 1} rejected: current-system model incomplete`)
}
if (!systemModel) return { stage: 'model', passed: false, aborted: true, needsUser: true, reason: 'current-system model incomplete after two attempts' }
dispatchModel = systemModelPath
const systemModelInput = `\nUse the current-system model below as input, not as a proposed design. Check it against code. Show proposed transitions in the plan and map their IDs to tasks, INV entries and checks. Review the model, the plan and the map together; flag an omitted or contradicted transition. Keep material uncertainty. Do not edit the model while writing or reviewing the plan.\nMODEL: ${systemModelPath}\n${JSON.stringify(systemModel)}\n`

// ───────────────────────── 3. Synthesize v1 draft ─────────────────────────
phase('Synthesize')
const synth = await runEscalated('synthesize', 'Synthesize',
  (fb) => `${CONTEXT}${systemModelInput}\nSynthesize the discovery findings into a FIRST-VERSION implementation plan. ${PLAN_SECTIONS}\n` +
    `Write it to ${planPath} (mkdir -p ${outDir}) AND return the full markdown.\n${fb}\n${undiscoveredAreas.length ? `UNDISCOVERED AREAS (discovery failed — list each as an open question; do NOT plan them from memory): ${undiscoveredAreas.join(', ')}\n` : ''}FINDINGS:\n${JSON.stringify(findings, null, 2)}`,
  { verify: planOk }
)
if (!synth.ok) return { aborted: true, stage: 'synthesize', needsUser: true, synth }
let plan = synth.result

// ───────────────────────── 4. Internal consensus loop ─────────────────────────
phase('InternalConsensus')
const READ_ONLY = 'Read-only: do not edit files or run build, test, lint or any command that writes into the tree.'
// panel[i] = lens i's verdict on the CURRENT plan (null = not judged yet); a plan change resets it.
let panel = lenses.map(() => null)
const runCritics = async (tag) => {
  const todo = lenses.map((l, i) => i).filter(i => panel[i] == null)
  const res = await parallel(todo.map(i => () =>
    agent(
      `${CONTEXT}${systemModelInput}\nAdversarially critique this v1 plan through ONE lens: ${lenses[i]}. ` +
      `VERIFY each "current state" claim against the actual code (rg/Read) — flag any claim that rests on docs/memory rather than code. Set verified_against_code honestly. ` +
      `Be skeptical; default consensus=false if you find a blocker. Each issue needs concrete evidence (file:line / log) and a fix. Skip nitpicks. ${READ_ONLY}\n\nPLAN:\n${plan}`,
      { label: `critic:${String(lenses[i]).split(' ')[0]}#${tag}`, phase: 'InternalConsensus', model, effort: reviewEffort, isolation, agentType, schema: CRITIQUE_SCHEMA }
    )
  ))
  todo.forEach((i, k) => { panel[i] = res[k] || null })
  const critiques = panel.filter(Boolean)
  const missingLenses = lenses.filter((l, i) => panel[i] == null)
  const blocking = critiques.flatMap(c => (c.blocking_issues || []).filter(i => i.severity !== 'minor'))
  const consensus = !missingLenses.length && critiques.every(c => c.consensus && c.verified_against_code === true) && blocking.length === 0
  return { critiques, missingLenses, blocking, consensus }
}
let internalRound = 0, internalConsensus = false
while (internalRound < maxInternal) {
  internalRound++
  const { critiques, missingLenses, blocking, consensus } = await runCritics(internalRound)
  if (!critiques.length) return { aborted: true, stage: 'internal-critics', needsUser: true, round: internalRound } // all critics died -> can't trust convergence
  if (consensus) {
    internalConsensus = true; log(`internal consensus in round ${internalRound}`); break
  }
  // judgment-rubrics §9.2: a dead critic is not a pass — no consensus from a partial panel; the plan is unchanged, so re-run only the missing lenses
  if (missingLenses.length && blocking.length === 0) { log(`internal round ${internalRound}: critic(s) missing for ${missingLenses.join(', ')} -> re-run those critics, no consensus`); continue }
  // a revision on the last round is never judged
  if (internalRound >= maxInternal) { log(`internal round ${internalRound}: ${blocking.length} blocking, last round -> no revise`); break }
  log(`internal round ${internalRound}: ${blocking.length} blocking -> revise`)
  const rev = await runEscalated(`revise-internal#${internalRound}`, 'InternalConsensus',
    (fb) => `${CONTEXT}${systemModelInput}\nRevise the plan to resolve these critic issues; RE-VERIFY each asserted fact in code. Keep structure (${PLAN_SECTIONS}). Overwrite ${planPath}, return full markdown.\n${fb}\nISSUES:\n${JSON.stringify(blocking, null, 2)}\n\nCURRENT PLAN:\n${plan}`,
    { verify: planOk }
  )
  if (!rev.ok) return { aborted: true, stage: 'internal-revise', needsUser: true, round: internalRound }
  plan = rev.result; panel = lenses.map(() => null)
}

// ───────────────────────── 5. External (second-brain) review loop ─────────────────────────
// With a.cli: the counterpart CLI reviews as a tmux-agent mod worker. Without: a FRESH Claude opus agent
// (independent context — it never saw the critics or the revisions) runs the same adversarial prompt.
phase('ExternalReview')
let externalRound = 0, externalConsensus = false
// The gate needs both verdicts: without internal consensus an external round cannot change the outcome.
const externalRounds = internalConsensus ? maxExternal : 0
if (!internalConsensus) log('no internal consensus -> external review skipped')
while (externalRound < externalRounds) {
  externalRound++
  const extPrompt =
    `Act as an INDEPENDENT adversarial reviewer for an implementation PLAN. Repo: ${repo}.\n${EVIDENCE}\n${systemModelInput}` +
    `INDEPENDENTLY verify the plan's "current state" claims with rg/Read and logs/real runs — do not take the plan's or any doc's word for it. Then judge completeness, sequencing, effort realism, and unverified assumptions. ` +
    `Set verified_against_code + default consensus=false unless genuinely sound. Each issue needs evidence (file:line/log) + fix. ${READ_ONLY}\n\nPLAN:\n${plan}`
  const extOpts = { label: `${externalTier}-review#${externalRound}`, phase: 'ExternalReview', model, effort: reviewEffort, isolation, agentType, schema: cli ? withWorker(CRITIQUE_SCHEMA) : CRITIQUE_SCHEMA }
  const c = cli ? await cliCall(() => driveCli(extPrompt, `/tmp/${cli}-extreview-${slug}-${externalRound}.md`), extOpts) : { res: await agent(extPrompt, extOpts) }
  if (c.lost) return { aborted: true, stage: 'external-review', needsUser: true, round: externalRound, reason: 'cli worker name lost' }
  const review = c.res
  if (!review) return { aborted: true, stage: 'external-review', needsUser: true, round: externalRound } // external reviewer (top automated tier) died -> escalate to user
  const blocking = (review.blocking_issues || []).filter(i => i.severity !== 'minor')
  if (review.consensus && review.verified_against_code === true && blocking.length === 0) {
    externalConsensus = true; log(`external consensus in round ${externalRound}`); break
  }
  if (externalRound >= externalRounds) { log(`external round ${externalRound}: ${blocking.length} blocking, last round -> no revise`); break }
  log(`external round ${externalRound}: ${blocking.length} blocking -> revise`)
  const rev = await runEscalated(`revise-external#${externalRound}`, 'ExternalReview',
    (fb) => `${CONTEXT}${systemModelInput}\nThe independent reviewer (${externalTier}) raised these issues; resolve each and RE-VERIFY facts in code/logs. Keep structure. Overwrite ${planPath}, return full markdown.\n${fb}\nISSUES:\n${JSON.stringify(blocking, null, 2)}\n\nCURRENT PLAN:\n${plan}`,
    { verify: planOk }
  )
  if (!rev.ok) return { aborted: true, stage: 'external-revise', needsUser: true, round: externalRound }
  plan = rev.result; panel = lenses.map(() => null)
  // judgment-rubrics §9.1: the internal verdict judged the previous plan; it does not carry over to the revision.
  if (internalConsensus) { internalConsensus = false; log(`external revision #${externalRound} changed the plan — internal consensus no longer applies (needs a re-run on the final plan)`) }
}
// An external revise cleared internalConsensus: re-judge the final plan once with the full panel (no revise after it).
if (externalConsensus && !internalConsensus) {
  internalRound++
  internalConsensus = (await runCritics('final')).consensus
  log(`internal re-run on the final plan: consensus=${internalConsensus}`)
}

// ───────────────────────── 6. Commit (consensus + approval gated) ─────────────────────────
phase('Commit')
// judgment-rubrics §9.2: an undiscovered area is unknown scope, so the plan cannot pass the gate.
const bothConsensus = internalConsensus && externalConsensus && undiscoveredAreas.length === 0
const wantCommit = a.commit === true && bothConsensus
const wantPush = wantCommit && a.push === true
const COMMIT_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['written', 'committed', 'pushed'],
  properties: {
    written: { type: 'boolean', description: 'plan.md + final-report.md actually written' },
    committed: { type: 'boolean' }, pushed: { type: 'boolean' },
    sha: { type: 'string' }, staged_files: { type: 'array', items: { type: 'string' } }, notes: { type: 'string' },
  },
}
const commit = await agent(
  `${CONTEXT}${systemModelInput}\nFinalize the plan artifact in ${outDir}.\n` +
  `1) Ensure final plan markdown is at ${planPath} (mkdir -p ${outDir}); write ${outDir}/final-report.md noting internal consensus=${internalConsensus} (rounds ${internalRound}), external consensus=${externalConsensus} (rounds ${externalRound}).\n` +
  (wantCommit
    ? `2) APPROVED: git add ONLY the artifacts under ${outDir} (verify with 'git status --porcelain' that nothing outside ${outDir} is staged; if anything else is staged, unstage it). Commit "docs(plan): ${slug} v1 implementation plan (internal+external consensus)". ${wantPush ? 'Then push current branch.' : 'Do NOT push.'} Report the staged_files list and commit sha.`
    : `2) Do NOT git add/commit/push — ${bothConsensus ? 'commit not approved (args.commit!=true)' : undiscoveredAreas.length ? `discovery failed for ${undiscoveredAreas.join(', ')}; needs user decision` : 'consensus NOT reached; needs user decision'}. Just confirm files written (committed=false, pushed=false).`) +
  `\nReturn the schema honestly (committed/pushed reflect what you actually did).`,
  { label: 'commit-plan', phase: 'Commit', model, effort: wantCommit ? effort : 'low', isolation, agentType, schema: COMMIT_SCHEMA }
)
// commit agent died -> we have no trustworthy write/commit result; do not silently report false. Surface to user.
if (!commit) return { aborted: true, stage: 'commit', needsUser: true, planPath, internal: { consensus: internalConsensus, rounds: internalRound }, external: { consensus: externalConsensus, rounds: externalRound } }

return {
  systemModelPath,
  planPath,
  areas: areas.map(x => x.key),
  undiscoveredAreas,
  internal: { consensus: internalConsensus, rounds: internalRound },
  external: { consensus: externalConsensus, rounds: externalRound },
  needsUser: !bothConsensus,
  approved: wantCommit,
  committed: commit?.committed === true,
  pushed: commit?.pushed === true,
  commit,
}
