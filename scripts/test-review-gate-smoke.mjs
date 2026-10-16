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

const M = 'a'.repeat(64)   // reviewers return the bare hex; L0 returns shasum's "<hex>  -" (seen in real journals)
const V = (open = [], extra = {}) => ({ manifest_start: M, manifest_end: M, open, resolved: [], summary: 's', ...extra })
const MAJOR = { id: 'x', severity: 'Major', status: 'new', issue: 'major', evidence: 'f:1', fix: 'f', check: 'c' }
const known = p => [...new Set([...p.matchAll(/"id": "((?:L\d|TK)-\d+)"/g)].map(m => m[1]))].map(id => ({ id, evidence: 'verified' }))

// policy(seat, round, prompt, model) → verdict; seat is 'L1:code-reviewer', 'L1:luna', 'TK:<agent>', 'L2'
async function run(policy, extraArgs = {}, opts = {}) {
  const calls = [], seen = {}
  const agent = async (prompt, o = {}) => {
    calls.push(`${o.label}|${o.model || ''}|${o.agentType || ''}|${o.effort || ''}`)
    if (o.label === 'implement') return 'IMPL_DONE'
    if (o.label.startsWith('fix#')) { seen.fix = prompt; return { ok: true, summary: 's', actions: [] } }
    if (o.label.startsWith('L0#')) { seen.l0 = prompt; return { manifest: `${M}  -`, rc: 0, output: 'L0-OUT-42' } }
    if (o.label === 'verify-and-classify') { seen.finalize = prompt; return { summary: 'ok', manifest: opts.finalManifest ?? M, verified: opts.verified ?? true, amendment_needed: false, deviations: opts.deviations || [] } }
    const [, seat, r] = o.label.match(/^((?:L[123]|TK)(?::[a-z-]+)?)#(\d+)$/)
    seen[`${seat}#${r}`] = prompt
    const v = policy(seat, +r, prompt, o.model)
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
const seq = calls => calls.filter(c => /^(L[123]|TK|fix)/.test(c)).map(c => c.split('|')[0].replace(/#\d+$/, '')).join(' ')

const TWO = { toolkit: ['silent-failure-hunter', 'pr-test-analyzer'], luna: true }
const TK4 = 'TK:silent-failure-hunter TK:pr-test-analyzer TK:type-design-analyzer TK:comment-analyzer'
{ const { result } = await run((s, r, p) => s === 'TK:pr-test-analyzer' ? 'THROW' : clean(s, r, p))
  check('a TK seat that throws is a warning, not a silent skip', result.verified === true && result.warnings.some(w => /pr-test-analyzer: threw/.test(w)), JSON.stringify(result.warnings)) }
{ const { seen } = await run((s, r, p) => s === 'L1:code-reviewer' && r === 1 ? V([MAJOR]) : clean(s, r, p))
  const p2 = seen['L1:code-reviewer#2'] || ''
  check('round 2 gets the fix diff by pipe, no shared file', /\| diff -u \S+r1\.prev\.diff -/.test(p2) && !/now\.diff/.test(p2), p2.slice(0, 200))
  const l2 = seen['L2#1'] || ''
  check('reviewers get the L0 output and must not run checks', l2.includes('L0-OUT-42') && /Read-only: do not edit files or run build, test, lint/.test(l2), l2.slice(0, 300))
  check('the fixer runs a narrow check, not the full L0 set', /narrowest check/.test(seen.fix) && !/run the L0 checks/.test(seen.fix), seen.fix.slice(0, 200)) }
{ const { seen } = await run(clean, { verifyCommands: ['npm test'] })
  check('L0 hashes the tree after the verify commands', seen.l0.indexOf('npm test') < seen.l0.indexOf('shasum'), seen.l0)
  check('the finalizer reuses the L0 evidence, it does not rerun verify', seen.finalize.includes('L0-OUT-42') && !seen.finalize.includes('npm test'), seen.finalize.slice(0, 300)) }
{ const { result } = await run(clean, {}, { finalManifest: 'b'.repeat(64) })
  check('a tree change after the last L0 stops finalize', result.aborted === true && result.stage === 'finalize' && /changed after/.test(result.reason), JSON.stringify(result)) }
{ const { seen } = await run(clean)
  check('without verifyCommands, L0 still picks and runs the narrowest checks', /choose and run the narrowest relevant checks/.test(seen.l0), seen.l0) }
{ const { result } = await run(clean, { isolation: 'worktree' })
  check('rejects isolation (the ladder needs one live tree)', result.aborted === true && !result.stage, JSON.stringify(result)) }
for (const [k, v] of [['cli', 'codex'], ['l1Lenses', []], ['toolkit', ['code-reviewer']], ['luna', 'yes'], ['maxReviewRounds', 0], ['reviewEffort', 'low']]) {
  const { result } = await run(clean, { [k]: v })
  check(`rejects ${k}=${JSON.stringify(v)}`, result.aborted === true && !result.stage, JSON.stringify(result))
}
{ const { result, calls, seen } = await run(clean)
  check('default: L1 sonnet high code-reviewer → TK all four toolkit agents once (sonnet high) → L2 code-reviewer', seq(calls) === `L1:code-reviewer ${TK4} L2` && calls.some(c => c.startsWith('L1:code-reviewer#1|sonnet|pr-review-toolkit:code-reviewer|high')) && calls.some(c => c.startsWith('TK:comment-analyzer#1|sonnet|pr-review-toolkit:comment-analyzer|high')), calls.join('\n'))
  check('L0 runs on sonnet medium, not opus', calls.some(c => /^L0#1\|sonnet\|[^|]*\|medium$/.test(c)), calls.join('\n'))
  check('TK reviewers are asked for the full report in their own area', /full report/.test(seen['TK:pr-test-analyzer#1'] || '') && !/full report/.test(seen['L2#1'] || ''), (seen['TK:pr-test-analyzer#1'] || '').slice(0, 300))
  check('L2 uses pr-review-toolkit:code-reviewer on fable medium (best tier), no opus when fable answers', calls.some(c => c === 'L2#1|fable|pr-review-toolkit:code-reviewer|medium') && !calls.some(c => c.startsWith('L2#1|opus')), calls.join('\n'))
  check('clean ladder reaches a no-edit finalizer and verifies', result.verified === true && /do NOT edit any file/.test(seen.finalize), JSON.stringify(result)) }
{ const { result } = await run((s, r, p) => s === 'L2' ? null : clean(s, r, p))
  check('L2 reviewer missing aborts at review (P2-A5)', result.aborted === true && result.stage === 'review', JSON.stringify(result)) }
{ const { result } = await run((s, r, p) => s.startsWith('L1') ? null : clean(s, r, p))
  check('every L1 seat missing aborts at review', result.aborted === true && result.stage === 'review', JSON.stringify(result)) }
{ const { calls } = await run(clean, { toolkit: [] })
  check('toolkit: [] skips the TK step', seq(calls) === 'L1:code-reviewer L2', seq(calls)) }
{ const { result, calls } = await run((s, r, p) => s === 'TK:silent-failure-hunter' ? V([MAJOR]) : clean(s, r, p))
  check('TK runs one round: its Major goes to the fixer once, then L2 clears it', result.verified === true && seq(calls) === `L1:code-reviewer ${TK4} fix L2`, seq(calls)) }
{ const MINOR = { ...MAJOR, severity: 'Minor', issue: 'minor' }
  const { result, calls, seen } = await run((s, r, p) => s === 'TK:comment-analyzer' ? V([MINOR]) : clean(s, r, p))
  check('a TK-only Minor still goes to the fixer once, and L2 sees it', result.verified === true && seq(calls) === `L1:code-reviewer ${TK4} fix L2` && /"id": "TK-1"/.test(seen.fix) && /"id": "TK-1"/.test(seen['L2#1'] || ''), seq(calls)) }
{ const { calls } = await run(clean, TWO)
  check('luna joins L1 and toolkit picks the TK agents', seq(calls) === 'L1:code-reviewer L1:luna TK:silent-failure-hunter TK:pr-test-analyzer L2' && calls.some(c => c.startsWith('TK:pr-test-analyzer#1|sonnet|pr-review-toolkit:pr-test-analyzer')), calls.join('\n')) }
{ const { result } = await run((s, r, p) => s === 'L1:luna' ? null : clean(s, r, p), TWO)
  check('one L1 seat missing is a warning, review continues', result.verified === true && result.warnings.some(w => /luna/.test(w)), JSON.stringify(result.warnings)) }
{ const { result, calls } = await run((s, r, p, m) => s === 'L2' && m === 'fable' ? null : clean(s, r, p))
  check('L2 fable gives no verdict → opus at reviewEffort reviews', result.verified === true && calls.some(c => c.startsWith('L2#1|opus|pr-review-toolkit:code-reviewer|high')), calls.join('\n')) }
{ const { result, calls } = await run((s, r, p) => s === 'L2' ? V([MAJOR]) : clean(s, r, p))
  check('L2 blocks 3 rounds: no L3, stops and needs the user', result.aborted === true && result.needsUser === true && /ask the user/.test(result.reason || result.summary || JSON.stringify(result)) && !calls.some(c => c.startsWith('L3')), JSON.stringify(result)) }
{ const { result } = await run((s) => V([MAJOR]))
  check('every layer blocks: aborted at review, needs the user', result.aborted === true && result.stage === 'review' && result.needsUser === true && result.blockers.length > 0, JSON.stringify(result)) }
{ const { result } = await run(clean, {}, { verified: false })
  check('verification failure is not a success', result.aborted === true && result.stage === 'finalize', JSON.stringify(result)) }
{ const { result } = await run(clean, {}, { deviations: [{ what: 'w', classification: 'amendment-needed' }] })
  check('amendment-needed stops before success', result.aborted === true && result.needsUser === true, JSON.stringify(result)) }

console.log(`review-gate smoke: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
