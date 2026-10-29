import type { EngineInterface, PluginState, Register } from 'claude-code'

import { cells, fit, rowsOf } from './lib/band.ts'
import { atomic, AUDIT_PROMPT, cleanupEmptySid, digest, errorText, judgeResult, migrate, ownerRow, projectionOf, rootOf, snapshot, validIdentity } from './lib/records.ts'
import type { Bundle, Call, Identity, Owner } from './lib/records.ts'

const MOD_VERSION = '0.3.2'
const NAME = 'agent-should-know'
const COMMAND = 'heads-up'
const ACCENT = 'magenta'

// The built-in's offer card carries these two buttons; its other views do not.
const OFFER_LABELS = ['Learn more', 'Knew this already']
const KEPT = 20
const PREFIX = 'A side agent watching this session flagged this for you, the main agent:'
const VERDICT_CHARS = 600
// Nobody approved what a side agent suggests: a fix stays inside what the user already
// approved (10-20: a relayed card made the agent pick a model tier that needs approval).
const ASK =
  "Check it against the work. If it holds, fix it only within what the user already approved; a fix that needs the user's approval (a model tier, a push, a deletion, a change of scope) is not made: name it and ask. If it does not hold, say why in one line."
/** 'open' once the person unfolded the band; absent or 'folded': the band starts as its header line. */
const FOLD_KEY = `${NAME}.fold`
const HIDE_KEY = `${NAME}.hidden`
/** The session's log file, so a reload (or one after midnight) keeps writing and counting the same file. */
const fileKey = (sid: string) => `file:${sid}`

type Node = { type?: string; props?: { label?: string }; children?: unknown[] }

function walk(node: unknown, labels: string[], words: string[]) {
  if (typeof node === 'string' || typeof node === 'number') {
    words.push(String(node))
    return
  }
  if (Array.isArray(node)) {
    for (const child of node) walk(child, labels, words)
    return
  }
  if (node === null || typeof node !== 'object') return
  const el = node as Node
  if (el.type === 'Button') {
    labels.push(el.props?.label ?? '')
    return
  }
  walk(el.children ?? [], labels, words)
}

// The band joins every plugin's rows (live costs among them), so the line is cut
// out by its tag. shortcut: a two-sentence card keeps its first sentence only;
// the relay sends the stored line instead whenever the built-in's store is read.
const LINE = /(?:Heads up|You should know) · .*?(?:。|\.(?=\s|$))/

function cardLine(node: unknown): string | null {
  const labels: string[] = []
  const words: string[] = []
  walk(node, labels, words)
  if (!OFFER_LABELS.every(l => labels.includes(l))) return null
  // Texts are joined with a space: another plugin's row right after the card would
  // otherwise run into its last period ("summed.workers") and hide the sentence end.
  return LINE.exec(words.join(' ').replace(/\s+/g, ' '))?.[0] ?? null
}

// The card's line ("Heads up · ..."), or null when the tree holds no offer card.
export const offerLine = (tree: unknown): string | null => cardLine(tree)

// The tree without the card: the deepest node that still holds it is dropped,
// the other plugins' rows beside it stay.
export function withoutCard(node: unknown): unknown {
  if (node === null || typeof node !== 'object' || Array.isArray(node)) return node
  const el = node as Node
  const kids = el.children ?? []
  const at = kids.findIndex(k => cardLine(k) !== null)
  // No child holds the card: the node is the card itself (the built-in's tree alone).
  if (at === -1) return cardLine(node) === null ? node : null
  const kid = kids[at]
  const isDeeper = ((kid as Node).children ?? []).some(k => cardLine(k) !== null)
  return { ...el, children: isDeeper ? kids.map((k, i) => (i === at ? withoutCard(k) : k)) : kids.filter((_, i) => i !== at) }
}

type State = {
  cwd: string
  sid: string
  home: string
  // The log file, fixed at the session's first card or read back from the store.
  file: { path: string; head: string; sid8: string } | null
  // The time of the card last flagged, which its verdict row names.
  flagged: string
  count: { flagged: number; handled: number }
  // The relayed card, and the turn it was queued behind (its answer is not the verdict).
  // A plugin's submit carries no turnId, so the running main turn is tracked here.
  pending: { over: string | undefined; card: string } | null
  running: string | undefined
  // The card's line for the running turn, read after its next tool result instead of when it ends.
  early: string | null
  sent: Set<string>
  folded: boolean
  hidden: boolean
}

const iso = () => `${new Date().toISOString().slice(0, 19)}Z`
const errText = (err: unknown) => (err instanceof Error ? err.message : String(err))
const project = (s: State) => s.cwd.split('/').pop() || 'unknown'
const folderOf = (s: State) => `${s.home}/.local/state/${NAME}/${project(s)}`

function countOf(text: string) {
  const rows = text.split('\n')
  return { flagged: rows.filter(r => r.includes(' · flagged · ')).length, handled: rows.filter(r => / · handled \d/.test(r)).length }
}

function fileFor(s: State, path: string) {
  return { path, head: `# ${project(s)} · ${s.sid} · ${s.cwd}`, sid8: s.sid.slice(0, 8) }
}

// One file per session, `<project>/<day>-<sid8>.log`: sessions never write into
// each other's file. Every row starts `<ISO time> · <sid8> ·`, so one file reads
// in order and `sort <project>/*.log` is the project's timeline across sessions.
async function logLine($: EngineInterface, s: State, at: string, kind: string, text: string) {
  // A failed log row must not fail the hook: the relay after it matters more.
  try {
    if (!validIdentity(s)) throw new Error('identity unready; log not written')
    if (s.file === null) {
      s.file = fileFor(s, `${folderOf(s)}/${at.slice(0, 10)}-${s.sid.slice(0, 8)}.log`)
      await $.store.set(fileKey(s.sid), s.file.path)
    }
    const { path, head, sid8 } = s.file
    const before = await $.fs.read(path).catch(() => `${head}\n`)
    const after = `${before}${at} · ${sid8} · ${kind} · ${text}\n`
    await $.fs.write(path, after)
    s.count = countOf(after)
    $.ui.invalidate('ui.render')
  } catch (err) {
    $.ui.toast(`${NAME} v${MOD_VERSION}: log not written (${errText(err)})`)
  }
}

const BUILTIN_STORE = 'cc-plugin-you-should-know_builtin-'

type Stored = { line: string; explanation: string | undefined }

// The card as the built-in stored it: the whole line, and the explanation its
// Learn more would show, written beside the card. Or why it could not be read.
// shortcut: reads the built-in's own store file, an internal format under
// ~/.claude only; upgrade if Claude Code moves it or CLAUDE_CONFIG_DIR is set.
async function storedCard($: EngineInterface, s: State, shown: string): Promise<Stored | string> {
  try {
    const dir = `${s.home}/.claude/plugins/store`
    const name = (await $.fs.list(dir)).find(f => f.name.startsWith(BUILTIN_STORE) && f.name.endsWith('.json'))?.name
    if (name === undefined) return `no ${BUILTIN_STORE}*.json in ${dir}`
    type Row = { id?: string; tag?: string; view?: { kind?: string; line?: string; explanation?: string } }
    const rows = (JSON.parse(await $.fs.read(`${dir}/${name}`)) as { sessions?: Row[] }).sessions ?? []
    const row = rows.find(r => r.id === s.sid)
    if (row?.view?.kind !== 'offer' || row.view.line === undefined) return 'the store holds no offer for this session'
    // The file may lag the screen and still hold this session's previous card.
    const flat = (t: string) => t.replace(/\s+/g, ' ').trim()
    if (!flat(row.view.line).startsWith(flat(shown.replace(/^(?:Heads up|You should know) · /, ''))))
      return "the store's offer does not match the card on screen"
    // The built-in ends every line with a period, after a 。 too.
    const line = `${row.tag ?? 'Heads up'} · ${row.view.line.replace(/(?<=[。.!?])\.$/, '')}`
    return { line, explanation: row.view.explanation }
  } catch (err) {
    return errText(err)
  }
}

const quote = (text: string) => text.split('\n').map(l => `> ${l}`).join('\n')

// The card on show goes to the main agent once, and is logged; the tree comes back without it.
async function relay($: EngineInterface, s: State, line: string) {
  if (s.sent.has(line)) return
  s.sent.add(line)
  // Kept in the store too, so a hot reload does not send the card on show again.
  const kept = ((await $.store.get('sent')) as string[] | undefined) ?? []
  if (kept.includes(line)) return
  await $.store.set('sent', [...kept, line].slice(-KEPT))

  const stored = await storedCard($, s, line)
  const card = typeof stored === 'string' ? { line, explanation: undefined } : stored
  const body = card.explanation ? `${quote(card.line)}\n>\n${quote(card.explanation)}` : quote(card.line)
  const note = typeof stored === 'string' ? `\n(Only the card's line: its explanation was not read: ${stored}.)` : ''

  s.flagged = iso()
  await logLine($, s, s.flagged, 'flagged', card.line)

  // A long turn can run for hours before the prompt below is read: its next tool result carries the line now.
  const waited = s.running !== undefined
  if (waited)
    s.early = `${PREFIX} (at ${s.flagged}, while this turn runs)\n${body}${note}\nWeigh it in the work still to do; it approves nothing. A check of it follows as a prompt when this turn ends.`
  const when = `\nFlagged at ${s.flagged}${waited ? ', while a turn ran: check it against the work as it stands now.' : '.'}`

  // A plugin's prompt waits until the running turn ends: no interruption.
  $.prompt
    .submit({ text: `${PREFIX}\n${body}${note}${when}\n${ASK}` })
    .then(r => {
      if (r.drop !== undefined) s.pending = null
      $.ui.toast(r.drop === undefined ? `${NAME} v${MOD_VERSION}: sent to the main session` : `${NAME}: not sent (${r.drop})`)
    })
    .catch(err => $.ui.toast(`${NAME}: not sent (${errText(err)})`))
}

// The session's log, or its repo's folder before the first card.
async function openLog($: EngineInterface, s: State): Promise<string> {
  const target = s.file?.path ?? folderOf(s)
  if (!(await $.fs.exists(target))) return `no heads-up logged yet in ${project(s)}`
  const r = await $.process.run(['open', target], { timeoutMs: 5000 })
  return r.exitCode === 0 ? `opened ${target}` : `open failed (exit ${r.exitCode}): ${target}`
}

async function setHidden($: EngineInterface, s: State, hidden: boolean) {
  s.hidden = hidden
  $.ui.invalidate('ui.render')
  await $.store.set(HIDE_KEY, hidden ? 'hidden' : 'shown').catch(err => $.ui.toast(`${NAME}: band state not saved (${errText(err)})`))
}

function summary(s: State) {
  const where = s.file?.path ?? `${folderOf(s)}/ (no file yet)`
  return `${s.count.flagged} heads-up · ${s.count.handled} handled this session · log: ${where}`
}

const STATE = { plugin: 'agent-should-know', key: 'observer-v1' } as const
type Saved = PluginState['agent-should-know']['observer-v1']
type Turn = { id: string; model: string; calls: Call[]; expected: Set<string>; messages: unknown[]; coverage: Set<string> }

type Observer = {
  retired: boolean
  cleanup: boolean
  instance: string
  seq: number
  epoch: number
  version: number
  id: Identity | null
  rows: Owner[]
  ledger: string | null
  retained: string
  projection: string | null
  enabled: boolean
  health: string
  turn: Turn | null
  probe: Promise<void> | null
  writing: Promise<void>
  diagnostics: Promise<void>
  states: Promise<void>
  segment: { root: string; index: number; total: number } | null
  job: Promise<void> | null
  controller: AbortController | null
  timer: ReturnType<EngineInterface['clock']['after']> | null
  warnings: Set<string>
}

// Each trace rewrites one segment, counted in bytes as fs.list reports them.
const SEGMENT = 256 * 1024
const segmentPath = (root: string, index: number) => `${root}/diagnostics${index ? `.${index}` : ''}.jsonl`
const bytes = (text: string) => new TextEncoder().encode(text).length
const NOT_SAVED = 'diagnostics not saved'

const notice = ($: EngineInterface, o: Observer, text: string, warning = true, key = text) => {
  if (o.retired) return
  o.health = text
  // A transcript line is a session.append, whose hook traces, and a trace can warn: a warning
  // already shown is not logged again, or it feeds itself (0.3.2: ed52bad5 froze on 13491 rows).
  if (warning && o.warnings.has(key)) return
  if (warning) o.warnings.add(key)
  try { $.ui.log(`agent-should-know v${MOD_VERSION}: ${text}`); $.ui.invalidate('ui.render') } catch { /* The next healthy dispatch repeats the pending notice. */ }
}
const cancel = (o: Observer) => {
  o.epoch += 1
  o.timer?.cancel()
  o.timer = null
  o.controller?.abort()
}
const trace = ($: EngineInterface, o: Observer, event: string, extra: Record<string, unknown> = {}): Promise<void> => {
  if (o.retired) return Promise.resolve()
  const row = { instance: o.instance, seq: ++o.seq, at: Date.now(), event, epoch: o.epoch, sid: o.id?.sid ?? null, ...extra }
  const context = o.id
  o.diagnostics = o.diagnostics.then(async () => {
    $.ui.log(JSON.stringify(row), { to: 'debug' })
    if (!context) return
    const root = rootOf(context)
    if (o.segment?.root !== root) {
      // One list at the first trace finds the last segment; an older full file is never read again.
      const found = (await $.fs.exists(root) ? await $.fs.list(root) : []).flatMap(f => {
        const m = /^diagnostics(?:\.(\d+))?\.jsonl$/.exec(f.name)
        return m ? [{ index: Number(m[1] ?? 0), size: f.size }] : []
      })
      const last = found.reduce((a, b) => b.index >= a.index ? b : a, { index: 0, size: 0 })
      o.segment = { root, index: last.size >= SEGMENT ? last.index + 1 : last.index, total: found.reduce((n, f) => n + f.size, 0) }
    }
    const line = `${JSON.stringify(row)}\n`
    let path = segmentPath(root, o.segment.index)
    let old = await $.fs.exists(path) ? await $.fs.read(path) : null
    if (old !== null && bytes(old) + bytes(line) > SEGMENT) { path = segmentPath(root, ++o.segment.index); old = null }
    o.segment.total += bytes(line)
    if (o.segment.total > 1024 * 1024) notice($, o, 'diagnostics size warning; owner decides retention')
    await atomic($, path, `${old ?? ''}${line}`, old)
  }).catch(err => {
    try { $.ui.log(`agent-should-know diagnostics not saved: ${errorText(err)}`, { to: 'debug' }) } catch { /* The notice below still shows. */ }
    notice($, o, `${NOT_SAVED}; ${errorText(err).replace(/\s+/g, ' ').slice(0, 160)}`, true, NOT_SAVED)
  })
  return o.diagnostics
}
const saveState = ($: EngineInterface, o: Observer): Promise<void> => {
  const saved = o.states.then(async () => {
    if (!o.id) return
    const value: Saved = { schema_version: 1, sid: o.id.sid, epoch: o.epoch, rows: o.rows, ledger: o.ledger, retained: o.retained, projection: o.projection, pending: o.job !== null, instance: o.instance }
    const r = await $.state.set(STATE, value, { ifVersion: o.version })
    o.version = r.version
    if (!r.isSet) {
      o.enabled = false
      cancel(o)
      throw new Error('state CAS conflict; not saved; use on after a fresh dispatch')
    }
  })
  // Keep the queue usable; the caller still receives the original rejection.
  o.states = saved.catch(() => undefined)
  return saved
}
const persist = ($: EngineInterface, o: Observer): Promise<void> => {
  const context = o.id
  const at = o.epoch
  o.writing = o.writing.then(async () => {
    if (!context || o.id !== context || at !== o.epoch) return
    const text = o.retained + (o.retained && !o.retained.endsWith('\n') ? '\n' : '') + (o.rows.length ? `${o.rows.map(r => JSON.stringify(r)).join('\n')}\n` : '')
    await atomic($, `${rootOf(context)}/owner.asks.jsonl`, text, o.ledger)
    if (o.id !== context) return
    o.ledger = text
    if (at !== o.epoch) return
    const projected = snapshot(context, o.rows, o.epoch, o.enabled)
    await atomic($, projectionOf(context), projected, o.projection)
    if (o.id !== context) return
    o.projection = projected
    if (at !== o.epoch) return
    await saveState($, o)
  }).catch(err => notice($, o, `storage not saved; coverage UNKNOWN: ${errorText(err)}`))
  return o.writing
}
const identity = async ($: EngineInterface, o: Observer): Promise<Identity> => {
  let operation = 'session.id'
  try {
    const sid = await $.session.id()
    await trace($, o, 'identity.await', { operation, empty: sid === '' })
    operation = 'env.get(HOME)'
    const home = (await $.env.get('HOME')) ?? ''
    await trace($, o, 'identity.await', { operation, absolute: home.startsWith('/') })
    operation = 'session.cwd'
    const cwd = await $.session.cwd()
    await trace($, o, 'identity.await', { operation, absolute: cwd.startsWith('/') })
    return { sid, home, cwd }
  } catch (err) {
    await trace($, o, 'identity.error', { operation, error: errorText(err) })
    throw new Error(`${operation}: ${errorText(err)}`)
  }
}
const ready = async ($: EngineInterface, o: Observer) => {
  if (o.retired) return
  if (o.probe) return o.probe
  o.probe = (async () => {
    try {
      if (o.cleanup) {
        o.cleanup = false
        try { await cleanupEmptySid($) } catch (err) { notice($, o, `cleanup incomplete: ${errorText(err)}`) }
      }
      const live = await identity($, o)
      await trace($, o, 'identity', { liveSid: live.sid, sidEqual: o.id?.sid === live.sid, homeEqual: o.id?.home === live.home, cwdEqual: o.id?.cwd === live.cwd })
      if (!validIdentity(live)) {
        cancel(o); o.id = null; o.enabled = false
        notice($, o, 'identity unready; no state write; tools remain available')
        return
      }
      if (o.id?.sid === live.sid && o.id.home === live.home && o.id.cwd === live.cwd) return
      cancel(o)
      o.id = null
      o.rows = []; o.ledger = null; o.retained = ''; o.projection = null; o.turn = null; o.enabled = true
      const control = await $.store.get(`control:${live.sid}`)
      o.enabled = control !== 'off'
      const saved = await $.state.get(STATE)
      o.version = saved.version
      const value = saved.value as Saved | undefined
      if (value?.schema_version === 1 && value.sid === live.sid) {
        if (!Array.isArray(value.rows) || value.rows.some(r => r.schema_version !== 1 || r.sid !== live.sid || !r.uuid || !Array.isArray(r.items) || r.items.some(i => r.text.slice(i.start, i.end) !== i.text))) throw new Error('invalid engine recovery state')
        o.rows = value.rows
        o.ledger = value.ledger
        o.retained = value.retained ?? ''
        o.projection = value.projection
        o.epoch = Math.max(o.epoch, value.epoch + 1)
        if (value.pending) notice($, o, `audit UNKNOWN: interrupted at reload; no verdict restored; observer remains ${o.enabled ? 'on' : 'off'}`, false)
      }
      o.id = live
      if (o.ledger === null && await $.fs.exists(`${rootOf(live)}/owner.asks.jsonl`)) {
        o.retained = o.ledger = await $.fs.read(`${rootOf(live)}/owner.asks.jsonl`)
        if (o.projection === null && await $.fs.exists(projectionOf(live))) o.projection = await $.fs.read(projectionOf(live))
        notice($, o, 'historical ledger retained; native recovery coverage UNKNOWN; disk grants no authority')
      }
      if (o.health === 'initializing') o.health = o.enabled ? 'ready' : 'off'
      await saveState($, o)
      await trace($, o, 'identity-ready')
    } catch (err) {
      o.enabled = false
      notice($, o, `identity/store recovery degraded; explicit on required: ${errorText(err)}`)
    }
  })().finally(() => { o.probe = null })
  return o.probe
}
const failed = ($: EngineInterface, o: Observer, event: string, error: unknown) => {
  notice($, o, `hook ${event} UNKNOWN: ${errorText(error)}`)
}

const retire = async (o: Observer) => {
  if (o.job || o.timer) o.health = 'audit UNKNOWN: interrupted at reload; no verdict restored'
  o.retired = true
  cancel(o)
  // A probe can finish recovery, and an audit can enqueue its final state save.
  await o.probe
  cancel(o)
  await o.job
  await o.writing
  await o.diagnostics
  await o.states
  o.id = null
}

export const register: Register = on => {
  // Old callbacks retain their own state; a new registration never resets it.
  const o: Observer = {
    retired: false,
    cleanup: true,
    instance: crypto.randomUUID(),
    seq: 0,
    epoch: 0,
    version: 0,
    id: null,
    rows: [],
    ledger: null,
    retained: '',
    projection: null,
    enabled: true,
    health: 'initializing',
    turn: null,
    probe: null,
    writing: Promise.resolve(),
    diagnostics: Promise.resolve(),
    states: Promise.resolve(),
    segment: null,
    job: null,
    controller: null,
    timer: null,
    warnings: new Set<string>()
  }

  on('command.run', { command: 'reload-plugins' }, async ($, e, next) => {
    await retire(o)
    const result = await next(e)
    // An unchanged module stays loaded. Only that environment can still call $.
    try { await $.session.id() } catch { return result }
    o.retired = false
    await ready($, o)
    return result
  }).catch(($, e, next) => { failed($, o, 'reload', next.error); return next(e) })

  on('session.start', async ($, e, next) => {
    // The engine stages this instance while the old one can still write. Do not
    // read recovery baselines or write session storage until a dispatch after swap.
    o.cleanup = true
    await $.command.register({ name: 'asks', description: 'Owner asks and audit: status, on, off, migrate' })
    s.cwd = e.cwd
    s.sid = await $.session.id()
    s.home = (await $.env.get('HOME')) ?? ''
    if (validIdentity(s)) {
      s.folded = (await $.store.get(FOLD_KEY)) !== 'open'
      s.hidden = (await $.store.get(HIDE_KEY)) === 'hidden'
      const path = (await $.store.get(fileKey(s.sid))) as string | undefined
      if (path !== undefined) {
        if (typeof path !== 'string' || !path.startsWith(`${folderOf(s)}/`) || !path.endsWith(`-${s.sid.slice(0, 8)}.log`) || path.split('/').includes('..')) {
          notice($, o, 'relay cache path invalid; ignored; original retained')
        } else {
          s.file = fileFor(s, path)
          s.count = countOf(await $.fs.read(path))
        }
      }
      await $.command.register({ name: 'heads-up', description: `Agent should know v${MOD_VERSION}: show or hide the card band` })
    }
    return next(e)
  }).catch(($, e, next) => { failed($, o, 'session.start', next.error); return next(e) })

  on('session.attach', async ($, e, next) => { await ready($, o); await trace($, o, 'session.attach'); return next(e) })
    .catch(($, e, next) => { failed($, o, 'session.attach', next.error); return next(e) })

  on('session.end', ($, e, next) => {
    cancel(o)
    o.id = null; o.turn = null; o.rows = []; o.ledger = null; o.retained = ''; o.projection = null
    s.sid = ''; s.cwd = ''; s.home = ''; s.file = null
    s.pending = null; s.early = null; s.running = undefined; s.sent.clear()
    try { $.ui.log(JSON.stringify({ instance: o.instance, event: 'session.end', sid: e.sessionId, reason: e.reason, epoch: o.epoch }), { to: 'debug' }) } catch { /* No model or repair at session end. */ }
    return next(e)
  }).catch(($, e, next) => { failed($, o, 'session.end', next.error); return next(e) })

  on('command.run', { command: 'asks' }, async ($, e) => {
    await ready($, o)
    if (e.origin?.kind !== 'composer' && e.origin?.kind !== 'bridge') return { text: 'asks: command origin is not owner authority' }
    const action = e.args.trim()
    if (action === 'off') {
      const interrupted = o.job !== null || o.timer !== null
      o.enabled = false; cancel(o); o.health = 'off'
      if (interrupted) notice($, o, 'off; audit cancelled; previous verdict unavailable', false)
      if (!o.id) return { text: 'off in this instance; identity unready; not saved' }
      try { await $.store.set(`control:${o.id.sid}`, 'off'); await persist($, o) } catch (err) { notice($, o, `off in memory; not saved: ${errorText(err)}`) }
    } else if (action === 'on') {
      if (!o.id) return { text: 'identity unready; not enabled' }
      if (o.job) return { text: 'UNKNOWN previous request still settling; no new audit started' }
      const state = await $.state.get(STATE)
      o.version = state.version
      cancel(o); o.enabled = true; o.health = 'ready'; o.warnings.clear()
      try { await $.store.set(`control:${o.id.sid}`, 'on'); await persist($, o) } catch (err) { notice($, o, `on not saved: ${errorText(err)}`) }
    } else if (action === 'migrate') {
      if (!o.id) return { text: 'migrate: identity unready; no files changed' }
      try { return { text: await migrate($, o.id) } } catch (err) { notice($, o, errorText(err)) }
    }
    await trace($, o, 'command', { action: ['on', 'off', 'migrate'].includes(action) ? action : 'status' })
    return { text: `agent-should-know v${MOD_VERSION}: ${o.enabled ? 'on' : 'off'}; ${o.health}\n${o.rows.flatMap(r => r.items.map(i => `${i.id} [${i.kind}${i.answer ? ', answered' : ', open'}] ${i.text}`)).join('\n')}\n${[...o.warnings].join('\n')}` }
  }).catch(($, _e, next) => { failed($, o, 'command.run', next.error); return { text: `asks UNKNOWN: ${errorText(next.error)}` } })

  on('prompt.submit', async ($, e, next) => {
    await ready($, o)
    if (e.origin?.kind === 'composer' || e.origin?.kind === 'bridge') {
      if (o.job || o.timer) notice($, o, 'audit UNKNOWN: interrupted by new owner message', false)
      cancel(o)
    }
    await trace($, o, 'prompt.submit', { origin: e.origin?.kind ?? 'unknown' })
    const origin = e.origin
    if (origin?.kind === 'plugin' && (origin.name === NAME || origin.name.startsWith(`${NAME}@`))) s.pending = { over: e.turnId ?? s.running, card: s.flagged }
    return next(e)
  }).catch(($, e, next) => { failed($, o, 'prompt.submit', next.error); return next(e) })

  on('session.append', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId !== undefined || 'deny' in result) return result
    await ready($, o)
    if (o.turn) {
      o.turn.messages.push({ uuid: result.uuid, origin: e.origin, message: result.message })
      for (const block of result.message.content) {
        if (!['text', 'thinking', 'tool_use', 'tool_result'].includes(block.type)) o.turn.coverage.add(`media or unknown body ${result.uuid}`)
        if (block.type === 'tool_use' && typeof block.id === 'string') o.turn.expected.add(block.id)
      }
    }
    if (o.enabled && o.id && ['prompt', 'delivery', 'command'].includes(e.door) && result.message.role !== 'assistant' && (e.origin.kind === 'composer' || e.origin.kind === 'bridge')) {
      if (!o.rows.some(r => r.uuid === result.uuid)) {
        cancel(o)
        const text = result.message.content.flatMap(b => b.type === 'text' ? [b.text] : []).join('\n')
        o.rows.push(ownerRow(o.id, result.uuid, e.origin.kind, text, o.epoch, o.instance, e.door === 'delivery'))
        await persist($, o)
      }
    }
    await trace($, o, 'session.append', { uuid: result.uuid, origin: e.origin.kind, agent: e.agentId ?? null })
    return result
  }).catch(($, e, next) => { failed($, o, 'session.append', next.error); return next(e) })

  on('turn.start', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)
    // Not on a save that works: the notice's own echo row traces, and a save in between would let
    // an intermittent failure show again on every echo (ASK032-03). The mod never starts a turn.
    o.warnings.delete(NOT_SAVED)
    await ready($, o)
    o.turn = { id: e.turnId, model: await $.session.model(), calls: [], expected: new Set(), messages: [], coverage: new Set() }
    s.running = e.turnId
    if (o.id) { s.sid = o.id.sid; s.home = o.id.home; s.cwd = o.id.cwd }
    await trace($, o, 'turn.start', { turn: e.turnId })
    return next(e)
  }).catch(($, e, next) => { failed($, o, 'turn.start', next.error); return next(e) })

  on('turn.step', async function* ($, e, next) {
    if (e.agentId === undefined && o.turn?.id === e.turnId) {
      o.turn.model = e.model
      if (e.messageCount >= 4096) o.turn.coverage.add('SDK message cap')
      await trace($, o, 'turn.step', { turn: e.turnId, step: e.index })
    }
    for await (const chunk of next(e)) {
      if (e.agentId === undefined && o.turn?.id === e.turnId && chunk.kind === 'tool') o.turn.expected.add(chunk.id)
      yield chunk
    }
  }).catch(async function* ($, e, next) { failed($, o, 'turn.step', next.error); yield* next(e) })

  on('tool.call', async ($, e, next) => {
    const result = await next(e)
    await ready($, o)
    await trace($, o, 'tool.call.enter', { tool: e.tool, call: e.tool_use_id, agent: e.agentId ?? null })
    if (e.agentId === undefined && next.origin.plugin === 'engine' && o.turn) o.turn.calls.push({ id: e.tool_use_id, tool: e.tool, input: e, result })
    await trace($, o, 'tool.call.exit', { tool: e.tool, call: e.tool_use_id, denied: 'deny' in result })
    if (s.early !== null && next.origin.plugin === 'engine' && e.agentId === undefined && !('deny' in result)) {
      const early = s.early
      s.early = null
      return { ...result, context: [...(result.context ?? []), early] }
    }
    return result
  }).catch(($, e, next) => { failed($, o, 'tool.call', next.error); return next(e) })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId !== undefined) return result
    s.early = null
    if (e.turnId === s.running) s.running = undefined
    if (s.pending !== null && e.turnId !== s.pending.over) {
      const { card } = s.pending
      s.pending = null
      await logLine($, s, iso(), `${e.reason === 'answer' ? 'handled' : e.reason} ${card.slice(11, 19)}`, result.text.trim().replace(/\s+/g, ' ').slice(0, VERDICT_CHARS))
    }
    await ready($, o)
    await trace($, o, 'turn.complete', { turn: e.turnId, reason: e.reason })
    if (!o.id || !o.enabled || !o.turn || o.turn.id !== e.turnId) return result
    if (o.job || o.timer) { notice($, o, 'UNKNOWN audit already active; no second request'); return result }
    const current = o.turn
    for (const call of current.expected) if (!current.calls.some(c => c.id === call)) current.coverage.add(`missing result ${call}`)
    if (!o.rows.length) current.coverage.add('no native owner provenance captured')
    for (const warning of o.warnings) current.coverage.add(warning)
    const context = o.id
    const at = o.epoch
    const bundle: Bundle = JSON.parse(JSON.stringify({ schema_version: 1, sid: context.sid, epoch: at, instance: o.instance, turn: e.turnId, reply: result.text, owners: o.rows, calls: current.calls, messages: current.messages, coverage: [...current.coverage] }))
    const model = e.usage?.model ?? current.model
    o.controller = new AbortController()
    const signal = o.controller.signal
    notice($, o, 'audit UNKNOWN: pending; result follows independently', false)
    o.timer = $.clock.after(0, () => {
      o.timer = null
      if (at !== o.epoch || o.id !== context || !o.enabled) return
      o.job = Promise.resolve().then(async () => {
        await saveState($, o)
        const body = JSON.stringify(bundle)
        const hash = await digest(body)
        const path = `${rootOf(context)}/audit/${hash}`
        await atomic($, `${path}.evidence.json`, body, null)
        // maxTokens: the API default is 1024; high effort plus the items array overran it (empty-reply / cut JSON).
        const answer = await $.model.complete({ model, effort: 'high', maxTokens: 16000, timeoutMs: 180000, prompt: `${AUDIT_PROMPT}\n${body}` }, { signal })
        if (at !== o.epoch || o.id !== context || !o.enabled || signal.aborted) return
        const judged = answer.isAnswered ? judgeResult(answer.text, bundle) : { verdict: 'UNKNOWN' as const, reason: `model ${answer.reason}`, owners: o.rows }
        const detail = judged.verdict === 'UNKNOWN' ? { output_tokens: answer.usage.output_tokens, excerpt: answer.isAnswered ? answer.text.slice(0, 500) : '' } : {}
        await atomic($, `${path}.json`, JSON.stringify({ schema_version: 1, sid: context.sid, epoch: at, instance: o.instance, digest: hash, verdict: judged.verdict, reason: judged.reason, ...detail }), null)
        if (at !== o.epoch || o.id !== context || !o.enabled) return
        if (judged.verdict === 'PASS') { o.rows = judged.owners; await persist($, o) }
        // Audit reports must not become warnings in the next audit's coverage.
        const reason = judged.reason.startsWith('coverage: ') ? 'coverage' : judged.reason.replace(/\s+/g, ' ').slice(0, 120)
        notice($, o, `audit ${judged.verdict}: ${reason}; ${path}.json`, false)
      }).catch(err => notice($, o, `audit UNKNOWN; not saved: ${errorText(err)}`)).finally(() => {
        o.job = null
        o.controller = null
        if (o.id === context) void saveState($, o).catch(err => notice($, o, `audit state not saved: ${errorText(err)}`))
      })
    })
    return result
  }).catch(($, e, next) => { failed($, o, 'turn.complete', next.error); return next(e) })
  const s: State = {
    cwd: '',
    sid: '',
    home: '',
    file: null,
    flagged: '',
    count: { flagged: 0, handled: 0 },
    pending: null,
    running: undefined,
    early: null,
    sent: new Set(),
    folded: true,
    hidden: false,
  }


  on('command.run', { command: 'heads-up' }, async ($, e) => {
    await setHidden($, s, !s.hidden)
    return { text: `${s.hidden ? `band hidden; /${COMMAND} shows it again.` : 'band shown.'} ${summary(s)}` }
  })



  // The main loop's next tool result only: a subagent's would not reach the main agent, and
  // a plugin's own `$.tool.call` (origin not engine) reaches no model.


  // The card leaves the band once relayed; this mod's header goes under what is left,
  // in what is left of maxRows, and nothing when even the header does not fit.
  // No hotkeys: the workers panel owns digits and r x q i a, grok-bot-watch w f o u.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const tree = await next(e)
    const line = offerLine(tree)
    let below = tree
    if (line !== null && validIdentity(s)) {
      below = (withoutCard(tree) ?? $.ui.resolve(e).Box({})) as typeof tree
      await relay($, s, line)
    }
    if (s.hidden && o.warnings.size === 0) return below
    const budget = e.props.maxRows - rowsOf(below)
    if (budget < 1) return below

    const { Box, Text, Button } = $.ui.resolve(e)
    const width = e.props.bodyColumns
    const title = `▌agent should know v${MOD_VERSION}`
    const status = (s.count.flagged ? ` · ${s.count.flagged} heads-up · ${s.count.handled} handled ` : ' · no heads-up yet ') + (o.health === 'ready' ? '' : `· ${o.health} `)
    // Buttons say what they do when the header has room for it, else their icon (the workers band's rule).
    // ' [-]' is the engine's collapse control, drawn over the band's last cells: kept clear.
    const words = cells(title) + cells(status) + cells('[ ⧉ log ][ ▾ fold ][ hide ] [-]') <= width
    const header = Box({
      flexDirection: 'row',
      children: [
        Text({ bold: true, color: ACCENT, children: title }),
        Text({ dimColor: true, children: fit(status, Math.max(0, width - cells(title) - (words ? 31 : 19))) }),
        Button({ key: 'log', label: words ? '⧉ log' : '⧉', onPress: () => void openLog($, s).then(t => $.ui.toast(t), err => $.ui.toast(`${NAME}: ${errText(err)}`)) }),
        // Fold keeps the header (the count still changes); hide takes the band away until /heads-up.
        Button({
          key: 'fold',
          label: words ? (s.folded ? '▸ open' : '▾ fold') : s.folded ? '▸' : '▾',
          onPress: () => {
            s.folded = !s.folded
            $.ui.invalidate('ui.render')
            void $.store.set(FOLD_KEY, s.folded ? 'folded' : 'open').catch(err => $.ui.toast(`${NAME}: fold not saved (${errText(err)})`))
          },
        }),
        Button({ key: 'hide', label: words ? 'hide' : '✕', onPress: () => void setHidden($, s, true) }),
      ],
    })
    if (s.folded || budget < 2) return Box({ flexDirection: 'column', children: [below, header] })
    // Help in words only when there is nothing yet (rule 8).
    const home = (p: string) => (s.home && p.startsWith(s.home) ? `~${p.slice(s.home.length)}` : p)
    const detail = s.file ? `  log: ${home(s.file.path)}` : `  each card goes to the agent; logged in ${home(folderOf(s))}/`
    return Box({ flexDirection: 'column', children: [below, header, Text({ dimColor: true, children: fit(detail, width) })] })
  }).catch(($, e, next) => { $.ui.log(`${NAME}: relay render degraded: ${errText(next.error)}`); return next(e) })
}
