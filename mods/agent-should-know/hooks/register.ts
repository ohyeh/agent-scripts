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

let instance = crypto.randomUUID()
let seq = 0
let epoch = 0
let version = 0
let id: Identity | null = null
let rows: Owner[] = []
let ledger: string | null = null
let retained = ''
let projection: string | null = null
let enabled = true
let health = 'initializing'
let turn: Turn | null = null
let probe: Promise<void> | null = null
let writing: Promise<void> = Promise.resolve()
let diagnostics: Promise<void> = Promise.resolve()
// Diagnostics rows go to diagnostics.jsonl, then diagnostics.1.jsonl, ...: one trace rewrites at most one segment.
const SEGMENT = 256 * 1024
const segmentPath = (root: string, index: number) => `${root}/diagnostics${index ? `.${index}` : ''}.jsonl`
// Bytes, the unit fs.list reports: a CJK row is 3 bytes per character on disk.
const bytes = (text: string) => new TextEncoder().encode(text).length
const NOT_SAVED = 'diagnostics not saved; error in the debug log'
let segment: { root: string; index: number; total: number } | null = null
let job: Promise<void> | null = null
let controller: AbortController | null = null
let timer: ReturnType<EngineInterface['clock']['after']> | null = null
const warnings = new Set<string>()

const notice = ($: EngineInterface, text: string, warning = true) => {
  health = text
  // A transcript line is a session.append, whose hook traces, and a trace can warn: a warning
  // already shown is not logged again, or it feeds itself (0.3.2: ed52bad5 froze on 13491 rows).
  if (warning && warnings.has(text)) return
  if (warning) warnings.add(text)
  try { $.ui.log(`agent-should-know v${MOD_VERSION}: ${text}`); $.ui.invalidate('ui.render') } catch { /* The next healthy dispatch repeats the pending notice. */ }
}
const cancel = () => {
  epoch += 1
  timer?.cancel()
  timer = null
  controller?.abort()
}
const trace = ($: EngineInterface, event: string, extra: Record<string, unknown> = {}): Promise<void> => {
  const row = { instance, seq: ++seq, at: Date.now(), event, epoch, sid: id?.sid ?? null, ...extra }
  const context = id
  diagnostics = diagnostics.then(async () => {
    $.ui.log(JSON.stringify(row), { to: 'debug' })
    if (!context) return
    const root = rootOf(context)
    if (segment?.root !== root) {
      // One list at the first trace finds the last segment; an older full file is never read again.
      const found = (await $.fs.exists(root) ? await $.fs.list(root) : []).flatMap(f => {
        const m = /^diagnostics(?:\.(\d+))?\.jsonl$/.exec(f.name)
        return m ? [{ index: Number(m[1] ?? 0), size: f.size }] : []
      })
      const last = found.reduce((a, b) => b.index >= a.index ? b : a, { index: 0, size: 0 })
      segment = { root, index: last.size >= SEGMENT ? last.index + 1 : last.index, total: found.reduce((n, f) => n + f.size, 0) }
    }
    const line = `${JSON.stringify(row)}\n`
    let path = segmentPath(root, segment.index)
    let old = await $.fs.exists(path) ? await $.fs.read(path) : null
    if (old !== null && bytes(old) + bytes(line) > SEGMENT) { path = segmentPath(root, ++segment.index); old = null }
    segment.total += bytes(line)
    if (segment.total > 1024 * 1024) notice($, 'diagnostics size warning; owner decides retention')
    await atomic($, path, `${old ?? ''}${line}`, old)
  }).catch(err => {
    // The error goes to the debug log: an engine error that names a size would differ every time.
    try { $.ui.log(`agent-should-know diagnostics not saved: ${errorText(err)}`, { to: 'debug' }) } catch { /* The notice below still shows. */ }
    notice($, NOT_SAVED)
  })
  return diagnostics
}
const saveState = async ($: EngineInterface) => {
  if (!id) return
  const value: Saved = { schema_version: 1, sid: id.sid, epoch, rows, ledger, retained, projection, pending: job !== null, instance }
  const r = await $.state.set(STATE, value, { ifVersion: version })
  version = r.version
  if (!r.isSet) {
    enabled = false
    cancel()
    throw new Error('state CAS conflict; not saved; use on after a fresh dispatch')
  }
}
const persist = ($: EngineInterface): Promise<void> => {
  const context = id
  const at = epoch
  writing = writing.then(async () => {
    if (!context || id !== context || at !== epoch) return
    const text = retained + (retained && !retained.endsWith('\n') ? '\n' : '') + (rows.length ? `${rows.map(r => JSON.stringify(r)).join('\n')}\n` : '')
    await atomic($, `${rootOf(context)}/owner.asks.jsonl`, text, ledger)
    if (id !== context) return
    ledger = text
    if (at !== epoch) return
    const projected = snapshot(context, rows, epoch, enabled)
    await atomic($, projectionOf(context), projected, projection)
    if (id !== context) return
    projection = projected
    if (at !== epoch) return
    await saveState($)
  }).catch(err => notice($, `storage not saved; coverage UNKNOWN: ${errorText(err)}`))
  return writing
}
const identity = async ($: EngineInterface): Promise<Identity> => {
  let operation = 'session.id'
  try {
    const sid = await $.session.id()
    await trace($, 'identity.await', { operation, empty: sid === '' })
    operation = 'env.get(HOME)'
    const home = (await $.env.get('HOME')) ?? ''
    await trace($, 'identity.await', { operation, absolute: home.startsWith('/') })
    operation = 'session.cwd'
    const cwd = await $.session.cwd()
    await trace($, 'identity.await', { operation, absolute: cwd.startsWith('/') })
    return { sid, home, cwd }
  } catch (err) {
    await trace($, 'identity.error', { operation, error: errorText(err) })
    throw new Error(`${operation}: ${errorText(err)}`)
  }
}
const ready = async ($: EngineInterface) => {
  if (probe) return probe
  probe = (async () => {
    try {
      const live = await identity($)
      await trace($, 'identity', { liveSid: live.sid, sidEqual: id?.sid === live.sid, homeEqual: id?.home === live.home, cwdEqual: id?.cwd === live.cwd })
      if (!validIdentity(live)) {
        cancel(); id = null; enabled = false
        notice($, 'identity unready; no state write; tools remain available')
        return
      }
      if (id?.sid === live.sid && id.home === live.home && id.cwd === live.cwd) return
      cancel()
      id = null
      rows = []; ledger = null; retained = ''; projection = null; turn = null; enabled = true
      const control = await $.store.get(`control:${live.sid}`)
      enabled = control !== 'off'
      const saved = await $.state.get(STATE)
      version = saved.version
      const value = saved.value as Saved | undefined
      if (value?.schema_version === 1 && value.sid === live.sid) {
        if (!Array.isArray(value.rows) || value.rows.some(r => r.schema_version !== 1 || r.sid !== live.sid || !r.uuid || !Array.isArray(r.items) || r.items.some(i => r.text.slice(i.start, i.end) !== i.text))) throw new Error('invalid engine recovery state')
        rows = value.rows
        ledger = value.ledger
        retained = value.retained ?? ''
        projection = value.projection
        epoch = Math.max(epoch, value.epoch + 1)
        if (value.pending) { enabled = false; notice($, 'UNKNOWN interrupted audit at reload; no verdict restored; use on after old environment ends') }
      }
      id = live
      if (ledger === null && await $.fs.exists(`${rootOf(live)}/owner.asks.jsonl`)) {
        retained = ledger = await $.fs.read(`${rootOf(live)}/owner.asks.jsonl`)
        if (projection === null && await $.fs.exists(projectionOf(live))) projection = await $.fs.read(projectionOf(live))
        notice($, 'historical ledger retained; native recovery coverage UNKNOWN; disk grants no authority')
      }
      if (health === 'initializing') health = enabled ? 'ready' : 'off'
      await saveState($)
      await trace($, 'identity-ready')
    } catch (err) {
      enabled = false
      notice($, `identity/store recovery degraded; explicit on required: ${errorText(err)}`)
    }
  })().finally(() => { probe = null })
  return probe
}
const failed = ($: EngineInterface, event: string, error: unknown) => {
  notice($, `hook ${event} UNKNOWN: ${errorText(error)}`)
}

export const register: Register = on => {
  cancel()
  instance = crypto.randomUUID()
  seq = 0; epoch = 0; version = 0
  id = null; rows = []; ledger = null; retained = ''; projection = null
  enabled = true; health = 'initializing'; turn = null; probe = null
  writing = Promise.resolve(); diagnostics = Promise.resolve(); segment = null
  job = null; controller = null; timer = null
  warnings.clear()

  on('session.start', async ($, e, next) => {
    try { await cleanupEmptySid($) } catch (err) { notice($, `cleanup incomplete: ${errorText(err)}`) }
    await ready($)
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
          notice($, 'relay cache path invalid; ignored; original retained')
        } else {
          s.file = fileFor(s, path)
          s.count = countOf(await $.fs.read(path))
        }
      }
      await $.command.register({ name: 'heads-up', description: `Agent should know v${MOD_VERSION}: show or hide the card band` })
    }
    await trace($, 'session.start', { cwdEqual: id?.cwd === e.cwd })
    return next(e)
  }).catch(($, e, next) => { failed($, 'session.start', next.error); return next(e) })

  on('session.attach', async ($, e, next) => { await ready($); await trace($, 'session.attach'); return next(e) })
    .catch(($, e, next) => { failed($, 'session.attach', next.error); return next(e) })

  on('session.end', ($, e, next) => {
    cancel()
    id = null; turn = null; rows = []; ledger = null; retained = ''; projection = null
    s.sid = ''; s.cwd = ''; s.home = ''; s.file = null
    s.pending = null; s.early = null; s.running = undefined; s.sent.clear()
    try { $.ui.log(JSON.stringify({ instance, event: 'session.end', sid: e.sessionId, reason: e.reason, epoch }), { to: 'debug' }) } catch { /* No model or repair at session end. */ }
    return next(e)
  }).catch(($, e, next) => { failed($, 'session.end', next.error); return next(e) })

  on('command.run', { command: 'asks' }, async ($, e) => {
    await ready($)
    if (e.origin?.kind !== 'composer' && e.origin?.kind !== 'bridge') return { text: 'asks: command origin is not owner authority' }
    const action = e.args.trim()
    if (action === 'off') {
      const interrupted = job !== null || timer !== null
      enabled = false; cancel(); health = 'off'
      if (interrupted) notice($, 'off; audit cancelled; previous verdict unavailable', false)
      if (!id) return { text: 'off in this instance; identity unready; not saved' }
      try { await $.store.set(`control:${id.sid}`, 'off'); await persist($) } catch (err) { notice($, `off in memory; not saved: ${errorText(err)}`) }
    } else if (action === 'on') {
      if (!id) return { text: 'identity unready; not enabled' }
      if (job) return { text: 'UNKNOWN previous request still settling; no new audit started' }
      const state = await $.state.get(STATE)
      version = state.version
      cancel(); enabled = true; health = 'ready'; warnings.clear()
      try { await $.store.set(`control:${id.sid}`, 'on'); await persist($) } catch (err) { notice($, `on not saved: ${errorText(err)}`) }
    } else if (action === 'migrate') {
      if (!id) return { text: 'migrate: identity unready; no files changed' }
      try { return { text: await migrate($, id) } } catch (err) { notice($, errorText(err)) }
    }
    await trace($, 'command', { action: ['on', 'off', 'migrate'].includes(action) ? action : 'status' })
    return { text: `agent-should-know v${MOD_VERSION}: ${enabled ? 'on' : 'off'}; ${health}\n${rows.flatMap(r => r.items.map(i => `${i.id} [${i.kind}${i.answer ? ', answered' : ', open'}] ${i.text}`)).join('\n')}\n${[...warnings].join('\n')}` }
  }).catch(($, _e, next) => { failed($, 'command.run', next.error); return { text: `asks UNKNOWN: ${errorText(next.error)}` } })

  on('prompt.submit', async ($, e, next) => {
    await ready($)
    if (e.origin?.kind === 'composer' || e.origin?.kind === 'bridge') {
      if (job || timer) notice($, 'audit UNKNOWN: interrupted by new owner message', false)
      cancel()
    }
    await trace($, 'prompt.submit', { origin: e.origin?.kind ?? 'unknown' })
    const o = e.origin
    if (o?.kind === 'plugin' && (o.name === NAME || o.name.startsWith(`${NAME}@`))) s.pending = { over: e.turnId ?? s.running, card: s.flagged }
    return next(e)
  }).catch(($, e, next) => { failed($, 'prompt.submit', next.error); return next(e) })

  on('session.append', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId !== undefined || 'deny' in result) return result
    await ready($)
    if (turn) {
      turn.messages.push({ uuid: result.uuid, origin: e.origin, message: result.message })
      for (const block of result.message.content) {
        if (!['text', 'thinking', 'tool_use', 'tool_result'].includes(block.type)) turn.coverage.add(`media or unknown body ${result.uuid}`)
        if (block.type === 'tool_use' && typeof block.id === 'string') turn.expected.add(block.id)
      }
    }
    if (enabled && id && ['prompt', 'delivery', 'command'].includes(e.door) && result.message.role !== 'assistant' && (e.origin.kind === 'composer' || e.origin.kind === 'bridge')) {
      if (!rows.some(r => r.uuid === result.uuid)) {
        cancel()
        const text = result.message.content.flatMap(b => b.type === 'text' ? [b.text] : []).join('\n')
        rows.push(ownerRow(id, result.uuid, e.origin.kind, text, epoch, instance, e.door === 'delivery'))
        await persist($)
      }
    }
    await trace($, 'session.append', { uuid: result.uuid, origin: e.origin.kind, agent: e.agentId ?? null })
    return result
  }).catch(($, e, next) => { failed($, 'session.append', next.error); return next(e) })

  on('turn.start', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)
    // Not on a save that works: the notice's own echo row traces, and a save in between would let
    // an intermittent failure show again on every echo (ASK032-03). The mod never starts a turn.
    warnings.delete(NOT_SAVED)
    await ready($)
    turn = { id: e.turnId, model: await $.session.model(), calls: [], expected: new Set(), messages: [], coverage: new Set() }
    s.running = e.turnId
    if (id) { s.sid = id.sid; s.home = id.home; s.cwd = id.cwd }
    await trace($, 'turn.start', { turn: e.turnId })
    return next(e)
  }).catch(($, e, next) => { failed($, 'turn.start', next.error); return next(e) })

  on('turn.step', async function* ($, e, next) {
    if (e.agentId === undefined && turn?.id === e.turnId) {
      turn.model = e.model
      if (e.messageCount >= 4096) turn.coverage.add('SDK message cap')
      await trace($, 'turn.step', { turn: e.turnId, step: e.index })
    }
    for await (const chunk of next(e)) {
      if (e.agentId === undefined && turn?.id === e.turnId && chunk.kind === 'tool') turn.expected.add(chunk.id)
      yield chunk
    }
  }).catch(async function* ($, e, next) { failed($, 'turn.step', next.error); yield* next(e) })

  on('tool.call', async ($, e, next) => {
    const result = await next(e)
    await ready($)
    await trace($, 'tool.call.enter', { tool: e.tool, call: e.tool_use_id, agent: e.agentId ?? null })
    if (e.agentId === undefined && next.origin.plugin === 'engine' && turn) turn.calls.push({ id: e.tool_use_id, tool: e.tool, input: e, result })
    await trace($, 'tool.call.exit', { tool: e.tool, call: e.tool_use_id, denied: 'deny' in result })
    if (s.early !== null && next.origin.plugin === 'engine' && e.agentId === undefined && !('deny' in result)) {
      const early = s.early
      s.early = null
      return { ...result, context: [...(result.context ?? []), early] }
    }
    return result
  }).catch(($, e, next) => { failed($, 'tool.call', next.error); return next(e) })

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
    await ready($)
    await trace($, 'turn.complete', { turn: e.turnId, reason: e.reason })
    if (!id || !enabled || !turn || turn.id !== e.turnId) return result
    if (job || timer) { notice($, 'UNKNOWN audit already active; no second request'); return result }
    const current = turn
    for (const call of current.expected) if (!current.calls.some(c => c.id === call)) current.coverage.add(`missing result ${call}`)
    if (!rows.length) current.coverage.add('no native owner provenance captured')
    for (const warning of warnings) current.coverage.add(warning)
    const context = id
    const at = epoch
    const bundle: Bundle = JSON.parse(JSON.stringify({ schema_version: 1, sid: context.sid, epoch: at, instance, turn: e.turnId, reply: result.text, owners: rows, calls: current.calls, messages: current.messages, coverage: [...current.coverage] }))
    const model = e.usage?.model ?? current.model
    controller = new AbortController()
    const signal = controller.signal
    notice($, 'audit UNKNOWN: pending; result follows independently', false)
    timer = $.clock.after(0, () => {
      timer = null
      if (at !== epoch || id !== context || !enabled) return
      job = Promise.resolve().then(async () => {
        await saveState($)
        const body = JSON.stringify(bundle)
        const hash = await digest(body)
        const path = `${rootOf(context)}/audit/${hash}`
        await atomic($, `${path}.evidence.json`, body, null)
        // maxTokens: the API default is 1024; high effort plus the items array overran it (empty-reply / cut JSON).
        const answer = await $.model.complete({ model, effort: 'high', maxTokens: 16000, timeoutMs: 180000, prompt: `${AUDIT_PROMPT}\n${body}` }, { signal })
        if (at !== epoch || id !== context || !enabled || signal.aborted) return
        const judged = answer.isAnswered ? judgeResult(answer.text, bundle) : { verdict: 'UNKNOWN' as const, reason: `model ${answer.reason}`, owners: rows }
        const detail = judged.verdict === 'UNKNOWN' ? { output_tokens: answer.usage.output_tokens, excerpt: answer.isAnswered ? answer.text.slice(0, 500) : '' } : {}
        await atomic($, `${path}.json`, JSON.stringify({ schema_version: 1, sid: context.sid, epoch: at, instance, digest: hash, verdict: judged.verdict, reason: judged.reason, ...detail }), null)
        if (at !== epoch || id !== context || !enabled) return
        if (judged.verdict === 'PASS') { rows = judged.owners; await persist($) }
        // Audit reports must not become warnings in the next audit's coverage.
        const reason = judged.reason.startsWith('coverage: ') ? 'coverage' : judged.reason.replace(/\s+/g, ' ').slice(0, 120)
        notice($, `audit ${judged.verdict}: ${reason}; ${path}.json`, false)
      }).catch(err => notice($, `audit UNKNOWN; not saved: ${errorText(err)}`)).finally(() => {
        job = null
        controller = null
        if (id === context) void saveState($).catch(err => notice($, `audit state not saved: ${errorText(err)}`))
      })
    })
    return result
  }).catch(($, e, next) => { failed($, 'turn.complete', next.error); return next(e) })
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
    if (s.hidden && warnings.size === 0) return below
    const budget = e.props.maxRows - rowsOf(below)
    if (budget < 1) return below

    const { Box, Text, Button } = $.ui.resolve(e)
    const width = e.props.bodyColumns
    const title = `▌agent should know v${MOD_VERSION}`
    const status = (s.count.flagged ? ` · ${s.count.flagged} heads-up · ${s.count.handled} handled ` : ' · no heads-up yet ') + (health === 'ready' ? '' : `· ${health} `)
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
