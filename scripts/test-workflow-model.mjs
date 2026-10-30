import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
const root = new URL('../skills/using-workflows/workflows/', import.meta.url)
const recipes = ['plan-pipeline', 'feature-plan-consensus']
const area = { key: 'core', scope: 'entry point' }

for (const name of recipes) {
  const source = readFileSync(new URL(`${name}.workflow.js`, root), 'utf8')
  const run = new AsyncFunction('args', 'agent', 'parallel', 'phase', 'log', source.replace(/\bexport\s+/g, ''))
  console.log(`${name}: AsyncFunction parse PASS`)
  const args = { repoPath: '/repo', brief: 'goal', featureBrief: 'goal', slug: 'model-test', skipDirection: true, areas: [area] }
  const modelPath = name === 'plan-pipeline'
    ? '/repo/.workflow/next-direction/model-test/system-model.json' : '/repo/.workflow/model-test/system-model.json'
  const valid = { path: modelPath, diagram: 'flowchart LR\n A --> B', transitions: ['T1: caller enters; no guard; effect B; src/a:1'], invariants: ['INV-1: one result'], assumptions: [] }
  const discovery = { area: 'core', existing: [], gaps: [{ task: 'change', effort: 'S' }], risks: [] }
  for (const bad of [null, { ...valid, diagram: ' ' }, { ...valid, transitions: [''] }, { ...valid, path: '/wrong/system-model.json' }, 'throw']) {
    const calls = [], phases = []
    const result = await run(args, async (prompt, opts) => {
      calls.push(opts)
      if (opts.phase === 'Discover') return discovery
      assert.equal(opts.phase, 'Model', 'failure must stop before Plan/Synthesize')
      if (bad === 'throw') throw new Error('fixture agent failure')
      return bad
    }, xs => Promise.all(xs.map(fn => fn())), p => phases.push(p), () => {})
    assert.equal(result.stage, 'model')
    assert.equal(result.needsUser, true)
    const attempts = calls.filter(x => x.phase === 'Model')
    assert.deepEqual(attempts.map(x => [x.model, x.effort]), [['opus', 'high'], ['opus', 'xhigh']])
    assert.ok(!phases.includes('Plan') && !phases.includes('Synthesize'))
  }
  console.log(`${name}: Model failure/invalid data/throw stops before planning; same 2-attempt retry PASS`)
  const marker = new Error('reached planning')
  let tries = 0
  await assert.rejects(run(args, async (prompt, opts) => {
    if (opts.phase === 'Discover') return discovery
    if (opts.phase === 'Model') return ++tries === 1 ? null : valid
    assert.match(prompt, new RegExp(modelPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    assert.match(prompt, /T1/)
    throw marker
  }, xs => Promise.all(xs.map(fn => fn())), () => {}, () => {}), e => e === marker)
  assert.equal(tries, 2)
  console.log(`${name}: retry recovery passes the model path and transition IDs to planning PASS`)
  assert.ok(!source.includes('pstack'))
  assert.match(source, /\\\\nMODEL: \$\{dispatchModel\}/)
}
console.log('workflow Model contract: PASS (2 recipes)')
