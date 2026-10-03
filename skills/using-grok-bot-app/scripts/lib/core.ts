// The Grok Bot row model shared by the global TUI (lib/tui.node.ts) and the
// grok-bot-watch mod. Source of truth: this file. The mod imports a
// byte-identical copy from mods/grok-bot-watch/hooks/lib/ (scripts/sync-mod-core).
// Pure: no engine, no I/O, erasable TypeScript only (Node runs it unbundled).

/** One sidebar entry, as scripts/sidebar.mjs reads it. */
export type Row = { id: string; name: string; unread: boolean; preview: string; busy: string | null; current: boolean }
export type Msg = { who: string; text: string; at: string }
/** convo: the last messages of the bot open in the app (the row with current), from its transcript. */
export type Read = { state: string; rows?: Row[]; convo?: Msg[]; error?: string }

export const UUID_RE = /^[0-9a-f-]{8,36}$/
export const FULL_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
// eslint-disable-next-line no-control-regex
const CTRL_RE = /[\u0000-\u001f\u007f-\u009f]/g

/** A reply is done: not streaming, not the user's draft, not empty. A row with no state element (NOTE, seen live) counts as idle. */
export const settled = (r: Row) => (r.busy === 'idle' || r.busy === null) && r.preview !== '' && !r.preview.startsWith('Draft:')
/** Before a baseline exists, only a reply in progress (or a bot with no reply yet) makes the next settled read new; a draft does not. */
export const inProgress = (r: Row) => (r.busy !== 'idle' && r.busy !== null) || r.preview === ''

/** What the row itself says right now, before any watch state: a draft or a reply streaming. Undefined = at rest. */
export function liveState(r: Row): { glyph: string; color: string; state: string } | undefined {
  if (!settled(r) && !inProgress(r)) return { glyph: '●', color: 'green', state: 'draft in composer' }
  if (r.busy !== 'idle' && r.busy !== null) return { glyph: '◐', color: 'cyan', state: 'replying' }
  return undefined
}

/** App text made safe for one line: control characters out, code fences broken, cut to max. */
export const clean = (s: string, max: number) => s.replace(CTRL_RE, ' ').replaceAll('```', "'''").slice(0, max)

/** Terminal cells: CJK and other fullwidth text takes 2. */
export const cells = (t: string) => [...t].reduce((n, ch) => n + (/[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/.test(ch) ? 2 : 1), 0)
/** The longest prefix of t that fits in max cells, with … when cut. */
export function fit(t: string, max: number): string {
  if (cells(t) <= max) return t
  let out = ''
  for (const ch of t) {
    if (cells(out + ch) + 1 > max) break
    out += ch
  }
  return max > 0 ? `${out}…` : ''
}

export const ago = (ms: number) => (ms < 60_000 ? `${Math.max(0, Math.round(ms / 1000))}s` : ms < 3600_000 ? `${Math.round(ms / 60_000)}m` : `${Math.round(ms / 3600_000)}h`)
