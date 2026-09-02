// Reusable recipe: trigger an AI review bot on a PR, then act as the BRAIN —
// independently establish code ground-truth FIRST, triage every bot finding against
// that truth (accept / already-fixed / reject), fix only what's real (dispatch to
// workers or self with an escalation ladder), push, and resolve ALL handled threads.
// ONE-SHOT: no internal loop. Need another round? Re-run the whole workflow (Phase 1
// summons a fresh review). State carries across runs via a ledger file.
//
// Doctrine baked in (per repo owner):
//   - Truth = code / logs / real operations, NOT memory or stale docs/threads.
//     An open thread does NOT mean "unfixed" — verify against code (Phase 0 + 3).
//   - Authority: user > codex >= orchestrator(self) > sonnet workers.
//   - Don't rubber-stamp the bot. The brain knows the diff before the bot speaks.
//   - High-stakes / low-confidence calls escalate: T1 self -> T2 worker panel ->
//     T3 internal adversarial consensus THEN external codex consensus.
//
//   Workflow({ scriptPath: "~/.claude/workflows/pr-review-triage-resolve.workflow.js", args: {
//     repoPath: "/abs/path/to/repo",
//     prRef: "8",                                  // PR number (or URL)
//     branch: "feat/my-change",                    // PR branch (must be checked out)
//     baseRef: "origin/main",                      // optional, default origin/main (for the diff)
//     reviewBots: ["codex", "gemini-code-assist"], // gh logins to summon + ingest (no [bot] suffix; matched both ways)
//     triggerScript: "scripts/pr/trigger-codex-review.sh",  // REQUIRED; repo-relative. Owns the account guard — no default, no raw `gh pr comment` fallback
//     account: { login: "...", id: "..." },        // optional account-guard for the trigger script
//     wait: { minGraceSec: 600, quietWindowSec: 120, maxTimeoutSec: 1800 },  // optional, these are defaults
//     sonnetTries: 2,                              // worker attempts before escalating to self
//     ledgerPath: ".workflow/pr-review/<prRef>/ledger.json",  // optional, repo-relative; default derived from prRef
//     orchestratorModel: null                      // optional; null = inherit session model for self-rung agents
//   }})
//
// NOTE: workflow scripts have NO filesystem/shell and may NOT call Date.now()/Math.random().
// ALL gh/git/test/ledger read+write happens inside agent() prompts; timestamps come from
// shell `date` inside agents and are returned as data.

export const meta = {
  name: 'pr-review-triage-resolve',
  description: 'Trigger PR review, triage findings vs code truth, fix real ones, push + resolve threads (one-shot, param via args)',
  phases: [
    { title: 'Ground-truth', detail: 'brain reads the diff + ledger BEFORE the bot speaks' },
    { title: 'Trigger', detail: 'summon review bot(s) + wait (detached poll)' },
    { title: 'Ingest', detail: 'collect NEW bot review threads (not human, not pre-existing)' },
    { title: 'Triage', detail: 'accept / already-fixed / reject vs code; escalate by confidence' },
    { title: 'Fix', detail: 'fix accepted findings; worker/self escalation ladder' },
    { title: 'Land', detail: 'push, write ledger, resolve all handled threads' },
  ],
}

const a = typeof args === 'string' ? (() => { try { return JSON.parse(args) } catch { return {} } })() : (args || {})
for (const k of ['repoPath', 'prRef', 'branch', 'reviewBots']) {
  if (!a[k]) return { aborted: true, reason: `missing arg: ${k}` }
}
if (!Array.isArray(a.reviewBots) || !a.reviewBots.length) {
  return { aborted: true, reason: 'args.reviewBots must be a non-empty array of gh logins' }
}
const repo = a.repoPath
const prRef = String(a.prRef)
// PR number for API paths (strip URL if a full URL was passed).
const prNum = (prRef.match(/(\d+)\s*$/) || [])[1] || prRef
if (!/^\d+$/.test(prNum)) return { aborted: true, reason: `cannot derive PR number from prRef: ${prRef}` }
const baseRef = a.baseRef || 'origin/main'
const wait = Object.assign({ minGraceSec: 600, quietWindowSec: 120, maxTimeoutSec: 1800 }, a.wait || {})
const sonnetTries = Number.isInteger(a.sonnetTries) ? a.sonnetTries : 2
const ledgerPath = a.ledgerPath || `.workflow/pr-review/${prNum}/ledger.json`
const orchModel = a.orchestratorModel || undefined
const externalAgentType = a.externalAgentType || 'codex:codex-rescue' // second-model rung; if unavailable, agent() -> null is handled
if (typeof a.triggerScript !== 'string' || !a.triggerScript) {
  return { aborted: true, reason: 'args.triggerScript is required (repo-relative script that summons the bots; it owns the account guard)' }
}
const triggerScript = a.triggerScript
const botList = a.reviewBots.join(', ')

// Shared gh/git guidance — the API-correct invocations (verified against gh 2.94 + a live PR).
const GH = `Repo root: ${repo}. PR #${prNum} on branch ${a.branch}. Authority: code/logs are truth, not thread state.
GH API HARDLINES (these exact forms — others fail on this gh version):
- Review THREADS: use \`gh api graphql -f query='...'\` (NOT \`gh graphql\`). Query pullRequest.reviewThreads with PAGINATION:
    reviewThreads(first:100, after:CURSOR){ pageInfo{hasNextPage endCursor} totalCount
      nodes{ id isResolved isOutdated comments(first:5){ nodes{ databaseId author{login} path line body createdAt } } } }
  Loop until pageInfo.hasNextPage=false. \`id\` (node id, "PRRT_...") is the thread id for resolving.
- Review SUBMIT events: \`gh pr view ${prNum} --json reviews\` (camelCase .submittedAt). NOTE: REST
  \`gh api repos/.../pulls/${prNum}/reviews\` uses snake_case .submitted_at and login WITH a "[bot]" suffix.
  GraphQL author.login has NO "[bot]" suffix. Normalize before comparing.
- Bot login match: a finding is from a review bot iff its author.login (lowercased, "[bot]" stripped) is one of: [${botList}].
  Human-authored threads are NEVER touched (not triaged, not resolved).
- Resolve a thread: \`gh api graphql -f query='mutation($id:ID!){ resolveReviewThread(input:{threadId:$id}){ thread{ id isResolved } } }' -f id=THREAD_NODE_ID\`
  then re-query that thread and confirm isResolved=true.
- Timestamps: get via shell \`date -u +%s\` (epoch) — return as data; never rely on the workflow runtime for time.`

// ---------- schemas ----------
const GROUND_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['ok', 'changed_files', 'baseline_thread_ids', 'trigger_epoch', 'notes'],
  properties: {
    ok: { type: 'boolean' },
    changed_files: { type: 'array', items: { type: 'string' } },
    intent: { type: 'string' },
    risk_areas: { type: 'array', items: { type: 'string' } },
    baseline_thread_ids: { type: 'array', items: { type: 'string' }, description: 'all reviewThread node ids that EXIST right now, before triggering' },
    baseline_unresolved_ids: { type: 'array', items: { type: 'string' } },
    test_build_baseline: { type: 'string', description: 'how to run the relevant tests/typecheck; current pass/fail if cheap' },
    prior_ledger: { type: 'array', items: { type: 'object', additionalProperties: true }, description: 'parsed entries from the ledger file if it exists, else empty' },
    trigger_epoch: { type: 'integer', description: 'shell `date -u +%s` captured AFTER the baseline snapshot, BEFORE Phase 1 triggers' },
    notes: { type: 'string' },
  },
}
const WAIT_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['ok', 'completed_reason', 'new_thread_ids', 'responded_bots', 'notes'],
  properties: {
    ok: { type: 'boolean' },
    completed_reason: { type: 'string', enum: ['quiet-stable', 'timeout', 'no-response'] },
    new_thread_ids: { type: 'array', items: { type: 'string' }, description: 'thread node ids NOT in baseline (the new review)' },
    responded_bots: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' },
  },
}
const INGEST_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['ok', 'findings'],
  properties: {
    ok: { type: 'boolean' },
    findings: { type: 'array', items: {
      type: 'object', additionalProperties: false,
      required: ['thread_id', 'file', 'summary'],
      properties: {
        thread_id: { type: 'string' }, comment_id: { type: 'string' },
        file: { type: 'string' }, line: { type: 'integer' },
        summary: { type: 'string' }, author: { type: 'string' }, severity_claimed: { type: 'string' },
      },
    } },
    notes: { type: 'string' },
  },
}
const TRIAGE_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['thread_id', 'verdict', 'severity', 'confidence', 'owner', 'evidence'],
  properties: {
    thread_id: { type: 'string' },
    verdict: { type: 'string', enum: ['accept', 'already-fixed', 'reject'] },
    severity: { type: 'string', enum: ['P0', 'P1', 'P2', 'none'], description: 'self-judged, NOT copied from the bot' },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    owner: { type: 'string', enum: ['self', 'worker'] },
    evidence: { type: 'string', description: 'accept: where code is wrong. already-fixed: the EXACT commit sha / code that satisfies it. reject: why invalid.' },
    notes: { type: 'string' },
  },
}
const FIX_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['thread_id', 'resolved', 'verified', 'files_changed'],
  properties: {
    thread_id: { type: 'string' }, resolved: { type: 'boolean' }, verified: { type: 'boolean' },
    files_changed: { type: 'array', items: { type: 'string' } }, verify_output: { type: 'string' }, notes: { type: 'string' },
  },
}
// Phase 5 is split into 3 control-flow-gated rungs so ordering is enforced by code, not a prompt.
const PUSH_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['ok', 'pushed', 'notes'],
  properties: { ok: { type: 'boolean' }, pushed: { type: 'boolean' }, head_sha: { type: 'string' }, notes: { type: 'string' } },
}
const LEDGER_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['ok', 'ledger_written', 'notes'],
  properties: { ok: { type: 'boolean' }, ledger_written: { type: 'boolean' }, round: { type: 'integer' }, entries_total: { type: 'integer' }, notes: { type: 'string' } },
}
const RESOLVE_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['ok', 'resolved_thread_ids', 'failed_resolves'],
  properties: {
    ok: { type: 'boolean' },
    resolved_thread_ids: { type: 'array', items: { type: 'string' } },
    failed_resolves: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' },
  },
}

// Escalation ladder: sonnet worker x sonnetTries -> orchestrator self -> codex.
async function runEscalated(label, phaseName, makePrompt, schema) {
  for (let i = 0; i < Math.max(1, sonnetTries); i++) {
    const r = await agent(makePrompt('sonnet worker'), { label: `${label}:w${i + 1}`, phase: phaseName, model: 'sonnet', schema })
    if (r) return { result: r, rung: `worker#${i + 1}` }
  }
  const self = await agent(makePrompt('orchestrator (self) — workers failed, you handle it'), { label: `${label}:self`, phase: phaseName, model: orchModel, schema })
  if (self) return { result: self, rung: 'self' }
  const cx = await agent(makePrompt('external second model — self could not complete; deep pass'), { label: `${label}:external`, phase: phaseName, agentType: externalAgentType, schema })
  return { result: cx, rung: 'external' }
}

// ---------- Phase 0: ground-truth (brain first) ----------
phase('Ground-truth')
const ground = await agent(
  `${GH}
You are the ORCHESTRATOR (brain). BEFORE any review bot speaks, independently establish the code reality of this PR so later triage judges the bot against the code, not the other way around.
1. Diff: \`git -C ${repo} diff ${baseRef}...HEAD --stat\` and inspect changed files; summarize intent + risk areas from the CODE, not from any description.
2. Baseline review-thread snapshot (CRITICAL — used to detect the NEW review): list ALL existing reviewThread node ids RIGHT NOW (paginate). Return them in baseline_thread_ids, and the currently-unresolved subset in baseline_unresolved_ids.
3. Prior ledger: if ${repo}/${ledgerPath} exists, read + parse it into prior_ledger (array). If absent, prior_ledger=[]. Do NOT create it now.
4. Test/build baseline: identify the narrowest relevant test/typecheck/lint command(s) for the changed files; note them (run only if cheap).
5. Capture trigger_epoch = \`date -u +%s\` LAST (after the snapshot), as the time floor for "new" activity.
Return the schema. Do NOT trigger any review here.`,
  { label: 'ground-truth', phase: 'Ground-truth', model: orchModel, schema: GROUND_SCHEMA }
)
if (!ground || !ground.ok) return { aborted: true, stage: 'ground-truth', ground }

const baseline = ground.baseline_thread_ids || []
const priorLedger = ground.prior_ledger || []

// ---------- Phase 1: trigger + detached poll ----------
phase('Trigger')
const waited = await agent(
  `${GH}
STEP A — trigger the review by running the repo trigger script (it posts a comment summoning the bots with a strict rubric). Build the command with each value as a SEPARATELY DOUBLE-QUOTED argv token — do NOT concatenate raw, since repoPath/script/login may contain spaces or shell metacharacters. Use EXACTLY these literal values:
    repo   = ${repo}
    script = ${triggerScript}   (relative to repo)
    --pr   = ${prNum}
    --bots = ${a.reviewBots.map(b => '@' + String(b).replace(/^@/, '')).join(',')}${a.account && a.account.login ? `\n    --expect-login = ${a.account.login}${a.account.id ? `\n    --expect-id = ${a.account.id}` : ''}` : ''}
  i.e. run:  ( cd "<repo>" && bash "<script>" --pr "<pr>" --bots "<bots>"${a.account && a.account.login ? ` --expect-login "<login>"${a.account.id ? ` --expect-id "<id>"` : ''}` : ''} )
  If the script file does NOT exist, ABORT (ok=false). Do NOT fall back to a raw \`gh pr comment\` — the account guard lives in the script and bypassing it could post from the wrong GitHub account.

STEP B — WAIT for the review with a DETACHED POLL (a single bash call caps ~10min; minGrace alone is ${wait.minGraceSec}s, so you MUST loop across multiple bounded bash calls):
  - Hard-wait minGrace FIRST: sleep in bounded chunks (each bash call sleeps <= 480s) until ${wait.minGraceSec}s elapsed since trigger. Do NOT check for completion before minGrace — bots are slow to start; checking early falsely concludes "done".
  - Then POLL every ~30s. Each poll: fetch reviewThreads (paginated) + \`gh pr view ${prNum} --json reviews\`.
    * NEW threads = thread node ids NOT in this baseline set: ${JSON.stringify(baseline)}. (Primary signal — robust to same-second timestamps. Timestamps are only a secondary cross-check vs trigger_epoch=${ground.trigger_epoch}.)
    * Track, per responded bot, the latest new-comment time and the total NEW-thread count.
  - A bot is "done" iff it submitted a review (after trigger) OR posted >=1 new comment then stayed quiet > ${wait.quietWindowSec}s.
  - Round COMPLETE iff: (>=1 bot responded) AND (NEW-thread totalCount unchanged across two consecutive polls) AND (all responded bots quiet) -> completed_reason='quiet-stable'.
  - If ${wait.maxTimeoutSec}s elapse first: completed_reason='timeout' (return whatever NEW threads exist).
  - If timeout AND zero new threads: completed_reason='no-response', ok=false (do NOT proceed on empty findings).
Return new_thread_ids (node ids not in baseline) + responded_bots.`,
  { label: 'trigger+wait', phase: 'Trigger', model: 'sonnet', schema: WAIT_SCHEMA }
)
if (!waited || !waited.ok || !(waited.new_thread_ids || []).length) {
  return { aborted: true, stage: 'trigger-wait', reason: waited && waited.completed_reason, waited }
}

// ---------- Phase 2: ingest ----------
phase('Ingest')
const ingest = await agent(
  `${GH}
Ingest ONLY these NEW review threads (node ids): ${JSON.stringify(waited.new_thread_ids)}.
For each: fetch its thread + first comment via graphql. KEEP a finding iff author.login (lowercased, "[bot]" stripped) is in [${botList}] AND the thread is isResolved=false. DROP human-authored threads and already-resolved ones.
Return findings: { thread_id (node id), comment_id (databaseId, as string), file (path), line, summary (the bot's claim, condensed), author, severity_claimed }.`,
  { label: 'ingest', phase: 'Ingest', model: 'sonnet', schema: INGEST_SCHEMA }
)
if (!ingest || !ingest.ok || !Array.isArray(ingest.findings)) {
  return { aborted: true, stage: 'ingest', note: 'ingest agent failed', waited, ingest } // failure != empty
}
if (!ingest.findings.length) {
  return { done: true, note: 'no actionable bot findings after filtering', waited, ingest } // clean: nothing to do
}

// ---------- Phase 3: triage (escalate by confidence/severity) ----------
phase('Triage')
const groundBlob = `GROUND-TRUTH (Phase 0): intent=${ground.intent || ''}; changed_files=${JSON.stringify(ground.changed_files)}; risk=${JSON.stringify(ground.risk_areas || [])}.`
const priorBlob = priorLedger.length ? `\nPRIOR LEDGER (audit only — re-verify against code, do not blindly trust): ${JSON.stringify(priorLedger).slice(0, 4000)}` : ''

function triagePrompt(f) {
  return (who) => `${GH}
You are triaging ONE PR review finding as ${who}. ${groundBlob}${priorBlob}
FINDING ${f.thread_id} @ ${f.file}:${f.line || '?'} — "${f.summary}" (bot-claimed severity: ${f.severity_claimed || 'n/a'}).
Judge it AGAINST THE ACTUAL CODE (read ${f.file}; git blame / git log if needed). Decide verdict:
- accept: the code is genuinely wrong/at-risk and needs a change. Set owner: 'worker' if the fix is small/local/1-file, 'self' if cross-file/risky/subtle.
- already-fixed: a prior commit ALREADY satisfies this; the thread just wasn't resolved. evidence MUST name the exact commit sha and/or code that satisfies it (no commit/code cited -> you may NOT use this verdict).
- reject: false-positive / outdated / out-of-scope. evidence = why.
Self-judge severity (P0/P1/P2/none) from the code — do NOT copy the bot's label. Set confidence honestly.`
}

// Per finding: a first self/worker judgment; escalate medium/low-confidence or high-severity.
const triaged = await pipeline(
  ingest.findings,
  (f) => agent(triagePrompt(f)('orchestrator (self)'), { label: `triage:${f.thread_id}`, phase: 'Triage', model: orchModel, schema: TRIAGE_SCHEMA })
    .then(v => ({ finding: f, verdict: v })),
  async ({ finding: f, verdict: v }) => {
    if (!v) return { finding: f, verdict: null, tier: 'T1', failed: true } // triage agent failed -> NOT dropped silently
    const highStakes = v.severity === 'P0' || v.verdict === 'already-fixed'
    const needPanel = v.confidence !== 'high' || highStakes
    if (!needPanel) return { finding: f, verdict: v, tier: 'T1', escalated: false }
    // T2: independent panel of 3 sonnet verifiers — FULL quorum (4 votes) required.
    const panel = await parallel([0, 1, 2].map(i => () =>
      agent(triagePrompt(f)(`independent verifier #${i + 1} (challenge the proposed verdict "${v.verdict}")`), { label: `triage:${f.thread_id}:panel${i + 1}`, phase: 'Triage', model: 'sonnet', schema: TRIAGE_SCHEMA })
    ))
    const panelOk = panel.filter(Boolean)
    const votes = [v, ...panelOk]
    const tally = votes.reduce((m, x) => (m[x.verdict] = (m[x.verdict] || 0) + 1, m), {})
    const winner = Object.entries(tally).sort((x, y) => y[1] - x[1])[0]
    const consensusVerdict = votes.find(x => x.verdict === winner[0]) || v
    const fullPanel = panelOk.length === 3            // any panel agent null -> incomplete quorum
    const deadlock = !fullPanel || winner[1] < 3      // require >=3/4 agreement on a full panel
    const p0 = v.severity === 'P0' || consensusVerdict.severity === 'P0' // panel may surface a P0 T1 missed
    if (!(p0 || deadlock)) {
      return { finding: f, verdict: consensusVerdict, tier: 'T2', escalated: true, tally }
    }
    // T3: external second-model pass is AUTHORITATIVE (schema-validated, not a note).
    const t3 = await agent(
      `${GH}\nHigh-stakes / deadlocked PR finding — you are the DECIDING second model. ${groundBlob}\nFINDING ${f.thread_id} @ ${f.file}:${f.line || '?'} — "${f.summary}".\nInternal panel tally: ${JSON.stringify(tally)} (votes=${votes.length}). Verify against the ACTUAL code and return the single correct verdict (accept/already-fixed/reject) WITH concrete code/commit evidence; for already-fixed you MUST cite the commit sha. Self-judge severity.`,
      { label: `triage:${f.thread_id}:external`, phase: 'Triage', agentType: externalAgentType, schema: TRIAGE_SCHEMA }
    )
    if (!t3) return { finding: f, verdict: null, tier: 'T3', failed: true, tally } // external unavailable/failed -> do NOT resolve this thread
    return { finding: f, verdict: t3, tier: 'T3', escalated: true, tally } // T3 verdict wins
  }
)
const triagedOk = triaged.filter(t => t && t.verdict)
const triageFailed = triaged.filter(t => t && !t.verdict) // findings that could NOT be triaged — never resolved, surfaced in return
const accepts = triagedOk.filter(t => t.verdict.verdict === 'accept')
const alreadyFixed = triagedOk.filter(t => t.verdict.verdict === 'already-fixed')
const rejects = triagedOk.filter(t => t.verdict.verdict === 'reject')
log(`triage: ${accepts.length} accept / ${alreadyFixed.length} already-fixed / ${rejects.length} reject (of ${ingest.findings.length})`)

// ---------- Phase 4: fix (accepts only) ----------
phase('Fix')
const fixes = await pipeline(
  accepts,
  (t) => {
    const f = t.finding
    const make = (who) => `${GH}
Fix ONE accepted PR finding as ${who}. ${groundBlob}
FINDING ${f.thread_id} @ ${f.file}:${f.line || '?'} — "${f.summary}".
Triage evidence: ${t.verdict.evidence}
Make the MINIMAL correct change (surgical — touch only what this finding requires; no drive-by edits). Then VERIFY with the narrowest relevant check (unit/type/lint per Phase 0 baseline: ${ground.test_build_baseline || 'pick the narrowest relevant check'}) and paste the output. Set resolved + verified honestly; list files_changed.`
    return runEscalated(`fix:${f.thread_id}`, 'Fix', make, FIX_SCHEMA).then(r => ({ finding: f, ...r }))
  }
)
const fixedOk = fixes.filter(x => x && x.result && x.result.resolved && x.result.verified)
const fixFailed = fixes.filter(x => !(x && x.result && x.result.resolved && x.result.verified))

// ---------- Phase 5: land (ledger FIRST, then resolve) ----------
phase('Land')
// Threads safe to resolve: fixed+verified accepts, already-fixed, rejects.
const resolveAccept = fixedOk.map(x => x.finding.thread_id)
const resolveAlready = alreadyFixed.map(t => t.finding.thread_id)
const resolveReject = rejects.map(t => t.finding.thread_id)
const ledgerEntries = [
  ...fixedOk.map(x => ({ thread_id: x.finding.thread_id, comment_id: x.finding.comment_id, finding: { file: x.finding.file, line: x.finding.line, summary: x.finding.summary }, verdict: 'accept', evidence: `fixed; files=${JSON.stringify(x.result.files_changed)}`, rung: x.rung })),
  ...alreadyFixed.map(t => ({ thread_id: t.finding.thread_id, comment_id: t.finding.comment_id, finding: { file: t.finding.file, line: t.finding.line, summary: t.finding.summary }, verdict: 'already-fixed', evidence: t.verdict.evidence })),
  ...rejects.map(t => ({ thread_id: t.finding.thread_id, comment_id: t.finding.comment_id, finding: { file: t.finding.file, line: t.finding.line, summary: t.finding.summary }, verdict: 'reject', evidence: t.verdict.evidence })),
]
// Rung 1: push (only if there were verified fixes). Failure aborts before ledger/resolve.
let push = { ok: true, pushed: false }
if (fixedOk.length) {
  push = await agent(
    `${GH}
Stage ONLY the files changed by the accepted fixes this round, commit (message references PR #${prNum}), then push (use --force-with-lease ONLY if amending an already-pushed commit).${fixFailed.length ? ` Do NOT touch the ${fixFailed.length} unverified findings.` : ''} Return head_sha + pushed.`,
    { label: 'land:push', phase: 'Land', model: 'sonnet', schema: PUSH_SCHEMA }
  ) || { ok: false, pushed: false }
  if (!push.ok) return { aborted: true, stage: 'push', push, triage_failed: triageFailed.map(t => t.finding.thread_id) }
}

// Rung 2: ledger — must be written AND re-read-verified before anything is resolved.
const ledger = await agent(
  `${GH}
Append these ledger entries to ${repo}/${ledgerPath} (mkdir -p its dir; create as a JSON array if absent). Add to EACH entry: "round" = (prior max round in the file) + 1, and "ts" = \`date -u +%s\`. Then RE-READ the file and confirm it parses as JSON and contains the new entries. Set ledger_written=true ONLY if that re-read succeeded.
ENTRIES:
${JSON.stringify(ledgerEntries, null, 2)}`,
  { label: 'land:ledger', phase: 'Land', model: 'sonnet', schema: LEDGER_SCHEMA }
) || { ok: false, ledger_written: false }
if (!ledger.ok || !ledger.ledger_written) {
  // audit must survive -> resolve NOTHING; surface loudly.
  return { aborted: true, stage: 'ledger', note: 'ledger write/verify failed — no threads resolved', push, ledger, triage_failed: triageFailed.map(t => t.finding.thread_id) }
}

// Rung 3: resolve — only reached after a validated ledger.
const resolve = await agent(
  `${GH}
The ledger is written + verified. RESOLVE each thread below: run the resolveReviewThread mutation, then re-query that thread and confirm isResolved=true. NO comment is posted on any thread. Record flips in resolved_thread_ids, any that did NOT flip in failed_resolves.
   - accept (fixed+verified): ${JSON.stringify(resolveAccept)}
   - already-fixed:          ${JSON.stringify(resolveAlready)}
   - reject:                 ${JSON.stringify(resolveReject)}`,
  { label: 'land:resolve', phase: 'Land', model: 'sonnet', schema: RESOLVE_SCHEMA }
) || { ok: false, resolved_thread_ids: [], failed_resolves: [...resolveAccept, ...resolveAlready, ...resolveReject] }

return {
  pr: prNum,
  ok: resolve.ok === true && (resolve.failed_resolves || []).length === 0 && triageFailed.length === 0 && fixFailed.length === 0,
  findings: ingest.findings.length,
  triage: { accept: accepts.length, already_fixed: alreadyFixed.length, reject: rejects.length, escalated: triagedOk.filter(t => t.escalated).map(t => ({ thread: t.finding.thread_id, tier: t.tier })) },
  triage_failed: triageFailed.map(t => t.finding.thread_id),
  fixed: fixedOk.length,
  fix_failed: fixFailed.map(x => x.finding && x.finding.thread_id).filter(Boolean),
  ledger_entries: ledgerEntries.length,
  land: { push, ledger, resolve },
}
