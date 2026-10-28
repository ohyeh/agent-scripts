import type { EngineInterface, ModelUsage, Register, SessionMessage } from 'claude-code'

import { type Form, classified, classifierPrompt, formFound, formText, meets, parseSubstance, readOnly, retroBlock, stateWrite, substancePrompt } from './lib/align.ts'
import { type Finding, evidence, failReason, judgePrompt, parseVerdict, relays, reportReason, sha16, superseded, toolIds, verify } from './lib/audit.ts'
import { cells, fit, rowsOf } from './lib/band.ts'
import { type Duty, type Episode, type Row, attachmentNames, deliveries, kindOf, ledgerText, openText, owns, parseRows, quotedSpans, transcriptRows, userIndexes } from './lib/ledger.ts'

const MOD_VERSION = '0.2.0'
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
/** The owner ledger's durable path; engine state owns the live rows. */
const asksKey = (sid: string) => `asks:${sid}`
const dutiesKey = (sid: string) => `duties:${sid}`
/** Kept in the store so a hot reload or a relayed turn does not reset an episode's counts. */
const episodeKey = (sid: string) => `episode:${sid}`
const offKey = (sid: string) => `off:${sid}`
/** G3: rows not yet in the ledger file, queued in the engine's state until the file write lands. */
const REPLAY = { plugin: 'agent-should-know', key: 'replay' } as const
const GUARD = { plugin: 'agent-should-know', key: 'guard' } as const
const FAIL_BLOCKS = 2
/** N9: judge calls per stable input; a new owner row resets the count. */
const JUDGE_CALLS = 3
const JUDGE_MS = 60_000
/** N9: substance checks per correction; past them only the owner's `/asks release U<n>` lets the act run. */
const RETRO_TRIES = 3
// N1 (#q7): the classifier and the Retro check run on haiku xhigh; measured output 891–1293 and 1775–3011 tokens.
const CLASSIFY = { model: 'haiku', effort: 'xhigh', maxTokens: 4000, timeoutMs: 60_000 } as const
const RETRO_CHECK = { ...CLASSIFY, maxTokens: 8000 } as const
// The runtime reports no stop reason here: an unparsable answer that used every token was cut off.
const badAnswer = (usage: ModelUsage, max: number) => (usage.output_tokens >= max ? 'truncated' : 'protocol')

const episodeAfter = (k: number, u: number): Episode => ({ k, from: u + 1, fails: 0, calls: 0, findings: [], unchecked: null })
type Verdict = 'PASS' | 'FAIL' | 'UNKNOWN' | 'REPORTED' | 'UNAUDITED'
const KIND_WORD = { retro: '糾正', align: '指令', none: '一般' } as const

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
  count: Count
  // The owner ledger: every row, in memory and in its file; `written` is the last row the file holds.
  rows: Row[]
  u: number
  written: number
  asksPath: string | null
  ledger: { path: string; text: string; rows: Row[]; written: number } | null
  // N2: store writes that failed in a row, and the last one's error class.
  storeFails: number
  storeErr: string | null
  writing: Promise<void>
  // The gate's generation: bumped at turn.start and on every ledger change.
  gen: number
  projection: Record<string, string>
  dirty: boolean
  duties: Duty[]
  classifying: Map<number, Promise<Form | null>>
  kinds: Map<number, string>
  ep: Episode
  // G3: rows may be missing (lost) or were read back from the transcript (derived) until `/asks confirm`.
  lost: boolean
  derived: boolean
  off: boolean
  auditing: boolean
  held: string | null
  auditHeld: boolean
  // The turn whose audit set the hold; null for REPORTED, which only the owner releases.
  heldTurn: string | null
  activeErr: string | null
  last: string
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

type Count = ReturnType<typeof countOf>

// Counted back from the log, so a reload shows what the session did. tok sums every judge call's usage.
function countOf(text: string) {
  const rows = text.split('\n')
  const has = (re: RegExp) => rows.filter(r => re.test(r)).length
  const audits = rows.filter(r => / · audit-(?:pass|fail|unknown|reported|unaudited) · /.test(r))
  const judged = rows.filter(r => / · judge · /.test(r))
  return {
    flagged: rows.filter(r => r.includes(' · flagged · ')).length,
    handled: has(/ · handled \d/),
    audits: audits.length,
    pass: has(/ · audit-pass · /),
    fail: has(/ · audit-fail · /),
    resolved: has(/ · audit-resolved /),
    tok: judged.reduce((n, r) => n + Number(/ · tok (\d+)$/.exec(r)?.[1] ?? 0), 0),
  }
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

const auditPart = (c: Count) => (c.audits ? `audits ${c.pass}/${c.audits} · ${c.fail} fail→${c.resolved} · ${c.tok} tok` : '')
// The open asks, the last verdict, coverage, and the kind of each row the classifier saw (N1).
const statusPart = (s: State) => {
  const kinds = [...s.kinds].slice(-3).map(([u, k]) => `U${u} ${k}`)
  return [`${openRows(s).length} asks open`, `audit ${s.last || '—'}`, `coverage ${coverageLabel(s)}`, ...kinds].join(' · ')
}
const alarmPart = (s: State) =>
  [
    s.off ? 'off' : '',
    s.held !== null ? `held: ${s.held}` : '',
    s.storeFails >= 2 ? `store-error:${s.storeErr}` : '',
    ...s.duties.filter(d => d.tries >= RETRO_TRIES).map(d => `U${d.u} Retro stuck: /asks release U${d.u}`),
    s.activeErr !== null ? `gate marker not written (${s.activeErr})` : '',
  ]
    .filter(Boolean)
    .join(' · ')

function summary(s: State) {
  const where = s.file?.path ?? `${folderOf(s)}/ (no file yet)`
  const audits = [statusPart(s), auditPart(s.count), alarmPart(s)].filter(Boolean).join(' · ')
  return `${s.count.flagged} heads-up · ${s.count.handled} handled this session${audits ? ` · ${audits}` : ''} · log: ${where}`
}

// --- The gate's files: ~/.local/state/agent-hooks/<sid>/ (read by .agents/hooks/claim-evidence-gate.sh) ---

const gateDir = (s: State) => `${s.home}/.local/state/agent-hooks/${s.sid}`
const auditDir = (s: State) => `${gateDir(s)}/audit`
const pendingPath = (asks: string) => asks.replace(/\.asks\.jsonl$/, '.pending')
const errClass = (err: unknown) => (err instanceof Error ? err.name : typeof err)
const openRows = (s: State) => s.rows.filter(r => owns(r) && !r.closed)
const coverageLabel = (s: State) => (s.lost || s.dirty || s.written < s.u ? 'unknown' : s.derived ? 'unconfirmed' : 'known')

const saveGuard = ($: EngineInterface, s: State) => $.state.set(GUARD, { sid: s.sid, generation: s.gen, files: s.projection, held: s.held, auditHeld: s.auditHeld, heldTurn: s.heldTurn, ledger: s.ledger, duties: s.duties, episode: s.ep, dirty: s.dirty })

async function coverageNow($: EngineInterface, s: State) {
  try {
    const queued = (await $.state.get(REPLAY)).value ?? []
    const pending = s.asksPath === null ? 0 : Number(await $.fs.read(pendingPath(s.asksPath)))
    return queued.length || !Number.isFinite(pending) || pending !== 0 ? 'unknown' : coverageLabel(s)
  } catch (err) {
    await logLine($, s, iso(), 'coverage-error', errClass(err))
    return 'unknown'
  }
}

async function projectFile($: EngineInterface, s: State, name: string, text: string) {
  s.projection[name] = text
  await saveGuard($, s)
  await $.fs.write(`${auditDir(s)}/${name}`, text)
}

// F1: disk is a projection, never authority to remove a hold or introduce a verdict.
async function checkProjection($: EngineInterface, s: State, rewrite = false) {
  await s.writing
  const bad: string[] = []
  if (s.ledger !== null && await $.fs.read(s.ledger.path).catch(() => null) !== s.ledger.text) {
    bad.push('ledger')
  }
  try {
    for (const f of await $.fs.list(auditDir(s))) {
      if (/\.json$/.test(f.name) && !Object.hasOwn(s.projection, f.name)) {
        bad.push(f.name)
        await run($, ['rm', '-f', `${auditDir(s)}/${f.name}`])
      }
      if (f.name === 'held' && s.projection.held === undefined) {
        // The gate can add a restriction; only the owner can remove it.
        s.held = await readHeld($, s) ?? 'tamper:held'
        s.projection.held = JSON.stringify({ reason: s.held })
        bad.push('held')
      }
    }
    for (const [name, text] of Object.entries(s.projection)) {
      if (await $.fs.read(`${auditDir(s)}/${name}`).catch(() => null) !== text) bad.push(name)
    }
  } catch (err) {
    bad.push(`audit:${errClass(err)}`)
  }
  if (bad.length) {
    const reason = `tamper:${[...new Set(bad)].join(',')}`
    s.held ??= reason
    if (bad.some(name => name !== 'held')) s.auditHeld = false
    s.projection.held = JSON.stringify({ reason: s.held })
    await saveGuard($, s)
    $.ui.toast(`${NAME}: ${reason}; the hold stays`)
    await logLine($, s, iso(), 'tamper', reason)
  }
  if (bad.includes('ledger') && s.ledger !== null) {
    try {
      await $.fs.write(s.ledger.path, s.ledger.text)
    } catch (err) {
      $.ui.toast(`${NAME}: ledger not restored (${errClass(err)}); held`)
      await logLine($, s, iso(), 'projection-error', `ledger:${errClass(err)}`)
    }
  }
  if (bad.length || rewrite) {
    for (const [name, text] of Object.entries(s.projection)) {
      try {
        await $.fs.write(`${auditDir(s)}/${name}`, text)
      } catch (err) {
        $.ui.toast(`${NAME}: projection ${name} not written (${errClass(err)}); held`)
        await logLine($, s, iso(), 'projection-error', `${name}:${errClass(err)}`)
      }
    }
  }
}

async function run($: EngineInterface, argv: string[]) {
  const r = await $.process.run(argv, { timeoutMs: 5000 })
  if (r.exitCode !== 0) throw new Error(`${argv[0]} exit ${r.exitCode}`)
}

// The whole ledger is written each time ($.fs has no append). G3: the new rows wait in the state queue and the
// pending count says how many, so a crash before the ledger write shows at resume. Then the generation and
// asks-open.md (temp file + rename). Writes queue, so two rows never race.
function persist($: EngineInterface, s: State, opts: { rows: boolean; bump: boolean }): Promise<void> {
  if (opts.rows) s.dirty = true
  s.writing = s.writing.then(async () => {
    try {
      s.asksPath ??= `${folderOf(s)}/${iso().slice(0, 10)}-${s.sid.slice(0, 8)}.asks.jsonl`
      // A row still unwritten is retried by any later write, so failures count in a row (N2).
      if (opts.rows || s.written < s.u) {
        for (const r of s.rows) {
          r.duty = s.duties.find(d => d.u === r.u) ?? null
          r.episode = s.ep
        }
        const fresh = s.rows.filter(r => r.u > s.written)
        s.ledger = { path: s.asksPath, text: `${s.rows.map(r => JSON.stringify(r)).join('\n')}\n`, rows: s.rows, written: s.written }
        await saveGuard($, s)
        await $.state.set(REPLAY, fresh)
        await $.fs.write(pendingPath(s.asksPath), String(fresh.length))
        await $.fs.write(s.asksPath, s.ledger.text)
        await $.store.set(asksKey(s.sid), s.asksPath)
        await $.fs.write(pendingPath(s.asksPath), '0')
        await $.state.set(REPLAY, [])
        s.written = s.rows.at(-1)?.u ?? 0
        s.ledger.written = s.written
      }
      if (opts.bump) s.gen += 1
      await projectFile($, s, 'current', JSON.stringify({ generation: String(s.gen) }))
      const dst = `${gateDir(s)}/asks-open.md`
      const text = openText(openRows(s), s.asksPath, s.gen)
      await $.fs.write(`${dst}.tmp`, text)
      await run($, ['mv', `${dst}.tmp`, dst])
      s.storeFails = 0
      s.storeErr = null
      s.dirty = false
      await saveGuard($, s)
      if (opts.rows) await logLine($, s, iso(), 'asks-open', `gen ${s.gen} · ${openRows(s).length} open · ${text.length} chars`)
    } catch (err) {
      s.storeFails += 1
      s.storeErr = errClass(err)
      s.dirty = true
      $.ui.toast(`${NAME} v${MOD_VERSION}: owner ledger not written (${errText(err)}); coverage unknown, retried at the next change`)
      await logLine($, s, iso(), 'store-error', `${s.storeErr} · ${s.storeFails} in a row`)
    }
    $.ui.invalidate('ui.render')
  })
  return s.writing
}

const saveDuties = async ($: EngineInterface, s: State) => {
  await saveGuard($, s)
  await persist($, s, { rows: true, bump: false })
  await $.store.set(dutiesKey(s.sid), s.duties).catch(err => $.ui.toast(`${NAME}: alignment duties store not saved (${errText(err)}); ledger retains duties`))
}
const saveEpisode = async ($: EngineInterface, s: State) => {
  await saveGuard($, s)
  await persist($, s, { rows: true, bump: false })
  await $.store.set(episodeKey(s.sid), s.ep).catch(err => $.ui.toast(`${NAME}: audit episode store not saved (${errText(err)}); ledger retains guards`))
}

async function writeActive($: EngineInterface, s: State) {
  try {
    await projectFile($, s, 'active', `${NAME} ${MOD_VERSION}\n`)
    s.activeErr = null
  } catch (err) {
    s.activeErr = errClass(err)
    $.ui.toast(`${NAME} v${MOD_VERSION}: gate marker not written (${errText(err)}); the Stop gate does not see this mod`)
  }
  $.ui.invalidate('ui.render')
}

/** The held file's reason (the gate writes JSON {at, sha, reason}; so does the mod), or null when not held. */
async function readHeld($: EngineInterface, s: State): Promise<string | null> {
  const path = `${auditDir(s)}/held`
  if (!(await $.fs.exists(path))) return null
  const text = await $.fs.read(path)
  try {
    const reason = (JSON.parse(text) as { reason?: unknown }).reason
    return typeof reason === 'string' && reason !== '' ? reason : 'held'
  } catch {
    return text.trim() || 'held'
  }
}

async function writeHeld($: EngineInterface, s: State, sha: string, reason: string) {
  s.held = reason
  await projectFile($, s, 'held', JSON.stringify({ at: iso(), sha, reason }))
  await logLine($, s, iso(), 'held', reason)
}

// G1: the owner's own message ends the hold; its findings stay open.
async function release($: EngineInterface, s: State) {
  const d = auditDir(s)
  try {
    await run($, ['rm', '-f', `${d}/held`, `${d}/chain`, `${d}/missing-chain`])
    if (s.held !== null) await logLine($, s, iso(), 'released', s.held)
    s.held = null
    s.auditHeld = false
    s.heldTurn = null
    delete s.projection.held
    await saveGuard($, s)
  } catch (err) {
    $.ui.toast(`${NAME}: hold not cleared (${errText(err)})`)
  }
  $.ui.invalidate('ui.render')
}

// --- A: the owner ledger ---

async function seenNow($: EngineInterface): Promise<number> {
  try {
    return userIndexes(await $.session.messages()).length
  } catch {
    // 0 only widens where the row's delivery is looked for.
    return 0
  }
}

async function record($: EngineInterface, s: State, origin: Row['origin'], text: string, attachments: string[], seen: number, duty: boolean, turnId?: string) {
  const row: Row = { u: ++s.u, at: iso(), origin, text, attachments, seen, ...(turnId === undefined ? {} : { turnId }) }
  const quoted = quotedSpans(text)
  if (quoted.length) row.quoted = quoted
  s.rows.push(row)
  if (origin === 'owner' || origin === 'owner-command') {
    if (duty) s.duties.push({ u: row.u, tries: 0 })
    s.ep.calls = 0
    s.ep.fails = 0
    if (origin === 'owner') s.ep.unchecked = null
    await saveGuard($, s)
  }
  await persist($, s, { rows: true, bump: true })
  await logLine($, s, row.at, 'ask', `U${row.u} ${origin} · ${text.length} chars${attachments.length ? ` · ${attachments.join(', ')}` : ''}`)
}

// G3 resume: the ledger file, plus rows the state queue kept that the file missed. Coverage is unknown when the
// pending count names more rows than the queue holds, or the transcript holds more owner texts after the last
// delivered row than rows still undelivered.
async function resume($: EngineInterface, s: State, asks: string) {
  s.asksPath = asks
  try {
    s.rows = s.ledger?.rows ?? parseRows(await $.fs.read(asks))
    s.ledger ??= { path: asks, rows: s.rows, text: `${s.rows.map(r => JSON.stringify(r)).join('\n')}\n`, written: s.rows.at(-1)?.u ?? 0 }
  } catch (err) {
    s.storeFails += 1
    s.storeErr = errClass(err)
    s.lost = true
    $.ui.toast(`${NAME} v${MOD_VERSION}: owner ledger not read (${errText(err)}); coverage unknown`)
  }
  s.written = s.ledger?.written ?? 0
  try {
    const queued = ((await $.state.get(REPLAY)).value ?? []).filter(r => r.u > s.written)
    s.rows.push(...queued.filter(r => !s.rows.some(row => row.u === r.u)))
    const pending = Number((await $.fs.read(pendingPath(asks)).catch(() => '0')).trim() || 0)
    if (pending > queued.length) s.lost = true
    const messages = await $.session.messages()
    const at = deliveries(messages, s.rows)
    const users = userIndexes(messages)
    const last = Math.max(-1, ...at.values())
    const after = transcriptRows(messages).filter(t => (users[t.seen] ?? -1) > last).length
    if (after > s.rows.filter(r => owns(r) && !at.has(r.u)).length) s.lost = true
  } catch (err) {
    s.lost = true
    await logLine($, s, iso(), 'resume-error', errClass(err))
  }
  s.u = s.rows.at(-1)?.u ?? 0
  s.derived = s.rows.some(r => r.origin === 'transcript' && !r.confirmed)
  s.duties = s.rows.filter(r => owns(r) && r.duty !== null).map(r => r.duty ?? { u: r.u, tries: 0 })
  s.ep = s.rows.findLast(r => r.episode !== undefined)?.episode ?? s.ep
  if (s.lost) await logLine($, s, iso(), 'coverage', 'unknown: rows may be missing; /asks confirm after checking the ledger')
  if (s.written < s.u) await persist($, s, { rows: true, bump: true })
}

// No ledger yet, but owner text already in the transcript (a continued session): its rows are read back, unconfirmed.
async function derive($: EngineInterface, s: State) {
  let rows: { text: string; seen: number }[] = []
  try {
    rows = transcriptRows(await $.session.messages())
  } catch (err) {
    s.lost = true
    await logLine($, s, iso(), 'derive-error', errClass(err))
    return
  }
  if (rows.length === 0) return
  for (const t of rows) {
    s.rows.push({ u: ++s.u, at: iso(), origin: 'transcript', text: t.text, attachments: [], seen: t.seen })
    s.duties.push({ u: s.u, tries: 0 })
  }
  s.derived = true
  await persist($, s, { rows: true, bump: true })
}

// --- B: the alignment hold ---

const assistantText = (messages: readonly SessionMessage[], from: number, to = messages.length) =>
  messages
    .slice(from + 1, to)
    .filter(m => m.role === 'assistant' && m.text.trim() !== '')
    .map(m => m.text)
    .join('\n\n')

// Once per row; any failure reads as a correction (N1), with a toast naming the row and the error.
function classify($: EngineInterface, s: State, d: Duty, claims: string, row: Row): Promise<Form | null> {
  let p = s.classifying.get(d.u)
  if (p === undefined) {
    const t0 = Date.now()
    p = $.model
      .complete({ ...CLASSIFY, prompt: classifierPrompt(claims, row.text) })
      .then(
        r => {
          if (!r.isAnswered) return { need: 'retro' as const, constraint: true, why: `classifier ${r.reason}`, usage: r.usage }
          const kind = r.usage.output_tokens >= CLASSIFY.maxTokens ? undefined : classified(r.text)
          return kind === undefined ? { need: 'retro' as const, constraint: true, why: `classifier ${badAnswer(r.usage, CLASSIFY.maxTokens)}`, usage: r.usage } : { ...kind, why: undefined, usage: r.usage }
        },
        (err: unknown) => ({ need: 'retro' as const, constraint: true, why: `classifier ${errClass(err)}`, usage: undefined }),
      )
      .then(async ({ need, constraint, why, usage }) => {
        d.need = need
        row.constraint = constraint
        if (why !== undefined) {
          d.why = why
          $.ui.toast(`${NAME}: U${d.u} not classified (${why}); held as a correction`)
        }
        s.kinds.set(d.u, KIND_WORD[need ?? 'none'])
        await saveDuties($, s)
        await logLine($, s, iso(), 'classify', `U${d.u} ${KIND_WORD[need ?? 'none']}${why ? ` · ${why}` : ''} · ${Date.now() - t0}ms${usage ? ` · ${usageText(usage)}` : ''}`)
        return need
      })
    s.classifying.set(d.u, p)
  }
  return p
}

const stuckText = (tool: string, u: number) =>
  `${NAME} held ${tool}: the Retro for U${u} failed its substance check ${RETRO_TRIES} times. Only the owner can release it, with /asks release U${u}; the episode then cannot PASS. Tools that only read still run.`

// N1: a correction's Retro is checked before its first act; no answer, a bad answer or an error keeps the hold.
async function substance($: EngineInterface, s: State, d: Duty, tool: string, row: Row, claims: string, retro: string): Promise<string | null> {
  if (d.tries >= RETRO_TRIES) return stuckText(tool, d.u)
  const redo = `Fix the Retro block for U${d.u} in your reply text, then call the tool again. Tools that only read still run.`
  if (d.retro === retro && d.missing !== undefined) return `${NAME} held ${tool}: the Retro for U${d.u} does not answer the correction yet: ${d.missing.join('; ')}. ${redo}`
  d.tries += 1
  await saveDuties($, s)
  const t0 = Date.now()
  let why: string
  try {
    const r = await $.model.complete({ ...RETRO_CHECK, prompt: substancePrompt(row.text, claims, retro) })
    await logLine($, s, iso(), 'retro-check', `U${d.u} try ${d.tries} · ${Date.now() - t0}ms · ${usageText(r.usage)}`)
    const v = r.isAnswered && r.usage.output_tokens < RETRO_CHECK.maxTokens ? parseSubstance(r.text) : null
    if (v?.aligned === true) return null
    if (v !== null) {
      d.retro = retro
      d.missing = v.missing
      await saveDuties($, s)
      return `${NAME} held ${tool}: the Retro for U${d.u} does not answer the correction yet: ${v.missing.join('; ')}. ${redo}`
    }
    why = r.isAnswered ? badAnswer(r.usage, RETRO_CHECK.maxTokens) : r.reason
  } catch (err) {
    why = errClass(err)
  }
  $.ui.toast(`${NAME}: U${d.u} Retro check failed (${why}); the hold stays`)
  await logLine($, s, iso(), 'retro-check', `U${d.u} try ${d.tries} · failed ${why}`)
  return d.tries >= RETRO_TRIES ? stuckText(tool, d.u) : `${NAME} held ${tool}: the Retro check for U${d.u} is unavailable (${why}); the hold stays. Call the tool again to retry.`
}

async function hold($: EngineInterface, s: State, tool: string): Promise<string | null> {
  if (s.duties.length === 0) return null
  let messages: readonly SessionMessage[]
  try {
    messages = await $.session.messages()
  } catch (err) {
    return `${NAME} held ${tool}: the transcript could not be read to check alignment (${errClass(err)}). Tools that only read still run.`
  }
  const at = deliveries(messages, s.rows)
  const first = s.rows.find(r => r.u >= s.ep.from && owns(r))
  const start = first === undefined ? -1 : (at.get(first.u) ?? -1)
  for (const d of [...s.duties]) {
    const row = s.rows.find(r => r.u === d.u)
    const i = at.get(d.u)
    if (row === undefined || i === undefined) continue
    const claims = assistantText(messages, Math.min(start, i), i)
    const need = d.need !== undefined ? d.need : await classify($, s, d, claims, row)
    const text = assistantText(messages, i)
    const found = need === null ? null : formFound(text, d.u, row.text)
    if (need !== null && !meets(found, need)) {
      await logLine($, s, iso(), `held ${tool} U${d.u}`, found === 'align' ? 'align line, Retro needed' : 'no block')
      const why = need === 'retro' ? (d.why ? ` (Retro needed: ${d.why})` : ' (the message corrects earlier work: Retro needed)') : ''
      return `${NAME} held ${tool}: the owner's message U${d.u} has no alignment block in your text yet${why}. U${d.u} (verbatim): 「${row.text}」 Write ${formText(d.u, need)} in your reply text, then call the tool again. Tools that only read still run.`
    }
    if (need === 'retro') {
      const block = await substance($, s, d, tool, row, claims, retroBlock(text, d.u) ?? '')
      if (block !== null) return block
    }
    s.duties = s.duties.filter(x => x !== d)
    await saveDuties($, s)
    await logLine($, s, iso(), need === null ? 'passive' : found === 'retro' ? 'retro' : 'align', `U${d.u}`)
  }
  return null
}

// --- C: the self-audit at the main loop's final step ---

const usageText = (u: ModelUsage) =>
  `in ${u.input_tokens} cr ${u.cache_read_input_tokens ?? 0} cw ${u.cache_creation_input_tokens ?? 0} out ${u.output_tokens}`
const tokOf = (u: ModelUsage) => u.input_tokens + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + u.output_tokens

// Resolve symlinks before `..`, as the OS does, including a new file's existing parent.
async function resolvePath($: EngineInterface, s: State, given: string): Promise<string> {
  const expanded = given.replace(/^~(?=\/|$)/, s.home)
  let probe = expanded.startsWith('/') ? expanded : `${s.cwd}/${expanded}`
  let suffix = ''
  while (!(await $.fs.exists(probe))) {
    if (probe === '/') throw new Error('root not readable')
    const i = probe.lastIndexOf('/')
    suffix = `/${probe.slice(i + 1)}${suffix}`
    probe = probe.slice(0, i) || '/'
  }
  const real = (await $.fs.stat(probe, { resolve: true })).realPath
  if (real === undefined) throw new Error('unresolved path')
  return `${real}${suffix}`
}

async function resolveArguments($: EngineInterface, s: State, value: unknown): Promise<unknown> {
  if (typeof value === 'string') {
    return value.includes('/') || /^(?:\.{1,2}|~)$/.test(value) || await $.fs.exists(`${s.cwd}/${value}`)
      ? resolvePath($, s, value) : value
  }
  if (Array.isArray(value)) return Promise.all(value.map(v => resolveArguments($, s, v)))
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(await Promise.all(Object.entries(value).map(async ([key, v]) => [key, await resolveArguments($, s, v)])))
  }
  return value
}

async function nextEpisode($: EngineInterface, s: State) {
  s.ep = episodeAfter(s.ep.k + 1, s.u)
  await saveEpisode($, s)
}

type Answer = { text: string; path: 'fork' | 'complete'; usage: ModelUsage }

// Fork first (it shares the conversation, so the evidence is the conversation itself); else the session's model
// with the episode's evidence whole. Both race one 60 s clock.
async function judge($: EngineInterface, p: Omit<Parameters<typeof judgePrompt>[0], 'evidence'>, episode: readonly SessionMessage[]): Promise<Answer | { reason: string }> {
  let timer: { cancel: () => void } | undefined
  const late = new Promise<{ reason: string }>(res => {
    timer = $.clock.after(JUDGE_MS, () => res({ reason: 'timeout' }))
  })
  const ask = async (): Promise<Answer | { reason: string }> => {
    const why: string[] = []
    try {
      const r = await $.model.fork({ prompt: judgePrompt({ ...p, evidence: 'The conversation above is the evidence: its tool calls, their ids and their results.' }) })
      if (r.isAnswered) return { text: r.text, path: 'fork', usage: r.usage }
      why.push(`fork ${r.reason}`)
    } catch (err) {
      why.push(`fork ${errClass(err)}`)
    }
    try {
      const model = await $.session.model()
      const r = await $.model.complete({ model, prompt: judgePrompt({ ...p, evidence: evidence(episode) }), effort: 'high', maxTokens: 4000, timeoutMs: JUDGE_MS })
      if (r.isAnswered) return { text: r.text, path: 'complete', usage: r.usage }
      why.push(`complete ${r.reason}`)
    } catch (err) {
      why.push(`complete ${errClass(err)}`)
    }
    return { reason: `judge:${why.join(';')}` }
  }
  try {
    return await Promise.race([ask(), late])
  } finally {
    timer?.cancel()
  }
}

type VerdictFile = { verdict: Verdict; reason: string; turnId: string; episode: string; covered: string[]; tools: string[]; findings?: { id: string; problem: string }[] }

// G4: a result whose generation moved while the judge ran belongs to an older reply: dropped.
async function writeVerdict($: EngineInterface, s: State, sha: string, gen: number, v: VerdictFile) {
  await s.writing
  if (gen !== s.gen) {
    await logLine($, s, iso(), 'audit-stale', `${v.episode} · ${v.verdict} dropped · gen ${gen}→${s.gen}`)
    return false
  }
  await checkProjection($, s, true)
  if (v.verdict === 'PASS' && s.held !== null && !s.auditHeld) v = { ...v, verdict: 'UNKNOWN', reason: s.held }
  if (v.verdict === 'PASS') {
    // A PASS clears only a hold its own turn's audit set; REPORTED and earlier turns wait for the owner.
    if (s.held === null || (s.auditHeld && s.heldTurn === v.turnId)) await release($, s)
  } else {
    // Re-set only a free hold or one this turn's audit owns: a REPORTED or earlier-turn hold is never handed over.
    if (s.held === null || (s.auditHeld && s.heldTurn === v.turnId)) {
      s.held = `${v.verdict}: ${v.reason}`
      s.auditHeld = true
      s.heldTurn = v.verdict === 'REPORTED' ? null : v.turnId
    }
    // Save the hold before its disk mirror: I/O failure cannot release tools.
    await saveGuard($, s)
  }
  await projectFile($, s, `${sha}.json`, JSON.stringify({ ...v, generation: String(gen) }))
  if (s.held !== null) {
    try {
      await writeHeld($, s, sha, s.held)
    } catch (err) {
      $.ui.toast(`${NAME}: held mirror not written (${errClass(err)}); the mod holds`)
    }
  }
  s.last = `${v.verdict} ${v.episode}`
  await logLine($, s, iso(), `audit-${v.verdict.toLowerCase()}`, `${v.episode} · ${v.reason.split('\n')[0]}`)
  $.ui.invalidate('ui.render')
  return true
}

async function audit($: EngineInterface, s: State, turnId: string, reply: string, sha: string, gen: number) {
  const ep = s.ep
  const coverage: string[] = []
  let messages: readonly SessionMessage[] = []
  try {
    messages = await $.session.messages()
  } catch (err) {
    coverage.push(`the transcript (${errClass(err)})`)
  }
  const at = deliveries(messages, s.rows)
  const first = s.rows.find(r => r.u >= ep.from && owns(r))
  const from = first === undefined ? undefined : at.get(first.u)
  if (from === undefined && first !== undefined) coverage.push('where this episode starts (the whole transcript is sent)')
  const episode = messages.slice(from ?? 0)
  const covered = openRows(s).filter(r => at.has(r.u))
  const base = { turnId, episode: `E${ep.k}`, covered: covered.map(r => `U${r.u}`), tools: toolIds(episode) }
  const write = (verdict: Verdict, reason: string, findings?: Finding[]) =>
    writeVerdict($, s, sha, gen, { verdict, reason, ...base, ...(findings ? { findings: findings.map(f => ({ id: f.id, problem: f.problem })) } : {}) })
  if (s.storeFails >= 2) return write('UNKNOWN', `store-error:${s.storeErr}`)
  if (s.held !== null && !s.auditHeld) return write('UNKNOWN', s.held)

  // Past the FAIL cap the judge is not asked again: the reply either relays each finding as its line or fails.
  const mechanical = async () => {
    if (!relays(reply, ep.findings)) return write('FAIL', reportReason(ep.k, ep.findings), ep.findings)
    if (!(await write('REPORTED', `E${ep.k}: ${ep.findings.map(f => f.id).join(',')} relayed, open`, ep.findings))) return
    await writeHeld($, s, sha, `REPORTED E${ep.k}: ${ep.findings.map(f => f.id).join(', ')} still open; the owner decides`)
    await nextEpisode($, s)
  }
  if (coverage.length || await coverageNow($, s) === 'unknown') return write('UNKNOWN', 'coverage:unknown')
  if (ep.fails > FAIL_BLOCKS) return mechanical()
  if (ep.calls >= JUDGE_CALLS) return ep.findings.length ? mechanical() : write('UNAUDITED', 'judge-cap')
  ep.calls += 1
  await saveEpisode($, s)

  const label = coverageLabel(s)
  if (label !== 'known') coverage.push(label === 'unknown' ? 'owner rows that may be missing from the ledger' : 'owner rows read back from the transcript, not confirmed')
  const open = new Set(openRows(s).map(r => r.u))
  for (const row of covered) {
    if (row.constraint !== undefined) continue
    const d = s.duties.find(d => d.u === row.u) ?? { u: row.u, tries: 0 }
    await classify($, s, d, assistantText(messages, from ?? -1, at.get(row.u)), row)
  }
  const t0 = Date.now()
  const res = await judge($, { asks: ledgerText(s.rows, open, s.asksPath ?? '(not written)'), episodeFrom: ep.from, reply, coverage }, episode)
  if ('reason' in res) return write('UNKNOWN', res.reason)
  await logLine($, s, iso(), 'judge', `E${ep.k} · ${res.path} · ${Date.now() - t0}ms · ${usageText(res.usage)} · tok ${tokOf(res.usage)}`)
  const v = parseVerdict(res.text)
  if (v === null) return write('UNKNOWN', 'protocol')
  const { valid, dropped } = verify(v.findings, { reply, rows: s.rows, open, episode })
  const supers = superseded(v.supersedes, s.rows, at)
  dropped.push(...supers.dropped)
  for (const bad of dropped) await logLine($, s, iso(), 'finding-dropped', `E${ep.k} · ${bad}`)
  // A stale judge cannot change the ledger, just as it cannot write a verdict (G4).
  if (gen === s.gen) {
    for (const r of s.rows) if (supers.valid.includes(r.u)) r.closed = true
    if (supers.valid.length) await persist($, s, { rows: true, bump: false })
  }
  if (v.verdict === 'FAIL') {
    if (valid.length === 0) return write('UNKNOWN', 'protocol:fail-without-valid-finding')
    ep.fails += 1
    ep.findings = valid
    await saveEpisode($, s)
    return ep.fails <= FAIL_BLOCKS && ep.calls < JUDGE_CALLS ? write('FAIL', failReason(ep.k, valid, v.complete), valid) : mechanical()
  }
  if (valid.length) return write('UNKNOWN', 'protocol:pass-with-findings')
  if (dropped.length) return write('UNKNOWN', 'protocol:pass-with-dropped-findings')
  if (!v.complete) return write('UNKNOWN', 'protocol:pass-not-complete')
  if (label !== 'known') return write('UNKNOWN', `coverage:${label}`)
  if (coverage.length || await coverageNow($, s) !== 'known') return write('UNKNOWN', 'coverage:unknown')
  if (ep.unchecked !== null) {
    if (await write('UNKNOWN', `align-unchecked:${ep.unchecked}`)) await writeHeld($, s, sha, `align-unchecked:${ep.unchecked}: the owner released a Retro that failed its check`)
    return
  }
  if (gen !== s.gen) return write('UNKNOWN', 'stale')
  // N2: PASS closes tasks, never ongoing constraints. Keep the verdict's generation current.
  for (const r of covered) if (!r.constraint) r.closed = true
  await persist($, s, { rows: true, bump: false })
  if (s.dirty) {
    for (const r of covered) if (!r.constraint && !supers.valid.includes(r.u)) r.closed = false
    return write('UNKNOWN', `close-state:${s.storeErr}`)
  }
  await nextEpisode($, s)
  if (s.dirty) return write('UNKNOWN', `close-state:${s.storeErr}`)
  if (!(await write('PASS', `E${ep.k}`))) return
  if (ep.fails) await logLine($, s, iso(), `audit-resolved ${ep.findings.map(f => f.id).join(',')}`, `E${ep.k}`)
}

export const register: Register = on => {
  const s: State = {
    cwd: '',
    sid: '',
    home: '',
    file: null,
    flagged: '',
    count: countOf(''),
    rows: [],
    u: 0,
    written: 0,
    asksPath: null,
    ledger: null,
    storeFails: 0,
    storeErr: null,
    writing: Promise.resolve(),
    gen: 0,
    projection: {},
    dirty: false,
    duties: [],
    classifying: new Map(),
    kinds: new Map(),
    ep: episodeAfter(1, 0),
    lost: false,
    derived: false,
    off: false,
    auditing: false,
    held: null,
    auditHeld: false,
    heldTurn: null,
    activeErr: null,
    last: '',
    pending: null,
    running: undefined,
    early: null,
    sent: new Set(),
    folded: true,
    hidden: false,
  }

  on('session.start', async ($, e, next) => {
    s.cwd = e.cwd
    s.sid = await $.session.id()
    s.home = (await $.env.get('HOME')) ?? ''
    s.folded = (await $.store.get(FOLD_KEY)) !== 'open'
    s.hidden = (await $.store.get(HIDE_KEY)) === 'hidden'
    s.off = (await $.store.get(offKey(s.sid))) === 'off'
    const path = (await $.store.get(fileKey(s.sid))) as string | undefined
    if (path !== undefined) {
      s.file = fileFor(s, path)
      s.count = countOf(await $.fs.read(path).catch(() => ''))
    }
    const guard = structuredClone((await $.state.get(GUARD)).value)
    s.ledger = null
    if (guard?.sid === s.sid) {
      s.gen = guard.generation
      s.projection = guard.files
      s.held = guard.held
      s.auditHeld = guard.auditHeld
      s.heldTurn = guard.heldTurn ?? null
      s.ledger = guard.ledger
      s.duties = guard.duties
      s.ep = guard.episode
      s.dirty = guard.dirty
    }
    // A hot reload trusts $.state; a new process rebuilds durable duties and episode guards from rows.
    const asks = s.ledger?.path ?? (await $.store.get(asksKey(s.sid))) as string | undefined
    if (asks !== undefined) await resume($, s, asks)
    else await derive($, s)
    if (guard?.sid !== s.sid) {
      s.duties = s.rows.filter(r => owns(r) && r.duty !== null).map(r => r.duty ?? { u: r.u, tries: 0 })
      s.ep = s.rows.findLast(r => r.episode !== undefined)?.episode ?? episodeAfter(1, 0)
      // A new process has no authority for old verdicts; do not import them from disk.
      const old = (await $.fs.list(auditDir(s)).catch(() => [])).filter(f => /\.json$/.test(f.name))
      if (old.length) await run($, ['rm', '-f', ...old.map(f => `${auditDir(s)}/${f.name}`)])
    } else {
      s.duties = guard.duties
      s.ep = guard.episode
    }
    if (s.projection.current === undefined) await projectFile($, s, 'current', JSON.stringify({ generation: String(s.gen) }))
    if (!s.off) await writeActive($, s)
    await saveGuard($, s)
    await $.command.register({ name: COMMAND, description: `Agent should know v${MOD_VERSION}: /${COMMAND} shows or hides the band, with this session's heads-up count and log` })
    await $.command.register({ name: 'asks', description: `Agent should know v${MOD_VERSION}: /asks release U<n> | confirm | off` })
    return next(e)
  })

  // Before this mod's own commands, which answer without next: every owner command is a row; the mod's own open no duty.
  on('command.run', async ($, e, next) => {
    const kind = kindOf(e.origin)
    if (kind === 'owner') await release($, s)
    if (kind !== null) await record($, s, kind === 'owner' ? 'owner-command' : kind, `/${e.command}${e.args ? ` ${e.args}` : ''}`, [], await seenNow($), e.command !== COMMAND && e.command !== 'asks')
    return next(e)
  })

  on('command.run', { command: COMMAND }, async ($, e) => {
    await setHidden($, s, !s.hidden)
    return { text: `${s.hidden ? `band hidden; /${COMMAND} shows it again.` : 'band shown.'} ${summary(s)}` }
  })

  // Only the owner's own Enter runs these: a peer or a plugin cannot release a hold or turn the audit off.
  on('command.run', { command: 'asks' }, async ($, e) => {
    if (e.origin.kind !== 'composer' && e.origin.kind !== 'bridge') return { text: `/asks runs only from the owner (origin ${e.origin.kind})` }
    const [verb, arg] = e.args.trim().split(/\s+/)
    if (verb === 'release') {
      const u = Number(/^U(\d+)$/i.exec(arg ?? '')?.[1] ?? NaN)
      if (!s.duties.some(d => d.u === u)) return { text: `no alignment hold on ${arg ?? '(none named)'}` }
      s.duties = s.duties.filter(d => d.u !== u)
      s.ep.unchecked = `U${u}`
      await saveDuties($, s)
      await saveEpisode($, s)
      await logLine($, s, iso(), 'release', `U${u} · align-unchecked`)
      $.ui.invalidate('ui.render')
      return { text: `U${u} released: tools run again; this episode is align-unchecked and cannot PASS.` }
    }
    if (verb === 'confirm') {
      s.lost = false
      s.derived = false
      for (const r of s.rows) r.confirmed = true
      await persist($, s, { rows: true, bump: false })
      if (s.dirty) return { text: `confirmation not saved (${s.storeErr}); coverage unknown` }
      await logLine($, s, iso(), 'confirm', `coverage known · ${s.rows.length} rows`)
      $.ui.invalidate('ui.render')
      return { text: `coverage confirmed: ${s.rows.length} rows in ${s.asksPath ?? '(no ledger yet)'}` }
    }
    if (verb === 'off') {
      await release($, s)
      s.off = true
      await $.store.set(offKey(s.sid), 'off')
      await run($, ['rm', '-f', `${auditDir(s)}/active`]).catch(err => $.ui.toast(`${NAME}: gate marker not removed (${errText(err)})`))
      delete s.projection.active
      await saveGuard($, s)
      await logLine($, s, iso(), 'off', 'hold and audit off for this session')
      $.ui.invalidate('ui.render')
      return { text: 'agent-should-know: hold and audit off for this session; the Stop gate skips it.' }
    }
    return { text: `${openRows(s).length} open asks · coverage ${coverageLabel(s)} · audit ${s.last || 'none yet'}. /asks release U<n> | confirm | off` }
  })

  // A new turn: the gate's marker, a new generation, and the verdicts of earlier replies gone.
  on('turn.start', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)
    s.running = e.turnId
    if (s.off) return next(e)
    await writeActive($, s)
    try {
      const names = (await $.fs.list(auditDir(s))).map(f => f.name).filter(n => /\.json$|^missing-chain$|^chain$/.test(n))
      if (names.length) await run($, ['rm', '-f', ...names.map(n => `${auditDir(s)}/${n}`)])
      for (const n of names) delete s.projection[n]
    } catch (err) {
      await logLine($, s, iso(), 'turn-start-error', errClass(err))
    }
    await persist($, s, { rows: false, bump: true })
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    const o = e.origin
    if (o?.kind === 'plugin' && (o.name === NAME || o.name.startsWith(`${NAME}@`))) s.pending = { over: e.turnId ?? s.running, card: s.flagged }
    if (o?.kind === 'composer' || o?.kind === 'bridge') await release($, s)
    const kind = kindOf(o)
    // A slash command is ledgered once, at command.run.
    if (kind === null || e.command !== undefined) return next(e)
    // The text is kept whole: a cut row would let the audit miss the cut part.
    await record($, s, kind, e.text, attachmentNames(e.attachments), await seenNow($), true, e.turnId)
    return next(e)
  })

  // The main loop only: a subagent's call is not the owner's turn, and a plugin's own `$.tool.call`
  // (origin not engine) reaches no model.
  on('tool.call', async ($, e, next) => {
    if (next.origin.plugin !== 'engine' || e.agentId !== undefined) return next(e)
    await checkProjection($, s)
    let target = e as unknown as Record<string, unknown>
    try {
      if (['Write', 'Edit', 'NotebookEdit'].includes(e.tool)) {
        target = { ...target, file_path: await resolvePath($, s, String(target.file_path ?? target.notebook_path ?? '')) }
      } else if (e.tool.startsWith('mcp__') && !readOnly(e.tool, target)) {
        target = await resolveArguments($, s, target) as Record<string, unknown>
      }
    } catch (err) {
      const why = `${NAME} denied ${e.tool}: target path could not be resolved (${errClass(err)})`
      $.ui.toast(why)
      await logLine($, s, iso(), 'state-write-denied', why)
      return { deny: why }
    }
    if (stateWrite(e.tool, target, s.home, s.cwd, s.sid)) {
      const reason = `${NAME} denied ${e.tool}: agent tools cannot write, move or delete this session's audit state or agent-should-know state.`
      $.ui.toast(reason)
      await logLine($, s, iso(), 'state-write-denied', e.tool)
      return { deny: reason }
    }
    if (!readOnly(e.tool, e as unknown as Record<string, unknown>)) {
      const held = s.held
      if (held !== null) return { deny: `${NAME} held ${e.tool}: ${held}. Only tools that read run until the owner sends a message.` }
      if (!s.off) {
        const why = await hold($, s, e.tool)
        if (why !== null) return { deny: why }
        if (s.dirty) return { deny: `${NAME} held ${e.tool}: ledger state not saved (${s.storeErr}); coverage unknown` }
      }
    }
    const r = await next(e)
    if ('deny' in r || s.early === null) return r
    const context = [...(r.context ?? []), s.early]
    s.early = null
    return { ...r, context }
  })

  // N10: the main loop's final step (no tool use, a response) is the reply the turn ends on.
  on('turn.step', async function* ($, e, next) {
    const r = yield* next(e)
    if (e.agentId !== undefined || s.auditing || r.toolUses.length > 0 || r.stopReason === null) return r
    // The judge's own fork is a model request too: it must not audit itself.
    s.auditing = true
    let gen = s.gen
    let sha = ''
    try {
      await checkProjection($, s, true)
      if (s.off) return r
      gen = s.gen
      sha = await sha16(r.answer)
      await audit($, s, r.turnId, r.answer, sha, gen)
      if (gen !== s.gen || s.projection[`${sha}.json`] === undefined) {
        if (s.held === null) {
          s.held = 'audit-skipped:stale'
          s.auditHeld = true
          s.heldTurn = r.turnId
        }
        await saveGuard($, s)
      }
    } catch (err) {
      const reason = `hook-error:${errClass(err)}`
      if (s.held === null) {
        s.held = reason
        s.auditHeld = true
        s.heldTurn = r.turnId
      }
      await saveGuard($, s)
      $.ui.toast(`${NAME} v${MOD_VERSION}: self-audit failed (${errText(err)})`)
      try {
        await writeVerdict($, s, sha || (await sha16(r.answer)), gen, { verdict: 'UNKNOWN', reason, turnId: r.turnId, episode: `E${s.ep.k}`, covered: [], tools: [] })
      } catch (again) {
        await logLine($, s, iso(), 'audit-unwritten', `${reason} · ${errClass(again)}`)
      }
    } finally {
      if (!s.off) await checkProjection($, s, true)
      s.auditing = false
    }
    return r
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (e.agentId !== undefined) return r
    await checkProjection($, s)
    $.ui.invalidate('ui.render')
    // Not read in time: the queued prompt carries the card.
    s.early = null
    if (e.turnId === s.running) s.running = undefined
    if (s.pending === null || e.turnId === s.pending.over) return r
    const { card } = s.pending
    s.pending = null
    const verdict = r.text.trim().replace(/\s+/g, ' ').slice(0, VERDICT_CHARS)
    await logLine($, s, iso(), `${e.reason === 'answer' ? 'handled' : e.reason} ${card.slice(11, 19)}`, verdict)
    return r
  })

  // The card leaves the band once relayed; this mod's header goes under what is left,
  // in what is left of maxRows, and nothing when even the header does not fit.
  // No hotkeys: the workers panel owns digits and r x q i a, grok-bot-watch w f o u.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const tree = await next(e)
    const line = offerLine(tree)
    let below = tree
    if (line !== null) {
      below = (withoutCard(tree) ?? $.ui.resolve(e).Box({})) as typeof tree
      await relay($, s, line)
    }
    if (s.hidden) return below
    const budget = e.props.maxRows - rowsOf(below)
    if (budget < 1) return below

    const { Box, Text, Button } = $.ui.resolve(e)
    const width = e.props.bodyColumns
    const title = `▌agent should know v${MOD_VERSION}`
    const status = ` · ${statusPart(s)}${s.count.flagged ? ` · ${s.count.flagged} heads-up · ${s.count.handled} handled` : ''} `
    // Held, store errors, a stuck Retro and an unwritten gate marker matter: never dim, never colour alone (rules 4, 5), and cut last.
    const warn = alarmPart(s) ? `⚠ ${alarmPart(s)} ` : ''
    // Buttons say what they do when the header has room for it, else their icon (the workers band's rule).
    // ' [-]' is the engine's collapse control, drawn over the band's last cells: kept clear.
    const words = cells(title) + cells(status) + cells(warn) + cells('[ ⧉ log ][ ▾ fold ][ hide ] [-]') <= width
    const room = Math.max(0, width - cells(title) - (words ? 31 : 19))
    const warned = fit(warn, room)
    const header = Box({
      flexDirection: 'row',
      children: [
        Text({ bold: true, color: ACCENT, children: title }),
        Text({ dimColor: true, children: fit(status, room - cells(warned)) }),
        ...(warned ? [Text({ bold: true, color: 'red', children: warned })] : []),
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
  })
}
