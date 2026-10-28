import type { EngineInterface, ModelForkResult, ModelUsage, Register, SessionMessage, ToolCallInput } from 'claude-code'

import { type Form, classified, classifierPrompt, formFound, formText, meets, readOnly } from './lib/align.ts'
import { type Finding, discloseBlock, disclosed, evidence, failBlock, judgePrompt, parseVerdict, toolIds, verify } from './lib/audit.ts'
import { cells, fit, rowsOf } from './lib/band.ts'
import { type Kind, type Row, RESUME_NOTE, active, attachmentNames, kindOf, ledgerText, owns, parseRows, quotedSpans } from './lib/ledger.ts'

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
/** The owner ledger's path and last row number; the rows live in the file, which has no store size limit. */
const asksKey = (sid: string) => `asks:${sid}`
const dutiesKey = (sid: string) => `duties:${sid}`
/** Kept in the store so a hot reload or a relayed turn does not reset an episode's counts. */
const episodeKey = (sid: string) => `episode:${sid}`
const QUOTE_ASKS = 'Quote every owner message verbatim in the summary, in order.'
const FAIL_BLOCKS = 2

/** One owner row's alignment duty: open once the row is delivered, met by the form the classifier asked for. */
type Duty = { u: number; delivered: boolean; need?: Form; why?: string }
type Disclose = { kind: 'cap'; problems: string[]; misses: number } | { kind: 'unknown'; reason: string; misses: number }
type Episode = {
  k: number
  /** The first owner row of the episode: rows from here on joined it. */
  from: number
  fails: number
  ids: string[]
  /** Rows the last audit found open, kept in a cut ledger context. */
  open: number[]
  disclose: Disclose | null
  compacted: boolean
}
const episodeAfter = (k: number, u: number): Episode => ({ k, from: u + 1, fails: 0, ids: [], open: [], disclose: null, compacted: false })

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
  // The owner ledger: every row, in memory and in its file; `broken` while the last write failed.
  rows: Row[]
  u: number
  asksPath: string | null
  broken: boolean
  writing: Promise<void>
  // A slash command command.run ledgered, so its prompt.submit is not a second row.
  lastCommand: string | null
  duties: Duty[]
  classifying: Map<number, Promise<Form>>
  ep: Episode
  // After a compaction: the ledger rides the next main-loop tool result and the next owner prompt.
  reinjectTool: boolean
  reinjectPrompt: boolean
  // Blocks the Stop hook's error handler gave in a row; it gives up after two so an erroring hook cannot loop a turn.
  caught: number
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

// Counted back from the log, so a reload shows what the session did. Fail counts episodes (their round 1),
// so it reads against resolved; tok sums every judge call's usage.
function countOf(text: string) {
  const rows = text.split('\n')
  const has = (re: RegExp) => rows.filter(r => re.test(r)).length
  const audits = rows.filter(r => / · audit-(?:pass|fail|unknown)\b/.test(r))
  return {
    flagged: rows.filter(r => r.includes(' · flagged · ')).length,
    handled: has(/ · handled \d/),
    audits: audits.length,
    pass: has(/ · audit-pass · /),
    fail: has(/ · audit-fail .* round 1 · /),
    resolved: has(/ · audit-resolved /),
    disclosed: has(/ · audit-disclosed · E\d+ · DISCLOSED$/),
    unaudited: has(/ · (?:audit-disclosed|disclose-missing) · E\d+ · UNAUDITED$/),
    tok: audits.reduce((n, r) => n + Number(/ · tok (\d+)$/.exec(r)?.[1] ?? 0), 0),
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

const auditPart = (c: Count) => (c.audits ? `audits ${c.pass}/${c.audits} · ${c.fail}→${c.resolved} · ${c.tok} tok` : '')
const warnPart = (s: State) =>
  [s.count.disclosed ? `${s.count.disclosed} disclosed` : '', s.count.unaudited ? `${s.count.unaudited} unaudited` : '', s.broken ? 'ledger not written' : '']
    .filter(Boolean)
    .join(' · ')

function summary(s: State) {
  const where = s.file?.path ?? `${folderOf(s)}/ (no file yet)`
  const audits = [auditPart(s.count), warnPart(s)].filter(Boolean).join(' · ')
  return `${s.count.flagged} heads-up · ${s.count.handled} handled this session${audits ? ` · ${audits}` : ''} · log: ${where}`
}

// --- A: the owner ledger ---

const flat = (t: string) => t.replace(/\s+/g, ' ').trim()

// The whole ledger is written each time ($.fs has no append): a write after a failed one puts the missed rows
// back, and writes queue so two rows never race.
function writeRows($: EngineInterface, s: State): Promise<void> {
  s.writing = s.writing.then(async () => {
    try {
      s.asksPath ??= `${folderOf(s)}/${iso().slice(0, 10)}-${s.sid.slice(0, 8)}.asks.jsonl`
      await $.fs.write(s.asksPath, `${s.rows.map(r => JSON.stringify(r)).join('\n')}\n`)
      await $.store.set(asksKey(s.sid), s.asksPath)
      if (s.broken) $.ui.invalidate('ui.render')
      s.broken = false
    } catch (err) {
      s.broken = true
      $.ui.invalidate('ui.render')
      $.ui.toast(`${NAME} v${MOD_VERSION}: owner ledger not written (${errText(err)}); audits read UNKNOWN until a write succeeds`)
    }
  })
  return s.writing
}

const saveDuties = ($: EngineInterface, s: State) =>
  $.store.set(dutiesKey(s.sid), s.duties).catch(err => $.ui.toast(`${NAME}: alignment duties not saved (${errText(err)})`))
const saveEpisode = ($: EngineInterface, s: State) =>
  $.store.set(episodeKey(s.sid), s.ep).catch(err => $.ui.toast(`${NAME}: audit episode not saved (${errText(err)})`))

async function record($: EngineInterface, s: State, origin: Kind | 'resume', text: string, attachments: string[], turnId?: string) {
  const row: Row = { u: ++s.u, at: iso(), origin, text, attachments, ...(turnId === undefined ? {} : { turnId }) }
  const quoted = quotedSpans(text)
  if (quoted.length) row.quoted = quoted
  s.rows.push(row)
  if (owns(row)) {
    s.duties.push({ u: row.u, delivered: false })
    await saveDuties($, s)
  }
  await writeRows($, s)
  await logLine($, s, row.at, 'ask', `U${row.u} ${origin} · ${text.length} chars${attachments.length ? ` · ${attachments.join(', ')}` : ''}`)
}

// A slash command reaches both prompt.submit and command.run, in an order the types do not fix: the first ledgers it.
// shortcut: the same command typed twice in a row, one of the two events missing, reads as one; upgrade on a turn id in command.run.
async function recordCommand($: EngineInterface, s: State, kind: Kind, key: string, attachments: string[], turnId?: string) {
  if (s.lastCommand === key) {
    s.lastCommand = null
    return
  }
  s.lastCommand = key
  await record($, s, kind === 'owner' ? 'owner-command' : kind, key, attachments, turnId)
}

const ledgerFor = (s: State) => ledgerText(s.rows, new Set(s.ep.open), s.asksPath ?? '(not written)')
const ledgerContext = (s: State) =>
  `${NAME}: the conversation was compacted. The owner's messages of this session, verbatim (owner ledger):\n\n${ledgerFor(s)}`

// --- B: the alignment hold ---

// Where the row reached the model: the last user message that holds its text.
// shortcut: a row whose text the transcript reformats never opens a duty; a command row matches on `/name` only.
function deliveredAt(messages: readonly SessionMessage[], row: Row): number {
  const probe = row.origin === 'owner-command' ? (row.text.split(/\s/)[0] ?? row.text) : flat(row.text).slice(0, 500)
  return messages.findLastIndex(m => m.role === 'user' && flat(m.text).includes(probe))
}

const assistantText = (messages: readonly SessionMessage[], from: number) =>
  messages
    .slice(from + 1)
    .filter(m => m.role === 'assistant')
    .map(m => m.text)
    .join('\n')

// Started when the row is first seen delivered; awaited at the first call that writes. Any failure: Retro.
function classify($: EngineInterface, s: State, d: Duty, previous: string, row: Row): Promise<Form> {
  let p = s.classifying.get(d.u)
  if (p === undefined) {
    p = $.model
      .complete({ model: 'haiku', prompt: classifierPrompt(previous, row.text), effort: 'low', maxTokens: 20, timeoutMs: 20_000 })
      .then(
        r => (r.isAnswered ? { need: classified(r.text), why: r.text.trim() === '' ? 'classifier said nothing' : undefined } : { need: 'retro' as const, why: `classifier ${r.reason}` }),
        (err: unknown) => ({ need: 'retro' as const, why: `classifier error (${errText(err)})` }),
      )
      .then(({ need, why }) => {
        d.need = need
        if (why !== undefined) d.why = why
        void saveDuties($, s)
        return need
      })
    s.classifying.set(d.u, p)
  }
  return p
}

async function hold($: EngineInterface, s: State, e: ToolCallInput): Promise<string | null> {
  if (s.duties.length === 0) return null
  let messages: readonly SessionMessage[]
  try {
    messages = await $.session.messages()
  } catch (err) {
    // Fail open with a trace: a transcript the mod cannot read must not freeze every write.
    $.ui.toast(`${NAME}: alignment not checked (${errText(err)})`)
    return null
  }
  const isRead = readOnly(e.tool, e as unknown as Record<string, unknown>)
  for (const d of [...s.duties]) {
    const row = s.rows.find(r => r.u === d.u)
    const at = row === undefined ? -1 : deliveredAt(messages, row)
    if (row === undefined || at === -1) continue
    if (!d.delivered) {
      d.delivered = true
      await saveDuties($, s)
    }
    const previous = messages.slice(0, at).findLast(m => m.role === 'assistant' && m.text.trim() !== '')?.text ?? ''
    const need = d.need ?? classify($, s, d, previous, row)
    if (isRead) continue
    const found = formFound(assistantText(messages, at), d.u)
    const want = await need
    if (meets(found, want)) {
      s.duties = s.duties.filter(x => x !== d)
      await saveDuties($, s)
      await logLine($, s, iso(), found === 'retro' ? 'retro' : 'align', `U${d.u}${want === 'retro' && d.why ? ` · ${d.why}` : ''}`)
      continue
    }
    await logLine($, s, iso(), `held ${e.tool} U${d.u}`, found === 'align' ? 'align line, Retro needed' : 'no block')
    const why = want === 'retro' ? (d.why ? ` (Retro needed: ${d.why})` : ' (the message corrects earlier work: Retro needed)') : ''
    return `${NAME} held ${e.tool}: the owner's message U${d.u} has no alignment block in your text yet${why}. U${d.u} (verbatim): 「${row.text}」 Write ${formText(d.u, want)} in your reply text, then call the tool again. Tools that only read still run.`
  }
  return null
}

// --- C: the self-audit at Stop ---

const usageText = (u: ModelUsage) =>
  `in ${u.input_tokens} cr ${u.cache_read_input_tokens ?? 0} cw ${u.cache_creation_input_tokens ?? 0} out ${u.output_tokens}`
const tokOf = (u: ModelUsage) => u.input_tokens + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + u.output_tokens
const addUsage = (a: ModelUsage, b: ModelUsage): ModelUsage => ({
  input_tokens: a.input_tokens + b.input_tokens,
  output_tokens: a.output_tokens + b.output_tokens,
  cache_read_input_tokens: (a.cache_read_input_tokens ?? 0) + (b.cache_read_input_tokens ?? 0),
  cache_creation_input_tokens: (a.cache_creation_input_tokens ?? 0) + (b.cache_creation_input_tokens ?? 0),
})
const ZERO: ModelUsage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

async function nextEpisode($: EngineInterface, s: State) {
  s.ep = episodeAfter(s.ep.k + 1, s.u)
  await saveEpisode($, s)
}

// The episode's disclose duty: met mechanically, else blocked again; a second miss ends it UNAUDITED.
async function discloseTurn($: EngineInterface, s: State, need: Disclose, reply: string | undefined): Promise<string | null> {
  const { k } = s.ep
  if (reply !== undefined && disclosed(reply, need)) {
    await logLine($, s, iso(), 'audit-disclosed', `E${k} · ${need.kind === 'cap' ? 'DISCLOSED' : 'UNAUDITED'}`)
    await nextEpisode($, s)
    return null
  }
  need.misses += 1
  if (need.misses >= 2) {
    await logLine($, s, iso(), 'disclose-missing', `E${k} · UNAUDITED`)
    $.ui.toast(`${NAME}: E${k} ended without its disclosure; logged UNAUDITED`)
    await nextEpisode($, s)
    return null
  }
  await saveEpisode($, s)
  return discloseBlock(k, need)
}

async function audit($: EngineInterface, s: State, reply: string | undefined): Promise<string | null> {
  const ep = s.ep
  if (ep.disclose !== null) return discloseTurn($, s, ep.disclose, reply)
  const t0 = Date.now()
  let usage = ZERO
  let path: 'fork' | 'alt' = 'fork'
  const stamp = () => `${path} · ${Date.now() - t0}ms · ${usageText(usage)} · tok ${tokOf(usage)}`
  const unknown = async (reason: string) => {
    await logLine($, s, iso(), 'audit-unknown', `E${ep.k} · ${reason} · ${stamp()}`)
    ep.disclose = { kind: 'unknown', reason, misses: 0 }
    await saveEpisode($, s)
    return discloseBlock(ep.k, ep.disclose)
  }
  if (reply === undefined || reply.trim() === '') return unknown('reply-absent')
  if (s.broken) return unknown('ledger-not-written')

  const coverage: string[] = []
  let messages: readonly SessionMessage[] = []
  try {
    messages = await $.session.messages()
  } catch (err) {
    coverage.push(`the transcript (${errText(err)})`)
  }
  if (ep.compacted) coverage.push('evidence from before the compaction')
  const first = s.rows.find(r => r.u >= ep.from && owns(r))
  const from = first === undefined ? -1 : deliveredAt(messages, first)
  const asks = ledgerFor(s)
  const why: string[] = []

  let res: ModelForkResult | null = null
  try {
    res = await $.model.fork({
      prompt: judgePrompt({ asks, episodeFrom: ep.from, reply, evidence: 'The conversation above is the evidence: its tool calls, their ids and their results.', coverage }),
    })
  } catch (err) {
    why.push(`fork threw (${errText(err)})`)
  }
  if (res !== null && 'usage' in res) usage = addUsage(usage, res.usage)
  if (res?.isAnswered !== true) {
    if (res !== null && !res.isAnswered) why.push(`fork ${res.reason}`)
    path = 'alt'
    const ev = evidence(messages, Math.max(0, from))
    const cover = [...coverage, ...(from === -1 ? ['where this episode starts (the whole transcript is sent)'] : []), ...(ev.isCut ? ['the oldest evidence (cut to size)'] : [])]
    try {
      const model = await $.session.model()
      res = await $.model.complete({ model, prompt: judgePrompt({ asks, episodeFrom: ep.from, reply, evidence: ev.text, coverage: cover }), effort: 'high', maxTokens: 4000, timeoutMs: 120_000 })
      usage = addUsage(usage, res.usage)
      if (!res.isAnswered) why.push(`alt ${res.reason}`)
    } catch (err) {
      res = null
      why.push(`alt threw (${errText(err)})`)
    }
  }
  if (res === null || !res.isAnswered) return unknown(why.join('; '))

  const v = parseVerdict(res.text)
  if (v === null) return unknown(`malformed judge reply (${path})`)
  if (v.verdict === 'UNKNOWN') return unknown(`the judge answered UNKNOWN (${path})`)
  if (v.verdict === 'PASS') {
    await logLine($, s, iso(), 'audit-pass', `E${ep.k} · ${stamp()}`)
    if (ep.ids.length) await logLine($, s, iso(), `audit-resolved ${ep.ids.join(',')}`, `E${ep.k}`)
    await nextEpisode($, s)
    return null
  }
  const { valid, invalid } = verify(v.findings, reply, new Set(active(s.rows).map(r => r.u)), toolIds(messages))
  for (const bad of invalid) await logLine($, s, iso(), 'finding-invalid', `E${ep.k} · ${bad}`)
  if (valid.length === 0) return unknown(`FAIL with no valid finding (${path})`)
  ep.fails += 1
  ep.ids = [...new Set([...ep.ids, ...valid.map(f => f.id)])]
  ep.open = [...new Set(valid.flatMap(f => (f.ref.kind === 'ask' ? [Number(/\d+/.exec(String(f.ref.id))?.[0])] : [])))]
  await logLine($, s, iso(), `audit-fail ${valid.map(f => f.id).join(',')}`, `E${ep.k} · round ${ep.fails} · ${stamp()}`)
  if (ep.fails <= FAIL_BLOCKS) {
    await saveEpisode($, s)
    return failBlock(ep.k, valid, v.complete)
  }
  ep.disclose = { kind: 'cap', problems: valid.map((f: Finding) => `${f.id}: ${f.problem}`), misses: 0 }
  await saveEpisode($, s)
  return discloseBlock(ep.k, ep.disclose)
}

// At a turn's end with no block, duties of rows the model saw close; so do undelivered rows older than a delivered one.
async function closeDuties($: EngineInterface, s: State) {
  const seen = Math.max(0, ...s.duties.filter(d => d.delivered).map(d => d.u))
  const kept = s.duties.filter(d => !d.delivered && d.u > seen)
  if (kept.length === s.duties.length) return
  for (const d of s.duties) if (!kept.includes(d)) s.classifying.delete(d.u)
  s.duties = kept
  await saveDuties($, s)
}

const joinBlocks = (a: string | undefined, b: string) => (a ? `${a}\n\n${b}` : b)

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
    asksPath: null,
    broken: false,
    writing: Promise.resolve(),
    lastCommand: null,
    duties: [],
    classifying: new Map(),
    ep: episodeAfter(1, 0),
    reinjectTool: false,
    reinjectPrompt: false,
    caught: 0,
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
    const path = (await $.store.get(fileKey(s.sid))) as string | undefined
    if (path !== undefined) {
      s.file = fileFor(s, path)
      s.count = countOf(await $.fs.read(path).catch(() => ''))
    }
    // A reload keeps the ledger, the open duties and the episode: the file holds the rows, the store the rest.
    const asks = (await $.store.get(asksKey(s.sid))) as string | undefined
    if (asks !== undefined) {
      s.asksPath = asks
      try {
        s.rows = parseRows(await $.fs.read(asks))
        s.u = s.rows.at(-1)?.u ?? 0
      } catch (err) {
        s.broken = true
        $.ui.toast(`${NAME} v${MOD_VERSION}: owner ledger not read (${errText(err)}); audits read UNKNOWN until a write succeeds`)
      }
    }
    s.duties = ((await $.store.get(dutiesKey(s.sid))) as Duty[] | undefined) ?? []
    s.ep = ((await $.store.get(episodeKey(s.sid))) as Episode | undefined) ?? episodeAfter(1, s.u)
    await $.command.register({ name: 'heads-up', description: `Agent should know v${MOD_VERSION}: /${COMMAND} shows or hides the band, with this session's heads-up count and log` })
    return next(e)
  })

  // Before the heads-up hook, which answers without next: its own run is an owner row too.
  on('command.run', async ($, e, next) => {
    const kind = kindOf(e.origin)
    if (kind !== null) await recordCommand($, s, kind, `/${e.command}${e.args ? ` ${e.args}` : ''}`, [])
    return next(e)
  })

  on('command.run', { command: 'heads-up' }, async ($, e) => {
    await setHidden($, s, !s.hidden)
    return { text: `${s.hidden ? `band hidden; /${COMMAND} shows it again.` : 'band shown.'} ${summary(s)}` }
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) s.running = e.turnId
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    const o = e.origin
    if (o?.kind === 'plugin' && (o.name === NAME || o.name.startsWith(`${NAME}@`))) s.pending = { over: e.turnId ?? s.running, card: s.flagged }
    const kind = kindOf(o)
    if (kind === null) return next(e)
    // The text is kept whole: a cut row would let the audit miss the cut part.
    const files = attachmentNames(e.attachments)
    if (e.command !== undefined) await recordCommand($, s, kind, `/${e.command.name}${e.command.args ? ` ${e.command.args}` : ''}`, files, e.turnId)
    else {
      s.lastCommand = null
      await record($, s, kind, e.text, files, e.turnId)
    }
    const r = await next(e)
    if (!s.reinjectPrompt || kind !== 'owner' || r.drop !== undefined) return r
    s.reinjectPrompt = false
    return { ...r, context: [...(r.context ?? []), ledgerContext(s)] }
  })

  // The main loop only: a subagent's call is not the owner's turn, and a plugin's own `$.tool.call`
  // (origin not engine) reaches no model.
  on('tool.call', async ($, e, next) => {
    if (next.origin.plugin !== 'engine' || e.agentId !== undefined) return next(e)
    const held = await hold($, s, e)
    if (held !== null) return { deny: held }
    const r = await next(e)
    if ('deny' in r) return r
    const context = [...(r.context ?? [])]
    if (s.early !== null) context.push(s.early)
    s.early = null
    if (s.reinjectTool) context.push(ledgerContext(s))
    s.reinjectTool = false
    return context.length === (r.context ?? []).length ? r : { ...r, context }
  })

  // The summary quotes the owner verbatim; after it the ledger itself rides the next tool result and owner prompt.
  // shortcut: a precompute compaction counts as applied, so one the engine later drops re-sends the ledger once.
  on('session.compact', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)
    const r = await next({ ...e, instructions: e.instructions ? `${e.instructions}\n\n${QUOTE_ASKS}` : QUOTE_ASKS })
    if (r.messages === undefined) return r
    s.reinjectTool = true
    s.reinjectPrompt = true
    s.ep.compacted = true
    await saveEpisode($, s)
    return r
  })

  on('classic.SessionStart', async ($, e, next) => {
    if (e.source === 'resume') await record($, s, 'resume', RESUME_NOTE, [])
    return next(e)
  })

  // The settings' own Stop hooks run first; their block and the audit's go out as one reason.
  on('classic.Stop', async ($, e, next) => {
    const r = await next(e)
    if (e.agent_id !== undefined) return r
    // shortcut: r folds every settings Stop hook into one verdict; the log cannot say which one blocked.
    await logLine($, s, iso(), `gate ${r.block === undefined ? 'pass' : 'block'}`, `E${s.ep.k}`)
    s.caught = 0
    const block = await audit($, s, e.last_assistant_message)
    if (block === null) {
      if (r.block === undefined) await closeDuties($, s)
      return r
    }
    return { ...r, block: joinBlocks(r.block, block) }
  }).catch(async ($, e, next) => {
    const r = await next(e)
    if (e.agent_id !== undefined || s.caught >= 2 || disclosed(e.last_assistant_message ?? '', { kind: 'unknown' })) return r
    s.caught += 1
    const reason = `hook error ${next.error.kind}: ${(next.error.message ?? 'no message').split('\n')[0]}`
    $.ui.toast(`${NAME} v${MOD_VERSION}: self-audit did not run (${reason})`)
    return { ...r, block: joinBlocks(r.block, discloseBlock(s.ep.k, { kind: 'unknown', reason })) }
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (e.agentId !== undefined) return r
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
    const audits = auditPart(s.count)
    const status = `${s.count.flagged ? ` · ${s.count.flagged} heads-up · ${s.count.handled} handled` : ' · no heads-up yet'}${audits ? ` · ${audits}` : ''} `
    // Disclosed, unaudited and an unwritten ledger matter: never dim, never colour alone (rules 4, 5), and cut last.
    const warn = warnPart(s) ? `⚠ ${warnPart(s)} ` : ''
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
        ...(warned ? [Text({ color: 'yellow', children: warned })] : []),
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
