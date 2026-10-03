// node --test skills/using-grok-bot-app/scripts/ensure.test.mjs — ensure.mjs's decisions and recovery,
// over a fake app (no process is started or stopped). The real restart is checked live.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { BUDGET_MS, judge, recover, tcpLock } from './ensure.mjs'

const renderer = { type: 'page', url: 'file:///Applications/Grok%20Bot.app/Contents/Resources/app.asar/dist/renderer/index.html' }

test('judge: down, ok, no-window, and a listener that is not Grok Bot is taken', () => {
  assert.equal(judge(null, false), 'down')
  assert.equal(judge([renderer], true), 'ok')
  assert.equal(judge([], true), 'no-window')
  assert.equal(judge([], false), 'taken', 'an empty list from someone else proves nothing')
  assert.equal(judge([{ type: 'page', url: 'http://localhost:3000/' }], false), 'taken')
})

/**
 * One app and one lock shared by every caller. app: 'off' | 'no-port' | 'up' | 'no-window';
 * foreign: someone else listens on the port. Effects advance a fake clock.
 */
function world(app, { foreign = false } = {}) {
  const w = { app, foreign, events: [], locked: false, t: 0 }
  w.d = () => ({
    now: () => w.t,
    sleep: async ms => {
      w.t += ms
      await new Promise(r => setImmediate(r))
    },
    pages: async () => (w.foreign ? [] : w.app === 'up' ? [renderer] : w.app === 'no-window' ? [] : null),
    ownerIsApp: async () => !w.foreign && (w.app === 'up' || w.app === 'no-window'),
    running: () => w.app !== 'off',
    open: withPort => {
      w.events.push(withPort ? 'launch' : 'reopen')
      if (w.foreign) return
      if (withPort) w.app = 'up'
      else if (w.app === 'no-window') w.app = 'up'
      else if (w.app === 'off') w.app = 'no-port'
    },
    quit: () => {
      w.events.push('quit')
      w.app = 'off'
    },
    sidebarOk: async () => w.app === 'up' && !w.foreign,
    lock: () => {
      if (w.locked) return null
      w.locked = true
      return () => (w.locked = false)
    },
  })
  return w
}

test('the app runs without the port: one quit, one launch', async () => {
  const w = world('no-port')
  assert.equal(await recover(w.d()), 'restarted')
  assert.deepEqual(w.events, ['quit', 'launch'])
})

test('not running: launch only', async () => {
  const w = world('off')
  assert.equal(await recover(w.d()), 'launched')
  assert.deepEqual(w.events, ['launch'])
})

test('Grok Bot listening with its window closed: reopen, never quit', async () => {
  const w = world('no-window')
  assert.equal(await recover(w.d()), 'reopened')
  assert.deepEqual(w.events, ['reopen'])
})

test('two callers, one outage: one quit and one launch; the late caller never quits the new app (Sol r2 P1)', async () => {
  const w = world('no-port')
  const [a, b] = await Promise.all([recover(w.d()), recover(w.d())])
  assert.deepEqual(w.events, ['quit', 'launch'])
  assert.deepEqual([a, b].sort(), ['ok', 'restarted'])
})

test('someone else on the port answering an empty list: no reopen, no quit, port-taken (Sol r2 P1)', async () => {
  const w = world('no-port', { foreign: true })
  assert.equal(await recover(w.d()), 'port-taken')
  assert.deepEqual(w.events, [])
})

test('another caller fixes the app while this one waits for the lock: re-checked under the lock, no quit', async () => {
  const w = world('no-port')
  w.locked = true
  const d = w.d()
  const sleep = d.sleep
  // The other caller finishes during this caller's first wait: app up, lock free.
  d.sleep = async ms => {
    w.app = 'up'
    w.locked = false
    d.sleep = sleep
    await sleep(ms)
  }
  assert.equal(await recover(d), 'ok')
  assert.deepEqual(w.events, [])
})

test('the lock comes free too late for a safe quit-and-relaunch: busy, nothing quit (Sol r3 P1)', async () => {
  const w = world('no-port')
  w.locked = true
  const d = w.d()
  const sleep = d.sleep
  d.sleep = async ms => {
    await sleep(ms)
    if (w.t >= 35_000) w.locked = false // a peer died holding it, freed at 35 s
  }
  assert.equal(await recover(d), 'busy')
  assert.deepEqual(w.events, [])
})

test('a recovery that starts finishes inside the budget, under the callers\' 90 s', async () => {
  const w = world('no-port')
  assert.equal(await recover(w.d()), 'restarted')
  assert.ok(w.t <= BUDGET_MS && BUDGET_MS < 90_000, `took ${w.t} ms of fake time`)
})

test('tcpLock: exclusive while held, free after release, and free when its holder is killed (Sol r3 P1)', async () => {
  const port = 39877
  const a = await tcpLock(port)
  assert.ok(a)
  assert.equal(await tcpLock(port), null, 'a second taker is refused')
  await a()
  const b = await tcpLock(port)
  assert.ok(b, 'free after release')
  await b()
  // A holder that is killed, not released: the kernel frees the port.
  const child = spawn(process.execPath, ['-e', `require('net').createServer().listen(${port}, '127.0.0.1', () => console.log('held'))`])
  await new Promise(r => child.stdout.once('data', r))
  assert.equal(await tcpLock(port), null, 'held by the child')
  child.kill('SIGKILL')
  await new Promise(r => child.once('exit', r))
  const c = await tcpLock(port)
  assert.ok(c, 'free after the holder was killed')
  await c()
})
