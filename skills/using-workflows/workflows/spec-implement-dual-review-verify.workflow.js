// Reusable recipe: implement a spec, review the change through the review ladder
// (model-dispatch.md §Review ladder), then verify with concrete commands.
// Generalized from the one-off `jenkins-cli-build` / `-trigger-cli` / `-iap-finalize`
// session workflows (standard-portal-app) — they were three instances of this same skeleton.
// Cross-project: fully parameterized via `args`. No hardcoded spec/paths.
//
// Invoke reliably via absolute scriptPath (independent of discovery/name):
//   Workflow({ scriptPath: ".claude/workflows/spec-implement-dual-review-verify.workflow.js", args: {
//     repoPath:  "/abs/path/to/repo",
//     spec:      "Full implementation spec (multi-line): what file to write/edit, style to match, exact behavior...",
//     targetFile:"scripts/foo/bar.sh",            // optional: file under review (repo-relative or absolute)
//     reviewFocus:"bash quoting under set -euo pipefail, curl error handling, edge cases",  // optional
//     verifyCommands: [                            // optional: the L0 checks, run before every review round and in Finalize
//       "bash -n scripts/foo/bar.sh",
//       "shellcheck scripts/foo/bar.sh",
//       "./scripts/foo/bar.sh --help"
//     ],
//     model: "opus",                               // optional, implementer/fixer model (default opus; 'sonnet' allowed HERE only — implementation)
//     effort: "low",                               // optional, implementer effort (default medium)
//     reviewEffort: "high",                        // optional, L2 effort: medium|high|xhigh|max (default high)
//     maxReviewRounds: 3,                          // optional, L2 rounds, integer 1–3 (L1 2 and L3 1 are fixed)
//     l1Lenses: ["silent-failure-hunter", "pr-test-analyzer"],  // optional pr-review-toolkit agents for L1
//                                                  // (also: type-design-analyzer, comment-analyzer)
//     timeoutSec: 1200, slug: "c1",                // optional: Luna run timeout; snapshot dir name
//   }})
//
// REVIEW LADDER (the Review phase):
//   L0  verifyCommands + a manifest hash (HEAD, `git diff HEAD`, untracked files) before every round;
//       a failing check goes to the fixer first; a manifest change during the round voids it.
//   L1  pr-review-toolkit lenses (default silent-failure-hunter + pr-test-analyzer) on sonnet high,
//       plus gpt-6-luna xhigh (codex exec, read-only), in parallel, ≤2 rounds; cannot pass the change.
//   L2  pr-review-toolkit:code-reviewer on opus at reviewEffort, always runs, ≤maxReviewRounds.
//   L3  pr-review-toolkit:code-reviewer on fable high, 1 round, only when L2 never reached
//       0 Critical / 0 Major. One finding ledger runs through every round and layer; the
//       implementer model fixes under the fixer contract (_lib/worker-doctrine.md §7–§9).
//
// PRESET — build from a frozen consensus plan (proven: build-smcs1498-from-frozen-plan).
// When a plan.md already passed consensus (e.g. via plan-pipeline / feature-plan-consensus),
// the spec arg is a PLAN POINTER, not a rewrite:
//   spec: `Implement the frozen plan at ${planPath}. Read it FULLY first; it is the
//          authoritative, consensus-passed spec. Follow its exact file targets, behavior,
//          and verification steps. Key invariants: <top 3-6 restated inline as a drift
//          guard>. Truth = source code and real command output, not memory. Do not modify
//          unrelated files.`
//   verifyCommands: exactly the plan's own verification steps (e.g. analyzer + targeted tests).
// Restating the key invariants inline matters: it protects against the implementer skimming
// the plan file, at ~10 lines' cost. Wrapper shape: an 18-line thin workflow that just calls
// this recipe — no need to save those shells; write them ad hoc.
// A review layer with no reviewer left (L2/L3 agent null, or every L1 seat failed) ABORTS at the
// review stage — no silent degradation (P2-A5). A failed L1 seat is a logged warning.
// MODEL POLICY: implementer/fixer = `model` (sonnet allowed here only); L1 sonnet is review-only
// (user ruling 2026-10-09); L2/L3 and the finalizer never run below opus.
//
// NOTE: workflow scripts have no FS/shell — only agents do. All file work happens inside agent() prompts.
// NESTING: this is a mid-level stage — do NOT call workflow() here (1-level nesting cap).

export const meta = {
  name: 'spec-implement-dual-review-verify',
  description: 'Implement a spec, review it through the ladder (L0 → pr-review-toolkit lenses + Luna → opus code-reviewer → fable), verify (param via args)',
  whenToUse: 'When a written spec must become code with laddered independent review and command-verified evidence — the main build pipeline. When a consensus-frozen plan.md already exists, pass a plan POINTER as the spec (see the frozen-plan preset in the header).',
  phases: [
    { title: 'Implement', detail: 'write/edit the target per spec', model: 'opus' },
    { title: 'Review', detail: 'review ladder: L0 → toolkit lenses + Luna → opus code-reviewer → fable' },
    { title: 'Finalize', detail: 'run verify commands and classify deviations; no further edits' },
  ],
}

const a = typeof args === 'string' ? (() => { try { return JSON.parse(args) } catch { return {} } })() : (args || {})
for (const k of ['repoPath', 'spec']) if (!a[k]) return { aborted: true, reason: `missing arg: ${k}` }
if (a.cli != null) return { aborted: true, reason: 'cli is not a reviewer here any more: the review ladder picks the reviewers (model-dispatch.md §Review ladder); drop cli' }
if (a.maxReviewRounds != null && !(Number.isInteger(a.maxReviewRounds) && a.maxReviewRounds >= 1 && a.maxReviewRounds <= 3)) return { aborted: true, reason: 'invalid arg: maxReviewRounds must be an integer 1–3 (L2 rounds)' }
if (a.reviewEffort != null && !['medium', 'high', 'xhigh', 'max'].includes(a.reviewEffort)) return { aborted: true, reason: 'invalid arg: reviewEffort must be medium|high|xhigh|max (L2 is opus medium+)' }
const LENS_OK = ['silent-failure-hunter', 'pr-test-analyzer', 'type-design-analyzer', 'comment-analyzer']
const lenses = a.l1Lenses == null ? ['silent-failure-hunter', 'pr-test-analyzer'] : a.l1Lenses
if (!Array.isArray(lenses) || !lenses.length || lenses.some(l => !LENS_OK.includes(l))) return { aborted: true, reason: `invalid arg: l1Lenses must be a non-empty subset of ${LENS_OK.join(', ')}` }

const repo = a.repoPath
const model = a.model || 'opus'     // IMPLEMENTER / FIXER model only ('sonnet' permitted here)
const effort = a.effort || 'medium'    // implementer effort (default medium; floor opus low)
const reviewEffort = a.reviewEffort || 'high'
const maxRounds = a.maxReviewRounds || 3
const timeout = Number.isInteger(a.timeoutSec) ? a.timeoutSec : 1200
// Official agent() opts, listed on every call. Both default OFF:
// No isolation: every agent() would get its own worktree, so drafter, fixer, L0 and reviewers would not
// see one another's edits. The ladder runs on one live tree.
if (a.isolation != null) return { aborted: true, reason: 'isolation is not supported: the review ladder needs every agent on the same live tree' }
const agentType = a.agentType || undefined  // implementer/fixer/finalizer only; reviewers use their toolkit agent types
// POSIX-safe single-quote: wraps in '...' and renders embedded ' as '\'' so any repo path is safe.
const shellQuote = (s) => "'" + String(s).replace(/'/g, "'\\''") + "'"
const R = shellQuote(repo)
const snapDir = `/tmp/spec-implement-${String(a.slug || 'change').replace(/[^a-zA-Z0-9._-]/g, '_')}`
// The change under review, as one text: tracked diff plus every untracked file as a new-file diff.
const CHANGE = `{ git -C ${R} diff HEAD; git -C ${R} ls-files -o --exclude-standard | while IFS= read -r f; do git -C ${R} diff --no-index /dev/null "$f"; done; }`
const MANIFEST = `{ git -C ${R} rev-parse HEAD; ${CHANGE}; } 2>/dev/null | shasum -a 256`
const target = a.targetFile ? `\nTarget file: ${a.targetFile}` : ''
const focus = a.reviewFocus || 'correctness, error handling, edge cases, anything that could silently corrupt state or data'
const verifyCommands = Array.isArray(a.verifyCommands) ? a.verifyCommands : []
const verifyClause = verifyCommands.length
  ? `VERIFY by running each of these and pasting the outputs:\n${verifyCommands.map(c => `  - ${c}`).join('\n')}`
  : `VERIFY with the narrowest relevant checks for this change (syntax check, linter, a smoke invocation) and paste the outputs.`

const SPEC = `Repo: ${repo}.${target}\n\nSPEC:\n${a.spec}`

// _lib/worker-doctrine.md §7/§8, kept byte-close (scripts cannot import).
const REVIEWER_CONTRACT = 'ADVERSARIAL REVIEW. Assume the work is wrong until the evidence says otherwise. Round 1: list EVERY finding now, in one pass; a finding held back for a later round counts as a miss. Each finding: stable id, file:line or command output, severity Critical|Major|Minor, why it is wrong, the concrete fix, the check that proves the fix. A finding without evidence is dropped. Round 2+: you get the finding ledger and the before/after diff of the fix. Report (a) each ledger finding: resolved (with evidence) or still open (not_fixed | partly), and adjudicate every fixer rejection; (b) NEW defects. Mark a new defect fix_caused=true only when the diff shows the fix caused it; a new defect the fix did not cause is a round-1 miss. PASS only with 0 Critical and 0 Major open.'
const FIXER_CONTRACT = 'Address EVERY finding in this pass, Minor included: fix it at the root cause, or reject it with evidence (file:line / command output). Never skip one silently. No surface bypass: no special case, disabled check, weakened test, or suppressed error to make a finding go away. Finish the whole task in scope, not the smallest patch: "surgical" limits WHERE you edit, never WHAT you finish. Before you hand back, run the L0 checks and quote their output. Report per finding: id, fixed | rejected, evidence.'

const FIX = { type: 'object', additionalProperties: false, required: ['ok', 'summary', 'actions'],
  properties: {
    ok: { type: 'boolean' }, summary: { type: 'string' },
    actions: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'action', 'evidence'],
      properties: { id: { type: 'string' }, action: { type: 'string', enum: ['fixed', 'rejected'] }, evidence: { type: 'string' } } } },
  } }
const L0 = { type: 'object', additionalProperties: false, required: ['manifest', 'rc', 'output'],
  properties: { manifest: { type: 'string' }, rc: { type: 'integer' }, output: { type: 'string', description: 'last 40 lines, verbatim' } } }
const FINDING = { type: 'object', additionalProperties: false, required: ['id', 'severity', 'status', 'issue', 'evidence', 'fix', 'check'],
  properties: {
    id: { type: 'string', description: 'the ledger id for a known finding; any new id for a new one' },
    severity: { type: 'string', enum: ['Critical', 'Major', 'Minor'] },
    status: { type: 'string', enum: ['new', 'not_fixed', 'partly'] },
    issue: { type: 'string' }, evidence: { type: 'string', description: 'file:line or real command output' },
    fix: { type: 'string' }, check: { type: 'string', description: 'the check that proves the fix' },
    fix_caused: { type: 'boolean', description: 'new findings only: true when the before/after diff shows the last fix caused it' },
  } }
const VERDICT = { type: 'object', additionalProperties: false, required: ['manifest_start', 'manifest_end', 'open', 'resolved', 'summary'],
  properties: {
    manifest_start: { type: 'string', description: 'the manifest command output before you read anything' },
    manifest_end: { type: 'string', description: 'the manifest command output after your review' },
    open: { type: 'array', items: FINDING, description: 'every finding still open, known or new' },
    resolved: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'evidence'],
      properties: { id: { type: 'string' }, evidence: { type: 'string' } } } },
    summary: { type: 'string' },
  } }
const LUNA = { type: 'object', additionalProperties: false, required: ['ran', 'error'],
  properties: { ran: { type: 'boolean' }, error: { type: 'string' }, verdict: VERDICT } }

phase('Implement')
const impl = await agent(
  `You are implementing per the spec below. Use the Write/Edit tools to make the change in the repo, then make any produced script executable if applicable. Finish the whole spec; do not add features beyond it and do not modify unrelated files. Do NOT commit: the review ladder reviews the uncommitted change.\n${SPEC}`,
  { label: 'implement', phase: 'Implement', model, effort, agentType }
)
if (!impl) return { aborted: true, stage: 'implement', reason: 'implementation agent failed (returned null) — nothing to review' }
log('implementation done, starting the review ladder')

phase('Review')
const LADDER = [
  { tier: 'L1', max: 2, freezes: false },   // pre-filter: 0 blockers here only admits the change to L2
  { tier: 'L2', max: maxRounds, freezes: true },
  { tier: 'L3', max: 1, freezes: true },    // only reached when L2 never went to 0 Critical / 0 Major
]
const BLOCKING = f => f.severity !== 'Minor'
const runL0 = n => agent(
  `In repo ${repo}: deterministic L0 before a review round. Do not edit any file.\n1. Run \`${MANIFEST}\`; manifest = its output.\n2. ${verifyCommands.length ? `Run each, in order, stopping at the first non-zero exit:\n${verifyCommands.map(c => `  - ${c}`).join('\n')}\nrc = the first non-zero exit code, or 0; output = the last 40 lines verbatim.` : 'No verifyCommands were given: rc = 0, output = "no verify commands".'}`,
  { label: `L0#${n}`, phase: 'Review', model: 'opus', effort: 'low', agentType, schema: L0 })   // no isolation: L0 and reviewers read the live tree
const reviewPrompt = (tier, r, max, ledger, prev) =>
  `${tier} REVIEW, round ${r}/${max}, of the change just implemented (you did not write it). Repo ${repo}. First run \`${MANIFEST}\`; manifest_start = its output. ` +
  `The change = the output of \`${CHANGE}\`. Review it against the spec below. Focus: ${focus}. Verify against the real code, not the implementer's claims. ` +
  `Every new concept or abstraction (type, layer, option, config surface, helper used once) must name the spec line or reproduced failure that requires it; one that cannot is an issue. Never flag the change for covering the full requested scope.\n${REVIEWER_CONTRACT}\n` +
  (ledger.length ? `FINDING LEDGER (open findings from earlier rounds and layers, with fixer actions):\n${JSON.stringify(ledger, null, 2)}\n` : 'No earlier findings: this is round 1 for this change.\n') +
  (prev ? `Before/after diff of the last fix: run \`${CHANGE} | diff -u ${prev} -\` (writes nothing).\n` : '') +
  `Last step: run the manifest command again; manifest_end = its output. Do not edit any file.\n${SPEC}`
let seat = 0
const seatFailed = (who, why) => { log(`L1 ${who} reviewer did not run (${why})`); return { seatFailed: `${who}: ${why}` } }
const review = (tier, who, r, max, ledger, prev) => {
  const prompt = reviewPrompt(tier, r, max, ledger, prev)
  const label = `${tier}${who ? `:${who}` : ''}#${r}`
  if (who === 'luna') {
    const f = `${snapDir}/luna-${++seat}`
    return agent(
      `Run a gpt-6-luna review with codex, read-only, and return its verdict. Steps:\n1. mkdir -p ${snapDir}; write the review request between <<< >>> below verbatim to ${f}.in\n` +
      `2. Run: codex exec -m gpt-6-luna -c model_reasoning_effort=xhigh -s read-only -C ${R} -o ${f}.out - < ${f}.in   (timeout ${timeout}s)\n` +
      `3. ran=true and verdict = Luna's verdict mapped onto the schema fields exactly as Luna wrote them (do not add, drop or soften findings). If codex exits non-zero or writes no verdict: ran=false, error = the exit code and last stderr lines.\n` +
      `<<<\n${prompt}\nReturn the verdict as JSON with fields manifest_start, manifest_end, open[], resolved[], summary.\n>>>`,
      { label, phase: 'Review', model: 'opus', effort: 'low', agentType, schema: LUNA }).then(x => {
      if (x && x.ran && x.verdict) return x.verdict
      return seatFailed('luna', !x ? 'agent null' : x.ran ? 'ran=true, no verdict' : x.error)
    }, e => seatFailed('luna', `threw: ${e}`))
  }
  const opts = tier === 'L1'
    ? { model: 'sonnet', effort: 'high', agentType: `pr-review-toolkit:${who}` }
    : { model: tier === 'L2' ? 'opus' : 'fable', effort: tier === 'L2' ? reviewEffort : 'high', agentType: 'pr-review-toolkit:code-reviewer' }
  const v = agent(prompt, { label, phase: 'Review', schema: VERDICT, ...opts })
  // An L1 seat that fails (null, or a throw such as a missing toolkit agent type) is a logged warning;
  // an L2/L3 reviewer that fails stops the gate (null).
  return tier === 'L1' ? v.then(x => x || seatFailed(who, 'agent null'), e => seatFailed(who, `threw: ${e}`)) : v
}
let calls = 0, prev = null, nid = 0, rounds = 0, frozen = false
const ledger = new Map()   // id → finding (+ tier, + fixer action); survives layer changes
const warnings = []
const fix = async (task, n) => {
  calls++
  const f = await agent(
    `In repo ${repo}: FIX the change you implemented. Before editing, run \`mkdir -p ${snapDir} && ${CHANGE} > ${snapDir}/r${n}.prev.diff\`. Do NOT commit.\n${FIXER_CONTRACT}\n${task}\n${SPEC}\nReturn ok=true once the edits are made; summary; actions = one entry per finding id.`,
    { label: `fix#${n}`, phase: 'Review', model, effort, agentType, schema: FIX })
  if (!f || f.ok !== true) return false
  prev = `${snapDir}/r${n}.prev.diff`
  for (const act of f.actions || []) { const e = ledger.get(act.id); if (e) e.fixer = { action: act.action, evidence: act.evidence } }
  return true
}
const stop = (reason, blockers) => ({ aborted: true, stage: 'review', reason, blockers, impl, rounds, calls, warnings, ledger: [...ledger.values()] })
ladder: for (const [li, L] of LADDER.entries()) {
  let r = 0, voids = 0, l0Fails = 0
  while (r < L.max) {
    calls++
    const pre = await runL0(rounds + 1)
    if (!pre) return stop('L0 agent failed (returned null)', [])
    if (pre.rc !== 0) {   // deterministic failure: fix first, the review round has not started
      if (++l0Fails >= 2) return stop('L0 failed twice in a row', [`rc=${pre.rc}: ${pre.output.slice(-400)}`])
      if (!(await fix(`L0 FAILED (rc=${pre.rc}). Output:\n${pre.output}\nFix the cause; also keep every open ledger finding in mind:\n${JSON.stringify([...ledger.values()], null, 2)}`, rounds + 1))) return stop('fixer failed on an L0 fix', [])
      continue
    }
    l0Fails = 0
    const known = [...ledger.values()]
    const seats = L.tier === 'L1' ? [...lenses, 'luna'] : ['']
    calls += seats.length
    const verdicts = await parallel(seats.map(w => () => review(L.tier, w, r + 1, L.max, known, prev)))
    verdicts.filter(v => v && v.seatFailed).forEach(v => warnings.push(`${L.tier} ${v.seatFailed}`))
    const ran = verdicts.filter(v => v && !v.seatFailed)
    if (!ran.length || (L.tier !== 'L1' && ran.length !== seats.length)) return stop(`${L.tier} reviewer failed (returned null) — no silent degradation`, [])
    if (ran.some(v => v.manifest_start !== pre.manifest || v.manifest_end !== pre.manifest)) {   // the change moved during the round
      if (++voids >= 2) return stop('the change moved during review twice', ['void round: manifest drifted during review'])
      log(`${L.tier} round ${r + 1} void (the change moved during review); rerun`)
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
    if (![...ledger.values()].some(BLOCKING)) {
      if (L.freezes) { frozen = true; log(`${L.tier} verdict: 0 Critical / 0 Major`); break ladder }
      break
    }
    if (li === LADDER.length - 1 && r === L.max) break   // last round of the top layer: no reviewer left for a fix
    if (!(await fix(`Findings (ledger, every open one):\n${JSON.stringify([...ledger.values()], null, 2)}`, rounds))) return stop('fixer failed on a fix', [])
  }
}
if (!frozen) {
  const open = [...ledger.values()].filter(BLOCKING)
  return { ...stop(`review ladder exhausted (L3 verdict still blocks) with ${open.length} Critical/Major open`, open.map(f => `${f.id} ${f.severity}: ${f.issue}`)), needsUser: true }
}
const minors = [...ledger.values()].map(f => `${f.id}: ${f.issue}`)

phase('Finalize')
// P7 deviation→amendment gate: the finalizer must classify any change that touches the spec's
// EXPLICIT frozen claims (SC-x / ADR Decision lines). within-spec = elaborates (ok); deviation =
// small/reversible (log it, keep going); amendment-needed = CONTRADICTS a frozen line → HARD STOP,
// escalate to an ADR amendment (re-freeze via plan-pipeline) instead of silently editing through.
const FINALIZE_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['summary', 'verified', 'amendment_needed', 'deviations'],
  properties: {
    summary: { type: 'string' },
    verified: { type: 'boolean', description: 'verify commands ran and passed' },
    amendment_needed: { type: 'boolean', description: 'true iff any change contradicts a frozen spec/ADR line' },
    deviations: { type: 'array', items: {
      type: 'object', additionalProperties: false, required: ['what', 'classification'],
      properties: {
        what: { type: 'string' },
        classification: { type: 'string', enum: ['within-spec', 'deviation', 'amendment-needed'] },
        frozen_ref: { type: 'string', description: 'the frozen SC-x / ADR Decision line it touches, if any' },
        rationale: { type: 'string' },
      },
    } },
  },
}
const fixed = await agent(
  `You are finalizing the change in ${repo}. The review ladder already passed it; do NOT edit any file — an edit now would be unreviewed. ${verifyClause}\n` +
  `DEVIATION GATE: list every change that touches an EXPLICIT frozen claim in the spec (an SC-x success criterion or an ADR Decision/Consequence line). Classify each as ` +
  `"within-spec" (only elaborates what the frozen line left open), "deviation" (small/reversible departure — record it), or "amendment-needed" (CONTRADICTS a frozen line). ` +
  `If ANY item is amendment-needed, set amendment_needed=true.\n` +
  `Report the verification outputs and return the deviations honestly. verified=true only if every verify command passed.\n\n` +
  `The change: run \`${CHANGE}\`.\n\n${SPEC}`,
  { label: 'verify-and-classify', phase: 'Finalize', model: 'opus', effort: reviewEffort, agentType, schema: FINALIZE_SCHEMA }
)
if (!fixed) return { aborted: true, stage: 'finalize', reason: 'finalize agent failed (returned null) — implementation not verified', impl, rounds, warnings }
// Gate on BOTH the boolean AND any amendment-needed deviation — a finalizer that sets the flag false
// while classifying a deviation as amendment-needed must NOT slip through (fail closed).
const amendmentNeeded = fixed.amendment_needed === true || (fixed.deviations || []).some(d => d && d.classification === 'amendment-needed')
if (amendmentNeeded) return { aborted: true, stage: 'finalize', reason: 'build contradicts a frozen spec/ADR line — escalate to an ADR amendment (re-freeze via plan-pipeline) before continuing; do not edit through', needsUser: true, deviations: fixed.deviations, impl, rounds, warnings }
// Fail closed on verification: a finalizer that did not get verify passing is not a success.
if (fixed.verified !== true) return { aborted: true, stage: 'finalize', reason: 'verification did not pass (verified!=true) — not finalizing as success', needsUser: true, fixed, impl, rounds, warnings }

return { impl, rounds, calls, minors, warnings, fixed, deviations: fixed.deviations, amendment_needed: false, verified: true }
