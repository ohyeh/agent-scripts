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
//   busy        another caller held the recovery lock too long (exit 2)
//   failed      the renderer did not answer in time (exit 2)
//   unsupported not macOS (exit 2)
// Usage: ensure.mjs [port]   (default: $GROK_BOT_CDP_PORT, else 39231)
//
// Every caller (each session's mod, each TUI) may run this at once after one outage, so
// recovery is serialized by a lock and re-checked under it: a late caller must not quit
// the app an earlier one just relaunched (Sol r2 P1). A listener counts as Grok Bot only
// when its pid is a Grok Bot process: an empty target list proves nothing (Sol r2 P1).

import { execFile, execFileSync } from 'node:child_process'
import { mkdirSync, realpathSync, rmdirSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PORT = Number(process.argv[2] || process.env.GROK_BOT_CDP_PORT || 39231)
const APP = 'Grok Bot'
const RENDERER = /app\.asar\/dist\/renderer\/index\.html$/
/** A lock older than this is from a caller that died mid-recovery (its own worst case is about 60 s). */
const STALE_LOCK_MS = 120_000

/** What the port says: down, the renderer, a Grok Bot listener with no window, or someone else's. */
export function judge(pages, ownerIsApp) {
  if (pages === null) return 'down'
  if (!ownerIsApp) return 'taken'
  return pages.some(t => t.type === 'page' && RENDERER.test(t.url)) ? 'ok' : 'no-window'
}

/**
 * The recovery, over injected effects so the test drives it without an app. d: pages(), ownerIsApp(),
 * running(), open(withPort), quit(), sidebarOk(), sleep(ms), lock() → release fn or null, now().
 */
export async function recover(d) {
  const look = async () => {
    const p = await d.pages()
    return judge(p, p === null ? false : await d.ownerIsApp())
  }
  const waitOk = async ms => {
    for (const end = d.now() + ms; d.now() < end; await d.sleep(500)) if ((await look()) === 'ok' && (await d.sidebarOk())) return true
    return false
  }
  let release = null
  for (const end = d.now() + 90_000; !(release = d.lock()); await d.sleep(1000)) {
    // Another caller is recovering: its result is ours once the port answers.
    if ((await look()) === 'ok') return 'ok'
    if (d.now() >= end) return 'busy'
  }
  try {
    // Re-checked under the lock: what an earlier caller did is now visible.
    const now = await look()
    if (now === 'ok') return 'ok'
    if (now === 'taken') return 'port-taken'
    if (now === 'no-window') {
      d.open(false)
      if (await waitOk(10_000)) return 'reopened'
      // Seen live: a quitting Grok Bot still listens with no page, and `open -a` then starts
      // it without the port. Fall through to quit and relaunch with it.
    }
    const was = d.running()
    if (was) {
      // --remote-debugging-port only takes effect at launch: a running app must quit first.
      d.quit()
      for (let i = 0; i < 40 && d.running(); i++) await d.sleep(250)
      if (d.running()) return 'failed:quit'
    }
    d.open(true)
    return (await waitOk(25_000)) ? (was ? 'restarted' : 'launched') : 'failed:launch'
  } finally {
    release()
  }
}

const sh = (cmd, args) => {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', timeout: 5000 })
  } catch {
    return ''
  }
}
const appPids = () => sh('pgrep', ['-x', APP]).split('\n').filter(Boolean)
// The sibling read-only helper, in both packages (skill scripts/, mod bin/).
const SIDEBAR = fileURLToPath(new URL('./sidebar.mjs', import.meta.url))
const LOCK = join(tmpdir(), `grok-bot-ensure-${PORT}.lock`)

const real = {
  now: () => Date.now(),
  sleep: ms => new Promise(r => setTimeout(r, ms)),
  pages: async () => {
    try {
      return await (await fetch(`http://127.0.0.1:${PORT}/json/list`, { signal: AbortSignal.timeout(1500) })).json()
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
  open: withPort => execFileSync('open', ['-a', APP, ...(withPort ? ['--args', `--remote-debugging-port=${PORT}`] : [])], { timeout: 10_000 }),
  quit: () => sh('pkill', ['-x', APP]),
  sidebarOk: () => new Promise(res => execFile(process.execPath, [SIDEBAR, String(PORT)], { timeout: 4000 }, err => res(!err))),
  lock: () => {
    try {
      mkdirSync(LOCK)
    } catch {
      try {
        if (Date.now() - statSync(LOCK).mtimeMs < STALE_LOCK_MS) return null
        rmdirSync(LOCK)
        mkdirSync(LOCK)
      } catch {
        return null
      }
    }
    return () => {
      try {
        rmdirSync(LOCK)
      } catch {}
    }
  },
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
