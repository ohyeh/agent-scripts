#!/usr/bin/env node
// session-assets TUI: a session's assets and the lines of its last answers, full screen, in a pane of its own.
// Reads the snapshot the mod writes (~/.local/state/session-assets/<sid>.json); writes only <sid>.ask.json, a request
// the mod turns into prompt text (an outside process cannot type into Claude's prompt box). No dependencies.
import { spawn } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'

export const DIR = `${process.env.HOME || homedir()}/.local/state/session-assets`

/** Terminal cells of a string: CJK, fullwidth and emoji take two. */
export const cells = str => {
  let n = 0
  for (const ch of str) {
    const c = ch.codePointAt(0)
    n += c < 32 ? 0 : (c >= 0x1100 && c <= 0x115f) || (c >= 0x2e80 && c <= 0xa4cf) || (c >= 0xac00 && c <= 0xd7a3) || (c >= 0xf900 && c <= 0xfaff) || (c >= 0xfe30 && c <= 0xfe4f) || (c >= 0xff00 && c <= 0xff60) || (c >= 0xffe0 && c <= 0xffe6) || c >= 0x1f300 ? 2 : 1
  }
  return n
}

/** Cut to `w` cells, `…` when cut; control characters out (a ref or a line must not move the cursor). */
export const fit = (str, w) => {
  const t = String(str).replace(/[\u0000-\u001f\u007f]/g, ' ')
  if (cells(t) <= w) return t
  let out = ''
  for (const ch of t) {
    if (cells(out + ch) > w - 1) break
    out += ch
  }
  return `${out}…`
}

/** `w`-cell lines of `str`, at most `max`. */
export const wrap = (str, w, max) => {
  const out = []
  let line = ''
  for (const ch of String(str).replace(/[\u0000-\u001f\u007f]/g, ' ')) {
    if (cells(line + ch) > w) {
      out.push(line)
      line = ''
    }
    line += ch
  }
  if (line) out.push(line)
  return out.length > max ? [...out.slice(0, max - 1), fit(out.slice(max - 1).join(''), w)] : out
}

const ago = ms => (ms < 60e3 ? `${Math.max(0, Math.round(ms / 1e3))}s` : ms < 3600e3 ? `${Math.round(ms / 60e3)}m` : ms < 86400e3 ? `${Math.round(ms / 3600e3)}h` : `${Math.round(ms / 86400e3)}d`)
const when = (at, now) => (at ? `${ago(now - at)} ago` : 'earlier')
const GLYPH = { url: '●', artifact: '◈', image: '▣', video: '▶', file: '▤', commit: '⎇', source: '◇' }
const nameOf = x => (x.kind === 'url' || x.kind === 'source' ? x.ref.replace(/^https?:\/\//, '').replace(/\/$/, '') : x.kind === 'commit' ? x.label : x.ref.split('/').pop() || x.ref)
const INV = '\x1b[7m'
const DIM = '\x1b[2m'
const BOLD = '\x1b[1m'
const OFF = '\x1b[0m'

/**
 * The screen as lines, from the snapshot `data` and the view `v` ({ tab, answer, cur, marks, msg }). Pure: the tests
 * call it with a fixed `now`.
 */
export function frame(data, v, cols, rows, now) {
  const tabs = ['answers', 'assets'].map((t, i) => (v.tab === t ? `${INV} ${i + 1} ${t} ${OFF}` : ` ${i + 1} ${t} `)).join('')
  const head = `${BOLD}▌session assets${OFF} ${DIM}${fit(`v${data.version ?? '?'} · ${data.project ?? ''}`, Math.max(0, cols - 40))}${OFF}  ${tabs}`
  const lines = [head]
  const body = Math.max(1, rows - 6)
  let detail = ''
  let keys = ''
  const list = (n, draw) => {
    const top = Math.max(0, Math.min(v.cur - Math.floor(body / 2), n - body))
    for (let i = top; i < Math.min(n, top + body); i++) lines.push(draw(i, i === v.cur))
    for (let i = Math.min(n, top + body) - top; i < body; i++) lines.push('')
  }
  if (v.tab === 'answers') {
    const a = data.answers?.[v.answer]
    if (!a) {
      lines.push(`${DIM}no answer with lines to quote yet.${OFF}`)
      for (let i = 1; i < body + 1; i++) lines.push('')
    } else {
      lines.push(`${DIM}${fit(`answer ${v.answer + 1}/${data.answers.length} · ${a.items.length} lines · ${when(a.at, now)}${v.marks.size ? ` · ${v.marks.size} marked` : ''}   ← → older/newer`, cols)}${OFF}`)
      list(a.items.length, (i, on) => {
        const row = `${v.marks.has(i) ? '[x]' : '[ ]'} ${fit(a.items[i], cols - 5)}`
        return on ? `${INV}${row}${OFF}` : row
      })
      detail = a.items[v.cur] ?? ''
    }
    keys = 'space mark · enter quote into the prompt · c copy · a all · esc unmark · tab assets · q quit'
  } else {
    const xs = data.assets ?? []
    lines.push(`${DIM}${fit(`${xs.length} assets, numbered as the band: #aN in a prompt refers to row N`, cols)}${OFF}`)
    if (!xs.length) lines.push(`${DIM}no assets yet.${OFF}`)
    list(xs.length, (i, on) => {
      const x = xs[i]
      const row = `#a${String(i + 1).padEnd(3)} ${GLYPH[x.kind] ?? '·'} ${fit(nameOf(x), Math.max(8, Math.floor(cols / 2)))}  ${DIM}${fit(`${when(x.at, now)} · ${x.kind === 'url' ? x.label : x.where}`, Math.max(0, cols - Math.floor(cols / 2) - 10))}${OFF}`
      return on ? `${INV}${row.replaceAll(OFF, `${OFF}${INV}`)}${OFF}` : row
    })
    detail = xs[v.cur]?.ref ?? ''
    keys = 'enter open · p preview · c copy · r #aN into the prompt · tab answers · q quit'
  }
  lines.length = 2 + body
  lines.push(`${DIM}${'─'.repeat(cols)}${OFF}`, ...wrap(detail, cols, 2).concat(['', '']).slice(0, 2), `${DIM}${fit(v.msg || keys, cols)}${OFF}`)
  return lines
}

/**
 * Where the answers view stands after a new snapshot. A selection stays on the answer it was made in (by its id, not
 * its place: a new answer moves every place by one). On the newest answer with nothing marked, it follows the newest.
 * An answer gone from the list (older than the last 16) takes its marks with it, and says so.
 */
export function follow(prev, next, v) {
  const newest = next.answers?.[0]?.id
  // The answers cursor only: on the assets tab its cursor is the assets', and stays (a tab switch starts at the top).
  const top = v.tab === 'answers' ? { cur: 0 } : {}
  const onNewest = v.answerId === undefined || (v.answerId === prev.answers?.[0]?.id && !v.marks.size)
  if (onNewest) return v.answerId === newest ? {} : { answer: 0, answerId: newest, ...top, marks: new Set() }
  const i = next.answers?.findIndex(a => a.id === v.answerId) ?? -1
  if (i >= 0) return { answer: i }
  return { answer: 0, answerId: newest, ...top, marks: new Set(), msg: 'that answer is older than the last 16: marks cleared' }
}

/** A snapshot's name: `<sid>.json` (requests and answers are folders, `<sid>.ask/`, `<sid>.done/`). */
const isSnap = f => /^[\w-]+\.json$/.test(f)

/** The snapshot of `sid`, or the newest one when no sid is given. */
export function pick(dir, sid) {
  if (sid) return `${dir}/${sid}.json`
  const snaps = readdirSync(dir).filter(isSnap).map(f => ({ f, t: statSync(`${dir}/${f}`).mtimeMs }))
  snaps.sort((a, b) => b.t - a.t)
  if (!snaps.length) throw new Error(`no session snapshot in ${dir}`)
  return `${dir}/${snaps[0].f}`
}

/**
 * A request to the mod: a file of its own in `<sid>.ask/`, named for when it was made, by whom and which (no TUI writes
 * over another's), and renamed into place whole so the mod never reads half of it. Returns its name.
 */
let made = 0
export function ask(dir, req) {
  mkdirSync(dir, { recursive: true })
  const name = `${String(Date.now()).padStart(13, '0')}-${process.pid}-${++made}.json`
  writeFileSync(`${dir}/.${name}.tmp`, JSON.stringify(req))
  renameSync(`${dir}/.${name}.tmp`, `${dir}/${name}`)
  return name
}

function main() {
  const arg = process.argv.indexOf('--sid')
  const sid = arg > 0 ? process.argv[arg + 1] : undefined
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    process.stderr.write('session-assets tui: needs a terminal\n')
    process.exit(2)
  }
  const snap = pick(DIR, sid)
  const askAt = snap.replace(/\.json$/, '.ask')
  const doneAt = snap.replace(/\.json$/, '.done')
  // Requests not answered yet, by name: each is answered once, so none is sent twice; a slow one is only reported.
  const pending = new Map()
  const send = (req, onOk, what) => {
    try {
      pending.set(ask(askAt, req), { onOk, at: Date.now() })
    } catch (err) {
      return `not sent: ${err.code ?? err.message} writing ${askAt}`
    }
    return `${what}: sending…`
  }
  const answered = () => {
    let changed = false
    for (const [name, p] of pending) {
      let done
      try {
        done = JSON.parse(readFileSync(`${doneAt}/${name}`, 'utf8'))
      } catch {}
      // `{ taking }` is the mark of one begun: final only when it stays so (the session stopped between the two).
      const final = typeof done?.ok === 'boolean'
      if (final || (done && Date.now() - p.at > 5000)) {
        if (done.ok) p.onOk()
        v.msg = !final ? 'the session took it but did not say it was done: check the prompt' : done.ok ? done.text : `not done: ${done.text}`
        pending.delete(name)
        // The answer goes only once the request is gone: it is what keeps the request from being done again.
        let gone = false
        try {
          unlinkSync(`${askAt}/${name}`)
          gone = true
        } catch (err) {
          gone = err.code === 'ENOENT'
        }
        if (gone) {
          try {
            unlinkSync(`${doneAt}/${name}`)
          } catch {}
        }
        changed = true
      } else if (Date.now() - p.at > 5000 && !p.slow) {
        p.slow = true
        v.msg = 'no answer from the session in 5 s: is the mod loaded? (it is still waiting there)'
        changed = true
      }
    }
    return changed
  }
  let data = { assets: [], answers: [] }
  let seen = -1
  const v = { tab: 'answers', answer: 0, answerId: undefined, cur: 0, marks: new Set(), msg: '' }
  const load = () => {
    try {
      const t = statSync(snap).mtimeMs
      if (t === seen) return false
      const next = JSON.parse(readFileSync(snap, 'utf8'))
      Object.assign(v, follow(data, next, v))
      data = next
      seen = t
      return true
    } catch {
      return false // missing or half written: keep what is shown, try again
    }
  }
  const out = process.stdout
  const draw = () => {
    const n = v.tab === 'answers' ? (data.answers?.[v.answer]?.items.length ?? 0) : (data.assets?.length ?? 0)
    v.cur = Math.max(0, Math.min(v.cur, n - 1))
    out.write(`\x1b[H${frame(data, v, out.columns, out.rows, Date.now()).map(l => `${l}\x1b[K`).join('\r\n')}\x1b[J`)
  }
  const say = msg => {
    v.msg = msg
    draw()
  }
  const run = (argv, input) => {
    const p = spawn(argv[0], argv.slice(1), { stdio: [input === undefined ? 'ignore' : 'pipe', 'ignore', 'ignore'], detached: input === undefined })
    p.on('error', err => say(`${argv[0]}: ${err.message}`))
    if (input !== undefined) p.stdin.end(input)
    else p.unref()
  }
  const quit = () => {
    out.write('\x1b[?25h\x1b[?1049l')
    process.stdin.setRawMode(false)
    process.exit(0)
  }
  out.write('\x1b[?1049h\x1b[?25l\x1b[2J')
  process.stdin.setRawMode(true)
  process.stdin.resume()
  process.on('SIGTERM', quit)
  out.on('resize', draw)
  setInterval(() => (load() | answered()) && draw(), 300)
  load()
  draw()
  // One chunk can hold several keys (typed fast, a paste, tmux send-keys): one at a time.
  process.stdin.on('data', buf => {
    for (const k of keysOf(buf.toString())) onKey(k)
    draw()
  })
  const onKey = k => {
    const a = data.answers?.[v.answer]
    const x = data.assets?.[v.cur]
    v.msg = ''
    if (k === 'q' || k === '\x03') quit()
    if (k === '\t' || k === '1' || k === '2') {
      v.tab = k === '1' ? 'answers' : k === '2' ? 'assets' : v.tab === 'answers' ? 'assets' : 'answers'
      v.cur = 0
    } else if (k === '\x1b[A' || k === 'k') v.cur--
    else if (k === '\x1b[B' || k === 'j') v.cur++
    else if (k === '\x1b[5~') v.cur -= 10
    else if (k === '\x1b[6~') v.cur += 10
    else if (v.tab === 'answers') {
      const go = i => Object.assign(v, { answer: i, answerId: data.answers[i].id, cur: 0, marks: new Set() })
      if ((k === '\x1b[D' || k === '[' || k === 'h') && v.answer + 1 < (data.answers?.length ?? 0)) go(v.answer + 1)
      else if ((k === '\x1b[C' || k === ']' || k === 'l') && v.answer > 0) go(v.answer - 1)
      else if (k === ' ' && a) v.marks.has(v.cur) ? v.marks.delete(v.cur) : v.marks.add(v.cur)
      else if (k === 'a' && a) v.marks = new Set(a.items.map((_, i) => i))
      else if (k === '\x1b') v.marks.clear()
      else if ((k === '\r' || k === 'c') && a) {
        const quote = (v.marks.size ? [...v.marks].sort((p, q) => p - q) : [v.cur]).map(i => a.items[i])
        if (k === 'c') {
          run(['pbcopy'], quote.map(q => `${q.split('\n').map(l => `> ${l}`).join('\n')}\n\n`).join(''))
          v.msg = `copied ${quote.length} quote(s)`
          v.marks.clear()
        } else {
          // The marks stay until the mod says the quotes are in: a refused request can be sent again as it was.
          // Only the lines sent: one marked while waiting is for the next quote.
          const id = a.id
          const sent = v.marks.size ? [...v.marks] : []
          v.msg = send({ quote }, () => v.answerId === id && sent.forEach(i => v.marks.delete(i)), `${quote.length} quote(s)`)
        }
      }
    } else if (x) {
      const opens = /^https?:\/\//i.test(x.ref) || (x.kind !== 'commit' && x.ref.startsWith('/'))
      if (k === '\r' || k === 'o') {
        if (opens) run(['open', x.ref])
        v.msg = opens ? `opened ${x.ref}` : 'nothing to open'
      } else if (k === 'p') {
        if (opens) run(x.ref.startsWith('/') ? ['qlmanage', '-p', x.ref] : ['open', x.ref])
        v.msg = opens ? `preview ${x.ref}` : 'nothing to preview'
      } else if (k === 'c') {
        run(['pbcopy'], x.ref)
        v.msg = `copied ${x.ref}`
      } else if (k === 'r') {
        // The row by its ref: the mod numbers it as its list stands then.
        v.msg = send({ ref: x.ref }, () => {}, `#a${v.cur + 1}`)
      }
    }
  }
}

/** The keys in one read: an escape sequence (`ESC [ … final`, `ESC O x`), a lone ESC, or one character. */
export const keysOf = str => str.match(/\x1b\[[0-9;?]*[@-~]|\x1bO.|\x1b|[^\x1b]/gsu) ?? []

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) main()
