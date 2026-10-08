#!/usr/bin/env node
// Behavioral regression test for spec-implement-dual-review-verify.workflow.js's review ladder
// (model-dispatch.md §Review ladder) and the P2-A5 invariant: a review layer with no reviewer
// left ABORTS at the review stage — never finalized against missing coverage.
//
// The recipe runs under the Workflow harness (agent/parallel/phase/log/args are injected globals;
// `export const meta` is parsed separately, top-level return exits the run). We reproduce that
// contract here: strip `export`, wrap the body in an async function, inject stub globals.
// No test framework by design; this exercises real control flow, not text.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const recipePath = join(here, '..', 'skills', 'using-workflows', 'workflows', 'spec-implement-dual-review-verify.workflow.js')
const src = readFileSync(recipePath, 'utf8').replace(/^export\s+const\s+meta/m, 'const meta')

const M = 'manifest-1'
const V = (open = [], extra = {}) => ({ manifest_start: M, manifest_end: M, open, resolved: [], summary: 's', ...extra })
const MAJOR = { id: 'x', severity: 'Major', status: 'new', issue: 'major', evidence: 'f:1', fix: 'f', check: 'c' }
const known = p => [...new Set([...p.matchAll(/"id": "(L\d-\d+)"/g)].map(m => m[1]))].map(id => ({ id, evidence: 'verified' }))

// policy(seat, round, prompt) → verdict; seat is 'L1:<lens>', 'L1:luna', 'L2', 'L3'
async function run(policy, extraArgs = {}, opts = {}) {
  const calls = [], seen = {}
  const agent = async (prompt, o = {}) => {
    calls.push(`${o.label}|${o.model || ''}|${o.agentType || ''}`)
    if (o.label === 'implement') return 'IMPL_DONE'
    if (o.label.startsWith('fix#')) return { ok: true, summary: 's', actions: [] }
    if (o.label.startsWith('L0#')) return { manifest: M, rc: 0, output: '' }
    if (o.label === 'verify-and-classify') { seen.finalize = prompt; return { summary: 'ok', verified: opts.verified ?? true, amendment_needed: false, deviations: opts.deviations || [] } }
    const [, seat, r] = o.label.match(/^(L[123](?::[a-z-]+)?)#(\d+)$/)
    seen[`${seat}#${r}`] = prompt
    const v = policy(seat, +r, prompt)
    if (v === 'THROW') throw new Error('agent type not found')
    if (seat === 'L1:luna') return v === null ? { ran: false, error: 'exit 1' } : { ran: true, error: '', verdict: v }
    return v
  }
  const parallel = async thunks => Promise.all(thunks.map(t => t().catch(() => null)))   // harness: a throwing thunk → null
  const body = new Function('agent', 'parallel', 'phase', 'log', 'args', `return (async () => {\n${src}\n})()`)
  const result = await body(agent, parallel, () => {}, () => {}, { repoPath: '/tmp/review-gate-test', spec: 'test spec', ...extraArgs })
  return { result, calls, seen }
}

let pass = 0, fail = 0
const check = (m, cond, got) => { if (cond) { console.log(`  ok   ${m}`); pass++ } else { console.error(`  FAIL ${m}\n       got: ${got}`); fail++ } }
const clean = (s, r, p) => V([], { resolved: known(p) })
const seq = calls => calls.filter(c => /^L[123]/.test(c)).map(c => c.split('|')[0].replace(/#\d+$/, '')).join(' ')

{ const { result } = await run((s, r, p) => s === 'L1:pr-test-analyzer' ? 'THROW' : clean(s, r, p))
  check('an L1 seat that throws is a warning, not a silent skip', result.verified === true && result.warnings.some(w => /pr-test-analyzer: threw/.test(w)), JSON.stringify(result.warnings)) }
{ const { seen } = await run((s, r, p) => s === 'L1:silent-failure-hunter' && r === 1 ? V([MAJOR]) : clean(s, r, p))
  const p2 = seen['L1:luna#2'] || ''
  check('round 2 gets the fix diff by pipe, no shared file', /\| diff -u \S+r1\.prev\.diff -/.test(p2) && !/now\.diff/.test(p2), p2.slice(0, 200)) }
{ const { result } = await run(clean, { isolation: 'worktree' })
  check('rejects isolation (the ladder needs one live tree)', result.aborted === true && !result.stage, JSON.stringify(result)) }
for (const [k, v] of [['cli', 'codex'], ['l1Lenses', ['code-reviewer']], ['maxReviewRounds', 0], ['reviewEffort', 'low']]) {
  const { result } = await run(clean, { [k]: v })
  check(`rejects ${k}=${JSON.stringify(v)}`, result.aborted === true && !result.stage, JSON.stringify(result))
}
{ const { result, calls, seen } = await run(clean)
  check('L1 = toolkit lenses on sonnet + luna; L2 = code-reviewer on opus', seq(calls) === 'L1:silent-failure-hunter L1:pr-test-analyzer L1:luna L2', seq(calls))
  check('L1 lenses use their toolkit agent type on sonnet', calls.some(c => c.startsWith('L1:pr-test-analyzer#1|sonnet|pr-review-toolkit:pr-test-analyzer')), calls.join('\n'))
  check('L2 uses pr-review-toolkit:code-reviewer on opus', calls.some(c => c.startsWith('L2#1|opus|pr-review-toolkit:code-reviewer')), calls.join('\n'))
  check('clean ladder reaches a no-edit finalizer and verifies', result.verified === true && /do NOT edit any file/.test(seen.finalize), JSON.stringify(result)) }
{ const { result } = await run((s, r, p) => s === 'L2' ? null : clean(s, r, p))
  check('L2 reviewer missing aborts at review (P2-A5)', result.aborted === true && result.stage === 'review', JSON.stringify(result)) }
{ const { result } = await run((s, r, p) => s.startsWith('L1') ? null : clean(s, r, p))
  check('every L1 seat missing aborts at review', result.aborted === true && result.stage === 'review', JSON.stringify(result)) }
{ const { result } = await run((s, r, p) => s === 'L1:silent-failure-hunter' ? null : clean(s, r, p))
  check('one L1 seat missing is a warning, review continues', result.verified === true && result.warnings.some(w => /silent-failure-hunter/.test(w)), JSON.stringify(result.warnings)) }
{ const { result, calls } = await run((s, r, p) => s === 'L3' ? clean(s, r, p) : s === 'L2' ? V([MAJOR]) : clean(s, r, p))
  check('L2 blocks 3 rounds, then L3 code-reviewer on fable decides', result.verified === true && calls.some(c => c.startsWith('L3#1|fable|pr-review-toolkit:code-reviewer')), seq(calls)) }
{ const { result } = await run((s) => V([MAJOR]))
  check('every layer blocks: aborted at review, needs the user', result.aborted === true && result.stage === 'review' && result.needsUser === true && result.blockers.length > 0, JSON.stringify(result)) }
{ const { result } = await run(clean, {}, { verified: false })
  check('verification failure is not a success', result.aborted === true && result.stage === 'finalize', JSON.stringify(result)) }
{ const { result } = await run(clean, {}, { deviations: [{ what: 'w', classification: 'amendment-needed' }] })
  check('amendment-needed stops before success', result.aborted === true && result.needsUser === true, JSON.stringify(result)) }

console.log(`review-gate smoke: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
