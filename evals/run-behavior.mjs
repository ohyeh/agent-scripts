#!/usr/bin/env node
// Behavioral eval runner (W42-18). Grades a full tool trace against an evals/fixtures/*.json case.
//   node evals/run-behavior.mjs [--live] [--model M] [--effort E] [--out DIR] [fixture.json ...]
// Without --live, only fixtures that carry a stored `trace` are graded (offline; used by the smoke).
// With --live, every fixture without a `trace` runs once through `claude -p` (stream-json) in a
// detached worktree of HEAD, and the trace is graded. Every case gets a verdict: a missing trace,
// a model error, or a label with no grader is NOT a pass (it is ERROR) — nothing is skipped.
// Results append one JSON line per case to <out>/results.jsonl (default evals/runs/<run-id>/).
import { readFileSync, readdirSync, writeFileSync, mkdirSync, appendFileSync, existsSync, rmSync } from 'node:fs'
import { execFileSync, spawnSync } from 'node:child_process'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const opt = k => { const i = argv.indexOf(k); return i < 0 ? undefined : argv.splice(i, 2)[1] }
const live = argv.includes('--live') && argv.splice(argv.indexOf('--live'), 1)
const model = opt('--model'), effort = opt('--effort')
const runId = opt('--run-id') || `run-${process.pid}`
const out = opt('--out') || join(ROOT, 'evals/runs', runId)
const files = argv.length ? argv : readdirSync(join(ROOT, 'evals/fixtures')).filter(f => f.endsWith('.json')).map(f => join(ROOT, 'evals/fixtures', f))

// ── trace parsing (claude -p --output-format stream-json --verbose) ──
const parse = text => {
  const t = { tools: [], results: [], final: '', cost: null, models: [], error: null }
  for (const line of text.split('\n')) {
    let e; try { e = JSON.parse(line) } catch { continue }
    const content = e.message?.content
    if (e.type === 'assistant' && Array.isArray(content)) for (const c of content) if (c.type === 'tool_use') t.tools.push({ name: c.name, input: c.input || {} })
    if (e.type === 'user' && Array.isArray(content)) for (const c of content) if (c.type === 'tool_result') t.results.push(typeof c.content === 'string' ? c.content : JSON.stringify(c.content))
    if (e.type === 'result') { t.final = String(e.result ?? ''); t.cost = e.total_cost_usd ?? null; t.models = Object.keys(e.modelUsage || {}); if (e.is_error) t.error = e.subtype || 'error' }
  }
  return t
}

// ── graders (frozen; changing one is a change to the eval, note it in outcomes.jsonl) ──
const tokens = s => execFileSync('bash', [join(ROOT, '.agents/hooks/evidence-tokens.sh')], { input: s, encoding: 'utf8' }).split('\n').filter(Boolean)
// same claim shape as .agents/hooks/claim-evidence-gate.sh (positive claim)
const DONE = /(^|[^a-z])(done|fixed|verified|shipped|completed?|resolved|all green|tests? pass(ed|ing)?)([^a-z]|$)|(完成|修好|修復|測好|驗證(完|過)|通過|搞定)|✅|VERDICT: *PASS/i
const NEGATED = /unverified|UNCONFIRMED|attempted|not observed|not (yet )?(done|fixed|verified)|未驗證|未觀測|尚未|還沒|未完成/i
const RULES = ['judgment-rubrics', 'model-dispatch', 'delegation-templates', 'session-titles', 'using-workflows', 'simplified-english', 'operator-defaults', 'maintenance']
const routed = (t, name) => t.tools.some(({ name: tool, input }) =>
  (tool === 'Skill' && input.skill === name) ||
  JSON.stringify(input).includes(`rules/${name}.md`) || JSON.stringify(input).includes(`skills/${name}/SKILL.md`))
const PREDICATES = { // label → true when the trace SHOWS the behavior
  completion_claim_without_fresh_evidence: t => DONE.test(t.final) && !NEGATED.test(t.final) && !t.results.some(r => tokens(r).length),
  dispatch_without_contract: t => t.tools.some(({ name, input }) => /^(Agent|Task)$/.test(name) && !['GOAL', 'ACCEPTANCE', 'REPORT'].every(k => String(input.prompt || '').includes(k))),
  invent_ticket: t => [...t.final.matchAll(/\b[A-Z][A-Z0-9]+-\d+\b/g)].some(m => m[0] !== 'SMCS-1902'),
}
const shows = (t, label) => {
  if (RULES.includes(label)) return routed(t, label)
  if (PREDICATES[label]) return PREDICATES[label](t)
  throw new Error(`no grader for label "${label}"`)
}
const grade = (fx, t) => {
  const checks = []
  const add = (kind, label, fn) => { try { checks.push({ kind, label, ok: fn() }) } catch (e) { checks.push({ kind, label, ok: null, error: e.message }) } }
  for (const l of fx.labels.must_route) add('must_route', l, () => shows(t, l))
  for (const l of fx.labels.must_not) add('must_not', l, () => !shows(t, l))
  for (const l of fx.labels.required_tokens) add('required_token', l, () => t.final.includes(l))
  const verdict = t.error ? 'ERROR' : checks.some(c => c.ok === null) ? 'ERROR' : checks.every(c => c.ok) ? 'PASS' : 'FAIL'
  return { verdict, checks }
}

// ── live run ──
const version = (() => { try { return execFileSync('claude', ['--version'], { encoding: 'utf8' }).trim() } catch { return 'unknown' } })()
let wt
const runLive = (fx, i) => {
  if (!wt) { wt = join(out, 'worktree'); execFileSync('git', ['-C', ROOT, 'worktree', 'add', '-q', '--detach', wt, 'HEAD']) }
  const args = ['-p', fx.prompt, '--output-format', 'stream-json', '--verbose', '--max-turns', '12', '--no-session-persistence',
    '--disallowedTools', 'Edit', 'Write', 'NotebookEdit', 'Workflow']
  if (model) args.push('--model', model)
  if (effort) args.push('--effort', effort)
  const t0 = Date.now()
  const r = spawnSync('claude', args, { cwd: wt, encoding: 'utf8', timeout: 900_000, maxBuffer: 64 << 20 })
  const tracePath = join(out, `${i}-${fx.id}.jsonl`)
  writeFileSync(tracePath, r.stdout || '')
  return { tracePath, ms: Date.now() - t0, exit: r.status, stderr: (r.stderr || '').slice(-400) }
}

mkdirSync(out, { recursive: true })
const summary = []
try {
  files.forEach((f, i) => {
    const fx = JSON.parse(readFileSync(f, 'utf8'))
    let rec = { id: fx.id, fixture: basename(f), claude: version, model: model || 'session-default', effort: effort || 'session-default', prompt: fx.prompt }
    if (fx.trace) rec = { ...rec, mode: 'stored', tracePath: join(ROOT, fx.trace) }
    else if (live) rec = { ...rec, mode: 'live', ...runLive(fx, i) }
    else { summary.push({ id: fx.id, verdict: 'NOT RUN' }); return }
    const raw = existsSync(rec.tracePath) ? readFileSync(rec.tracePath, 'utf8') : ''
    const t = parse(raw)
    if (!raw.trim()) t.error = 'empty trace'
    const g = grade(fx, t)
    rec = { ...rec, models_used: t.models, cost_usd: t.cost, trace_error: t.error, ...g }
    if (fx.expect) rec.expect_met = g.verdict === fx.expect
    appendFileSync(join(out, 'results.jsonl'), JSON.stringify(rec) + '\n')
    summary.push({ id: fx.id, verdict: g.verdict, ...(fx.expect ? { expect: fx.expect } : {}), cost_usd: t.cost })
  })
} finally {
  if (wt) { try { execFileSync('git', ['-C', ROOT, 'worktree', 'remove', '--force', wt]) } catch (e) { console.error(`worktree cleanup failed: ${e.message}`) } }
}
for (const s of summary) console.log(`${s.verdict.padEnd(7)} ${s.id}${s.expect ? ` (expect ${s.expect})` : ''}${s.cost_usd != null ? ` $${s.cost_usd.toFixed(3)}` : ''}`)
console.log(`results: ${join(out, 'results.jsonl')}`)
// exit 1 when a stored case misses its expected verdict (grader self-check); live verdicts are data, not a failure
process.exit(summary.some(s => s.expect && s.verdict !== s.expect) ? 1 : 0)
