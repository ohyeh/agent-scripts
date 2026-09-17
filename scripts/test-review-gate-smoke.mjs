#!/usr/bin/env node
// Behavioral regression test for the P2-A5 root-cause fix in
// spec-implement-dual-review-verify.workflow.js: dual review is an INVARIANT.
// A missing reviewer must ABORT at the review stage — never get papered over
// with placeholder text and finalized against half the coverage.
//
// The recipe runs under the Workflow harness (agent/parallel/phase/log/args are
// injected globals; `export const meta` is parsed separately, top-level return
// exits the run). We reproduce that contract here: strip `export`, wrap the body
// in an async function, inject stub globals, and drive it to the review gate.
//
// No test framework by design — mirrors the repo's grep-style smoke tests, but
// this one exercises real control flow, not text.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import assert from 'node:assert/strict'

const here = dirname(fileURLToPath(import.meta.url))
const recipePath = join(here, '..', 'skills', 'using-workflows', 'workflows', 'spec-implement-dual-review-verify.workflow.js')
const src = readFileSync(recipePath, 'utf8').replace(/^export\s+const\s+meta/m, 'const meta')

const CLI = 'codex'

// Run the recipe body once with a given review scenario. Returns { result, calls, finalizePrompt }.
async function runRecipe({ external, claude }) {
  const calls = []
  let finalizePrompt = null
  const agent = async (prompt, opts = {}) => {
    const label = opts.label
    calls.push(label)
    if (label === 'implement') return 'IMPL_DONE'
    if (label === `review:${CLI}`) return external
    if (label === 'review:claude') return claude
    if (label === 'fix-and-verify') {
      finalizePrompt = prompt
      return { summary: 'ok', verified: true, amendment_needed: false, deviations: [] }
    }
    return null
  }
  const parallel = async (thunks) => Promise.all(thunks.map((t) => t()))
  const pipeline = async (items, ...stages) => { throw new Error('pipeline not expected in this recipe') }
  const phase = () => {}
  const log = () => {}
  const budget = { total: null, spent: () => 0, remaining: () => Infinity }
  const args = { repoPath: '/tmp/review-gate-test', spec: 'test spec', cli: CLI }

  const body = new Function(
    'agent', 'parallel', 'pipeline', 'phase', 'log', 'budget', 'args',
    `return (async () => {\n${src}\n})()`,
  )
  const result = await body(agent, parallel, pipeline, phase, log, budget, args)
  return { result, calls, finalizePrompt }
}

let pass = 0, fail = 0
const ok = (m) => { console.log(`  ok   ${m}`); pass++ }
const check = (m, fn) => { try { fn(); ok(m) } catch (e) { console.error(`  FAIL ${m}\n       ${e.message}`); fail++ } }

// Case A: external reviewer missing → abort at review, finalize never runs.
{
  const { result, calls } = await runRecipe({ external: null, claude: 'B: no issues' })
  check('external-missing aborts at review stage', () => {
    assert.equal(result.aborted, true)
    assert.equal(result.stage, 'review')
  })
  check('external-missing never calls the finalizer', () => {
    assert.ok(!calls.includes('fix-and-verify'), `finalizer was called: ${calls.join(',')}`)
  })
}

// Case B: claude reviewer missing → same abort (symmetric invariant).
{
  const { result, calls } = await runRecipe({ external: 'A: no issues', claude: null })
  check('claude-missing aborts at review stage (symmetric)', () => {
    assert.equal(result.aborted, true)
    assert.equal(result.stage, 'review')
  })
  check('claude-missing never calls the finalizer', () => {
    assert.ok(!calls.includes('fix-and-verify'), `finalizer was called: ${calls.join(',')}`)
  })
}

// Case C: both present → finalize runs, no placeholder text, both reviews embedded.
{
  const { result, calls, finalizePrompt } = await runRecipe({ external: 'A: fix the quoting', claude: 'B: add error handling' })
  check('both-present reaches the finalizer', () => {
    assert.ok(calls.includes('fix-and-verify'), `finalizer not called: ${calls.join(',')}`)
  })
  check('finalize prompt carries NO "unavailable" placeholder', () => {
    assert.ok(!/unavailable/.test(finalizePrompt), 'placeholder "unavailable" leaked into finalize prompt')
  })
  check('finalize prompt embeds both real reviews', () => {
    assert.ok(finalizePrompt.includes('A: fix the quoting'), 'external review missing from finalize prompt')
    assert.ok(finalizePrompt.includes('B: add error handling'), 'claude review missing from finalize prompt')
  })
  check('both-present finalizes as success', () => {
    assert.equal(result.verified, true)
    assert.equal(result.external_available, true)
    assert.equal(result.claude_available, true)
  })
}

console.log(`review-gate smoke: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
