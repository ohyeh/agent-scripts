// Generic, project-agnostic PLANNING pipeline. Prepares the planning artifacts ONLY —
// it deliberately STOPS before implementation/build. Encodes the four-layer model:
//
//   ① direction (goal_doc)  →  ② frozen plan (plan-<slug>.md)  →  ③ ADR design (docs/adr/NNNN-*)
//   └ then: review → commit → push the prepared DOCS.    ④ build is NOT part of this workflow.
//
// Each artifact is drafted, then frozen only by the review ladder (model-dispatch.md §Review ladder):
//   L0 deterministic: hash the artifact + run args.l0 before every review round; a hash change
//      during the round voids it; an L0 failure goes to the fixer first.
//   L1 pre-filter, ≤2 rounds, cannot freeze: sonnet high and gpt-6-luna xhigh (codex exec, read-only)
//      in parallel, findings merged into one ledger.
//   L2 verdict, always runs: opus at reviewEffort, ≤maxReviewRounds (1–3, default 3).
//   L3 final verdict: fable high, 1 round, only when L2 never reached 0 Critical / 0 Major.
// The drafter (args.cli via agent-tmux, else opus) answers every round under the fixer contract;
// args.cli never reviews its own draft. agent() keeps no session, so each round's reviewer gets the
// whole finding ledger and the before/after snapshot diff in place of kept context.
// MODEL POLICY: drafter floor opus low; sonnet only as an L1 reviewer (user ruling 2026-10-09).
//
// NOTHING is hardcoded to a project: slug, brief, output paths, review settings all come from
// `args`. When driving an external CLI via agent-tmux, completion is detected by POLLING an output file, never
// by matching a marker in the tmux pane (the marker echoes in the sent prompt — a real bug).
//
//   Workflow({ scriptPath: ".claude/workflows/plan-pipeline.workflow.js", args: {
//     repoPath: "/abs/repo",
//     slug: "<slug>",                               // names the plan/direction files
//     brief: "<the topic / feature idea to plan>",  // REQUIRED seed for the direction doc
//     directionPath: ".workflow/<YYYYMMDDHHMM>-<slug>/direction.md",  // ① output (default .workflow/next-direction/<slug>-direction.md)
//     planPath: ".workflow/<YYYYMMDDHHMM>-<slug>/plan.md",            // ② output (default .workflow/next-direction/plan-<slug>.md)
//     adrDir: "docs/adr",                           // ③ output dir (default "docs/adr")
//     maxReviewRounds: 3,                           // L2 rounds per artifact, integer 1–3 (L1 2 and L3 1 are fixed)
//     l0: "scripts/check-docs",                     // OPTIONAL deterministic check run before every review round
//     snapshotDir: "/tmp/plan-pipeline-<slug>",     // pre-fix copies for the reviewer's diff (default shown)
//     cli: "codex",                                 // OPTIONAL drafter CLI via agent-tmux; absent → opus drafter
//     sessionName: "plan-<slug>", model: "opus", effort: "low", reviewEffort: "high", timeoutSec: 1200,
//     skipDirection: false,                         // true → directionPath already exists, start at ②
//     adrs: [{ slug: "external-idp", title: "..." }],// OPTIONAL: force these ADRs; else ② decides which are needed
//     commitPush: true, commitMessage: "docs(plan): freeze <slug> planning artifacts"
//   }})
export const meta = {
  name: 'plan-pipeline',
  description: 'Planning-only pipeline: direction → frozen plan → ADRs, each frozen by the review ladder (L0 → sonnet+luna → opus → fable) → commit/push docs. No build.',
  whenToUse: 'When you need FROZEN planning artifacts (goal_doc → plan-<slug>.md → ADRs), each frozen by the review ladder (model-dispatch.md §Review ladder), committed but deliberately NOT built. Complements project-direction-review (that answers "where next"; this freezes "how"). Build afterwards via spec-implement-dual-review-verify.',
  phases: [
    { title: 'Direction', detail: '① draft/refine goal_doc; review ladder → FROZEN', model: 'opus' },
    { title: 'Plan', detail: '② draft plan-<slug>.md; review ladder → FROZEN', model: 'opus' },
    { title: 'ADRs', detail: '③ draft each needed ADR; review ladder → FROZEN', model: 'opus' },
    { title: 'Integrate', detail: 'commit + push the prepared docs (no build)', model: 'opus' },
  ],
}

// NESTING: this is a mid-level stage — do NOT call workflow() here (1-level nesting cap). Drive
// the optional external CLI (codex/claude/…) via inline agent() + agent-tmux, never via workflow() or a harness agent type.
//
// BUILTIN: arg-channel fallback. This env's Workflow tool drops `args` for scriptPath runs
// (documented gotcha — see .claude handoffs). Keep this {} in the committed/generic copy; to run a
// specific job either fix the arg channel or TEMPORARILY fill BUILTIN, run, then revert to {}.
const BUILTIN = {}
const a = { ...BUILTIN, ...(typeof args === 'string' ? (() => { try { return JSON.parse(args) } catch { return {} } })() : (args || {})) }
const repo = a.repoPath || '.'
const slug = a.slug || 'next'
const brief = a.brief || ''
if (!brief && a.skipDirection !== true) return { aborted: true, reason: 'need brief (the topic to plan) or skipDirection:true with an existing directionPath' }
const directionPath = a.directionPath || `.workflow/next-direction/${slug}-direction.md`
const planPath = a.planPath || `.workflow/next-direction/plan-${slug}.md`
const adrDir = a.adrDir || 'docs/adr'
// The ladder caps are the contract: L2 runs 1–3 rounds at medium+ effort, never 0 and never more.
if (a.maxReviewRounds != null && !(Number.isInteger(a.maxReviewRounds) && a.maxReviewRounds >= 1 && a.maxReviewRounds <= 3)) return { aborted: true, reason: 'invalid arg: maxReviewRounds must be an integer 1–3 (L2 rounds)' }
if (a.reviewEffort != null && !['medium', 'high', 'xhigh', 'max'].includes(a.reviewEffort)) return { aborted: true, reason: 'invalid arg: reviewEffort must be medium|high|xhigh|max (L2 is opus medium+)' }
const maxRounds = a.maxReviewRounds || 3
const session = a.sessionName || `plan-${slug}`
const effort = a.effort || 'medium'    // drafter / driving agent effort (default medium; floor opus low)
const reviewEffort = a.reviewEffort || 'high'   // L2 reviewer effort
const model = a.model || 'opus'     // drafter never sonnet: this recipe is planning (user ruling 2026-09-02)
// Official agent() opts, listed on every call. Both default OFF:
// No isolation: every agent() would get its own worktree, so drafter, fixer, L0 and reviewers would not
// see one another's edits. The ladder runs on one live tree.
if (a.isolation != null) return { aborted: true, reason: 'isolation is not supported: the review ladder needs every agent on the same live tree' }
const agentType = a.agentType || undefined  // off = default workflow agent (portable; missing custom agentType = HARD error #20931)
const timeout = a.timeoutSec || 1200
const l0Cmd = typeof a.l0 === 'string' ? a.l0 : ''   // caller-owned, like launchEnv
const snapDir = a.snapshotDir || `/tmp/plan-pipeline-${slug}`
// Drafter CLI is OPTIONAL and neutral (never depend on codex). Each CLI's launch flags come from its own
// agent-tmux profile; EXTRA flags pass raw via a.launchEnv. charset guard blocks shell injection (cli is interpolated into commands).
if (a.cli != null && !/^[a-z0-9][a-z0-9._-]*$/i.test(a.cli)) return { aborted: true, reason: "invalid arg: cli ('codex' | 'claude' | any agent-tmux profile name, or omit)" }
const cli = a.cli || null
// e.g. a.launchEnv = "CODEX_TMUX_LAUNCH_FLAGS='--yolo -c model_reasoning_effort=high' " — caller-owned passthrough.
const launchEnv = typeof a.launchEnv === 'string' ? a.launchEnv : ''

const STATUS = { type: 'object', additionalProperties: false,
  required: ['ok', 'summary'], properties: { ok: { type: 'boolean' }, summary: { type: 'string' }, detail: { type: 'string' } } }

// _lib/worker-doctrine.md §7/§8, kept byte-close (scripts cannot import).
const REVIEWER_CONTRACT = 'ADVERSARIAL REVIEW. Assume the work is wrong until the evidence says otherwise. Round 1: list EVERY finding now, in one pass; a finding held back for a later round counts as a miss. Each finding: stable id, file:line or command output, severity Critical|Major|Minor, why it is wrong, the concrete fix, the check that proves the fix. A finding without evidence is dropped. Round 2+: you get the finding ledger and the before/after diff of the fix. Report (a) each ledger finding: resolved (with evidence) or still open (not_fixed | partly), and adjudicate every fixer rejection; (b) NEW defects. Mark a new defect fix_caused=true only when the diff shows the fix caused it; a new defect the fix did not cause is a round-1 miss. PASS only with 0 Critical and 0 Major open.'
const FIXER_CONTRACT = 'Address EVERY finding in this pass, Minor included: fix it at the root cause, or reject it with evidence (file:line / command output). Never skip one silently. No surface bypass: no special case, disabled check, weakened test, or suppressed error to make a finding go away. Finish the whole task in scope, not the smallest patch: "surgical" limits WHERE you edit, never WHAT you finish. Before you hand back, run the L0 checks and quote their output. Report per finding: id, fixed | rejected, evidence.'

const DRAFT = { type: 'object', additionalProperties: false,
  required: ['ok', 'path', 'summary', 'actions'],
  properties: {
    ok: { type: 'boolean' },
    path: { type: 'string' },
    requiredAdrs: { type: 'array', items: { type: 'object', additionalProperties: true,
      properties: { slug: { type: 'string' }, title: { type: 'string' }, brief: { type: 'string' } } },
      description: 'ADRs the plan says are needed (plan stage only)' },
    summary: { type: 'string' },
    actions: { type: 'array', description: 'fix rounds: one entry per finding id; [] for the first draft',
      items: { type: 'object', additionalProperties: false, required: ['id', 'action', 'evidence'],
        properties: { id: { type: 'string' }, action: { type: 'string', enum: ['fixed', 'rejected'] }, evidence: { type: 'string' } } } },
  } }
const L0 = { type: 'object', additionalProperties: false, required: ['sha256', 'rc', 'output'],
  properties: { sha256: { type: 'string' }, rc: { type: 'integer' }, output: { type: 'string', description: 'last 40 lines, verbatim' } } }
const FINDING = { type: 'object', additionalProperties: false, required: ['id', 'severity', 'status', 'issue', 'evidence', 'fix', 'check'],
  properties: {
    id: { type: 'string', description: 'the ledger id for a known finding; any new id for a new one' },
    severity: { type: 'string', enum: ['Critical', 'Major', 'Minor'] },
    status: { type: 'string', enum: ['new', 'not_fixed', 'partly'] },
    issue: { type: 'string' }, evidence: { type: 'string', description: 'file:line or real command output' },
    fix: { type: 'string' }, check: { type: 'string', description: 'the check that proves the fix' },
    fix_caused: { type: 'boolean', description: 'new findings only: true when the before/after diff shows the last fix caused it' },
  } }
const VERDICT = { type: 'object', additionalProperties: false, required: ['sha256_start', 'sha256_end', 'open', 'resolved', 'summary'],
  properties: {
    sha256_start: { type: 'string', description: 'shasum -a 256 of the artifact before you read it' },
    sha256_end: { type: 'string', description: 'shasum -a 256 of the artifact after your review' },
    open: { type: 'array', items: FINDING, description: 'every finding still open, known or new' },
    resolved: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'evidence'],
      properties: { id: { type: 'string' }, evidence: { type: 'string' } } } },
    summary: { type: 'string' },
  } }
const LUNA = { type: 'object', additionalProperties: false, required: ['ran', 'error'],
  properties: { ran: { type: 'boolean' }, error: { type: 'string' }, verdict: VERDICT } }

const LADDER = [
  { tier: 'L1', max: 2, freezes: false },   // pre-filter: 0 blockers here only admits the artifact to L2
  { tier: 'L2', max: maxRounds, freezes: true },
  { tier: 'L3', max: 1, freezes: true },    // only reached when L2 never went to 0 Critical / 0 Major
]
const BLOCKING = f => f.severity !== 'Minor'

const freezeArtifact = async (label, phaseName, what, outPath, extra) => {
  const GROUND = 'Ground every claim in real code/files (rg/fd/Read) — do NOT trust memory or stale docs; unverifiable claims go under Open Questions.'
  const base = outPath.replace(/[^A-Za-z0-9._-]/g, '_')
  let calls = 0
  // Drafter / fixer: args.cli through agent-tmux (one OUT per call; `start --exact` exiting 1 means
  // the session is live and is reused), else opus in-script.
  const author = (task, n) => {
    calls++
    const prompt = cli
      ? `Drive ${cli} via agent-tmux in repo ${repo}. If agent-tmux/${cli}-tmux are not on PATH, run them from the tmux-agent-tools skill bundle scripts/ dir.\n` +
        `1. ${launchEnv}agent-tmux ${cli} start --exact ${session} ${repo} "planning task incoming; read fully" — if it exits 1 because the name is live, reuse that session.\n` +
        `2. Send ${cli} this task, and have it write its report to ${snapDir}/${base}-author-${n}.md ending with a line exactly: === AUTHOR END ===\n<<<\n${task}\n>>>\n` +
        `3. Wait by POLLING that file for the marker (NOT the tmux pane — it echoes in the sent prompt), up to ${timeout}s. Return its report in the schema fields.`
      : task
    return agent(prompt, { label: `${label}:${n === 0 ? 'draft' : `fix#${n}`}`, phase: phaseName, model, effort, agentType, schema: DRAFT })
  }
  const runL0 = n => { calls++; return agent(
    `In repo ${repo}: deterministic L0 before a review round. Do not edit any file.\n1. Run \`shasum -a 256 ${outPath}\`; sha256 = the hash.\n2. ${l0Cmd ? `Run \`${l0Cmd}\`; rc = its exit code; output = its last 40 lines verbatim.` : 'No L0 command was given: rc = 0, output = "no l0 command".'}`,
    { label: `${label}:L0#${n}`, phase: phaseName, model, effort: 'low', agentType, schema: L0 }) }   // no isolation: L0 and reviewers read the live tree
  const reviewPrompt = (tier, r, max, ledger, prev) =>
    `${tier} REVIEW, round ${r}/${max} (you did not write this). Repo ${repo}. First run \`shasum -a 256 ${outPath}\`; sha256_start = the hash field only. Read ${outPath} fully, then verify each "current state" claim against the real code. Judge completeness, sequencing, effort realism, unverified assumptions.\n${REVIEWER_CONTRACT}\n` +
    (ledger.length ? `FINDING LEDGER (open findings from earlier rounds and layers, with fixer actions):\n${JSON.stringify(ledger, null, 2)}\n` : 'No earlier findings: this is round 1 for this artifact.\n') +
    (prev ? `Before/after diff of the last fix: run \`diff -u ${prev} ${outPath}\`.\n` : '') +
    `Last step: run \`shasum -a 256 ${outPath}\` again; sha256_end = the hash field only. Do not edit any file.`
  const seatFailed = (who, why) => { log(`${label}: L1 ${who} reviewer did not run (${why})`); return { seatFailed: `${who} did not run: ${why}` } }
  const review = (tier, who, r, max, ledger, prev) => {
    calls++
    const prompt = reviewPrompt(tier, r, max, ledger, prev)
    const opts = { label: `${label}:${tier}${who}#${r}`, phase: phaseName, agentType }
    if (who === 'luna') return agent(
      `Run a gpt-6-luna review with codex, read-only, and return its verdict. Steps:\n1. mkdir -p ${snapDir}; write the review request between <<< >>> below verbatim to ${snapDir}/${base}-luna-r${calls}.in\n` +
      `2. Run: codex exec -m gpt-6-luna -c model_reasoning_effort=xhigh -s read-only -C ${repo} -o ${snapDir}/${base}-luna-r${calls}.out - < ${snapDir}/${base}-luna-r${calls}.in   (timeout ${timeout}s)\n` +
      `3. ran=true and verdict = Luna's verdict mapped onto the schema fields exactly as Luna wrote them (do not add, drop or soften findings). If codex exits non-zero or writes no verdict: ran=false, error = the exit code and last stderr lines.\n` +
      `<<<\n${prompt}\nReturn the verdict as JSON with fields sha256_start, sha256_end, open[], resolved[], summary.\n>>>`,
      { ...opts, model, effort: 'low', schema: LUNA }).then(x => {
      if (x && x.ran && x.verdict) return x.verdict
      return seatFailed('luna', !x ? 'agent null' : x.ran ? 'ran=true, no verdict' : x.error)
    }, e => seatFailed('luna', `threw: ${e}`))
    const m = tier === 'L1' ? ['sonnet', 'high'] : tier === 'L2' ? ['opus', reviewEffort] : ['fable', 'high']
    const v = agent(prompt, { ...opts, model: m[0], effort: m[1], schema: VERDICT })
    // An L1 seat that fails is a logged warning; an L2/L3 reviewer that fails stops the gate (null).
    return tier === 'L1' ? v.then(x => x || seatFailed(who, 'agent null'), e => seatFailed(who, `threw: ${e}`)) : v
  }

  const draft = await author(`In repo ${repo}: DRAFT ${what}. Write the artifact to ${outPath} (create parent dirs). ${GROUND}${extra || ''}\nReturn ok=true once the file is written; path=${outPath}; summary; actions=[].`, 0)
  if (!draft || draft.ok !== true) return { ok: false, frozen: false, path: outPath, rounds: 0, calls, summary: 'drafter failed', blockers: ['drafter returned null or ok=false'], requiredAdrs: draft?.requiredAdrs }
  let requiredAdrs = draft.requiredAdrs, rounds = 0, prev = null, nid = 0
  const ledger = new Map()   // id → finding (+ tier, + fixer action); survives layer changes
  const warnings = []
  const fail = (summary, blockers) => ({ ok: false, frozen: false, path: outPath, rounds, calls, summary, blockers, requiredAdrs, warnings })
  const fix = async (task, n) => {
    const f = await author(`In repo ${repo}: FIX ${what} at ${outPath}. Before editing, run \`mkdir -p ${snapDir} && cp ${outPath} ${snapDir}/${base}-r${n}.prev\`.\n${FIXER_CONTRACT}\n${GROUND}${extra || ''}\n${task}\nReturn ok=true once the file is written; path=${outPath}; summary; actions = one entry per finding id.`, n)
    if (!f || f.ok !== true) return false
    prev = `${snapDir}/${base}-r${n}.prev`
    if (f.requiredAdrs) requiredAdrs = f.requiredAdrs
    for (const act of f.actions || []) { const e = ledger.get(act.id); if (e) e.fixer = { action: act.action, evidence: act.evidence } }
    return true
  }
  for (const [li, L] of LADDER.entries()) {
    let r = 0, voids = 0, l0Fails = 0
    while (r < L.max) {
      const pre = await runL0(rounds + 1)
      if (!pre) return fail('L0 agent failed', ['L0 agent returned null'])
      if (pre.rc !== 0) {   // deterministic failure: fix first, the review round has not started
        if (++l0Fails >= 2) return fail('L0 failed twice in a row', [`L0 rc=${pre.rc}: ${pre.output.slice(-400)}`])
        if (!(await fix(`L0 FAILED (rc=${pre.rc}). Output:\n${pre.output}\nFix the cause; also keep every open ledger finding in mind:\n${JSON.stringify([...ledger.values()], null, 2)}`, rounds + 1))) return fail('drafter failed on an L0 fix', ['drafter returned null or ok=false'])
        continue
      }
      l0Fails = 0
      const known = [...ledger.values()]
      const who = L.tier === 'L1' ? ['sonnet', 'luna'] : ['']
      const verdicts = await parallel(who.map(w => () => review(L.tier, w, r + 1, L.max, known, prev)))
      const ran = verdicts.filter(v => v && !v.seatFailed)
      verdicts.filter(v => v && v.seatFailed).forEach(v => warnings.push(`${L.tier} ${v.seatFailed}`))
      if (!ran.length) return fail(`${L.tier} reviewer failed`, ['reviewer returned null'])
      if (ran.some(v => v.sha256_start !== pre.sha256 || v.sha256_end !== pre.sha256)) {   // artifact moved during the round
        if (++voids >= 2) return fail('artifact changed during review twice', ['void round: sha256 drifted during review'])
        log(`${label}: ${L.tier} round ${r + 1} void (artifact changed during review); rerun`)
        continue
      }
      voids = 0; r++; rounds++
      // Resolutions first, then open findings: when two L1 reviewers disagree, the finding stays open.
      const before = new Map(ledger)
      for (const v of ran) for (const x of v.resolved || []) ledger.delete(x.id)
      for (const v of ran) {
        for (const f of v.open || []) {
          const id = before.has(f.id) ? f.id : `${L.tier}-${++nid}`
          const old = ledger.get(id) || before.get(id)
          ledger.set(id, { ...old, ...f, id, tier: old?.tier || L.tier })
        }
      }
      const open = [...ledger.values()]
      if (!open.some(BLOCKING)) {
        if (L.freezes) return { ok: true, frozen: true, path: outPath, rounds, calls, summary: `${L.tier} verdict: 0 Critical / 0 Major`, blockers: [], minors: open.map(f => `${f.id}: ${f.issue}`), requiredAdrs, warnings }
        break
      }
      if (li === LADDER.length - 1 && r === L.max) break   // last round of the top layer: no reviewer left for a fix
      if (!(await fix(`Findings (ledger, every open one):\n${JSON.stringify(open, null, 2)}`, rounds))) return fail('drafter failed on a fix', ['drafter returned null or ok=false'])
    }
  }
  const open = [...ledger.values()].filter(BLOCKING)
  return { ok: true, frozen: false, path: outPath, rounds, calls, summary: `ladder exhausted (L3 verdict still blocks) with ${open.length} Critical/Major open`, blockers: open.map(f => `${f.id} ${f.severity}: ${f.issue}`), requiredAdrs, warnings }
}

const artifacts = []

// ── ① Direction (goal_doc) ──
let direction = { skipped: true, path: directionPath }
if (a.skipDirection !== true) {
  phase('Direction')
  direction = await freezeArtifact(`direction:${slug}`, 'Direction',
    `the DIRECTION goal_doc for "${slug}" at ${directionPath}. Topic/brief:\n<<<\n${brief}\n>>>\n` +
    `It must list candidate workstreams (goal / why-now / effort S·M·L / risk / readiness), a PRIORITIZED in-scope vs explicitly-deferred split (MECE) with one-line rationale each, the FIRST concrete step, and an "ADR vs direct build" flag per item`,
    directionPath
  )
  if (!direction || direction.frozen !== true) return { stage: 'direction', passed: false, direction, note: 'direction did not freeze' }
  artifacts.push(directionPath)
}

// ── ② Frozen plan ──
phase('Plan')
const plan = await freezeArtifact(`plan:${slug}`, 'Plan',
  `the implementation PLAN at ${planPath}, derived from the direction doc ${directionPath}. ` +
  `Include: goal, success criteria, scope/non-goals, invariants as stable INV-<n> entries (start condition, preserved guarantee, failure condition), a Minimality check (smallest outcome, the simpler alternative considered, why each remaining part is needed), per-area work breakdown (tasks with effort + touched files + deps + a one-line acceptance contract: the exact command/check that must pass, citing the INV-<n> it proves), risks/open-questions, phased sequence, and an explicit "ADR vs direct build" list`,
  planPath,
  `\nAlso: in requiredAdrs[], list every design decision the plan says NEEDS an ADR (slug + title + one-line brief).`
)
if (!plan || plan.frozen !== true) return { stage: 'plan', passed: false, direction, plan, note: 'plan did not freeze CLEAN' }
artifacts.push(planPath)

// ── ③ ADRs (each frozen) ── prefer explicit args.adrs, else what the plan flagged.
const adrList = Array.isArray(a.adrs) && a.adrs.length ? a.adrs : (Array.isArray(plan.requiredAdrs) ? plan.requiredAdrs : [])
const adrResults = []
if (adrList.length) {
  phase('ADRs')
  for (const adr of adrList) {
    const adrPath = `${adrDir}/${adr.slug}.md`  // caller-provided slug should include the NNNN- prefix if their repo uses it
    const r = await freezeArtifact(`adr:${adr.slug}`, 'ADRs',
      `the ADR "${adr.title || adr.slug}" at ${adrPath} (number it per the existing ${adrDir}/ convention if it uses NNNN- prefixes). ` +
      `Decision brief: ${adr.brief || adr.title || adr.slug}. It must follow the format of existing ADRs in ${adrDir}/ and ground every choice in real source line references. This is DESIGN ONLY — no product code`,
      adrPath
    )
    adrResults.push(r || { ok: false, frozen: false, path: adrPath, summary: 'agent returned null' })
    if (r && r.frozen === true) artifacts.push(adrPath)
  }
  const unfrozen = adrResults.filter(r => !r || r.frozen !== true)
  if (unfrozen.length) return { stage: 'adrs', passed: false, direction, plan, adrResults, note: `${unfrozen.length} ADR(s) did not freeze CLEAN` }
}

// ── Integrate: review→commit→push the prepared DOCS (NO build, NO deploy) ──
let integrate = { skipped: true, reason: 'commitPush !== true' }
if (a.commitPush === true) {
  phase('Integrate')
  integrate = await agent(
    `In ${repo}: stage and commit ONLY these prepared planning docs, then push to the current branch's upstream:\n` +
    artifacts.map(p => `  - ${p}`).join('\n') + '\n' +
    `- Commit message: ${a.commitMessage ? JSON.stringify(a.commitMessage) : `"docs(plan): freeze ${slug} planning artifacts"`}. Match this repo's commit conventions (check recent git log; invent nothing it doesn't show).\n` +
    `- Do NOT add any source/test/build files — this is a planning-only commit. Do NOT deploy. Return ok=true with the pushed range in summary.`,
    { label: 'commit-push-docs', phase: 'Integrate', model, effort, agentType, schema: STATUS }
  )
  if (!integrate || integrate.ok !== true) return { stage: 'integrate', passed: false, direction, plan, adrResults, integrate }
}

return {
  passed: true,
  ready_for_build: true,
  stops_before: 'implementation/build (④) — by design',
  artifacts,
  direction, plan, adrResults, integrate,
  note: 'All PLAN | TASK | GOAL docs prepared & consensus-frozen. Hand off to a build workflow (e.g. spec-implement-dual-review-verify) for ④.',
}
