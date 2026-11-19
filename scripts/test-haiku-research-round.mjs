import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../skills/using-workflows/workflows/haiku-research-round.workflow.js', import.meta.url), 'utf8')
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor
const run = new AsyncFunction('args', 'agent', 'parallel', 'phase', 'log', source.replace(/^export const meta/m, 'const meta'))
const args = { context: 'test', scratchDir: '/abs/test-scratch', scouts: [{ key: 'fox', prompt: 'test' }] }
const empty = { findings: [], open_questions: [], blockers: ['valid structured response'] }
const found = { findings: [{ claim: 'fact', source: 'https://example.com', status: 'documented' }], open_questions: [], blockers: [] }
async function replay(primary, fallback, input = args) {
  const calls = []
  const agent = async (prompt, { label }) => {
    calls.push({ prompt, label })
    if (label.endsWith('-scratch')) return fallback
    if (primary instanceof Error) throw primary
    return primary
  }
  const { scouts: [scout] } = await run(input, agent, tasks => Promise.all(tasks.map(task => task())), () => {}, () => {})
  return { scout, calls }
}
const recovered = await replay(null, found)
assert.equal(recovered.scout.source, 'scratch_file')
assert.match(recovered.scout.scratch_file, /^\/abs\/test-scratch\/research-[^/]+\/fox\.md$/)
assert.deepEqual(recovered.scout.findings, found.findings)
assert.equal(recovered.calls.length, 2)
assert(recovered.calls.every(({ prompt }) => prompt.includes(recovered.scout.scratch_file)))
assert.notEqual(recovered.scout.scratch_file, (await replay(null, found)).scout.scratch_file)
const structured = await replay(empty, found)
assert.deepEqual(structured.scout, { key: 'fox', ...empty, source: 'structured' })
assert.equal(structured.calls.length, 1)
const blocked = await replay(new Error('scout denied'), found)
assert.deepEqual(blocked.scout, { key: 'fox', failed: true })
assert.equal(blocked.calls.length, 1)
assert.equal((await replay(null, empty)).scout.failed, true)
assert.equal((await replay(null, found, { ...args, scratchDir: undefined })).calls.length, 1)
await assert.rejects(
  () => replay(null, found, { ...args, scouts: [args.scouts[0], { key: 'FOX', prompt: 'test' }] }),
  /scratch scout keys must be unique/,
)
console.log('PASS W48-14: current scratch recovered, structured output retained, rejection and missing scratch stay failed')
