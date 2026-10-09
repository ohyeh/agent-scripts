/** `source`: a page this session consulted (WebFetch, a fetched page, a link you pasted), kept apart from what it made. */
export type Kind = 'url' | 'artifact' | 'file' | 'image' | 'video' | 'commit' | 'source'

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
  /** Replayed from the transcript: `at` is the session's start, not when it was made. */
  replayed?: true
}

/** One tool call as the mod sees it after the tool ran. */
export type Call = {
  tool: string
  input: Record<string, unknown>
  text: string
  home: string
  cwd: string
  readOnly?: boolean
  /** Replayed from the transcript, which does not say what was read-only: what a call printed is not trusted, only what it did. */
  replay?: boolean
}

/** Per session: the band shows a handful, the rest only scroll away. */
export const MAX_ENTRIES = 80
// shortcut: keeps at most 5 assets per tool result so a dumped page cannot flood the list; raise if real ones get dropped.
const PER_CALL = 5
/** A call that prints more remote URLs than this printed a list. */
// shortcut: real deploys printed at most 2 (wrangler deploy, gh release create: 18 runs); raise it if a deploy prints more.
const LISTING = 4
// Tools whose output is file or page content: what they print is not something this session made.
const SKIP = new Set(['Read', 'Grep', 'Glob', 'WebFetch', 'WebSearch'])
// context-mode (it searches, fetches and analyses what is already there), an MCP tool named for a read (`get_…`,
// `search_threads`, `query-docs`, `peek`), a computer-use REPL (it prints the screen and every open tab), and this mod's
// own tool: its answer lists what is already kept.
const SKIP_RE = /^mcp__.*__(?:ctx_\w+|(?:get|list|search|read|query|fetch|find|lookup|resolve)[-_]\w[\w-]*|peek|tabs_context\w*)$|^mcp__codex-cu__js$|^mcp__session-recall__/
// A name that also makes something is not a read: `get_or_create_preview`, `fetch_and_deploy`.
const ACTS_RE = /(?:^|[-_])(?:create|deploy|publish|upload|send|write|launch|put|post)(?=$|[-_])/i
// A command that says it ships something: its URLs are what it made, however many (a deploy of five services).
// The verb as a word of the command (`wrangler pages deploy`, `gh release create`), or a deploy script (`deploy-web.sh`);
// not a path that only names it (`~/deploy-stash-1`).
const DEPLOY_RE = /(?:^|[\s;&|(])(?:deploy|publish|release|upload)(?=$|[\s;&|)])|(?:^|[\s/])deploy[\w-]*\.(?:sh|mjs|js|ts|py)\b/m
const CTX_RUN_RE = /^mcp__.*__ctx_(?:execute|batch_execute)$/
/** The shell a context-mode call ran: `code` in shell, or a batch's commands. Analysis in another language is none. */
const ctxCommand = (input: Record<string, unknown>) =>
  Array.isArray(input.commands) ? input.commands.map(x => String((x as { command?: unknown })?.command ?? '')).join('\n') : input.language === 'shell' && typeof input.code === 'string' ? input.code : ''
/** A ref longer than this is not something a person opens; it would only fill the store. */
const MAX_REF = 2048
const WRITERS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit'])
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|heic)$/i
const VIDEO_EXT = /\.(mp4|mov|m4v|webm|mkv)$/i
/** What a written file is worth a row for: something to read or open. Source code is churn the diff already shows. */
const DOC_EXT = /\.(md|markdown|html?|pdf|txt|rtf|csv|tsv|ipynb|docx?|xlsx?|pptx?|odt|ods|odp|key|pages|numbers|epub|mp3|wav|m4a|aac|flac|ogg)$/i

// A dev server prints its URL in ANSI colour, the port bold inside it: escapes go first, other control characters end a URL.
const ANSI_RE = /\u001b\[[0-9;?]*[ -\/]*[@-~]/g
// Fullwidth punctuation (`（`, `，`, `。`) ends a URL: in CJK prose it follows one with no space.
const URL_RE = /\bhttps?:\/\/[^\s<>"'`|\\^{}\u0000-\u001f\u007f-\u009f\u3000-\u303f\uff00-\uffef]+/g
// An absolute or ~ path to a picture or a video, as a screenshot tool prints it; `//` is a URL's tail (`https://h/x.png`), not a path.
// A path with spaces counts when quoted (`'/Desktop/IMG 1.png'`, a file dragged into the prompt) or escaped (`IMG\ 1.png`).
// Inside quotes a single space is part of the name; `;`, `*`, `[ ]` and two spaces are prose or a glob, not one file.
// After `\ ` a new path does not start: a line of `/a\ /a\ ` would otherwise rescan to its end from every `/`.
const IMAGE_PATH_RE = /(?:(['"])((?:~|\/(?!\/))(?:[^'"\s<>|;*[\]\u0000-\u001f]| (?! ))*\.(?:png|jpe?g|gif|webp|svg|heic|mp4|mov|m4v|webm|mkv))\1|(?:^|(?<!\\)[\s'"(=:])((?:~|\/(?!\/))(?:\\ |[^\s'"<>()|:*\u0000-\u001f])*\.(?:png|jpe?g|gif|webp|svg|heic|mp4|mov|m4v|webm|mkv))(?=$|[\s'")\],.;:]))/gim
/** The path an IMAGE_PATH_RE match names; an unquoted one is unescaped (inside quotes a backslash is literal). */
const mediaPath = (m: RegExpMatchArray) => m[2] ?? m[3]!.replace(/\\ /g, ' ')
// `git commit` prints `[branch hash] subject`, `[branch (root-commit) hash]`, or `[detached HEAD hash]`.
const COMMIT_RE = /^\[([^\]\n]+?)(?: \(root-commit\))? ([0-9a-f]{7,40})\] (.+)$/m

/** Every asset one tool call made or printed, deduped by ref, first PER_CALL. */
export function assetsOf(c: Call): Asset[] {
  // A fetch is read-only, but the page it was given is a source: what was consulted, not what its page contained.
  if (c.tool === 'WebFetch' || /^mcp__.*__ctx_fetch_and_index$/.test(c.tool)) {
    // context-mode also takes a batch: `requests: [{ url, source }]`.
    const asks = Array.isArray(c.input.requests) ? (c.input.requests as Record<string, unknown>[]) : [c.input]
    const out: Asset[] = []
    for (const r of asks) {
      const url = r && typeof r.url === 'string' ? r.url : ''
      if (!/^https?:\/\//i.test(url) || url.length > MAX_REF || out.length >= PER_CALL || out.some(x => x.ref === url)) continue
      const said = [r.prompt ?? c.input.prompt, r.source].find(v => typeof v === 'string' && v.trim())
      out.push({ kind: 'source', ref: url, label: typeof said === 'string' ? clean(said.trim(), 60) : hostOf(url), where: hostOf(url), isLocal: isLocalHost(hostOf(url)) })
    }
    return out
  }
  // A picture Read is one shown in the conversation; a file sent to the person is one they were meant to see.
  if (c.tool === 'Read' && typeof c.input.file_path === 'string' && (IMAGE_EXT.test(c.input.file_path) || VIDEO_EXT.test(c.input.file_path))) return [fileAsset(c.input.file_path, c)]
  if (c.tool === 'SendUserFile' && Array.isArray(c.input.files)) {
    const said = typeof c.input.caption === 'string' && c.input.caption.trim() ? clean(c.input.caption.trim(), 60) : ''
    const out: Asset[] = []
    for (const f of c.input.files) if (typeof f === 'string' && f.length <= MAX_REF && out.length < PER_CALL && !out.some(x => x.ref === fileAsset(f, c).ref)) out.push({ ...fileAsset(f, c), ...(said ? { label: said } : {}) })
    return out
  }
  // A read-only call (Bash `cat`, `rg`) prints what it read, not what this session made.
  // context-mode runs commands as well as analysis: a shell command that says it deploys or publishes is read as Bash.
  if (CTX_RUN_RE.test(c.tool)) {
    const command = ctxCommand(c.input)
    if (command && DEPLOY_RE.test(command)) return assetsOf({ ...c, tool: 'Bash', input: { ...c.input, command } })
  }
  if (c.readOnly || SKIP.has(c.tool) || (SKIP_RE.test(c.tool) && !ACTS_RE.test(c.tool.split('__').pop() ?? ''))) return []
  const out: Asset[] = []
  const add = (a: Asset) => {
    if (out.length < PER_CALL && a.ref.length <= MAX_REF && !out.some(x => x.ref === a.ref)) out.push({ ...a, label: a.label.slice(0, 200) })
  }
  // Not what the call made: the browser tab it ran in (Claude in Chrome ends every result with `• tabId 1: "title" ("url")`,
  // 63 rows for one form page in 14 days), and the docs link of an API error (`gh api`: `"documentation_url": "…"`).
  const text = c.text.replace(ANSI_RE, '').replace(/^\s*• tabId \d+: .*$/gm, '').replace(/"documentation_url"\s*:\s*"[^"]*"/g, '')
  const path = typeof c.input.file_path === 'string' ? c.input.file_path : typeof c.input.notebook_path === 'string' ? c.input.notebook_path : ''

  if (WRITERS.has(c.tool)) {
    if (path && (DOC_EXT.test(path) || IMAGE_EXT.test(path) || VIDEO_EXT.test(path))) add(fileAsset(path, c))
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
    const commit = /\bgit\b[^\n]*\bcommit\b/.test(withoutHeredocs(String(c.input.command ?? ''))) ? COMMIT_RE.exec(text) : null
    if (commit) add({ kind: 'commit', ref: commit[2]!, label: commit[3]!.trim(), where: commit[1]!, isLocal: true })
    if (pushIn(String(c.input.command ?? ''))) for (const a of pushedOf(text)) add(a)
  }
  // The engine does not mark every reader read-only (`tmux capture-pane | grep` printed another session's screen).
  if (c.tool === 'Bash' && isReader(String(c.input.command ?? ''))) return out
  // What the call was given is not what it made: `curl <url>`, or a tool that echoes its own code back.
  const given = JSON.stringify(c.input)
  // The command as typed, not JSON: `in\ 1.mov` is not doubled, and its unescaped form is checked too.
  const typed = Object.values(c.input).map(String).join('\n')
  // A picture a command saved (`saved to /tmp/shot.png`): the replay keeps it too, a picture path is rarely in a doc.
  if (c.tool === 'Bash') for (const m of text.matchAll(IMAGE_PATH_RE)) if (!typed.includes(m[2] ?? m[3]!) && !typed.includes(mediaPath(m))) add(fileAsset(mediaPath(m), c))
  if (c.replay) return out
  // A `.git` URL is a remote to clone or push to (`git push` prints `To <remote>`), not a page.
  // A test run prints its fixtures (`tui-smoke.sh` showed a screen of made-up rows): its URLs are not pages it made.
  if (c.tool === 'Bash' && isTestRun(String(c.input.command ?? ''))) return out
  const urls = extractUrls(text).filter(url => !given.includes(url) && !isLocalNoise(url) && !/\.git\/?$/.test(url))
  // More remote URLs than a deploy prints (a page and its preview) is a list it printed: an index, a catalog, a scan of a
  // transcript; its links are data, not what the call made. A dev server's local URLs stay (`--host` prints one per
  // network interface).
  const listing = urls.filter(url => !isLocalHost(hostOf(url))).length > LISTING && !(c.tool === 'Bash' && DEPLOY_RE.test(String(c.input.command ?? '')))
  for (const url of urls) if (!listing || isLocalHost(hostOf(url))) add({ kind: 'url', ref: url, label, where: hostOf(url), isLocal: isLocalHost(hostOf(url)) })
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
    const said = clean(line.replace(URL_RE, ' ').replace(/[*_`#>\[\]()<>|]+|^\s*[-+]\s+/g, ' ').replace(/\s+/g, ' ').trim().replace(/\s*[:：—-]$/, ''), 60)
    if (url.length <= MAX_REF && !isLocalNoise(url)) out.push({ kind: 'url', ref: url, label: said ? `${who}: ${said}` : who, where: hostOf(url), isLocal: isLocalHost(hostOf(url)) })
  }
  for (const m of plain.matchAll(IMAGE_PATH_RE)) {
    // Compared as stored: `~/a.png` is kept as the home path.
    const a = fileAsset(mediaPath(m), c)
    if (out.length < PER_CALL && !out.some(x => x.ref === a.ref)) out.push({ ...a, label: `${who}: ${a.label}` })
  }
  return out
}

/**
 * The local URLs a test run printed: its fixtures. A reply that repeats one is talking about the test, not a page it
 * made. A remote one stays: an e2e run against the real site prints the site.
 */
export function testUrlsOf(tool: string, input: Record<string, unknown>, text: string): string[] {
  return tool === 'Bash' && isTestRun(String(input.command ?? '')) ? extractUrls(text).filter(url => isLocalHost(hostOf(url))) : []
}

/** One tool use as the transcript stored it, for the replay at session start. */
export type StoredUse = { tool: string; input: Record<string, unknown>; text?: string; isError?: true }

/**
 * What the transcript shows this session made, oldest first: each answered tool use and each reply's URLs.
 * User messages are left out: in the transcript they also carry reminders and notices, not only what the person typed.
 */
export function assetsOfTranscript(msgs: readonly { role: string; text: string; toolUses?: readonly StoredUse[] }[], c: { home: string; cwd: string }, extra: (u: StoredUse) => readonly Asset[] = () => [], muted = new Set<string>(), live = false): Asset[] {
  const out: Asset[] = []
  for (const m of msgs) {
    if (m.role !== 'assistant') continue
    // As live: a reply adds only a URL nothing named before, so it never turns an artifact or a tool's URL into `reply: …`;
    // a page Claude read (a source) is the exception, it becomes the link the reply points at.
    out.push(...assetsOfText(m.text, 'reply', c).filter(a => !muted.has(a.ref) && !out.some(x => x.ref === a.ref && x.kind !== 'source')))
    // As live, a test's URLs are muted for its turn only: a reply with no tool use ends it.
    if (!m.toolUses?.length) muted.clear()
    for (const u of m.toolUses ?? []) for (const url of testUrlsOf(u.tool, u.input ?? {}, u.text ?? '')) muted.add(url)
    // `extra` (a push git named) never repeats what assetsOf found in the same call: that needs a `To` line, it lacks one.
    // A Read of a picture or a sent file needs no text: an image result has none to give.
    for (const u of m.toolUses ?? []) if (!u.isError && (typeof u.text === 'string' || u.tool === 'Read' || u.tool === 'SendUserFile')) out.push(...assetsOf({ tool: u.tool, input: u.input ?? {}, text: u.text ?? '', ...c, replay: !live }), ...extra(u).filter(a => !out.some(x => x.ref === a.ref)))
  }
  return out
}

/** What the call said it was for (`description`, `intent`, `title`), else a Bash command's head, else the tool's own name. */
export function labelOf(c: Pick<Call, 'tool' | 'input'>): string {
  const said = ['description', 'intent', 'title'].map(k => c.input[k]).find(v => typeof v === 'string' && v.trim())
  if (said) return String(said)
  if (c.tool === 'Bash') return String(c.input.command ?? '').slice(0, 60) || 'Bash'
  return c.tool.split('__').pop() || c.tool
}

function fileAsset(path: string, c: { home: string; cwd: string }): Asset {
  const abs = path.startsWith('~/') && c.home ? `${c.home}${path.slice(1)}` : path
  return { kind: IMAGE_EXT.test(abs) ? 'image' : VIDEO_EXT.test(abs) ? 'video' : 'file', ref: abs, label: basename(abs), where: shortDir(abs.slice(0, abs.lastIndexOf('/')) || '/', c), isLocal: true }
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

/** URLs in text, trailing punctuation and unbalanced closers trimmed, deduped, login walls dropped. */
export function extractUrls(text: string): string[] {
  const out: string[] = []
  const plain = text.replace(ANSI_RE, '')
  for (const hit of plain.matchAll(URL_RE)) {
    const raw = hit[0]
    // A URL built in code or prose (`/a/<id>`, `/p/${name}`, `'/p/' + name`) is a pattern, not a page.
    if (/\$$/.test(raw) || /^(?:[<{]|['"`]\s*\+)/.test(plain.slice(hit.index! + raw.length))) continue
    let url = raw.replace(/[.,;:!?'"*]+$/, '')
    while (/[)\]]$/.test(url) && count(url, url.endsWith(')') ? '(' : '[') < count(url, url.slice(-1))) url = url.slice(0, -1)
    if (hostOf(url) && !out.includes(url) && !isAuthWall(url)) out.push(url)
  }
  return out
}

const count = (s: string, ch: string) => s.split(ch).length - 1

/**
 * What a blocked request printed instead of the page: a Cloudflare endpoint (`/cdn-cgi/` challenge, Access login,
 * trace; an image resize there is a picture, kept) or a login page that sends you back (`?redirect_uri=`, `?next=`).
 */
export const isAuthWall = (url: string): boolean =>
  /^https?:\/\/[^/?#]+\/(?:[^?#]*\/)?cdn-cgi\/(?!image\/)/i.test(url) ||
  (/\/(?:log-?in|sign-?in|sign_in)\b/i.test(url) && /[?&](?:redirect(?:_ur[il])?|return_?to|returnTo|next|continue)=/i.test(url))

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
  // Pushes that follow on from each other (`a..b`, then `b..c` on one branch) are one compare view, `a..c`: one row, not one per push.
  const chained = fresh.map(e => {
    const m = e.label.startsWith('push: ') ? COMPARE_RE.exec(e.ref) : null
    const prev = m && list.find(x => COMPARE_RE.exec(x.ref)?.[1] === m[1] && COMPARE_RE.exec(x.ref)?.[3] === m[2] && x.label.startsWith('push: ') && x.label.split(' ')[1] === e.label.split(' ')[1])
    if (!m || !prev) return e
    const from = COMPARE_RE.exec(prev.ref)![2]!
    return { ...e, ref: `${m[1]}${from}...${m[3]}`, label: e.label.replace(/\S+\.\.\S+$/, `${from.slice(0, 7)}..${m[3]!.slice(0, 7)}`), drop: prev.ref }
  })
  const refs = new Set(chained.flatMap(e => ('drop' in e ? [e.ref, e.drop] : [e.ref])))
  return [...chained.map(({ drop: _, ...e }: Entry & { drop?: string }) => e), ...list.filter(e => !refs.has(e.ref))].slice(0, MAX_ENTRIES)
}
const COMPARE_RE = /^(https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/compare\/)([0-9a-f]{7,40})\.\.\.([0-9a-f]{7,40})$/

/** What the band names a row by: the thing itself. A URL is its host and path (`localhost:5173/app`), anything else its label. */
export function nameOf(x: Asset): string {
  if (x.kind !== 'url' || x.label.startsWith('push: ')) return x.label
  return x.ref.replace(/^https?:\/\/(?:[^@/]*@)?/i, '').replace(/[?#].*$/, '').replace(/\/$/, '')
}

/** The band's glyph and colour per kind; a URL's colour says local or remote. */
export function glyphOf(a: Asset): [string, string] {
  switch (a.kind) {
    case 'url': return a.isLocal ? ['●', 'green'] : ['◆', 'cyan']
    case 'artifact': return ['◈', 'magenta']
    case 'image': return ['▣', 'yellow']
    case 'video': return ['▶', 'yellow']
    case 'file': return ['▤', 'white']
    case 'commit': return ['⎇', 'blue']
    case 'source': return ['◇', 'gray']
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

/** `#a3` in a prompt: the person pointing at row 3 of the band. `#123` (an issue) is not one. */
export function refsIn(text: string): number[] {
  const out: number[] = []
  for (const m of text.matchAll(/(?:^|[\s(（,，])#a(\d{1,3})\b/g)) if (!out.includes(Number(m[1]))) out.push(Number(m[1]))
  return out
}

/** The local port a URL is served on, or undefined when it is not local. */
export function localPort(e: Asset): number | undefined {
  if ((e.kind !== 'url' && e.kind !== 'source') || !e.isLocal) return undefined
  const m = /^(https?):\/\/(?:[^@/]*@)?(?:\[[^\]]+\]|[^/:?#]+)(?::(\d+))?/i.exec(e.ref)
  return m ? Number(m[2] ?? (m[1]!.toLowerCase() === 'https' ? 443 : 80)) : undefined
}

/** `lsof -Fpc` output: the first listening process. */
export function parseListen(out: string): { pid: number; command: string } | undefined {
  const pid = /^p(\d+)$/m.exec(out)?.[1]
  return pid ? { pid: Number(pid), command: /^c(.+)$/m.exec(out)?.[1] ?? '?' } : undefined
}

/** `lsof -d cwd -Fn` output: the process's folder (the `n` line after `fcwd`). */
export function parseCwd(out: string): string | undefined {
  const lines = out.split('\n')
  const at = lines.indexOf('fcwd')
  return at >= 0 && lines[at + 1]?.startsWith('n') ? lines[at + 1]!.slice(1) : undefined
}

/** Entries whose kind matches and whose label, ref, place or project holds every word of the query. */
export function findAssets<T extends Entry>(list: readonly T[], q: { query?: string; kind?: string }): T[] {
  const words = (q.query ?? '').toLowerCase().split(/\s+/).filter(Boolean)
  return list.filter(x => (!q.kind || x.kind === q.kind) && words.every(w => `${x.label} ${x.ref} ${x.where} ${x.project}`.toLowerCase().includes(w)))
}

/**
 * A local URL nobody opens: an ephemeral port (a debugger, a test server: 12,554 of 16,000 local URLs in 300 sessions'
 * tool output), or a file a page loads (`/assets/x.js`, `/data/a.json`). A page (`/`, `/app`, `/x.html`) is kept.
 */
export function isLocalNoise(url: string): boolean {
  if (!isLocalHost(hostOf(url))) return false
  const m = /^https?:\/\/(?:[^@/]*@)?(?:\[[^\]]+\]|[^/:?#]+)(?::(\d+))?([^?#]*)/i.exec(url)
  if (!m) return false
  if (Number(m[1] ?? 0) >= 49152) return true
  const ext = /\.([a-z0-9]{1,5})$/i.exec(m[2] ?? '')?.[1]?.toLowerCase()
  return ext !== undefined && ext !== 'html' && ext !== 'htm'
}

/** A commit hash someone pasted: 7-40 hex characters with a letter and a digit, not part of a longer word or a UUID. */
export function shasIn(text: string): string[] {
  const out: string[] = []
  for (const m of text.matchAll(/(?<![0-9A-Za-z-])[0-9a-f]{7,40}(?![0-9A-Za-z-])/g)) if (/[a-f]/.test(m[0]) && /\d/.test(m[0]) && !out.includes(m[0])) out.push(m[0])
  return out
}

/** A session id someone pasted (`sid: 77e282e3-…`). */
export const sessionIdsIn = (text: string) => [...new Set(text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g) ?? [])]

// Programs that only print what they read; `tmux` and `git` count only with a reading subcommand.
// shortcut: `printf > file` writes, but prints no URL; split it out if one does.
const READERS = /^(?:cat|head|tail|sed|less|grep|rg|jq|yq|wc|sort|uniq|cut|awk|bat|ls|cd|echo|sleep|true|diff|comm|find|fd|stat|file|du|tr|column|nl|printf|basename|dirname|realpath|which|tmux (?:capture-pane|ls|list-\w+)|git (?:log|show|diff|blame|status|grep))$/
// Readers that print a file or a screen (`agent-browser eval` returns a page's text): by name and positional arguments (a filter's first one is its pattern or script).
const SHOWS = /^(?:tmux capture-pane|agent-browser (?:eval|snapshot|get)|git (?:log|show|diff|blame|grep))$/
// A test runner by name (`npm test`, `pytest`), or a script that says it is one: named `*-smoke`, `test-*`, or in `tests/`.
const TEST_RUNNERS = /^(?:npx )?(?:(?:npm|pnpm|yarn|bun) (?:run )?test|pytest|vitest|jest|go test|cargo test|node --test|claude plugin test)(?: |$)/
const TEST_SCRIPT = /(?:^|\/)(?:tests?\/[^/]+|(?:[^/]*[._-])?(?:tests?|smoke|spec)(?:[._-][^/]*)?)$/
// An interpreter runs the script it is given: `bash tests/x.sh` is the script's run.
const INTERPRETERS = /^(?:bash|sh|zsh|node|python3?|bun|deno|tsx|ruby)$/
const base = (x: string) => x.split('/').pop()!
/**
 * A program that runs tests. Through an interpreter (`/bin/bash`, `env CI=1 node`) every word it is given must be a
 * test's: which one is the main script is not known without each option's arity (`node --require ./x.cjs main.mjs`).
 * Unsure keeps the URLs: a fixture row costs less than a real link gone.
 */
const isTest = (words: string[]) => {
  const w = base(words[0]!) === 'env' ? words.slice(1).filter(a => !a.startsWith('-') && !/^\w+=/.test(a)) : words
  if (!w.length) return false
  if (TEST_RUNNERS.test(w.slice(0, 4).join(' '))) return true
  if (!INTERPRETERS.test(base(w[0]!))) return TEST_SCRIPT.test(w[0]!)
  // Every word it is given, quoted code (`-e '…'`, read as `Q`) and a bare entrypoint (`server`) too.
  const args = w.slice(1).filter(a => !a.startsWith('-') && !/^\d*[<>]/.test(a))
  return args.length > 0 && args.every(f => TEST_SCRIPT.test(f.replace(/\.\w+$/, '')) || TEST_SCRIPT.test(f))
}
/**
 * Every program in the command, filters and `cd` aside, runs tests: what it printed is fixture data. Only the file name
 * and its folder count (`/work/test-site/…/vite` is a dev server). A test next to anything else (`npm test && npm run
 * dev`) keeps its URLs: its output has no line between the two.
 */
export function isTestRun(command: string): boolean {
  const progs = segmentsOf(command).filter(w => !READERS.test(w[0]!))
  return progs.length > 0 && progs.every(isTest)
}
/** The command's programs, each as its words: heredoc bodies and quoted text out, leading `VAR=x` assignments dropped. */
const segmentsOf = (command: string, outer = false) =>
  ((s: string) => outer ? capturedOut(s) : s)(quoted(withoutHeredocs(command)))
    // `diff <(cut a) <(cut b)` and `x=$(curl …)` run programs inside the brackets too.
    .split(/&&|\|\||[;|\n]|[<>$]?\(|\)/)
    .map(seg => seg.trim().replace(/^(?:\w+=\S*(?:\s+|$))*(?:timeout\s+(?:-\S+\s+)*\S+\s+)?/, '').split(/\s+/).filter(Boolean))
    .filter(w => w.length)
/** Quoted text is not a program, but `"$(curl …)"` runs one: a double quote keeps its `$( )`. */
const quoted = (s: string) => s.replace(/"((?:[^"\\]|\\.)*)"|'[^']*'/g, (_, d?: string) => ['Q', ...(d?.match(/\$\([^()]*\)/g) ?? [])].join(' '))
/** The command with what `$( )` and `<( )` capture taken out: those programs print into the command, not to you. */
const capturedOut = (s: string): string => { const t = s.replace(/[<$]\([^()]*\)/g, 'Q'); return t === s ? s : capturedOut(t) }
/** The command without its heredoc bodies: text a program reads (`python3 - <<'EOF' … EOF`), not commands. */
const withoutHeredocs = (command: string) => command.replace(/<<-?\s*(['"]?)(\w+)\1[^\n]*\n[\s\S]*?\n\s*\2\s*(?=\n|$)/g, '')

// shortcut: an option's detached value counts as a positional unless it is a number (`tail -n 30`, `grep -A 4`); `grep -e pat` on a pipe reads as a file, add option arity if that drops real URLs.
const FILE_ARGS: Record<string, number> = { cat: 1, head: 1, tail: 1, less: 1, bat: 1, sed: 2, grep: 2, rg: 2, jq: 2, yq: 2, awk: 2 }
/**
 * What the command printed is something it read: every program in it only reads (`tmux capture-pane | grep`), or one
 * of them prints a file or a screen (`git push && rg url docs.d.ts`). A commit or a push is read before this, from its
 * own lines.
 */
export function isReader(command: string): boolean {
  // `ssh host '<cmd>'` prints what `<cmd>` prints there.
  const remote = /^\s*(?:timeout\s+\S+\s+)?ssh\s+(?:-\S+(?:\s+(?!-)[^\s'"]+)?\s+)*[^\s'"-]\S*\s+(['"])([\s\S]*)\1(?:\s+\d?>&?\s*\S+)*\s*$/.exec(command)
  if (remote) return isReader(remote[2]!)
  const progs = segmentsOf(command)
  // Only what reaches the screen counts as printed: `U=$(jq -r .url r.json)` reads a file into a variable.
  const shows = (w: string[]) => SHOWS.test(`${w[0]} ${w[1] ?? ''}`) || w.slice(1).filter(a => !a.startsWith('-') && !/^\d+$/.test(a)).length >= (FILE_ARGS[w[0]!] ?? Infinity)
  // `find -exec wrangler deploy {} \;` and `fd -x wrangler deploy` run a program; `-delete` changes the disk.
  const runs = (w: string[]) => (w[0] === 'find' && w.some(a => /^-(?:exec|execdir|ok|okdir|delete)$/.test(a))) || (w[0] === 'fd' && w.some(a => /^(?:-[a-zA-Z]*[xX]|--exec(?:-batch)?)$/.test(a)))
  const reads = (w: string[]) => (READERS.test(w[0]!) && !runs(w)) || READERS.test(`${w[0]} ${w[1] ?? ''}`)
  return progs.length > 0 && (progs.every(reads) || segmentsOf(command, true).some(shows))
}

/** `/recall list` groups by when: today, this week, older (a replayed entry has no time of its own). */
export function bucketOf(x: Entry, now: number): 'today' | 'this week' | 'older' {
  if (x.replayed) return 'older'
  if (new Date(x.at).toDateString() === new Date(now).toDateString()) return 'today'
  return now - x.at < 7 * 86_400_000 ? 'this week' : 'older'
}

// `git push` to GitHub prints `To <remote>` and one line per ref: `a..b  main -> main`, `* [new tag]  v1 -> v1`.
const GITHUB_REMOTE_RE = /^(?:https:\/\/github\.com\/|(?:ssh:\/\/)?git@github\.com[:/])([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/
const PUSH_REF_RE = /^\s*(?:\+\s*)?(?:([0-9a-f]{7,40})\.\.\.?([0-9a-f]{7,40})|\* \[new (tag|branch)\])\s+\S+ -> (\S+)/gm
/** `owner/repo` of a GitHub remote URL, as `git remote get-url` or a push's `To` line gives it. */
export const githubRepoOf = (remote: string) => GITHUB_REMOTE_RE.exec(remote.trim())?.[1]
/**
 * What a push put on GitHub, as the page that shows it: the compare view, the new branch, the tag's release page.
 * The repo is the `To` line's; `repo` stands in when the output lost that line (`git push | tail -1`).
 */
export function pushedOf(text: string, repo = githubRepoOf(/^To (\S+)$/m.exec(text)?.[1] ?? '')): Asset[] {
  if (!repo) return []
  const out: Asset[] = []
  for (const m of text.matchAll(PUSH_REF_RE)) {
    const [, from, to, made, dst] = m
    const ref = made === 'tag' ? `https://github.com/${repo}/releases/tag/${dst}` : made ? `https://github.com/${repo}/tree/${dst}` : `https://github.com/${repo}/compare/${from}...${to}`
    const label = made ? `push: new ${made} ${dst}` : `push: ${dst} ${from!.slice(0, 7)}..${to!.slice(0, 7)}`
    out.push({ kind: 'url', ref, label, where: 'github.com', isLocal: false })
  }
  return out
}

/**
 * The first `git [-C dir] push` the command runs that is not a dry run (a dry run prints the same lines for a push that
 * did not happen), and the command without its heredoc bodies.
 */
function pushIn(command: string): { push: RegExpMatchArray; command: string } | undefined {
  const run = withoutHeredocs(command)
  const push = [...run.matchAll(/\bgit\b((?:\s+-C\s+\S+)?)\s+push\b([^;&|\n]*)/g)].find(m => !/\s(?:--dry-run|-n)\b/.test(m[2]!))
  return push && { push, command: run }
}

/**
 * A push whose output lost its `To` line but kept ref lines: where to ask for the remote, `git -C <dir> remote get-url
 * <remote>`. The folder is the command's leading `cd` (else the session's), the remote the word after `push` (else origin).
 */
export function pushRemoteOf(command: string, text: string, c: { home: string; cwd: string }): { dir: string; remote: string } | undefined {
  if (/^To \S+$/m.test(text) || !new RegExp(PUSH_REF_RE.source, 'm').test(text)) return undefined
  const run = pushIn(command)
  if (!run) return undefined
  const { push } = run
  const remote = push[2]!.split(/\s+/).find(w => w && !w.startsWith('-') && !/[<>]/.test(w)) ?? 'origin'
  const cd = /^\s*cd\s+("[^"]+"|'[^']+'|\S+)\s*&&/.exec(run.command)?.[1]?.replace(/^["']|["']$/g, '')
  const where = push[1]!.trim().replace(/^-C\s+/, '') || cd || '.'
  const abs = where.startsWith('~') ? `${c.home}${where.slice(1)}` : where.startsWith('/') ? where : `${c.cwd}/${where}`
  return { dir: abs.replace(/\/\.$/, ''), remote }
}
