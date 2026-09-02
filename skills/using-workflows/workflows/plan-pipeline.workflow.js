// Generic, project-agnostic PLANNING pipeline. Prepares the planning artifacts ONLY —
// it deliberately STOPS before implementation/build. Encodes the four-layer model:
//
//   ① direction (goal_doc)  →  ② frozen plan (plan-<slug>.md)  →  ③ ADR design (docs/adr/NNNN-*)
//   └ then: review → commit → push the prepared DOCS.    ④ build is NOT part of this workflow.
//
// Each artifact is drafted, then frozen only after an adversarial review reaches CLEAN (0 Critical /
// 0 Major). With args.cli the external counterpart drafts+reviews via agent-tmux; WITHOUT cli
// (user ruling 2026-09-02: never depend on codex) a Claude opus drafter and a FRESH Claude opus
// reviewer alternate in-script. Output = "all PLAN | TASK | GOAL docs ready for build".
// MODEL POLICY: floor opus low; reviewers run opus at reviewEffort (default high). Never sonnet here.
//
// NOTHING is hardcoded to a project: slug, brief, output paths, review settings all come from
// `args`. When driving an external CLI via agent-tmux, completion is detected by POLLING an output file, never
// by matching a marker in the tmux pane (the marker echoes in the sent prompt — a real bug).
//
//   Workflow({ scriptPath: ".claude/workflows/plan-pipeline.workflow.js", args: {
//     repoPath: "/abs/repo",
//     slug: "<slug>",                               // names the plan/direction files
//     brief: "<the topic / feature idea to plan>",  // REQUIRED seed for the direction doc
//     directionPath: ".workflow/<YYYYMMDDHHMM>-<slug>/direction.md",  // ① output (default derives from slug)
//     planPath: ".workflow/<YYYYMMDDHHMM>-<slug>/plan.md",            // ② output (default derives from slug)
//     adrDir: "docs/adr",                           // ③ output dir (default "docs/adr")
//     maxReviewRounds: 6,                           // review→fix freeze rounds per artifact (default 6)
//     cli: "codex",                                 // OPTIONAL second-model CLI; absent → in-script opus draft / fresh-opus review loop
//     sessionName: "plan-<slug>", model: "opus", effort: "low", reviewEffort: "high", timeoutSec: 1200,
//     skipDirection: false,                         // true → directionPath already exists, start at ②
//     adrs: [{ slug: "external-idp", title: "..." }],// OPTIONAL: force these ADRs; else ② decides which are needed
//     commitPush: true, commitMessage: "docs(plan): freeze <slug> planning artifacts"
//   }})
export const meta = {
  name: 'plan-pipeline',
  description: 'Planning-only pipeline: direction → frozen plan → ADRs (adversarially frozen: args.cli if given, else fresh Claude opus) → commit/push docs. No build.',
  whenToUse: 'When you need FROZEN planning artifacts (goal_doc → plan-<slug>.md → ADRs), each independently reviewed (args.cli when given, else a fresh Claude opus reviewer) to CLEAN, committed but deliberately NOT built. Complements project-direction-review (that answers "where next"; this freezes "how"). Build afterwards via spec-implement-dual-review-verify.',
  phases: [
    { title: 'Direction', detail: '① draft/refine goal_doc; independent review → ACCEPT', model: 'opus' },
    { title: 'Plan', detail: '② draft plan-<slug>.md; independent multi-round review → FROZEN', model: 'opus' },
    { title: 'ADRs', detail: '③ draft each needed ADR; independent review → FROZEN', model: 'opus' },
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
const maxRounds = a.maxReviewRounds || 6
const session = a.sessionName || `plan-${slug}`
const effort = a.effort || 'high'    // drafter / driving agent effort (default high; floor opus low)
const reviewEffort = a.reviewEffort || 'high'   // in-script fresh reviewer effort
const model = a.model || 'opus'     // never sonnet: this recipe is planning (user ruling 2026-09-02)
// Official agent() opts, listed on every call. Both default OFF:
const isolation = a.isolation === 'worktree' ? 'worktree' : undefined  // spec: only 'worktree' enables; off = omit
const agentType = a.agentType || undefined  // off = default workflow agent (portable; missing custom agentType = HARD error #20931)
const timeout = a.timeoutSec || 1200
// Second-model CLI is OPTIONAL and neutral (never depend on codex). Absent → in-script freeze loop
// (opus drafter ↔ fresh opus reviewer). Each CLI's launch flags come from its own agent-tmux profile;
// EXTRA flags pass raw via a.launchEnv. charset guard blocks shell injection (cli is interpolated into commands).
if (a.cli != null && !/^[a-z0-9][a-z0-9._-]*$/i.test(a.cli)) return { aborted: true, reason: "invalid arg: cli ('codex' | 'claude' | any agent-tmux profile name, or omit)" }
const cli = a.cli || null
// e.g. a.launchEnv = "CODEX_TMUX_LAUNCH_FLAGS='--yolo -c model_reasoning_effort=high' " — caller-owned passthrough.
const launchEnv = typeof a.launchEnv === 'string' ? a.launchEnv : ''

const FROZEN = { type: 'object', additionalProperties: false,
  required: ['ok', 'frozen', 'path', 'rounds', 'summary'],
  properties: {
    ok: { type: 'boolean' },
    frozen: { type: 'boolean', description: 'true iff external review reached CLEAN (0 Critical / 0 Major)' },
    path: { type: 'string' },
    rounds: { type: 'integer', description: 'how many draft→review rounds it took' },
    requiredAdrs: { type: 'array', items: { type: 'object', additionalProperties: true,
      properties: { slug: { type: 'string' }, title: { type: 'string' }, brief: { type: 'string' } } },
      description: 'ADRs the plan says are needed (plan stage only)' },
    summary: { type: 'string' },
    blockers: { type: 'array', items: { type: 'string' } },
  } }

const STATUS = { type: 'object', additionalProperties: false,
  required: ['ok', 'summary'], properties: { ok: { type: 'boolean' }, summary: { type: 'string' }, detail: { type: 'string' } } }

// Shared instruction: how to drive the second-model CLI draft→adversarial-review→freeze, file-polled.
const cliFreeze = (what, outPath, extra) =>
  `Drive ${cli} via agent-tmux to DRAFT then FREEZE ${what}. If agent-tmux/${cli}-tmux are not on PATH, run them from the tmux-agent-tools skill bundle scripts/ dir.\n` +
  `1. Start ${cli}: ${launchEnv}agent-tmux ${cli} start --exact ${session} ${repo} "planning task incoming; read fully".\n` +
  `2. Have ${cli} write the artifact to ${outPath} (create parent dirs). Ground every claim in real code/files — do NOT trust memory or stale docs.\n` +
  `3. FREEZE LOOP (max ${maxRounds} rounds): drive an ADVERSARIAL ${cli} review of the artifact; ${cli} writes its verdict to a unique OUT file ending with a last line exactly: === PLAN REVIEW END ===. Wait by POLLING that OUT file for the marker (NOT the tmux pane — it echoes in the sent prompt), up to ${timeout}s. If the verdict has any Critical/Major, apply the fix to ${outPath} and review again. Stop when CLEAN (0 Critical / 0 Major) or rounds exhausted.\n` +
  `4. Return frozen=true iff it reached CLEAN; path=${outPath}; rounds=number of rounds used; summary; blockers=[] (or remaining issues if not frozen).${extra || ''}`

// No-cli path: the same draft→review→fix loop, run in-script. Drafter = opus/effort; reviewer =
// a FRESH opus agent per round (never the drafter's context), so independence is structural.
const VERDICT = { type: 'object', additionalProperties: false, required: ['clean', 'issues'],
  properties: {
    clean: { type: 'boolean', description: 'true iff 0 Critical AND 0 Major' },
    issues: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['severity', 'issue', 'evidence', 'fix'],
      properties: { severity: { type: 'string', enum: ['Critical', 'Major', 'Minor'] }, issue: { type: 'string' }, evidence: { type: 'string', description: 'file:line or real command output' }, fix: { type: 'string' } } } },
    summary: { type: 'string' },
  } }
const freezeArtifact = async (label, phaseName, what, outPath, extra) => {
  if (cli) return agent(cliFreeze(what, outPath, extra), { label, phase: phaseName, model, effort, isolation, agentType, schema: FROZEN })
  const GROUND = 'Ground every claim in real code/files (rg/fd/Read) — do NOT trust memory or stale docs; unverifiable claims go under Open Questions.'
  let feedback = '', rounds = 0, clean = false, issues = []
  while (rounds < maxRounds) {
    rounds++
    const draft = await agent(
      `In repo ${repo}: ${rounds === 1 ? 'DRAFT' : 'FIX'} ${what}. Write the artifact to ${outPath} (create parent dirs). ${GROUND}${feedback}${extra || ''}\nReturn ok=true once the file is written; frozen=false (the reviewer decides); path=${outPath}; rounds=${rounds}; summary; blockers=[].`,
      { label: `${label}:draft#${rounds}`, phase: phaseName, model, effort, isolation, agentType, schema: FROZEN }
    )
    if (!draft || draft.ok !== true) return { ok: false, frozen: false, path: outPath, rounds, summary: 'drafter failed', blockers: ['drafter returned null or ok=false'], requiredAdrs: draft?.requiredAdrs }
    const verdict = await agent(
      `INDEPENDENT ADVERSARIAL REVIEW (fresh context — you did not write this). Repo ${repo}. Read ${outPath} fully, then verify each "current state" claim against the real code. Judge completeness, sequencing, effort realism, unverified assumptions. Each issue needs evidence (file:line / command output) and a fix. clean=true ONLY with 0 Critical and 0 Major.`,
      { label: `${label}:review#${rounds}`, phase: phaseName, model, effort: reviewEffort, isolation, agentType, schema: VERDICT }
    )
    if (!verdict) return { ok: false, frozen: false, path: outPath, rounds, summary: 'reviewer failed', blockers: ['reviewer returned null'], requiredAdrs: draft.requiredAdrs }
    issues = (verdict.issues || []).filter(i => i.severity !== 'Minor')
    if (verdict.clean && issues.length === 0) { clean = true; return { ok: true, frozen: true, path: outPath, rounds, summary: verdict.summary || draft.summary || 'frozen CLEAN', blockers: [], requiredAdrs: draft.requiredAdrs } }
    feedback = `\nREVIEWER ISSUES to resolve (round ${rounds}):\n${JSON.stringify(issues, null, 2)}\n`
  }
  return { ok: true, frozen: clean, path: outPath, rounds, summary: `rounds exhausted (${maxRounds}) with ${issues.length} Critical/Major open`, blockers: issues.map(i => `${i.severity}: ${i.issue}`) }
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
  if (!direction || direction.ok !== true) return { stage: 'direction', passed: false, direction }
  artifacts.push(directionPath)
}

// ── ② Frozen plan ──
phase('Plan')
const plan = await freezeArtifact(`plan:${slug}`, 'Plan',
  `the implementation PLAN at ${planPath}, derived from the direction doc ${directionPath}. ` +
  `Include: goal, success criteria, scope/non-goals, per-area work breakdown (tasks with effort + touched files + deps + a one-line acceptance contract: the exact command/check that must pass), risks/open-questions, phased sequence, and an explicit "ADR vs direct build" list`,
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
    { label: 'commit-push-docs', phase: 'Integrate', model, effort, isolation, agentType, schema: STATUS }
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
