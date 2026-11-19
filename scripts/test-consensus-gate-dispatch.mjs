import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../skills/using-workflows/workflows/consensus-gate.workflow.js', import.meta.url), 'utf8')
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor
const run = new AsyncFunction('args', 'agent', 'phase', 'log', source.replace(/^export const meta/m, 'const meta'))
const manifest = 'head h1\ndiff d1\nfreeze f1'
async function replay(names, worker) {
  const ops = []
  const args = { proposalFile: '/abs/p.md', cli: 'sol', layer: 'L2', l0: 'test-command', worker }
  const permitted = { ok: true, verdict: 'VERDICT: PASS', consensus: 'agree', notes: '',
    manifest_before: manifest, manifest_after: manifest, l0_rc: 0, l0_output: 'ok', timed_out: false }
  const result = await run(args, async (prompt, options) => {
    assert(!ops.includes('agent'), 'preflight must use the same conduit')
    ops.push('agent')
    const first = worker ? 'tell' : 'assign'
    const step0 = prompt.split('1. Ensure')[0]
    assert.match(step0, /0\. Before any L0 command/)
    assert.match(step0, new RegExp('tmux-agent ' + first + ' and await'))
    assert.match(step0, /Accept equivalent tmux-agent tools under runtime-specific names/)
    assert.match(prompt, /Use the exact callable names you found/)
    assert.doesNotMatch(prompt, /select:mcp__tmux-agent__/)
    assert.equal(options.schema.properties.missing_dispatch.type, 'string')
    const missing = [first, 'await'].find(op => !names.some(name => name.endsWith('__' + op)))
    if (missing) return { ...permitted, ok: false, verdict: '', consensus: 'unclear',
      manifest_before: '', manifest_after: '', l0_output: '', missing_dispatch: 'fixture runtime missing ' + missing }
    ops.push('L0', first, 'await')
    return permitted
  }, () => {}, () => {})
  return { result, ops }
}
const missing = await replay(['mcp__alternate__assign'])
assert.equal(missing.result.aborted, true)
assert.match(missing.result.reason, /missing await/)
assert.deepEqual(missing.ops, ['agent'])
const fresh = await replay(['mcp__alternate__assign', 'mcp__alternate__await'])
assert.equal(fresh.result.passed, true)
assert.deepEqual(fresh.ops, ['agent', 'L0', 'assign', 'await'])
const resumed = await replay(['mcp__alternate__tell', 'mcp__alternate__await'], 'worker-1')
assert.equal(resumed.result.passed, true)
assert.deepEqual(resumed.ops, ['agent', 'L0', 'tell', 'await'])
console.log('PASS W48-15: same-conduit capability check handles missing, aliased, and resume tools')
