// node --test skills/using-grok-bot-app/scripts/ensure.test.mjs — ensure.mjs's decisions and recovery,
// over a fake app (no process is started or stopped). The real restart is checked live.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { connect } from 'node:net'
import { BUDGET_MS, T, judge, recover, tcpLock } from './ensure.mjs'

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
 * foreign: someone else listens on the port. Effects advance a fake clock: by `slow`, each
 * takes its whole T bound. stuck: reopen does not bring the window back. quitTakes: ms from
 * a plain quit to exit (a forced one is instant). launchTakes: ms from launch to the renderer
 * (seen live: about 3 s). deaf: a launch never brings the renderer up.
 */
function world(app, { foreign = false, slow = false, stuck = false, quitTakes = 0, launchTakes = 0, deaf = false } = {}) {
  const w = { app, foreign, events: [], locked: false, t: 0, offAt: null, upAt: null }
  const cost = ms => {
    if (slow) w.t += ms
    if (w.offAt !== null && w.t >= w.offAt) [w.app, w.offAt] = ['off', null]
    if (w.upAt !== null && w.t >= w.upAt) [w.app, w.upAt] = ['up', null]
  }
  w.d = () => ({
    now: () => w.t,
    sleep: async ms => {
      w.t += ms
      if (w.t > 10 * BUDGET_MS) throw new Error('waited past any budget')
      cost(0)
      await new Promise(r => setImmediate(r))
    },
    pages: async () => (cost(T.fetch), w.foreign ? [] : w.app === 'up' ? [renderer] : w.app === 'no-window' ? [] : null),
    ownerIsApp: async () => (cost(2 * T.sh), !w.foreign && (w.app === 'up' || w.app === 'no-window')),
    running: () => (cost(T.sh), w.app !== 'off'),
    open: withPort => {
      cost(T.open)
      w.events.push(slow ? `${withPort ? 'launch' : 'reopen'}@${w.t}` : withPort ? 'launch' : 'reopen')
      if (w.foreign) return
      if (withPort) {
        w.app = 'no-port'
        if (!deaf) launchTakes ? (w.upAt = w.t + launchTakes) : (w.app = 'up')
      }
      else if (w.app === 'no-window' && !stuck) w.app = 'up'
      else if (w.app === 'off') w.app = 'no-port'
    },
    quit: force => {
      cost(T.sh)
      w.events.push(slow ? `${force ? 'kill' : 'quit'}@${w.t}` : force ? 'kill' : 'quit')
      if (force || !quitTakes) [w.app, w.offAt] = ['off', null]
      else w.offAt ??= w.t + quitTakes
    },
    sidebarOk: async () => (cost(T.sidebar), w.app === 'up' && !w.foreign),
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

// Sol r4 P1: every effect takes its whole bound; the run must still end inside the budget,
// and an app it quit must be relaunched.
const quitThenLaunched = w => {
  const q = w.events.findIndex(e => /^(quit|kill)/.test(e))
  return q < 0 || w.events.slice(q).some(e => e.startsWith('launch'))
}

test('every effect at its bound, lock at 29 s, reopen fails, quit hangs: no quit without time to relaunch (Sol r4 P1)', async () => {
  const w = world('no-window', { slow: true, stuck: true, quitTakes: 26_000, launchTakes: 3_000 })
  w.locked = true
  const d = w.d()
  const sleep = d.sleep
  d.sleep = async ms => {
    await sleep(ms)
    if (w.t >= 29_000) w.locked = false
  }
  const out = await recover(d)
  assert.ok(w.t <= BUDGET_MS && BUDGET_MS < 90_000, `${out} at ${w.t} ms: ${w.events}`)
  assert.ok(quitThenLaunched(w), `quit, never relaunched: ${w.events}`)
  assert.ok(['busy', 'restarted'].includes(out), out)
})

test('the lock never comes free: busy inside the budget, nothing done', async () => {
  const w = world('no-port', { slow: true })
  w.locked = true
  assert.equal(await recover(w.d()), 'busy')
  assert.ok(w.t <= BUDGET_MS, `took ${w.t} ms`)
  assert.deepEqual(w.events, [])
})

test('a quit that hangs is forced, then relaunched, inside the budget (Sol r4 P1)', async () => {
  const w = world('no-port', { slow: true, quitTakes: 26_000, launchTakes: 3_000 })
  assert.equal(await recover(w.d()), 'restarted')
  assert.ok(w.t <= BUDGET_MS, `took ${w.t} ms`)
  assert.deepEqual(w.events.map(e => e.split('@')[0]), ['quit', 'kill', 'launch'])
})

test('every effect at its bound and the launch never answers: failed:launch, still inside the budget', async () => {
  const w = world('off', { slow: true, deaf: true })
  assert.equal(await recover(w.d()), 'failed:launch')
  assert.ok(w.t <= BUDGET_MS, `took ${w.t} ms`)
})

test('every effect at its bound from the start: restarted inside the budget', async () => {
  const w = world('no-port', { slow: true, quitTakes: 3_000, launchTakes: 3_000 })
  assert.equal(await recover(w.d()), 'restarted')
  assert.ok(w.t <= BUDGET_MS, `took ${w.t} ms`)
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
  // A client that connects and stays idle must not hold up the release (Sol r4 P2).
  const idle = connect(port, '127.0.0.1')
  await new Promise(r => idle.once('connect', r))
  await new Promise(r => setTimeout(r, 100)) // the server side accepts it
  const done = await Promise.race([c().then(() => 'released'), new Promise(r => setTimeout(r, 1000, 'stuck'))])
  idle.destroy()
  assert.equal(done, 'released', 'release waited for an idle connection')
})
