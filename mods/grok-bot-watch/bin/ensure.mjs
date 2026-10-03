#!/usr/bin/env node
// Make the Grok Bot app debuggable on its CDP port, without asking: the owner's
// standing rule (2026-10-02) is that a tool which needs the port restarts the app,
// and an app update relaunches it without the flag. sidebar.mjs stays read-only;
// this is the one script that starts or stops the app.
// One JSON line on stdout: { state, port, ... }. Exit 0 when the port answers at the end.
//   ok          the renderer already answers; nothing done
//   reopened    the port was up with no window: `open -a` brought the window back
//   restarted   the app ran without the port: quit, then relaunched with it
//   launched    the app was not running: launched with the port
//   port-taken  something else listens on the port: left alone (exit 2)
//   failed      the renderer did not answer in time (exit 2)
//   unsupported not macOS (exit 2)
// Usage: ensure.mjs [port]   (default: $GROK_BOT_CDP_PORT, else 39231)

import { execFile, execFileSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const PORT = Number(process.argv[2] || process.env.GROK_BOT_CDP_PORT || 39231)
const APP = 'Grok Bot'
const RENDERER = /app\.asar\/dist\/renderer\/index\.html$/
const sleep = ms => new Promise(r => setTimeout(r, ms))

/** What the port says now: down, up with the renderer, up with pages but not ours, or up with none. */
export function judge(pages) {
  if (pages === null) return 'down'
  const p = pages.filter(t => t.type === 'page')
  if (p.some(t => RENDERER.test(t.url))) return 'ok'
  return p.length ? 'taken' : 'no-window'
}

async function pages() {
  try {
    return await (await fetch(`http://127.0.0.1:${PORT}/json/list`, { signal: AbortSignal.timeout(1500) })).json()
  } catch {
    return null
  }
}

const running = () => {
  try {
    execFileSync('pgrep', ['-x', APP], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

// The sibling read-only helper, in both packages (skill scripts/, mod bin/).
const SIDEBAR = fileURLToPath(new URL('./sidebar.mjs', import.meta.url))
const sidebarOk = () =>
  new Promise(res => execFile(process.execPath, [SIDEBAR, String(PORT)], { timeout: 4000 }, err => res(!err)))

/**
 * Polls until the sidebar lists bots; true when it did within ms. The renderer answers a second or
 * two before its sidebar draws, and a read in that gap says selector-not-observed (seen live 0.66.0).
 */
async function waitOk(ms) {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(500)) if (judge(await pages()) === 'ok' && (await sidebarOk())) return true
  return false
}

const say = (state, extra = {}) => {
  process.stdout.write(JSON.stringify({ state, port: PORT, ...extra }) + '\n', () => process.exit(['ok', 'reopened', 'restarted', 'launched'].includes(state) ? 0 : 2))
}

async function main() {
  if (process.platform !== 'darwin') return say('unsupported', { platform: process.platform })
  const now = judge(await pages())
  if (now === 'ok') return say('ok')
  if (now === 'taken') return say('port-taken')
  if (now === 'no-window' && running()) {
    execFileSync('open', ['-a', APP])
    if (await waitOk(10_000)) return say('reopened')
    // Seen live: a quitting app still listens with no page, and `open -a` then starts it without
    // the port. Fall through to quit and relaunch with it.
  }
  const was = running()
  if (was) {
    // --remote-debugging-port only takes effect at launch: a running app must quit first.
    execFileSync('pkill', ['-x', APP])
    for (let i = 0; i < 40 && running(); i++) await sleep(250)
    if (running()) return say('failed', { step: 'quit' })
  }
  execFileSync('open', ['-a', APP, '--args', `--remote-debugging-port=${PORT}`])
  return (await waitOk(25_000)) ? say(was ? 'restarted' : 'launched') : say('failed', { step: 'launch' })
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(e => say('failed', { error: String(e) }))
