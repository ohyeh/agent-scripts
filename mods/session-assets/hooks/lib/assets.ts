export type Kind = 'url' | 'artifact' | 'file' | 'image' | 'commit'

export type Asset = {
  kind: Kind
  /** What identifies it and what `open` gets: a URL, an absolute path, or a commit hash. */
  ref: string
  /** What it is: the Bash description, the artifact title, the file name, the commit subject. */
  label: string
  /** Where it lives: the host, the folder, or the branch. */
  where: string
  /** A URL on loopback, a private range or the tailnet; always true for a path. */
  isLocal: boolean
}

export type Entry = Asset & {
  /** Basename of the session's cwd. */
  project: string
  /** Last time seen, epoch ms. */
  at: number
}

/** One tool call as the mod sees it after the tool ran. */
export type Call = { tool: string; input: Record<string, unknown>; text: string; home: string; cwd: string; readOnly?: boolean }

/** Per session: the band shows a handful, the rest only scroll away. */
export const MAX_ENTRIES = 80
// shortcut: keeps at most 5 assets per tool result so a dumped page cannot flood the list; raise if real ones get dropped.
const PER_CALL = 5
// Tools whose output is file or page content: what they print is not something this session made.
const SKIP = new Set(['Read', 'Grep', 'Glob', 'WebFetch', 'WebSearch'])
// context-mode's reads: search an index or fetch a page.
const SKIP_RE = /^mcp__.*__ctx_(search|fetch_and_index|index)$/
/** A ref longer than this is not something a person opens; it would only fill the store. */
const MAX_REF = 2048
const WRITERS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit'])
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|heic)$/i

// A dev server prints its URL in ANSI colour, the port bold inside it: escapes go first, other control characters end a URL.
const ANSI_RE = /\u001b\[[0-9;?]*[ -\/]*[@-~]/g
const URL_RE = /\bhttps?:\/\/[^\s<>"'`|\\^{}\u0000-\u001f\u007f-\u009f]+/g
// An absolute or ~ path to a picture, as a screenshot tool prints it; `//` is a URL's tail (`https://h/x.png`), not a path.
const IMAGE_PATH_RE = /(?:^|[\s'"(=:])((?:~|\/(?!\/))[^\s'"<>()|:\u0000-\u001f]*\.(?:png|jpe?g|gif|webp|svg|heic))(?=$|[\s'")\],.;:])/gim
// `git commit` prints `[branch hash] subject`, `[branch (root-commit) hash]`, or `[detached HEAD hash]`.
const COMMIT_RE = /^\[([^\]\n]+?)(?: \(root-commit\))? ([0-9a-f]{7,40})\] (.+)$/m

/** Every asset one tool call made or printed, deduped by ref, first PER_CALL. */
export function assetsOf(c: Call): Asset[] {
  // A read-only call (Bash `cat`, `rg`) prints what it read, not what this session made.
  if (c.readOnly || SKIP.has(c.tool) || SKIP_RE.test(c.tool)) return []
  const out: Asset[] = []
  const add = (a: Asset) => {
    if (out.length < PER_CALL && a.ref.length <= MAX_REF && !out.some(x => x.ref === a.ref)) out.push({ ...a, label: a.label.slice(0, 200) })
  }
  const text = c.text.replace(ANSI_RE, '')
  const path = typeof c.input.file_path === 'string' ? c.input.file_path : typeof c.input.notebook_path === 'string' ? c.input.notebook_path : ''

  if (WRITERS.has(c.tool)) {
    if (path) add(fileAsset(path, c))
    return out
  }
  if (c.tool === 'Artifact') {
    const action = String(c.input.action ?? 'publish')
    const url = extractUrls(text)[0]
    if (action === 'publish' && !c.input.asset && url) {
      const title = typeof c.input.title === 'string' && c.input.title ? c.input.title : path ? basename(path) : 'artifact'
      add({ kind: 'artifact', ref: url, label: title, where: hostOf(url), isLocal: false })
    }
    return out
  }
  const label = labelOf(c)
  if (c.tool === 'Bash') {
    const commit = /\bgit\b[^\n]*\bcommit\b/.test(String(c.input.command ?? '')) ? COMMIT_RE.exec(text) : null
    if (commit) add({ kind: 'commit', ref: commit[2]!, label: commit[3]!.trim(), where: commit[1]!, isLocal: true })
    for (const m of text.matchAll(IMAGE_PATH_RE)) add(fileAsset(m[1]!, c))
  }
  for (const url of extractUrls(text)) add({ kind: 'url', ref: url, label, where: hostOf(url), isLocal: isLocalHost(hostOf(url)) })
  return out
}

/**
 * URLs and picture paths in prose: Claude's reply (`reply`) or the user's prompt (`you`).
 * The label is the rest of the URL's line, markdown and the URL taken out, so `Preview: <url>` reads `Preview`.
 */
export function assetsOfText(text: string, who: 'reply' | 'you', c: { home: string; cwd: string }): Asset[] {
  const out: Asset[] = []
  const plain = text.replace(ANSI_RE, '')
  for (const url of extractUrls(plain)) {
    if (out.length >= PER_CALL) break
    const line = plain.split('\n').find(l => l.includes(url)) ?? ''
    const said = clean(line.replace(url, ' ').replace(/[*_`#>\[\]()<>|]+|^\s*[-+]\s+/g, ' ').replace(/\s+/g, ' ').trim().replace(/\s*[:：—-]$/, ''), 60)
    if (url.length <= MAX_REF) out.push({ kind: 'url', ref: url, label: said ? `${who}: ${said}` : who, where: hostOf(url), isLocal: isLocalHost(hostOf(url)) })
  }
  for (const m of plain.matchAll(IMAGE_PATH_RE)) if (out.length < PER_CALL && !out.some(x => x.ref === m[1])) out.push({ ...fileAsset(m[1]!, c), label: `${who}: ${basename(m[1]!)}` })
  return out
}

/** One tool use as the transcript stored it, for the replay at session start. */
export type StoredUse = { tool: string; input: Record<string, unknown>; text?: string; isError?: true }

/**
 * What the transcript shows this session made, oldest first: each answered tool use and each reply's URLs.
 * User messages are left out: in the transcript they also carry reminders and notices, not only what the person typed.
 */
export function assetsOfTranscript(msgs: readonly { role: string; text: string; toolUses?: readonly StoredUse[] }[], c: { home: string; cwd: string }): Asset[] {
  const out: Asset[] = []
  for (const m of msgs) {
    if (m.role !== 'assistant') continue
    out.push(...assetsOfText(m.text, 'reply', c))
    for (const u of m.toolUses ?? []) if (!u.isError && typeof u.text === 'string') out.push(...assetsOf({ tool: u.tool, input: u.input ?? {}, text: u.text, ...c }))
  }
  return out
}

/** A Bash call's description, else its command head; another tool's name. */
function labelOf(c: Call): string {
  if (c.tool !== 'Bash') return c.tool.replace(/^mcp__/, '')
  return String(c.input.description || String(c.input.command ?? '').slice(0, 60) || 'Bash')
}

function fileAsset(path: string, c: { home: string; cwd: string }): Asset {
  const abs = path.startsWith('~/') && c.home ? `${c.home}${path.slice(1)}` : path
  return { kind: IMAGE_EXT.test(abs) ? 'image' : 'file', ref: abs, label: basename(abs), where: shortDir(abs.slice(0, abs.lastIndexOf('/')) || '/', c), isLocal: true }
}

/** A folder as the person reads it: `.` or `./sub` inside the session's cwd, `~/…` under home, else as is. */
export function shortDir(path: string, c: { home: string; cwd: string }): string {
  // macOS: /tmp and /var are /private/tmp and /private/var; a cwd and a tool path may spell them either way.
  const norm = (p: string) => p.replace(/^\/private(?=\/(?:tmp|var)(?:\/|$))/, '')
  const [dir, cwd] = [norm(path), norm(c.cwd)]
  if (cwd && dir === cwd) return '.'
  if (cwd && dir.startsWith(`${cwd}/`)) return `./${dir.slice(cwd.length + 1)}`
  return c.home && (dir === c.home || dir.startsWith(`${c.home}/`)) ? `~${dir.slice(c.home.length)}` : dir
}

const basename = (p: string) => p.slice(p.lastIndexOf('/') + 1) || p

/** URLs in text, trailing punctuation and unbalanced closers trimmed, deduped. */
export function extractUrls(text: string): string[] {
  const out: string[] = []
  for (const raw of text.replace(ANSI_RE, '').match(URL_RE) ?? []) {
    let url = raw.replace(/[.,;:!?'"*]+$/, '')
    while (/[)\]]$/.test(url) && count(url, url.endsWith(')') ? '(' : '[') < count(url, url.slice(-1))) url = url.slice(0, -1)
    if (hostOf(url) && !out.includes(url)) out.push(url)
  }
  return out
}

const count = (s: string, ch: string) => s.split(ch).length - 1

export function hostOf(url: string): string {
  const m = /^https?:\/\/(?:[^@/]*@)?(\[[^\]]+\]|[^/:?#]+)(:\d+)?/i.exec(url)
  return m ? (m[1] + (m[2] ?? '')).toLowerCase() : ''
}

/** Loopback, private ranges, CGNAT (the tailnet's 100.64/10) and *.local count as local. */
export function isLocalHost(host: string): boolean {
  const h = host.replace(/:\d+$/, '').replace(/^\[|\]$/g, '')
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h === '::1' || h === '0.0.0.0') return true
  const ip = /^(\d+)\.(\d+)\.\d+\.\d+$/.exec(h)
  if (!ip) return false
  const [a, b] = [Number(ip[1]), Number(ip[2])]
  return a === 127 || a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 100 && b >= 64 && b <= 127)
}

/** Newest first; an asset seen again moves to the top with its newest label. */
export function merge(list: readonly Entry[], fresh: readonly Entry[]): Entry[] {
  const refs = new Set(fresh.map(e => e.ref))
  return [...fresh, ...list.filter(e => !refs.has(e.ref))].slice(0, MAX_ENTRIES)
}

/** The band's glyph and colour per kind; a URL's colour says local or remote. */
export function glyphOf(a: Asset): [string, string] {
  switch (a.kind) {
    case 'url': return a.isLocal ? ['●', 'green'] : ['◆', 'cyan']
    case 'artifact': return ['◈', 'magenta']
    case 'image': return ['▣', 'yellow']
    case 'file': return ['▤', 'white']
    case 'commit': return ['⎇', 'blue']
  }
}

// Copied from grok-bot-watch hooks/lib/core.ts and register.ts: a plugin's cache holds only its own dir.
const CTRL_RE = /[\u0000-\u001f\u007f-\u009f]/g
export const clean = (s: string, max: number) => s.replace(CTRL_RE, ' ').slice(0, max)
/** Terminal cells: CJK and other fullwidth text takes 2. */
export const cells = (t: string) => [...t].reduce((n, ch) => n + (/[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/.test(ch) ? 2 : 1), 0)
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
/** Whole groups that fit in `room` lines; when some do not, the last line says how many are left. One line left: the newest row alone. */
export function cut<T>(groups: T[][], room: number, more: (n: number) => T): T[] {
  if (groups.flat().length <= room) return groups.flat()
  if (room <= 1) return groups[0]?.slice(0, Math.max(0, room)) ?? []
  const out: T[] = []
  let n = 0
  while (n < groups.length && out.length + groups[n]!.length <= room - 1) out.push(...groups[n++]!)
  // The newest row shows even when its open detail does not fit with it.
  if (!n) out.push(groups[n++]![0]!)
  return [...out, more(groups.length - n)]
}

export const ago = (ms: number) =>
  ms < 60_000 ? `${Math.max(0, Math.round(ms / 1000))}s` : ms < 3600_000 ? `${Math.round(ms / 60_000)}m` : ms < 86_400_000 ? `${Math.round(ms / 3600_000)}h` : `${Math.round(ms / 86_400_000)}d`
/**
 * Rows a drawn tree takes: a column stacks its children, a row is as tall as its tallest, a leaf is a line.
 * Assumes every Text fits its line; an engine element counts 0.
 */
export function rowsOf(n: unknown): number {
  if (Array.isArray(n)) return n.reduce((a: number, c) => a + rowsOf(c), 0)
  if (!n || typeof n !== 'object') return 0
  const el = n as { type?: string; children?: unknown; props?: { flexDirection?: string; children?: unknown } }
  if (el.type === 'engine') return 0
  if (el.type !== 'Box') return 1
  const kids = [el.children ?? el.props?.children].flat(9)
  return el.props?.flexDirection === 'column' ? kids.reduce((a: number, c) => a + rowsOf(c), 0) : Math.max(1, ...kids.map(rowsOf))
}
