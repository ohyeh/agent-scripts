// A full-screen, read-only terminal view of the Grok Bot sidebar for any host
// (Codex, Cursor, agy, plain shell), sharing the grok-bot-watch mod's row model
// from lib/core.ts. It reads through ../sidebar.mjs, the mod's own helper: one
// Runtime.evaluate, never a click. Watches live in the mod's session store, so
// they are not shown here.
//
// Usage: node tui.node.ts [--port 9231]
// Keys: j / k, Up / Down, 1-9  select a bot
//       Enter                  detail: the conversation when that bot is open in the app
//       Esc                    close the detail, or deselect
//       r                      read now
//       q, Ctrl-C              quit (the terminal is restored)

import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { type Read, ago, cells, clean, fit, liveState } from './core.ts'

const POLL_MS = 3_000
const SIDEBAR = fileURLToPath(new URL('../sidebar.mjs', import.meta.url))
const ENTER_ALT = '\x1b[?1049h\x1b[?25l'
const LEAVE_ALT = '\x1b[?25h\x1b[?1049l'
const COLOR: Record<string, string> = { green: '32', cyan: '36', magenta: '35', yellow: '33' }

export type View = { read?: Read; at?: number; now: number; sel?: number; detail: boolean; port: number }

const paint = (code: string | undefined, t: string) => (code ? `\x1b[${code}m${t}\x1b[0m` : t)

/** The screen as lines, each at most cols cells. Pure: the test draws with it. */
export function renderLines(v: View, cols: number, rows: number): string[] {
  const r = v.read
  const bots = r?.rows ?? []
  const head =
    `grok bot tui · port ${v.port} · ` +
    (!r ? 'reading…' : r.state === 'ok' ? `${bots.length} bot${bots.length === 1 ? '' : 's'}` : `▲ ${r.state}`) +
    (v.at !== undefined ? ` · read ${ago(v.now - v.at)} ago` : '')
  const out = [paint('1;35', fit(head, cols)), paint('2', fit('j/k select · Enter detail · r read · q quit · read-only', cols)), '']
  if (r && r.state !== 'ok') out.push(fit(`  ${clean(r.error ?? 'see the using-grok-bot-app skill: Connect', cols)}`, cols))
  const pick = v.sel !== undefined ? bots[v.sel] : undefined
  if (v.detail && pick) {
    out.push(paint('1', fit(`${clean(pick.name, 40)} · ${pick.id}`, cols)), '')
    const convo = pick.current ? (r?.convo ?? []) : []
    if (convo.length) for (const m of convo) out.push(fit(`  ${clean(m.at, 12)} ${clean(m.who, 24)} · 「${clean(m.text, 200)}」`, cols))
    else out.push(fit(`  「${clean(pick.preview, 200)}」`, cols), paint('2', fit('  open this bot in the app to read its conversation here', cols)))
    return out.slice(0, rows)
  }
  bots.forEach((b, i) => {
    const live = liveState(b)
    const [glyph, color, state] = live ? [live.glyph, live.color, live.state] : b.unread ? ['✦', 'magenta', 'unread'] : ['●', 'green', 'idle']
    const key = i < 9 ? `${i + 1}` : ' '
    const lead = `${key} ${glyph} ${fit(clean(b.name, 40), 24)} ${b.id.slice(0, 8)} ${state}${b.current ? ' · open' : ''} `
    const line = fit(lead, cols) + fit(b.preview ? `「${clean(b.preview, 200)}」` : '', Math.max(0, cols - cells(fit(lead, cols))))
    out.push(i === v.sel ? paint('7', line) : paint(COLOR[color], line))
  })
  return out.slice(0, rows)
}

function readSidebar(port: number): Promise<Read> {
  return new Promise(res =>
    execFile(process.execPath, [SIDEBAR, String(port)], { timeout: 5_000 }, (err, stdout) => {
      try {
        res(JSON.parse(stdout) as Read)
      } catch {
        res({ state: 'helper-failed', error: String(err ?? 'no output') })
      }
    }))
}

async function main() {
  const { values } = parseArgs({ options: { port: { type: 'string', default: '9231' } } })
  const port = Number(values.port)
  const { stdin, stdout } = process
  if (!stdin.isTTY || !stdout.isTTY) {
    console.error('grok-bot-tui: needs a terminal (stdin and stdout are not a TTY)')
    process.exit(2)
  }
  const v: View = { now: Date.now(), detail: false, port }
  let busy = false
  const draw = () => {
    v.now = Date.now()
    stdout.write('\x1b[H\x1b[2J' + renderLines(v, stdout.columns, stdout.rows).join('\r\n'))
  }
  const poll = async () => {
    if (busy) return
    busy = true
    v.read = await readSidebar(port)
    busy = false
    v.at = Date.now()
    const n = v.read.rows?.length ?? 0
    if (v.sel !== undefined && v.sel >= n) v.sel = n ? n - 1 : undefined
    draw()
  }
  const quit = (code = 0) => {
    stdin.setRawMode(false)
    stdout.write(LEAVE_ALT)
    process.exit(code)
  }
  process.on('SIGTERM', () => quit())
  process.on('uncaughtException', err => {
    stdin.setRawMode(false)
    stdout.write(LEAVE_ALT)
    console.error(err)
    process.exit(1)
  })
  stdin.setRawMode(true)
  stdout.write(ENTER_ALT)
  stdout.on('resize', draw)
  // A paste or a fast typist sends several keys in one chunk ("1\r"); an escape sequence is one key.
  stdin.on('data', (buf: Buffer) => {
    const s = buf.toString()
    for (const k of s.startsWith('\x1b') ? [s] : [...s]) onKey(k)
    draw()
  })
  const onKey = (k: string) => {
    const n = v.read?.rows?.length ?? 0
    if (k === 'q' || k === '\x03') return quit()
    if (k === 'r') void poll()
    else if ((k === 'j' || k === '\x1b[B') && n) v.sel = v.sel === undefined ? 0 : Math.min(n - 1, v.sel + 1)
    else if ((k === 'k' || k === '\x1b[A') && n) v.sel = v.sel === undefined ? 0 : Math.max(0, v.sel - 1)
    else if (/^[1-9]$/.test(k) && Number(k) <= n) v.sel = Number(k) - 1
    else if (k === '\r' && v.sel !== undefined) v.detail = true
    else if (k === '\x1b') v.detail ? (v.detail = false) : (v.sel = undefined)
  }
  draw()
  await poll()
  setInterval(() => void poll(), POLL_MS)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) void main()
