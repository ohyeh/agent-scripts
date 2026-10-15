// A full-screen, read-only terminal view of the Grok Bot sidebar for any host
// (Codex, Cursor, agy, plain shell), sharing the grok-bot-watch mod's row model
// from lib/core.ts. It reads through ../sidebar.mjs, the mod's own helper: one
// Runtime.evaluate, never a click. Watches live in the mod's session store, so
// they are not shown here.
//
// Usage: node tui.node.ts [--port <n>]   (default: the sidebar helper's, $GROK_BOT_CDP_PORT or 39231)
// Keys: j / k, Up / Down, 1-9  select a bot
//       Enter                  detail: the conversation when that bot is open in the app
//       Esc                    close the detail; in the list, quit
//       r                      read now
//       q, Ctrl-C              quit (the terminal is restored on every exit path)
// A paste (bracketed paste) is dropped, never read as keys.

import { type ChildProcess, execFile } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { type Read, ago, cells, clean, fit, liveState } from './core.ts'

const POLL_MS = 3_000
const SIDEBAR = fileURLToPath(new URL('../sidebar.mjs', import.meta.url))
const ENSURE = fileURLToPath(new URL('../ensure.mjs', import.meta.url))
/** A port that stays down is fixed again after this long, not on every read. */
const ENSURE_EVERY_MS = 60_000
const ENTER_ALT = '\x1b[?1049h\x1b[?25l\x1b[?2004h'
const LEAVE_ALT = '\x1b[?25h\x1b[?2004l\x1b[?1049l'
const PASTE_ON = '\x1b[200~'
const PASTE_OFF = '\x1b[201~'
const COLOR: Record<string, string> = { green: '32', cyan: '36', magenta: '35', yellow: '33' }

/** fix: what ensure.mjs is doing or last did about a down port, shown under the header. */
export type View = { read?: Read; at?: number; now: number; sel?: number; detail: boolean; port?: number; fix?: string }

const paint = (code: string | undefined, t: string) => (code ? `\x1b[${code}m${t}\x1b[0m` : t)
const pad = (t: string, w: number) => t + ' '.repeat(Math.max(0, w - cells(t)))

/** s with its bracketed pastes cut out; pasting carries a paste that a chunk boundary split. Pure: the test runs it. */
export function stripPaste(s: string, pasting: boolean): { keys: string; pasting: boolean } {
  let keys = ''
  while (s) {
    if (pasting) {
      const end = s.indexOf(PASTE_OFF)
      if (end < 0) return { keys, pasting }
      s = s.slice(end + PASTE_OFF.length)
      pasting = false
    }
    const start = s.indexOf(PASTE_ON)
    if (start < 0) return { keys: keys + s, pasting }
    keys += s.slice(0, start)
    s = s.slice(start + PASTE_ON.length)
    pasting = true
  }
  return { keys, pasting }
}

/** The key hints: whole pieces that fit in cols, the key names bold. */
function keyHints(pieces: Array<[string, string]>, cols: number): string {
  const kept: Array<[string, string]> = []
  for (const p of pieces) {
    if (cells([...kept, p].map(([k, d]) => (k ? `${k} ${d}` : d)).join(' · ')) > cols) break
    kept.push(p)
  }
  return kept.map(([k, d]) => (k ? `\x1b[1m${k}\x1b[22m ${d}` : d)).join(' · ')
}

/** What to do about a degraded read, from the skill's Connect section. */
function hint(state: string, port: number | string): string {
  if (state === 'port-down') return `Grok Bot is not debuggable on ${port}: open -a "Grok Bot" --args --remote-debugging-port=${port} (a running app must restart first; that drops a composer draft)`
  if (state === 'renderer-missing') return 'the app runs with its window closed: open -a "Grok Bot"'
  if (state === 'wrong-url') return `port ${port} is not the Grok Bot renderer`
  if (state === 'selector-not-observed' || state === 'eval-error') return 'the app changed its DOM: update scripts/sidebar.mjs, then scripts/sync-mod-core'
  if (state === 'node-too-old') return 'the sidebar read needs Node 22+'
  if (state === 'timeout') return 'the app did not answer in 2.5 s; r reads again'
  return 'r reads again'
}

/** t cut into lines of at most w cells: at a space when the line has one, else mid-run (CJK has no spaces). */
function wrap(t: string, w: number): string[] {
  const out: string[] = []
  let line = ''
  for (const ch of t) {
    if (cells(line + ch) > w) {
      const sp = line.lastIndexOf(' ')
      if (sp > 0 && ch !== ' ') {
        out.push(line.slice(0, sp))
        line = line.slice(sp + 1)
      } else {
        out.push(line)
        line = ''
      }
      if (ch === ' ') continue
    }
    line += ch
  }
  return line ? [...out, line] : out
}

/** The skill's version (SKILL.md `metadata.version`), shown in the title. A skill without one is an error, not a blank. */
export const VERSION = (() => {
  const md = readFileSync(fileURLToPath(new URL('../../SKILL.md', import.meta.url)), 'utf8')
  const v = /^---\n[\s\S]*?^metadata:\n(?:[ \t]+.*\n)*?[ \t]+version:[ \t]*"?([0-9][\w.-]*)"?[ \t]*$/m.exec(md)?.[1]
  if (!v) throw new Error('using-grok-bot-app/SKILL.md has no metadata.version')
  return v
})()

/** The screen as lines, each at most cols cells. Pure: the test draws with it. */
export function renderLines(v: View, cols: number, rows: number): string[] {
  const r = v.read
  const bots = r?.rows ?? []
  const port = r?.port ?? v.port ?? '…'
  const states = bots.map(b => {
    const live = liveState(b)
    return live ?? (b.unread ? { glyph: '✦', color: 'magenta', state: 'unread' } : { glyph: '●', color: 'green', state: 'idle' })
  })
  const count = (s: string) => states.filter(x => x.state === s).length
  const head =
    `▌grok bot tui v${VERSION} · port ${port} · ` +
    (!r ? 'reading…'
      : r.state === 'ok'
        ? [`${bots.length} bot${bots.length === 1 ? '' : 's'}`, count('replying') && `${count('replying')} replying`, count('unread') && `${count('unread')} unread`].filter(Boolean).join(' · ')
        : `▲ ${r.state}`) +
    (v.at !== undefined ? ` · read ${ago(v.now - v.at)} ago` : '')
  const keys: Array<[string, string]> = v.detail
    ? [['Esc', 'back'], ['r', 'read'], ['q', 'quit'], ['', 'read-only']]
    : [['j/k 1-9', 'select'], ['Enter', 'detail'], ['r', 'read'], ['q Esc', 'quit'], ['', 'read-only']]
  const out = [paint('1;35', fit(head, cols)), keyHints(keys, cols), '']
  if (v.fix) out.splice(2, 0, paint('33', fit(`  ${v.fix}`, cols)))
  if (r && r.state !== 'ok') {
    for (const l of wrap(`▲ ${hint(r.state, port)}`, cols - 2)) out.push(paint('33', `  ${l}`))
    if (r.error) out.push(paint('2', fit(`  ${clean(r.error, 300)}`, cols)))
  }
  const pick = v.sel !== undefined ? bots[v.sel] : undefined
  if (v.detail && pick) {
    out.push(paint('1', fit(`${clean(pick.name, 40)} · ${pick.id}`, cols)))
    const kept = out.length
    const convo = pick.current ? (r?.convo ?? []) : []
    const body = (lead: string, text: string) => {
      out.push(paint('2', fit(`  ${lead}`, cols)))
      for (const l of wrap(clean(text, 600), cols - 4)) out.push(`    ${l}`)
    }
    if (convo.length) for (const m of convo) body(`${clean(m.at, 12)} · ${clean(m.who, 24)}`, m.text)
    else {
      body('last reply (sidebar preview)', pick.preview || '—')
      out.push('', paint('2', fit('  open this bot in the app to read its conversation here', cols)))
    }
    // The newest lines matter most: a short terminal keeps the tail of the conversation.
    if (out.length <= rows) return out
    const tail = out.slice(out.length - (rows - kept - 1))
    return [...out.slice(0, kept), paint('2', fit(`  ↑ ${out.length - kept - tail.length} earlier lines`, cols)), ...tail]
  }
  // The list scrolls to keep the selection in view.
  const free = Math.max(1, rows - out.length)
  // One line is kept for "↓ N more" when the list does not fit, so it never covers the selection.
  const room = bots.length > free ? Math.max(1, free - 1) : free
  const top = v.sel === undefined || v.sel < room ? 0 : v.sel - room + 1
  const nameW = Math.min(24, Math.max(4, ...bots.map(b => cells(clean(b.name, 40)))))
  bots.slice(top, top + room).forEach((b, j) => {
    const i = top + j
    const s = states[i]!
    const key = i < 9 ? `${i + 1}` : ' '
    const lead = `${key} ${s.glyph} ${pad(fit(clean(b.name, 40), nameW), nameW)} ${b.id.slice(0, 8)} ${pad(s.state + (b.current ? ' · open' : ''), 24)}`
    const head = fit(lead, cols)
    const line = head + fit(b.preview ? `「${clean(b.preview, 200)}」` : '', Math.max(0, cols - cells(head)))
    out.push(i === v.sel ? paint('7', pad(line, cols)) : paint(COLOR[s.color], line))
  })
  if (top + room < bots.length) out.push(paint('2', fit(`  ↓ ${bots.length - top - room} more`, cols)))
  return out.slice(0, rows)
}

/** The ensure.mjs run in flight: quitting the TUI stops it, so it never restarts the app after the TUI is gone. */
let ensuring: ChildProcess | undefined

/** Runs ensure.mjs: restarts or relaunches the app so the port answers (standing rule of this setup, no asking). */
function ensureApp(port: number | undefined): Promise<Read> {
  return new Promise(res => {
    ensuring = execFile(process.execPath, [ENSURE, ...(port ? [String(port)] : [])], { timeout: 90_000 }, (err, stdout) => {
      ensuring = undefined
      try {
        res(JSON.parse(stdout) as Read)
      } catch {
        res({ state: 'failed', error: String(err ?? 'no output') })
      }
    })
  })
}

function readSidebar(port: number | undefined): Promise<Read> {
  return new Promise(res =>
    execFile(process.execPath, [SIDEBAR, ...(port ? [String(port)] : [])], { timeout: 5_000 }, (err, stdout) => {
      try {
        res(JSON.parse(stdout) as Read)
      } catch {
        res({ state: 'helper-failed', error: String(err ?? 'no output') })
      }
    }))
}

async function main() {
  const { values } = parseArgs({ options: { port: { type: 'string' } } })
  const port = values.port ? Number(values.port) : undefined
  const { stdin, stdout } = process
  if (!stdin.isTTY || !stdout.isTTY) {
    console.error('grok-bot-tui: needs a terminal (stdin and stdout are not a TTY)')
    process.exit(2)
  }
  const v: View = { now: Date.now(), detail: false, port }
  let busy = false
  let lastEnsure = 0
  const draw = () => {
    v.now = Date.now()
    stdout.write('\x1b[H\x1b[2J' + renderLines(v, stdout.columns, stdout.rows).join('\r\n'))
  }
  const poll = async () => {
    if (busy) return
    busy = true
    v.read = await readSidebar(port)
    if ((v.read.state === 'port-down' || v.read.state === 'renderer-missing') && Date.now() - lastEnsure > ENSURE_EVERY_MS) {
      lastEnsure = Date.now()
      v.fix = 'Grok Bot is not debuggable: starting it with the port…'
      draw()
      const fixed = await ensureApp(port)
      v.fix = `ensure: ${fixed.state} at ${new Date().toTimeString().slice(0, 5)}${fixed.error ? ` (${clean(fixed.error, 120)})` : ''}`
      v.read = await readSidebar(port)
    }
    busy = false
    v.at = Date.now()
    const n = v.read.rows?.length ?? 0
    if (v.sel !== undefined && v.sel >= n) v.sel = n ? n - 1 : undefined
    draw()
  }
  // Every way out restores the terminal once: 'exit' runs after process.exit and a normal end.
  let restored = false
  const restore = () => {
    if (restored) return
    restored = true
    ensuring?.kill('SIGTERM')
    stdin.setRawMode(false)
    stdout.write(LEAVE_ALT)
  }
  const quit = (code = 0) => process.exit(code)
  process.on('exit', restore)
  process.on('SIGINT', () => quit())
  process.on('SIGTERM', () => quit())
  process.on('uncaughtException', err => {
    restore()
    console.error(err)
    process.exit(1)
  })
  stdin.setRawMode(true)
  stdout.write(ENTER_ALT)
  stdout.on('resize', draw)
  // A fast typist sends several keys in one chunk ("1\r"); an escape sequence is one key. A paste is dropped.
  let pasting = false
  stdin.on('data', (buf: Buffer) => {
    const cut = stripPaste(buf.toString(), pasting)
    pasting = cut.pasting
    const s = cut.keys
    if (!s) return
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
    else if (k === '\x1b') v.detail ? (v.detail = false) : quit()
  }
  draw()
  await poll()
  setInterval(() => void poll(), POLL_MS)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) void main()
