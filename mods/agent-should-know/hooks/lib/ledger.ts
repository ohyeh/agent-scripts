import type { PromptOrigin, PromptSubmitAttachment, SessionMessage } from 'claude-code'

/** owner: typed or bridged; owner-command: a slash command typed so; unknown: kept, authorizes nothing;
 * transcript: owner text read back from the session at a start with no ledger (resume, continued session). */
export type Kind = 'owner' | 'owner-command' | 'unknown'

export type Row = {
  u: number
  at: string
  origin: Kind | 'transcript'
  text: string
  attachments: string[]
  turnId?: string
  /** User messages with text in the transcript when the row was submitted: where its delivery is looked for first. */
  seen: number
  /** [start, end) spans of text the owner quoted or pasted: a label for the judge, who decides adoption. */
  quoted?: [number, number][]
  /** A PASS covered it (N2): only then does an ask leave asks-open.md. */
  closed?: boolean
}

/** Past this size the judge gets the open rows, the newest 20 and the path instead of the whole ledger. */
export const WHOLE_MAX = 60_000
const NEWEST = 20
export const OPEN_HEADER = '## Open owner asks (agent-should-know)'

// Only the owner's own Enter (composer, bridge) is an owner row; sdk and unclassified prompts are kept as unknown.
// A message from a peer, a plugin or the system (scheduled-trigger, auto-continuation, observer, observer-activity,
// projects-relay, peer-send-message, task-notification) is information, not an owner instruction: no row.
export function kindOf(o: PromptOrigin | undefined): Kind | null {
  switch (o?.kind) {
    case 'composer':
    case 'bridge':
      return 'owner'
    case 'sdk':
    case 'channel':
    case 'slack-ping':
    case 'unclassified':
      return 'unknown'
    default:
      return null
  }
}

export const attachmentNames = (a: readonly PromptSubmitAttachment[] | undefined) =>
  (a ?? []).map(x => (x.filename ? `${x.type}:${x.filename}` : x.mediaType ? `${x.type}:${x.mediaType}` : x.type))

// `> ` lines, `#qN` quote lines and <pasted_content> blocks: what the owner hands over, labelled, never dropped.
export function quotedSpans(text: string): [number, number][] {
  const spans: [number, number][] = []
  for (const m of text.matchAll(/<pasted_content\b[^>]*>[\s\S]*?<\/pasted_content>/g)) spans.push([m.index, m.index + m[0].length])
  let at = 0
  for (const line of text.split('\n')) {
    const end = at + line.length
    if (/^\s*(?:>|#q\d+\b)/.test(line) && !spans.some(([a, b]) => at >= a && end <= b)) spans.push([at, end])
    at = end + 1
  }
  return spans.sort((a, b) => a[0] - b[0])
}

export const owns = (r: Row) => r.origin !== 'unknown'

const MARKS: Record<Row['origin'], string> = {
  owner: 'owner',
  'owner-command': 'owner-command',
  unknown: 'unknown (not the owner; authorizes nothing)',
  transcript: 'transcript (owner text read back from the session)',
}

/** One row: its origin mark, and quoted spans wrapped so the judge sees what the owner quoted. */
export function render(r: Row): string {
  let text = ''
  let at = 0
  for (const [a, b] of r.quoted ?? []) {
    text += `${r.text.slice(at, a)}<quoted>${r.text.slice(a, b)}</quoted>`
    at = b
  }
  text += r.text.slice(at)
  const files = r.attachments.length ? ` [attachments: ${r.attachments.join(', ')}]` : ''
  return `U${r.u} [${MARKS[r.origin]}] ${r.at}${files}:\n${text}`
}

/** The ledger whole when it fits, else the rows still open, the newest 20 and where the rest is. */
export function ledgerText(rows: readonly Row[], open: ReadonlySet<number>, path: string): string {
  const whole = rows.map(render).join('\n\n')
  if (whole.length <= WHOLE_MAX) return whole
  const newest = new Set(rows.slice(-NEWEST).map(r => r.u))
  const kept = rows.filter(r => open.has(r.u) || newest.has(r.u))
  return `(${rows.length - kept.length} older rows are not shown here; the whole ledger is ${path})\n\n${kept.map(render).join('\n\n')}`
}

/** asks-open.md: the open rows verbatim; the settings compaction hook appends it and checks the end marker. */
export function openText(rows: readonly Row[], path: string, gen: number): string {
  const body = rows.length ? rows.map(render).join('\n\n') : '(none open)'
  return `${OPEN_HEADER}\nWhole ledger: ${path}\n\n${body}\n\n<!-- asks-open gen=${gen} end -->\n`
}

/** Throws on a line that is not JSON: the caller marks the ledger broken rather than drop a row. */
export const parseRows = (text: string): Row[] =>
  text
    .split('\n')
    .filter(l => l.trim() !== '')
    .map(l => JSON.parse(l) as Row)

// session-handoff Step 3b's filter: wrappers, hook feedback, skill bodies, continuation summaries, plugin messages.
const NOT_OWNER = /^\s*<|^Base directory for this skill|^Stop hook feedback|^This session is being continued|plugin sent a message/

/** Owner text already in the transcript at a start with no ledger, with how many user texts came before it. */
export function transcriptRows(messages: readonly SessionMessage[]): { text: string; seen: number }[] {
  const texts = messages.filter(m => m.role === 'user' && m.text.trim() !== '').map(m => m.text)
  return texts.flatMap((text, seen) => (NOT_OWNER.test(text) ? [] : [{ text, seen }]))
}

export const userIndexes = (messages: readonly SessionMessage[]) => messages.flatMap((m, i) => (m.role === 'user' && m.text.trim() !== '' ? [i] : []))

const flat = (t: string) => t.replace(/\s+/g, ' ').trim()

/** N7: where each row reached the model, as a message index. Rows match in order: row k at the first user text at
 * or past max(its `seen`, the previous row's match + 1) that holds its text, so the same text twice maps one to one.
 * R0 (measured 2026-10-28): a queued mid-turn message is in `$.session.messages()`. Were it not, this is the one
 * place to change: deliver a row at the next step after its prompt.submit. */
export function deliveries(messages: readonly SessionMessage[], rows: readonly Row[]): Map<number, number> {
  const users = userIndexes(messages)
  const at = new Map<number, number>()
  let next = 0
  for (const r of rows) {
    if (r.origin === 'transcript' && r.seen < users.length) {
      at.set(r.u, users[r.seen]!)
      next = r.seen + 1
      continue
    }
    const probe = r.origin === 'owner-command' ? (r.text.split(/\s/)[0] ?? r.text) : flat(r.text).slice(0, 500)
    for (let k = Math.max(r.seen, next); k < users.length; k++) {
      if (!flat(messages[users[k]!]!.text).includes(probe)) continue
      at.set(r.u, users[k]!)
      next = k + 1
      break
    }
  }
  return at
}
