#!/usr/bin/env node
// Make the Grok Bot app debuggable on its CDP port, without asking: the owner's
// standing rule (2026-10-02) is that a tool which needs the port restarts the app,
// and an app update relaunches it without the flag. sidebar.mjs stays read-only;
// this is the one script that starts or stops the app.
// One JSON line on stdout: { state, port, ... }. Exit 0 when the port answers at the end.
//   ok          the renderer answers (already, or another caller just fixed it); nothing done
//   reopened    Grok Bot listened with no window: `open -a` brought the window back
//   restarted   the app ran without the port: quit, then relaunched with it
//   launched    the app was not running: launched with the port
//   port-taken  a process that is not Grok Bot listens on the port: left alone (exit 2)
//   busy        too little of the budget was left for the next step, mostly a peer held the lock (exit 2)
//   failed      the renderer did not answer in time (exit 2)
//   unsupported not macOS (exit 2)
// Usage: ensure.mjs [port]   (default: $GROK_BOT_CDP_PORT, else 39231)
//
// Every caller (each session's mod, each TUI) may run this at once after one outage, so
// recovery is serialized by a lock and re-checked under it: a late caller must not quit
// the app an earlier one just relaunched (Sol r2 P1). A listener counts as Grok Bot only
// when its pid is a Grok Bot process: an empty target list proves nothing (Sol r2 P1).
// The lock is a listening socket on 127.0.0.1:<port+1>: the kernel makes it exclusive and
// frees it when its holder exits or is killed, so there is no stale lock to reclaim and
// no one else's lock to release (Sol r3 P1: a lock directory's stale takeover raced).
// Lock wait and recovery share one budget that ends before the caller's timeout. Every
// effect has a fixed upper bound (T, also the real effects' own timeouts), and no step
// starts unless its bound still fits: no quit without time for the relaunch (Sol r3/r4 P1).

import { execFile, execFileSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { createServer } from 'node:net'
import { fileURLToPath } from 'node:url'

const PORT = Number(process.argv[2] || process.env.GROK_BOT_CDP_PORT || 39231)
const APP = 'Grok Bot'
const RENDERER = /app\.asar\/dist\/renderer\/index\.html$/
/** The whole run: lock wait plus recovery. Callers give the process 90 s. */
export const BUDGET_MS = 75_000
/** Upper bound of each real effect, in ms; the real effects use them as their timeouts. */
export const T = { fetch: 1500, sh: 2000, sidebar: 4000, open: 10_000 }
const LOOK_MS = T.fetch + 2 * T.sh // pages, then lsof + pgrep
const PROBE_MS = LOOK_MS + T.sidebar // one round of waiting for the app
/** One wait for an exit: the window, then a last pgrep that starts at its end (2 pgreps can straddle it). */
const goneMs = ms => ms + 2 * T.sh
/** SIGTERM and up to 10 s for it, then SIGKILL and up to 3 s. */
export const QUIT_MS = T.sh + goneMs(10_000) + T.sh + goneMs(3_000)
const LAUNCH_MS = T.open + 15_000
/** Quit plus relaunch: nothing destructive starts with less left. */
export const RECOVER_MS = QUIT_MS + LAUNCH_MS

/** What the port says: down, the renderer, a Grok Bot listener with no window, or someone else's. */
export function judge(pages, ownerIsApp) {
  if (pages === null) return 'down'
  if (!ownerIsApp) return 'taken'
  return pages.some(t => t.type === 'page' && RENDERER.test(t.url)) ? 'ok' : 'no-window'
}

/**
 * The recovery, over injected effects so the test drives it without an app. d: pages(), ownerIsApp(),
 * running(), open(withPort), quit(force), sidebarOk(), sleep(ms), lock() → release fn or null, now().
 * Each effect takes at most its T bound; a step starts only when its bound fits before the budget ends.
 */
export async function recover(d) {
  const end = d.now() + BUDGET_MS
  const fits = ms => d.now() + ms <= end
  const look = async () => {
    const p = await d.pages()
    return judge(p, p === null ? false : await d.ownerIsApp())
  }
  const waitOk = async ms => {
    const by = Math.min(d.now() + ms, end)
    for (; d.now() + PROBE_MS <= by; await d.sleep(500)) if ((await look()) === 'ok' && (await d.sidebarOk())) return true
    return false
  }
  // Still running only when a look that started at or after the window's end says so (Sol r5 P1).
  const gone = async ms => {
    const by = d.now() + ms
    for (;;) {
      const at = d.now()
      if (!d.running()) return true
      if (at >= by) return false
      await d.sleep(Math.min(250, Math.max(0, by - d.now())))
    }
  }
  let release = null
  for (; !(release = await d.lock()); await d.sleep(1000)) {
    if (!fits(RECOVER_MS)) return 'busy'
    // Another caller is recovering: its result is ours once the port answers.
    if ((await look()) === 'ok') return 'ok'
  }
  try {
    // Re-checked under the lock: what an earlier caller did is now visible.
    const now = await look()
    if (now === 'ok') return 'ok'
    if (now === 'taken') return 'port-taken'
    if (now === 'no-window' && fits(T.open + 10_000 + RECOVER_MS)) {
      d.open(false)
      if (await waitOk(10_000)) return 'reopened'
      // Seen live: a quitting Grok Bot still listens with no page, and `open -a` then starts
      // it without the port. Fall through to quit and relaunch with it.
    }
    const was = d.running()
    if (!fits(was ? RECOVER_MS : LAUNCH_MS)) return 'busy'
    if (was) {
      // --remote-debugging-port only takes effect at launch: a running app must quit first.
      // A quit that hangs is forced, so the relaunch still fits: never leave it quit, not relaunched.
      d.quit(false)
      if (!(await gone(10_000))) {
        d.quit(true)
        if (!(await gone(3_000))) return 'failed:quit'
      }
    }
    d.open(true)
    return (await waitOk(end - d.now())) ? (was ? 'restarted' : 'launched') : 'failed:launch'
  } finally {
    await release()
  }
}

const sh = (cmd, args) => {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', timeout: T.sh })
  } catch {
    return ''
  }
}
const appPids = () => sh('pgrep', ['-x', APP]).split('\n').filter(Boolean)
// The sibling read-only helper, in both packages (skill scripts/, mod bin/).
const SIDEBAR = fileURLToPath(new URL('./sidebar.mjs', import.meta.url))
const LOCK_PORT = PORT + 1

const real = {
  now: () => Date.now(),
  sleep: ms => new Promise(r => setTimeout(r, ms)),
  pages: async () => {
    try {
      return await (await fetch(`http://127.0.0.1:${PORT}/json/list`, { signal: AbortSignal.timeout(T.fetch) })).json()
    } catch {
      return null
    }
  },
  ownerIsApp: async () => {
    const listeners = sh('lsof', ['-nP', `-iTCP:${PORT}`, '-sTCP:LISTEN', '-t']).split('\n').filter(Boolean)
    const app = new Set(appPids())
    return listeners.length > 0 && listeners.every(p => app.has(p))
  },
  running: () => appPids().length > 0,
  open: withPort => execFileSync('open', ['-a', APP, ...(withPort ? ['--args', `--remote-debugging-port=${PORT}`] : [])], { timeout: T.open }),
  quit: force => sh('pkill', [...(force ? ['-9'] : []), '-x', APP]),
  sidebarOk: () => new Promise(res => execFile(process.execPath, [SIDEBAR, String(PORT)], { timeout: T.sidebar }, err => res(!err))),
  lock: () => tcpLock(LOCK_PORT),
}

/** Exclusive while held, freed by the kernel when this process exits: resolves to a release fn, or null when held elsewhere. */
export function tcpLock(port) {
  return new Promise(res => {
    // A connection to the lock (a port scan, a probe) is dropped at once: close() waits for open ones (Sol r4 P2).
    const srv = createServer(s => s.destroy())
    srv.once('error', () => res(null))
    srv.listen(port, '127.0.0.1', () => res(() => new Promise(done => srv.close(() => done()))))
  })
}

const say = (out, extra = {}) => {
  const [state, step] = out.split(':')
  process.stdout.write(JSON.stringify({ state, port: PORT, ...(step ? { step } : {}), ...extra }) + '\n', () =>
    process.exit(['ok', 'reopened', 'restarted', 'launched'].includes(state) ? 0 : 2))
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.platform !== 'darwin') say('unsupported', { platform: process.platform })
  else recover(real).then(s => say(s), e => say('failed', { error: String(e) }))
}
