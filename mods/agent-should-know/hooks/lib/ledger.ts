import type { PromptOrigin, PromptSubmitAttachment } from 'claude-code'

/** owner: typed or bridged; owner-command: a slash command typed so; unknown: kept, authorizes nothing. */
export type Kind = 'owner' | 'owner-command' | 'unknown'

export type Row = {
  u: number
  at: string
  origin: Kind | 'resume'
  text: string
  attachments: string[]
  turnId?: string
  /** [start, end) spans of text the owner quoted or pasted: material, not a command. */
  quoted?: [number, number][]
}

export const RESUME_NOTE = 'resume: earlier asks are not in this ledger; session-handoff Step 3b reads them'
/** Past this size the context carries the open rows, the newest 20 and the path instead of the whole ledger. */
export const WHOLE_MAX = 60_000
const NEWEST = 20

// shortcut: origins the design's table does not name (scheduled-trigger, auto-continuation, observer,
// observer-activity, projects-relay, peer-send-message) are not ledgered; add a row here when the owner rules on one.
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

// `> ` lines, `#qN` quote lines and <pasted_content> blocks: what the owner hands over to read, not to do.
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

/** Rows after the last resume row: the ledger covers this run of the session only. */
export function active(rows: readonly Row[]): Row[] {
  const at = rows.findLastIndex(r => r.origin === 'resume')
  return rows.slice(at + 1)
}

export const owns = (r: Row) => r.origin === 'owner' || r.origin === 'owner-command'

/** One row for the judge: its origin mark, and quoted spans wrapped so they read as material. */
export function render(r: Row): string {
  let text = ''
  let at = 0
  for (const [a, b] of r.quoted ?? []) {
    text += `${r.text.slice(at, a)}<quoted>${r.text.slice(a, b)}</quoted>`
    at = b
  }
  text += r.text.slice(at)
  const mark = r.origin === 'unknown' ? 'unknown (not the owner; authorizes nothing)' : r.origin
  const files = r.attachments.length ? ` [attachments: ${r.attachments.join(', ')}]` : ''
  return `U${r.u} [${mark}] ${r.at}${files}:\n${text}`
}

/** The active ledger whole when it fits, else the rows still open, the newest 20 and where the rest is. */
export function ledgerText(rows: readonly Row[], open: ReadonlySet<number>, path: string): string {
  const all = active(rows)
  const whole = all.map(render).join('\n\n')
  if (whole.length <= WHOLE_MAX) return whole
  const newest = new Set(all.slice(-NEWEST).map(r => r.u))
  const kept = all.filter(r => open.has(r.u) || newest.has(r.u))
  return `(${all.length - kept.length} older rows are not shown here; the whole ledger is ${path})\n\n${kept.map(render).join('\n\n')}`
}

/** Throws on a line that is not JSON: the caller marks the ledger broken rather than drop a row. */
export const parseRows = (text: string): Row[] =>
  text
    .split('\n')
    .filter(l => l.trim() !== '')
    .map(l => JSON.parse(l) as Row)
