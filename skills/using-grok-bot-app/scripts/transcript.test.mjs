// node --test skills/using-grok-bot-app/scripts/transcript.test.mjs — transcript.mjs's refusals and its read over a fake app.
// The real read is checked live against the app.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createServer } from 'node:net'
import { fileURLToPath } from 'node:url'
import { parseCli, read } from './transcript.mjs'

const CLI = fileURLToPath(new URL('./transcript.mjs', import.meta.url))
const A = 'aaaaaaaa-1111-4222-8333-444444444444'
const B = 'bbbbbbbb-1111-4222-8333-444444444444'

const run = (...args) => {
  const r = spawnSync('node', [CLI, ...args], { encoding: 'utf8' })
  return [r.status, JSON.parse(r.stdout).state]
}

test('argument errors are refused before any connection', () => {
  assert.deepEqual(run('Bot-name'), [2, 'bad-id'])
  assert.deepEqual(run(), [2, 'bad-id'])
  assert.deepEqual(run('aaaaaaaa', 'x'), [2, 'bad-port'])
  assert.deepEqual(run('aaaaaaaa', '1', '--tail', '0'), [2, 'bad-tail'])
  assert.deepEqual(run('aaaaaaaa', '--tail'), [2, 'bad-tail'])
})

test('nothing listening → down', async () => {
  const s = await new Promise(res => { const s = createServer().listen(0, '127.0.0.1', () => res(s)) })
  const port = s.address().port
  await new Promise(r => s.close(r))
  assert.deepEqual(run('aaaaaaaa', String(port)), [2, 'down'])
})

test('parseCli: --tail anywhere, default 1500', () => {
  assert.deepEqual(parseCli(['AAAAAAAA', '--tail', '40', '5'], {}), { id: 'aaaaaaaa', port: 5, tail: 40 })
  assert.deepEqual(parseCli(['aaaaaaaa'], {}), { id: 'aaaaaaaa', port: 39231, tail: 1500 })
})

/** Two bots, B open; a log renders one read after the click. */
function app({ stuck = false, meddle = false } = {}) {
  const a = { current: B, clicks: [], reads: 0 }
  a.d = {
    count: async id => [A, B].filter(x => x.startsWith(id)).length,
    current: async () => a.current,
    click: async id => {
      a.clicks.push(id.slice(0, 8))
      if (!stuck) a.current = [A, B].find(x => x.startsWith(id))
    },
    sleep: async () => {},
    tail: async (id, n) => {
      if (!a.current.startsWith(id)) return null
      if (meddle) a.current = 'cccccccc'
      return a.reads++ ? `log of ${id}`.slice(-n) : ''
    },
  }
  return a
}

test('reads the tail, then opens the previous bot again', async () => {
  const a = app()
  assert.deepEqual(await read(a.d, 'aaaaaaaa', 6), { state: 'ok', tail: 'aaaaaa', bot: 'aaaaaaaa', prev: 'bbbbbbbb', restored: true })
  assert.deepEqual(a.clicks, ['aaaaaaaa', 'bbbbbbbb'])
})

test('the bot already open: no click at all', async () => {
  const a = app()
  assert.equal((await read(a.d, 'bbbbbbbb', 50)).state, 'ok')
  assert.deepEqual(a.clicks, [])
})

test('someone opened another bot meanwhile: it is left open', async () => {
  const a = app({ meddle: true })
  const r = await read(a.d, 'aaaaaaaa', 50)
  assert.deepEqual([r.state, r.restored, a.current], ['no-transcript', false, 'cccccccc'])
  assert.deepEqual(a.clicks, ['aaaaaaaa'])
})

test('no-bot, ambiguous, not-open', async () => {
  assert.equal((await read(app().d, 'dddddddd', 50)).state, 'no-bot')
  assert.equal((await read(app().d, '1111', 50)).state, 'no-bot')
  const amb = app()
  amb.d.count = async () => 2
  assert.equal((await read(amb.d, 'aaaaaaaa', 50)).state, 'ambiguous')
  assert.equal((await read(app({ stuck: true }).d, 'aaaaaaaa', 50)).state, 'not-open')
})

test('a read that throws still opens the previous bot again, then throws', async () => {
  const a = app()
  a.d.tail = async () => { throw new Error('cdp gone') }
  await assert.rejects(read(a.d, 'aaaaaaaa', 6), /cdp gone/)
  assert.deepEqual([a.clicks, a.current], [['aaaaaaaa', 'bbbbbbbb'], B])
})
