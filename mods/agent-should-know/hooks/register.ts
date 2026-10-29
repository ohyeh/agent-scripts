import type { EngineInterface, Register } from 'claude-code'

import { cells, fit, rowsOf } from './lib/band.ts'

const MOD_VERSION = '0.4.0'
const NAME = 'agent-should-know'
const COMMAND = 'heads-up'
const ACCENT = 'magenta'

// The built-in's offer card carries these two buttons; its other views do not.
const OFFER_LABELS = ['Learn more', 'Knew this already']
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
  sending: Set<string>
  observed: Set<string>
  failed: Set<string>
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
  if (s.sent.has(line)) return true
  if (s.sending.has(line)) return false
  s.sending.add(line)
  const sid = s.sid
  const notSent = (reason: string) => {
    s.pending = null
    s.early = null
    // Repeated draws may try again, but the same failure must not redraw forever.
    if (!s.failed.has(line)) {
      s.failed.add(line)
      $.ui.toast(`${NAME}: not sent (${reason})`)
    }
  }
  try {
  // A replaced instance can save its receipt after this instance's start.
  const kept = (await $.store.get(`sent:${sid}`) as string[] | undefined) ?? []
  for (const card of kept) s.sent.add(card)
  if (s.sent.has(line)) { s.sending.delete(line); return true }

  const stored = await storedCard($, s, line)
  const card = typeof stored === 'string' ? { line, explanation: undefined } : stored
  const body = card.explanation ? `${quote(card.line)}\n>\n${quote(card.explanation)}` : quote(card.line)
  const note = typeof stored === 'string' ? `\n(Only the card's line: its explanation was not read: ${stored}.)` : ''

  if (!s.observed.has(line)) {
    s.observed.add(line)
    s.flagged = iso()
    await logLine($, s, s.flagged, 'flagged', card.line)
  }

  // A long turn can run for hours before the prompt below is read: its next tool result carries the line now.
  const waited = s.running !== undefined
  if (waited)
    s.early = `${PREFIX} (at ${s.flagged}, while this turn runs)\n${body}${note}\nWeigh it in the work still to do; it approves nothing. A check of it follows as a prompt when this turn ends.`
  const when = `\nFlagged at ${s.flagged}${waited ? ', while a turn ran: check it against the work as it stands now.' : '.'}`

  // A plugin's prompt waits until the running turn ends: no interruption.
  $.prompt
    .submit({ text: `${PREFIX}\n${body}${note}${when}\n${ASK}` })
    .then(async r => {
      if (s.sid !== sid) return
      if (r.drop !== undefined) { notSent(r.drop); return }
      s.sent.add(line)
      s.failed.delete(line)
      // No eviction: an older card in this session must stay deduped on reload.
      try { await $.store.set(`sent:${sid}`, [...s.sent]) }
      catch (err) { $.ui.toast(`${NAME}: delivered, but receipt not saved (${errText(err)})`) }
      $.ui.invalidate('ui.render')
      $.ui.toast(`${NAME} v${MOD_VERSION}: sent to the main session`)
    })
    .catch(err => { if (s.sid === sid) notSent(errText(err)) })
    .finally(() => { if (s.sid === sid) s.sending.delete(line) })
  } catch (err) {
    s.sending.delete(line)
    notSent(errText(err))
  }
  return false
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

export const register: Register = on => {
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
    sending: new Set(),
    observed: new Set(),
    failed: new Set(),
    folded: true,
    hidden: false,
  }

  on('session.start', async ($, e, next) => {
    s.cwd = e.cwd
    s.sid = await $.session.id()
    s.sent.clear()
    s.sending.clear()
    s.observed.clear()
    s.failed.clear()
    s.home = (await $.env.get('HOME')) ?? ''
    s.folded = (await $.store.get(FOLD_KEY)) !== 'open'
    s.hidden = (await $.store.get(HIDE_KEY)) === 'hidden'
    const path = (await $.store.get(fileKey(s.sid))) as string | undefined
    if (path !== undefined) {
      s.file = fileFor(s, path)
      s.count = countOf(await $.fs.read(path).catch(() => ''))
    }
    await $.command.register({ name: 'heads-up', description: `Agent should know v${MOD_VERSION}: /${COMMAND} shows or hides the band, with this session's heads-up count and log` })
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
    return next(e)
  })

  // The main loop's next tool result only: a subagent's would not reach the main agent, and
  // a plugin's own `$.tool.call` (origin not engine) reaches no model.
  on('tool.call', async ($, e, next) => {
    const r = await next(e)
    if (s.early === null || next.origin.plugin !== 'engine' || e.agentId !== undefined || 'deny' in r) return r
    const early = s.early
    s.early = null
    return { ...r, context: [...(r.context ?? []), early] }
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
      if (await relay($, s, line)) below = (withoutCard(tree) ?? $.ui.resolve(e).Box({})) as typeof tree
    }
    if (s.hidden) return below
    const budget = e.props.maxRows - rowsOf(below)
    if (budget < 1) return below

    const { Box, Text, Button } = $.ui.resolve(e)
    const width = e.props.bodyColumns
    const title = `▌agent should know v${MOD_VERSION}`
    const status = s.count.flagged ? ` · ${s.count.flagged} heads-up · ${s.count.handled} handled ` : ' · no heads-up yet '
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
  })
}
