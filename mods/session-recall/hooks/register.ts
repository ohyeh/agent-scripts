import type { EngineInterface, Register } from 'claude-code'

import { type Asset, MAX_ENTRIES, type Entry, type StoredUse, ago, nameOf, assetsOf, bucketOf, labelOf, assetsOfText, assetsOfTranscript, testUrlsOf, cells, clean, cut, findAssets, fit, githubRepoOf, glyphOf, localPort, merge, parseCwd, parseListen, pushedOf, pushRemoteOf, refsIn, rowsOf, sessionIdsIn, shasIn, shortDir } from './lib/assets.ts'
import { answerId, itemsOf, quoteOf } from './lib/items.ts'

const MOD_VERSION = '0.9.10'
/** The model calls it as this: `mcp__<plugin>__<name>`. */
const TOOL = 'mcp__session-recall__recall'
/** Checks run per answer at most: each local URL is two `lsof` runs. */
const MAX_CHECKS = 10
/** One store key per session: a shared list would be a read-modify-write race between sessions. */
const PREFIX = 'session-recall.s.'
const PANEL_KEY = 'session-recall.panel'
const PRUNE_MS = 30 * 86_400_000
/** Rows the band takes at most: header + this many entries; an open row and the other sessions add their own. */
const PANEL_ROWS = 4
const OTHER_ROWS = 4
const ACCENT = 'blue'
/** Answers the TUI offers to quote from: 31% of quoted lines came from an older answer, the furthest 15 back. */
const MAX_ANSWERS = 16
/** A request's bounds: quotes are lines of an answer; one past these is refused, never cut (a cut quote says less). */
const MAX_QUOTES = 60
const MAX_QUOTE = 4000
const MAX_ASK_BYTES = 300_000
/** How often the mod looks for a request from the TUI (a stat, a read only when it changed). */
const POLL_MS = 500

type $ = EngineInterface
type State = {
  sid: string
  project: string
  cwd: string
  home: string
  /** Index (0-based) of the open row in this session's list. */
  open?: number
  hidden: boolean
  others: boolean
  writes: Promise<unknown>
  /** Newest first: each answer of the main loop that has lines to quote. `at` 0 is an answer from before a reload. */
  answers: { id: string; at: number; items: string[] }[]
  /** The TUI's requests this load has taken (each is done once), and answers not written yet (path → answer). */
  handled: Set<string>
  unacked: Map<string, string>
  /** Local URLs test runs printed this turn: the turn's reply that repeats one adds no row. */
  muted: Set<string>
}

/** Where the mod and its TUI meet: the TUI reads `<sid>.json` and writes `<sid>.ask.json`; the store is the host's. */
const dirOf = (s: State) => `${s.home}/.local/state/session-recall`
const snapPath = (s: State) => `${dirOf(s)}/${s.sid}.json`
/**
 * A request is a file of its own, `<sid>.ask/<time>-<pid>-<n>.json`: no TUI can write over another's. Its answer, `{ ok,
 * text }`, goes to `<sid>.done/` under the same name; the TUI says sent only on `ok`, and removes both.
 */
const askDir = (s: State) => `${dirOf(s)}/${s.sid}.ask`
const doneDir = (s: State) => `${dirOf(s)}/${s.sid}.done`
const ASK_NAME = /^(\d{13})-(\d+)-(\d+)\.json$/
/** A request older than this is refused, not done: one left from before a reload must not fill the prompt now. */
const MAX_ASK_AGE_MS = 30_000

/** What the TUI shows: this session's list, numbered as the band numbers it, and the lines of its last answers. */
async function snapshot(s: State, $: $, list?: Entry[]) {
  try {
    const assets = list ?? (await mine(s, $))
    await $.fs.write(snapPath(s), JSON.stringify({ v: 1, version: MOD_VERSION, sid: s.sid, project: s.project, cwd: s.cwd, assets, answers: s.answers }))
  } catch (err) {
    $.ui.log(`session-recall: TUI snapshot not written (${errText(err)})`, { to: 'debug' })
  }
}

function addAnswer(s: State, text: string, at: number) {
  const items = itemsOf(text)
  if (items.length) s.answers = [{ id: answerId(items), at, items }, ...s.answers].slice(0, MAX_ANSWERS)
}

/**
 * The TUI's requests: quotes, or a row by its exact ref, into the prompt, where only the mod can put text (a paste of
 * several lines folds into `[Pasted text]` and loses the room to answer each one). Each one is the TUI's input, checked
 * here, the one place it enters: a bad one is refused whole, never cut. Each is answered, failed ones too, so the TUI
 * keeps the selection to send again; one with an answer already is not done again.
 */
async function poll(s: State, $: $) {
  // An answer whose write failed: written again, the request never done again.
  // Each on its own: one that still fails must not hold up the others or the new requests.
  for (const [out, text] of s.unacked) {
    await $.fs.write(out, text).then(() => s.unacked.delete(out), err => $.ui.log(`session-recall: TUI answer still not written (${errText(err)})`, { to: 'debug' }))
  }
  const asks = (await $.fs.list(askDir(s)).catch(() => [])).flatMap(e => {
    const m = e.kind === 'file' ? ASK_NAME.exec(e.name) : null
    return m ? [{ e, key: m.slice(1).map(Number) }] : []
  })
  // In the order they were made: time, then TUI, then its own count (a string sort puts -10 before -9).
  asks.sort((x, y) => x.key[0]! - y.key[0]! || x.key[1]! - y.key[1]! || x.key[2]! - y.key[2]!)
  for (const { e, key } of asks) {
    if (s.handled.has(e.name)) continue
    s.handled.add(e.name)
    const out = `${doneDir(s)}/${e.name}`
    // An answer there, or the mark of one taken: done (or begun) before, maybe by the last load.
    if (await $.fs.exists(out)) continue
    const said = JSON.stringify(await take(s, $, `${askDir(s)}/${e.name}`, out, e.size, key[0]!, await $.clock.now()))
    await $.fs.write(out, said).catch(err => {
      s.unacked.set(out, said)
      $.ui.log(`session-recall: TUI answer not written, again at the next look (${errText(err)})`, { to: 'debug' })
    })
  }
}

/** One request: what to tell its TUI. */
async function take(s: State, $: $, path: string, out: string, size: number, made: number, now: number): Promise<{ ok: boolean; text: string }> {
  if (now - made > MAX_ASK_AGE_MS) return { ok: false, text: 'too old (the session was not listening): check the prompt, then send again' }
  let ask: { quote?: unknown; ref?: unknown }
  try {
    if (size > MAX_ASK_BYTES) throw new Error(`${size} bytes`)
    const got: unknown = JSON.parse(String(await $.fs.read(path)))
    if (!got || typeof got !== 'object' || Array.isArray(got)) throw new Error('not an object')
    ask = got
  } catch (err) {
    return { ok: false, text: `refused: not a request (${errText(err)})` }
  }
  let text = ''
  let said = ''
  const quote = ask.quote
  if (Array.isArray(quote)) {
    if (!quote.length || quote.length > MAX_QUOTES || !quote.every(x => typeof x === 'string' && x.length > 0 && x.length <= MAX_QUOTE)) return { ok: false, text: `refused: 1 to ${MAX_QUOTES} quotes of at most ${MAX_QUOTE} characters` }
    text = quoteOf(quote)
    said = `${quote.length} quote(s) in the prompt: write under each one.`
  } else if (typeof ask.ref === 'string') {
    // The row by what it is, not by its number on the TUI's screen: a new asset since then moved the numbers.
    const n = (await mine(s, $)).findIndex(x => x.ref === ask.ref) + 1
    if (!n) return { ok: false, text: 'that row is gone from the list' }
    text = `#a${n} `
    said = `#a${n} is in the prompt: write the rest.`
  } else return { ok: false, text: 'refused: no quote or ref' }
  // Marked taken before the fill: a load that stops between the fill and its answer leaves the mark, and the next load
  // does not fill it again. No mark, no fill.
  try {
    await $.fs.write(out, JSON.stringify({ taking: true }))
  } catch (err) {
    return { ok: false, text: `not done: could not mark it taken (${errText(err)})` }
  }
  const f = await $.prompt.fill({ text, mode: 'insert' }).catch(() => ({ isFilled: false }))
  if (!f.isFilled) return { ok: false, text: 'no prompt box took it (a dialog open?): send it again' }
  $.ui.toast(said)
  return { ok: true, text: said }
}

/** A shell word: the TUI command runs in a shell (tmux's split, or a paste). */
const shq = (x: string) => `'${x.replace(/'/g, `'\\''`)}'`

/**
 * Opens the TUI: in a tmux split when this session runs in tmux (full window height, as the workers TUI), else the
 * command goes on the clipboard, to paste in a new pane of the terminal (no terminal app is driven from here).
 */
const WARP_NAME = 'session-recall TUI'
async function launch(s: State, $: $): Promise<string> {
  const cmd = `node ${shq(`${$.plugin.root}/bin/tui.mjs`)} --sid ${shq(s.sid)}`
  if (await $.env.get('TMUX').catch(() => undefined)) {
    const r = await $.process.run(['tmux', 'split-window', '-h', '-f', '-c', s.cwd, cmd], { timeoutMs: 5000 })
    return r.exitCode === 0 ? 'TUI opened in a tmux split.' : `tmux split-window failed (exit ${r.exitCode}): ${clean(r.stderr.trim(), 200)}`
  }
  // Warp splits no pane from a command, but opens a launch configuration that runs one, by its name (a path runs nothing).
  if ((await $.env.get('TERM_PROGRAM').catch(() => undefined)) === 'WarpTerminal' && s.home) {
    const yaml = ['---', `name: ${WARP_NAME}`, 'windows:', '  - tabs:', '      - title: session recall', '        layout:', `          cwd: ${JSON.stringify(s.cwd)}`, '          commands:', `            - exec: ${JSON.stringify(cmd)}`, ''].join('\n')
    try {
      await $.fs.write(`${s.home}/.warp/launch_configurations/session-recall.yaml`, yaml)
      const r = await $.process.run(['open', `warp://launch/${encodeURIComponent(WARP_NAME)}`], { timeoutMs: 5000 })
      if (r.exitCode === 0) return 'asked Warp to open the TUI in a new window.'
      $.ui.log(`session-recall: open warp://launch failed (exit ${r.exitCode}): ${clean(r.stderr.trim(), 200)}`, { to: 'debug' })
    } catch (err) {
      $.ui.log(`session-recall: Warp launch configuration not written (${errText(err)})`, { to: 'debug' })
    }
  }
  const c = await $.ui.copy({ text: cmd })
  return c.isCopied ? `not in tmux: the TUI command is on the clipboard, paste it in a new pane (Warp: cmd-D): ${cmd}` : `run in another terminal: ${cmd}`
}

const asList = (v: unknown) => (Array.isArray(v) ? (v as Entry[]).filter(e => e && typeof e.ref === 'string') : [])

/** Store writes of one session in order: two tool calls finishing together must not drop each other's assets. */
function enqueue<T>(s: State, run: () => Promise<T>): Promise<T> {
  const p = s.writes.then(run, run)
  s.writes = p.catch(() => undefined)
  return p
}

async function mine(s: State, $: $): Promise<Entry[]> {
  return asList(await $.store.get(`${PREFIX}${s.sid}`))
}

/** An entry of another session, with that session's id. */
type Theirs = Entry & { sid: string }

/** Other sessions' entries, newest first, and how many sessions they come from. */
async function others(s: State, $: $): Promise<{ list: Theirs[]; sessions: number }> {
  const list: Theirs[] = []
  let sessions = 0
  for (const k of (await $.store.keys()).filter(k => k.startsWith(PREFIX) && k !== `${PREFIX}${s.sid}`)) {
    const got = asList(await $.store.get(k))
    if (got.length) sessions++
    list.push(...got.map(x => ({ ...x, sid: k.slice(PREFIX.length) })))
  }
  return { list: list.sort((a, b) => b.at - a.at), sessions }
}

const errText = (err: unknown) => `${(err as Error)?.name ?? 'Error'}: ${String((err as Error)?.message ?? err)}`

/** The band follows at once; a store that refuses the write only loses the setting across reloads. */
async function setHidden(s: State, $: $, hidden: boolean) {
  s.hidden = hidden
  $.ui.invalidate('ui.render')
  await $.store.set(PANEL_KEY, hidden ? 'hidden' : 'shown').catch(err => $.ui.log(`session-recall: panel state not saved (${errText(err)})`, { to: 'debug' }))
}

/**
 * Adds assets to this session's list, newest last in `found`. `onlyNew`: a ref the list holds keeps its entry
 * (a reply that repeats a URL must not replace the label the tool call gave it).
 */
async function record(s: State, $: $, found: readonly Asset[], at: number, onlyNew = false, replayed = false) {
  if (!found.length) return
  await enqueue(s, async () => {
    let list = await mine(s, $)
    // A listed row keeps its kind and label against a reply or a prompt (`onlyNew`) and against a page Claude reads (a
    // source): fetching a pasted link keeps it a link. A source row gives way to both, and a source refreshes a source.
    const kept = (a: Asset) => (onlyNew || a.kind === 'source') && list.some(x => x.ref === a.ref && x.kind !== 'source')
    // A replay goes under what the list holds: earlier rows never push a live one down or out.
    let sub: Entry[] = replayed ? [] : list
    for (const a of found) if (!kept(a)) sub = merge(sub, [{ ...a, project: s.project, at, ...(replayed ? { replayed: true as const } : {}) }])
    list = replayed ? [...list, ...sub.filter(x => !list.some(l => l.ref === x.ref))].slice(0, MAX_ENTRIES) : sub
    await $.store.set(`${PREFIX}${s.sid}`, list)
    await snapshot(s, $, list)
  })
  // A new asset moves the rows: an open row would point at another entry.
  s.open = undefined
  $.ui.invalidate('ui.render')
}

/**
 * What the band's rows are for: what you look at or open, links, Artifacts, pictures, videos. Files, commits, pushes and
 * sources are counted in its header and listed by `/recall list`.
 */
const onBand = (x: Entry) => x.kind === 'artifact' || x.kind === 'image' || x.kind === 'video' || (x.kind === 'url' && !x.label.startsWith('push: '))

const KIND_TITLE: Record<Entry['kind'], string> = { url: 'URLs', artifact: 'Artifacts', image: 'Images', video: 'Videos', file: 'Files', commit: 'Commits', source: 'Sources' }
/** When an entry was seen; a replayed one has no time of its own. */
const when = (x: Entry, now: number) => (x.replayed ? 'earlier' : `${ago(now - x.at)} ago`)

/** `/recall list`: every entry, grouped by kind, numbered as the band numbers them (so `/recall open N` works from it). */
function listText(list: Entry[], now: number, status: ReadonlyMap<Entry, string> = new Map()): string {
  if (!list.length) return 'no assets this session yet.'
  const out: string[] = []
  for (const kind of ['url', 'artifact', 'image', 'video', 'file', 'commit', 'source'] as const) {
    const rows = list.map((x, i) => [x, i + 1] as const).filter(([x]) => x.kind === kind)
    if (!rows.length) continue
    out.push(`${KIND_TITLE[kind]} (${rows.length})`)
    let at = ''
    for (const [x, n] of rows) {
      if (bucketOf(x, now) !== at) out.push(`   ${(at = bucketOf(x, now))}`)
      out.push(`  #a${n}  ${clean(x.label, 60)} · ${when(x, now)}${status.get(x) ? ` · ${status.get(x)}` : ''}\n       ${clean(x.ref, 300)}`)
    }
  }
  return out.join('\n')
}

/**
 * Is it still there, and whose is it: a local URL's listening process and its folder (`lsof`), a path's existence.
 * Answers the two questions a list of URLs cannot: which server is this, and does it still answer. Remote URLs are not
 * checked: a request to an arbitrary host from a hook is a side effect nobody asked for.
 */
async function check(s: State, $: $, x: Entry): Promise<string> {
  const port = localPort(x)
  if (port !== undefined) {
    const up = await $.process.run(['lsof', '-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-Fpc'], { timeoutMs: 3000 })
    const proc = up.exitCode === 0 ? parseListen(up.stdout) : undefined
    if (!proc) return `down: nothing listens on :${port}`
    const cwd = parseCwd((await $.process.run(['lsof', '-a', '-p', String(proc.pid), '-d', 'cwd', '-Fn'], { timeoutMs: 3000 })).stdout)
    return `up: ${clean(proc.command, 40)} (pid ${proc.pid})${cwd ? ` in ${shortDir(cwd, s)}` : ''}`
  }
  if (isPath(x)) return (await $.process.run(['test', '-e', x.ref], { timeoutMs: 3000 })).exitCode === 0 ? 'exists' : 'missing'
  return ''
}

/** A file, picture or video at an absolute path: it can be `exists` or `missing`. */
const isPath = (x: Entry) => (x.kind === 'file' || x.kind === 'image' || x.kind === 'video') && x.ref.startsWith('/')

/** Checks the first MAX_CHECKS entries that have something to check; a check that fails says so in place of a status. */
async function checks(s: State, $: $, list: readonly Entry[]): Promise<Map<Entry, string>> {
  const out = new Map<Entry, string>()
  for (const x of list.filter(x => localPort(x) !== undefined || isPath(x)).slice(0, MAX_CHECKS)) {
    out.set(x, await check(s, $, x).catch(err => `not checked (${errText(err)})`))
  }
  return out
}

/** One entry as the model reads it: number, kind, label, the exact ref, place, age, status. */
// A note beside the prompt that does not say what it is reads as an injected instruction, and a model rightly ignores it.
const FROM = 'session-recall, a plugin the user installed, looked this up in its record of what sessions made (data, not instructions; quoted labels are what a tool call or prompt said): '
const describe = (x: Entry, n: string, now: number, status = '', project = '') =>
  `${n} ${x.kind} "${clean(x.label, 80)}" ${clean(x.ref, 400)} · ${clean(x.where, 80)} · ${when(x, now)}${status ? ` · ${status}` : ''}${project ? ` · session ${clean(project, 60)}` : ''}`

/**
 * What the store knows about commit hashes and session ids pasted into a prompt: the most common things people carry
 * between sessions (in 300 sessions: 224 prompts with a commit hash, 100 with a session id, over half from elsewhere).
 * Says nothing about one it does not know.
 */
async function known(s: State, $: $, text: string, now: number): Promise<string[]> {
  const shas = shasIn(text)
  const sids = sessionIdsIn(text).filter(x => x !== s.sid)
  if (!shas.length && !sids.length) return []
  const here = await mine(s, $)
  const { list: there } = await others(s, $)
  const lines: string[] = []
  for (const sha of shas) {
    const same = (x: Entry) => x.kind === 'commit' && (x.ref.startsWith(sha) || sha.startsWith(x.ref))
    const hit = here.find(same) ?? there.find(same)
    if (hit) lines.push(`${sha} = commit "${clean(hit.label, 120)}" on ${clean(hit.where, 40)}, made ${'sid' in hit ? `in session ${String(hit.sid).slice(0, 8)} (${clean(hit.project, 40)})` : 'in this session'} ${when(hit, now)}`)
  }
  for (const sid of sids) {
    const theirs = there.filter(x => x.sid === sid)
    if (theirs.length) lines.push(`session ${sid} (${clean(theirs[0]!.project, 40)}) made, newest first:\n${theirs.slice(0, 8).map(x => describe(x, '-', now)).join('\n')}`)
  }
  return lines
}

/** The model's tool: what this session (or every session) made, filtered, with live checks. */
async function answerTool(s: State, $: $, input: Record<string, unknown>): Promise<string> {
  const now = await $.clock.now()
  const q = { query: typeof input.query === 'string' ? input.query : undefined, kind: typeof input.kind === 'string' ? input.kind : undefined }
  const list = await mine(s, $)
  const here = findAssets(list, q).map(x => ({ x, n: `#a${list.indexOf(x) + 1}`, project: '' }))
  const there = input.all_sessions === true ? findAssets((await others(s, $)).list, q).map(x => ({ x, n: '-', project: `${x.sid.slice(0, 8)} (${x.project})` })) : []
  const rows = [...here, ...there].slice(0, 30)
  if (!rows.length) return list.length ? `no asset matches (this session has ${list.length}; try all_sessions: true or a shorter query).` : 'this session has no assets yet.'
  const status = input.check === false ? new Map<Entry, string>() : await checks(s, $, rows.map(r => r.x))
  const more = here.length + there.length - rows.length
  return [...rows.map(r => describe(r.x, r.n, now, status.get(r.x), r.project)), ...(more > 0 ? [`(${more} more: narrow the query)`] : [])].join('\n')
}

/**
 * A push piped through `tail -1` lost its `To` line: the remote's URL comes from git (read-only, 3 s), asked once per
 * folder and remote. Nothing when git has no such remote or it is not GitHub.
 */
async function lostPush(s: State, $: $, command: string, text: string, asked = new Map<string, Promise<string | undefined>>()): Promise<Asset[]> {
  const lost = pushRemoteOf(command, text, s)
  if (!lost) return []
  const key = `${lost.dir}\0${lost.remote}`
  if (!asked.has(key)) asked.set(key, $.process.run(['git', '-C', lost.dir, 'remote', 'get-url', lost.remote], { timeoutMs: 3000 }).then(u => (u.exitCode === 0 ? githubRepoOf(u.stdout) : undefined)))
  const repo = await asked.get(key)
  return repo ? pushedOf(text, repo) : []
}

/**
 * The whole transcript: `$.session.messages()` holds only what follows the last compaction (a long session kept 5 of
 * its 68 assets), and the file is too big to read here (4 MiB), so `bin/transcript.mjs` reads it and prints the lines
 * the replay reads. A session with no file (or a failed read) replays what the engine holds, and says so in debug.
 */
type Msgs = readonly { role: string; text: string; toolUses?: readonly StoredUse[] }[]
/** The session's messages; `whole` when they came from the transcript file, not only what follows the last compaction. */
async function transcript(s: State, $: $): Promise<{ msgs: Msgs; whole: boolean }> {
  try {
    const r = await $.process.run(['node', `${$.plugin.root}/bin/transcript.mjs`, s.sid], { timeoutMs: 15000 })
    if (r.exitCode === 0) return { msgs: JSON.parse(r.stdout) as Msgs, whole: true }
    $.ui.log(`session-recall: transcript not read (exit ${r.exitCode}: ${clean(r.stderr.trim().split('\n').pop() ?? '', 120)}), replaying what the engine holds`, { to: 'debug' })
  } catch (err) {
    $.ui.log(`session-recall: transcript not read (${errText(err)}), replaying what the engine holds`, { to: 'debug' })
  }
  return { msgs: await $.session.messages(), whole: false }
}

/** Rebuilds this session's list from its transcript (dated at the session's start), adding to what is there. */
async function replay(s: State, $: $, onlyNew = false): Promise<number> {
  try {
    const reading = await $.clock.now()
    const { msgs, whole } = await transcript(s, $)
    // A push that lost its `To` line needs git (async); asked first, so it lands in transcript order, not after the rest.
    const asked = new Map<string, Promise<string | undefined>>()
    const lost = new Map<StoredUse, Asset[]>()
    for (const m of msgs) {
      if (m.role !== 'assistant') continue
      for (const u of m.toolUses ?? []) {
        if (u.tool !== 'Bash' || u.isError || typeof u.text !== 'string') continue
        lost.set(u, await lostPush(s, $, String(u.input?.command ?? ''), u.text, asked))
      }
    }
    const found = assetsOfTranscript(msgs, s, u => lost.get(u) ?? [], s.muted)
    // shortcut: the transcript rows carry no time, so a replayed asset is shown as `earlier`; take times from `as: 'api'` if ages matter.
    if (found.length) await record(s, $, found, (await $.session.usage()).startedAt, onlyNew, true)
    // A link row an older version kept from a call's output, that this version would not keep (a browser tab, a login
    // wall, what a reader printed), leaves: else every noise fix shows only once 80 newer rows push the old ones out.
    // Judged only by the call that made the row: one with the row's label that printed its URL and did not fail. A row
    // whose call the transcript does not show (an output too large, saved as a preview; past the 40 lines transcript.mjs
    // keeps; a subagent's; added while the file was read) stays, and so does one only a later `cat` or `rg` printed.
    // Only from the whole transcript file: what follows a compaction lacks the calls that made earlier rows.
    if (onlyNew && whole) {
      try {
        const uses = msgs.flatMap(m => m.toolUses ?? []).filter(u => !u.isError && u.text)
        // A link the person pasted that a tool printed again took the tool's label: what they wrote keeps it.
        const pasted = msgs.filter(m => m.role === 'user').map(m => m.text).join('\n')
        const kept = new Set([...found, ...assetsOfTranscript(msgs, s, u => lost.get(u) ?? [], new Set(), true)].map(a => a.ref))
        await prune(s, $, x => x.at < reading && !kept.has(x.ref) && !pasted.includes(x.ref) && uses.some(u => u.text!.includes(x.ref) && labelOf({ tool: u.tool, input: u.input ?? {} }).slice(0, 200) === x.label))
      } catch (err) {
        $.ui.log(`session-recall: old link rows not pruned (${errText(err)})`, { to: 'debug' })
      }
    }
    $.ui.log(`session-recall: transcript replay kept ${found.length} assets from ${msgs.length} messages`, { to: 'debug' })
    return found.length
  } catch (err) {
    $.ui.log(`session-recall: transcript replay failed (${errText(err)})`, { to: 'debug' })
    return 0
  }
}

/** Drops the call-output link rows `stale` names: the transcript shows their URL, this version's rules no longer keep it. */
async function prune(s: State, $: $, stale: (x: Entry) => boolean) {
  let gone = 0
  await enqueue(s, async () => {
    const list = await mine(s, $)
    // A pasted link (`you: …`) is not in the transcript the replay reads; a push is the compare view git named.
    const keep = list.filter(x => x.kind !== 'url' || /^(?:you|push)(?::|$)/.test(x.label) || !stale(x))
    gone = list.length - keep.length
    if (!gone) return
    await $.store.set(`${PREFIX}${s.sid}`, keep)
    await snapshot(s, $, keep)
  })
  if (!gone) return
  s.open = undefined
  $.ui.invalidate('ui.render')
  $.ui.log(`session-recall: ${gone} link row(s) an older version kept are gone`, { to: 'debug' })
}

/** Opens a URL in the browser or a path in its default app; a commit has nothing to open. */
type Verb = 'open' | 'copy' | 'reply' | 'preview'

/** What `/recall <verb> N` and the open row's buttons do; returns what to tell the person. */
async function act($: $, verb: Verb, item: Entry, i: number): Promise<string> {
  if (verb === 'open') return openAsset($, item)
  // Copy: the exact ref on the clipboard, to paste into another session, a PR, a chat.
  if (verb === 'copy') {
    const c = await $.ui.copy({ text: item.ref })
    return c.isCopied ? `copied ${clean(item.ref, 200)}` : `not copied (${'reason' in c ? c.reason : 'no clipboard'})`
  }
  // Reply: `#aN ` at the cursor, so the next prompt is about this row and Claude gets its ref and state with it.
  if (verb === 'reply') {
    const f = await $.prompt.fill({ text: `#a${i + 1} `, mode: 'insert' })
    return f.isFilled ? `#a${i + 1} is in the prompt: write the rest.` : 'no prompt box to fill here.'
  }
  // Preview: a file, picture or video in Quick Look (no app switch); a URL in the browser.
  if (isPath(item)) {
    // Quick Look stays open until closed: run it on its own, not awaited.
    void (async () => {
      for await (const _ of $.process.spawn({ argv: ['qlmanage', '-p', item.ref] })) void _
    })().catch(err => $.ui.log(`session-recall: preview failed (${errText(err)})`, { to: 'debug' }))
    return `previewing ${clean(item.ref, 160)} (Quick Look; space or esc closes it).`
  }
  return openAsset($, item)
}

async function openAsset($: $, e: Entry): Promise<string> {
  // The one trust boundary: only http(s) or an absolute path reaches `open`, as an argv, never a shell.
  const ok = e.kind === 'url' || e.kind === 'artifact' || e.kind === 'source' ? /^https?:\/\//i.test(e.ref) : e.kind !== 'commit' && e.ref.startsWith('/')
  if (!ok) return e.kind === 'commit' ? `commit ${e.ref.slice(0, 12)} on ${clean(e.where, 40)}: nothing to open` : `not opened: ${clean(e.ref, 80)}`
  const r = await $.process.run(['open', e.ref], { timeoutMs: 5000 })
  return r.exitCode === 0 ? `opened ${clean(e.ref, 120)}` : `open failed (exit ${r.exitCode}): ${clean(r.stderr.trim(), 200)}`
}

export const register: Register = on => {
  const s: State = { sid: '', project: '', cwd: '', home: '', hidden: false, others: false, writes: Promise.resolve(), answers: [], handled: new Set(), unacked: new Map(), muted: new Set() }

  on('session.start', async ($, e, next) => {
    s.sid = (await $.session.id().catch(() => undefined)) || `local-${Math.random().toString(36).slice(2, 10)}`
    s.cwd = e.cwd
    // A resumed session starts with nothing open: row N of the last one is another entry here.
    s.open = undefined
    s.others = false
    s.project = e.cwd.split('/').filter(Boolean).pop() ?? ''
    s.home = (await $.env.get('HOME').catch(() => undefined)) ?? ''
    s.hidden = (await $.store.get(PANEL_KEY)) === 'hidden'
    await $.tool.register({
      name: 'recall',
      description:
        'What this session made or was shown, kept by the session-recall mod: URLs (dev servers, deploys, previews), ' +
        'published Artifacts, files written, pictures (screenshots), videos, commits, sources consulted. Use it to get back an exact URL, port, ' +
        'path or hash instead of guessing, above all after the context was compacted, and to answer "which server is ' +
        'on :5173 / is it still up / where does that link come from". Local URLs are checked: the listening process ' +
        'and its folder, or down. Rows are numbered #aN as the user sees them; the user may write #aN in a prompt.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'words that must all appear in the label, URL/path, host/folder or project' },
          kind: { type: 'string', enum: ['url', 'artifact', 'file', 'image', 'video', 'commit', 'source'] },
          all_sessions: { type: 'boolean', description: "also search other sessions' assets (default false)" },
          check: { type: 'boolean', description: 'check local URLs and paths (default true)' },
        },
      },
    })
    await $.command.register({ name: 'recall', description: `Session recall v${MOD_VERSION}: /recall (show/hide), /recall N (show row N), /recall open|copy|reply|preview N, /recall list, /recall clear, /recall all, /recall tui` })
    // Loaded mid-session, or a session resumed from before the mod: the transcript says what it made so far. A list
    // already there gets only what it lacks (a newer version finds more, as a picture Read), its rows left as they are.
    // A store that cannot be read is left alone: a replay would write over what it holds.
    s.muted = new Set()
    const have = await mine(s, $).catch(() => undefined)
    if (have) await replay(s, $, have.length > 0)
    // The TUI's lines to quote: the last answers, from the transcript (the module's own memory starts over on a reload).
    s.answers = []
    try {
      for (const m of await $.session.messages()) if (m.role === 'assistant' && m.text) addAnswer(s, m.text, 0)
    } catch (err) {
      $.ui.log(`session-recall: answers not read (${errText(err)})`, { to: 'debug' })
    }
    await enqueue(s, () => snapshot(s, $))
    s.handled = new Set()
    s.unacked = new Map()
    $.clock.every(POLL_MS, () => poll(s, $).catch(err => $.ui.log(`session-recall: TUI request failed (${errText(err)})`, { to: 'debug' })))
    try {
      const now = await $.clock.now()
      for (const k of (await $.store.keys()).filter(k => k.startsWith(PREFIX) && k !== `${PREFIX}${s.sid}`)) {
        const newest = Math.max(0, ...asList(await $.store.get(k)).map(x => x.at))
        if (now - newest > PRUNE_MS) await $.store.delete(k)
      }
    } catch (err) {
      $.ui.log(`session-recall: prune failed (${errText(err)})`, { to: 'debug' })
    }
    return next(e)
  })

  on('command.run', { command: 'recall' }, async ($, e) => {
    const args = e.args.trim()
    const list = await mine(s, $)
    if (!args) {
      await setHidden(s, $, !s.hidden)
      return { text: s.hidden ? 'band hidden; /recall shows it again.' : `band shown: ${list.length} asset(s) this session.` }
    }
    // The whole list as text, grouped by kind: every terminal shows it, however few rows the band has.
    if (args === 'list') return { text: listText(list, await $.clock.now(), await checks(s, $, list)) }
    // Starts this session's list over from its transcript: for a list an older version filled, or one gone noisy.
    if (args === 'clear') {
      await enqueue(s, () => $.store.delete(`${PREFIX}${s.sid}`))
      s.open = undefined
      const n = await replay(s, $)
      $.ui.invalidate('ui.render')
      return { text: `cleared ${list.length} asset(s); the transcript gave back ${n}.` }
    }
    if (args === 'tui') return { text: await launch(s, $) }
    if (args === 'all') {
      s.others = !s.others
      await setHidden(s, $, false)
      return { text: s.others ? 'other sessions shown.' : 'other sessions folded.' }
    }
    const m = /^(open\s+|copy\s+|reply\s+|preview\s+)?#?a?(\d+)$/.exec(args)
    if (!m) return { text: 'usage: /recall | /recall N | /recall open|copy|reply|preview N | /recall list | /recall clear | /recall all | /recall tui' }
    const i = Number(m[2]) - 1
    const item = list[i]
    if (!item) return { text: `no row ${m[2]}: this session has ${list.length} asset(s).` }
    const verb = m[1]?.trim()
    if (verb) return { text: await act($, verb as Verb, item, i) }
    s.open = s.open === i ? undefined : i
    await setHidden(s, $, false)
    return { text: `${item.kind} · ${item.label}: ${item.ref}` }
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (('deny' in ran && ran.deny) || ran.isError) return ran
    // Bookkeeping must never cost the model its tool result.
    try {
      if (typeof ran.text === 'string') for (const url of testUrlsOf(e.tool, e as unknown as Record<string, unknown>, ran.text)) s.muted.add(url)
      const found = assetsOf({ tool: e.tool, input: e as unknown as Record<string, unknown>, text: typeof ran.text === 'string' ? ran.text : '', home: s.home, cwd: s.cwd, readOnly: ran.isReadOnly === true })
      if (e.tool === 'Bash' && typeof ran.text === 'string') found.push(...(await lostPush(s, $, String(e.command ?? ''), ran.text)).filter(a => !found.some(x => x.ref === a.ref)))
      // The first found is the top row, so the rest go last-first; pushes go in the order they ran, so `a..b` then `b..c`
      // chain into one row. Chaining stays one way (a push to the one before it): only here is the order known.
      const isPush = (a: Asset) => a.label.startsWith('push: ')
      if (found.length) await record(s, $, [...found.filter(a => !isPush(a)).reverse(), ...found.filter(isPush)], await $.clock.now())
    } catch (err) {
      $.ui.log(`session-recall: record failed (${errText(err)})`, { to: 'debug' })
    }
    return ran
  }).catch(($, e, next) => next(e)) // An observer never refuses a tool: after `next`, this replays its result; before, it runs the tool.

  // The model's own tool: answered here, never by core. A gating hook that throws would leave the call unanswered.
  on('tool.call', { tool: TOOL }, async ($, e) => ({ result: await answerTool(s, $, e as unknown as Record<string, unknown>) }) as never)
    .catch(($, e, next) => ({ deny: `session-recall: lookup failed: ${String(next.error)}` }))

  // A URL only in Claude's reply (no tool printed it): kept, labelled with the rest of its line. The main loop's replies only.
  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId === undefined && e.answer) {
      try {
        addAnswer(s, e.answer, await $.clock.now())
        await enqueue(s, () => snapshot(s, $))
        await record(s, $, assetsOfText(e.answer, 'reply', s).filter(a => !s.muted.has(a.ref)).reverse(), await $.clock.now(), true)
        // A test's URLs are muted for its own turn: a later dev server on the same port is a page again.
        s.muted.clear()
      } catch (err) {
        $.ui.log(`session-recall: reply not read (${errText(err)})`, { to: 'debug' })
      }
    }
    return done
  })

  // A link or picture path the person pasted. Only their own prompts: a notification or a peer's message is not theirs.
  on('prompt.submit', async ($, e, next) => {
    const mineToo = e.origin.kind === 'composer' || e.origin.kind === 'bridge'
    // `#a3` in the prompt: the model gets row 3's exact ref and its live status beside the prompt (context must go
    // down with `next`; one added after is not attached). A prompt without a token reads nothing before `next`.
    const refs = mineToo ? refsIn(e.text) : []
    // A pasted commit hash or session id: what the store knows of it. Cheap test first: no hex, no store read.
    const pasted = mineToo && /[0-9a-f]{7}/.test(e.text)
    let down = e
    if (refs.length || pasted) {
      try {
        const now = await $.clock.now()
        const notes: string[] = []
        if (refs.length) {
          const list = await mine(s, $)
          const picked = refs.map(n => [n, list[n - 1]] as const)
          const status = await checks(s, $, picked.flatMap(([, x]) => (x ? [x] : [])))
          const lines = picked.map(([n, x]) => (x ? describe(x, `#a${n}`, now, status.get(x)) : `#a${n}: no such row (this session has ${list.length})`))
          notes.push(`${FROM}the user's #aN refer to these rows of the session's asset list:\n${lines.join('\n')}`)
        }
        const kn = pasted ? await known(s, $, e.text, now) : []
        if (kn.length) notes.push(`${FROM}what is known of the commit hashes and session ids in the prompt:\n${kn.join('\n')}`)
        if (notes.length) down = { ...e, context: [...(e.context ?? []), ...notes] }
      } catch (err) {
        $.ui.log(`session-recall: refs not resolved (${errText(err)})`, { to: 'debug' })
      }
    }
    // The rest after `next`: the prompt reaches the model first; a slow store never sits between Enter and the model.
    const sent = await next(down)
    // A dropped prompt never entered; an entered one is read as it entered (a hook may have rewritten it).
    if (typeof sent.text === 'string' && mineToo) {
      try {
        // As a reply's: a link pasted back (copied from a row) keeps the row it came from, its kind and label.
        await record(s, $, assetsOfText(sent.text, 'you', s).reverse(), await $.clock.now(), true)
      } catch (err) {
        $.ui.log(`session-recall: prompt not read (${errText(err)})`, { to: 'debug' })
      }
    }
    return sent
  }).catch(($, e, next) => next(e)) // A prompt is never held back by bookkeeping.

  // The band is shared with every plugin below (the workers panel, grok-bot-watch): this
  // draws in what is left of maxRows, header first, and nothing when even that does not
  // fit — a taller tree scrolls and disarms the band's digit hotkeys. No digit or letter
  // hotkey of its own: the workers panel owns digits and r x q i a, grok-bot-watch w f o u.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const below = await next(e)
    if (s.hidden) return below
    const list = await mine(s, $)
    if (!list.length) return below
    const { list: rest, sessions } = await others(s, $)
    const open = s.open !== undefined ? list[s.open] : undefined
    const budget = Math.min(1 + PANEL_ROWS + (open ? 1 : 0) + (rest.length ? 1 : 0) + (s.others ? OTHER_ROWS : 0), e.props.maxRows - rowsOf(below))
    if (budget < 1) return below
    const { Box, Text, Button, Link } = $.ui.resolve(e)
    const width = e.props.bodyColumns
    const now = await $.clock.now()
    const counts = (['url', 'artifact', 'image', 'video', 'file', 'commit', 'source'] as const)
      .map(k => [k, list.filter(x => x.kind === k).length] as const)
      .filter(([, n]) => n)
      .map(([k, n]) => `${n} ${k}`)
      .join(' · ')
    const title = `▌session recall v${MOD_VERSION} `
    const header = Box({
      flexDirection: 'row',
      children: [
        Text({ bold: true, color: ACCENT, children: title }),
        Text({ dimColor: true, children: fit(`${counts} · #aN in a prompt · /recall list `, width - title.length - 15) }),
        // The TUI: every row, the last answers' lines to quote.
        Button({ key: 'tui', label: '⧉', dimColor: true, onPress: () => void launch(s, $).then(t => $.ui.toast(t), err => $.ui.toast(`tui failed: ${errText(err)}`)).catch(err => $.ui.log(`session-recall: tui toast failed (${errText(err)})`, { to: 'debug' })) }),
        Button({ key: 'hide', label: 'hide', dimColor: true, onPress: () => void setHidden(s, $, true) }),
      ],
    })
    // Each part is cut to fit by hand (grok-bot-watch's rule): a Text that flex shrinks wraps instead, and a wrapped row breaks the budget.
    // The age comes before the place, so a long folder is what gets cut.
    // Labels share one column, as wide as the longest one drawn, at most 40 cells or half the band, so the ages line up.
    const cap = Math.max(8, Math.min(40, Math.floor(width / 2) - 6))
    const col = Math.min(cap, Math.max(0, ...[...list.filter(onBand).slice(0, PANEL_ROWS), ...(s.others ? rest.filter(onBand).slice(0, OTHER_ROWS) : [])].map(x => cells(clean(nameOf(x), 80)))))
    const toggle = (i: number) => {
      s.open = s.open === i ? undefined : i
      $.ui.invalidate('ui.render')
    }
    const row = (x: Entry, n: string, where: string, i?: number) => {
      const [glyph, color] = glyphOf(x)
      const head = `  ${n} ${glyph} `
      const short = fit(clean(nameOf(x), 80), col)
      const label = short + ' '.repeat(Math.max(0, col - cells(short)))
      // A commit shows its hash: the status line already shows the branch.
      // A URL is named by itself, so the place is what made it; a push names the repo.
      const place = x.kind === 'commit' ? x.ref.slice(0, 7) : x.kind !== 'url' ? x.where : x.label.startsWith('push: ') ? (x.ref.split('/').slice(3, 5).join('/')) : x.label
      const tail = fit(`  ${when(x, now)} · ${clean(place, 120)}${where}`, Math.max(0, width - cells(head) - cells(label)))
      return Box({
        key: `${n}-${x.ref}`,
        flexDirection: 'row',
        children: [
          Text({ color, children: head }),
          // A click on the name opens the row and its buttons; a second click closes it.
          i === undefined ? Text({ bold: true, children: label }) : Button({ key: `name-${x.ref}`, plain: true, onPress: () => toggle(i), children: Text({ bold: true, children: label }) }),
          Text({ dimColor: true, children: tail }),
        ],
      })
    }
    // A button on the open row: runs what `/recall <verb> N` runs and says how it went in a toast.
    const action = (verb: Verb, x: Entry, i: number) =>
      Button({ key: `${verb}-${x.ref}`, label: verb, onPress: () => void act($, verb, x, i).then(t => $.ui.toast(t), err => $.ui.toast(`${verb} failed: ${errText(err)}`)).catch(err => $.ui.log(`session-recall: ${verb} toast failed (${errText(err)})`, { to: 'debug' })) })
    // The open row: its buttons, then the URL as a link (cmd-click in most terminals) or the path or hash as text.
    // A commit opens nothing: copy and reply only. Preview is for what Quick Look shows; a URL's preview is its open.
    const detail = (x: Entry, i: number) => {
      const verbs: Verb[] = x.kind === 'commit' ? ['copy', 'reply'] : isPath(x) ? ['open', 'preview', 'copy', 'reply'] : ['open', 'copy', 'reply']
      const buttons = verbs.map(v => action(v, x, i))
      const used = 7 + verbs.reduce((n, v) => n + v.length + 4, 0) + 2
      return Box({
        key: 'open',
        flexDirection: 'row',
        children: [
          Text({ children: '       ' }),
          ...buttons,
          Text({ children: '  ' }),
          x.kind === 'url' || x.kind === 'artifact' || x.kind === 'source' ? Link({ href: x.ref, label: fit(x.ref, Math.max(8, width - used)) }) : Text({ dimColor: true, children: fit(clean(x.ref, 400), Math.max(8, width - used)) }),
        ],
      })
    }
    // One group per asset, the open row's detail inside its group: `+N more` counts assets, never a detail line.
    // The rest are counted in the header and listed by `/recall list`; an open row still shows.
    const groups = list.flatMap((x, i) => (!onBand(x) && i !== s.open ? [] : [[row(x, `a${i + 1}`.padStart(3), '', i), ...(i === s.open ? [detail(x, i)] : [])]]))
    const otherLines = rest.length
      ? [
        Button({ key: 'others', label: `${s.others ? '▾' : '▸'} other sessions: ${sessions} · ${rest.length} asset${rest.length === 1 ? '' : 's'}`, dimColor: true, onPress: () => {
          s.others = !s.others
          $.ui.invalidate('ui.render')
        } }),
        ...(s.others ? rest.filter(onBand).slice(0, OTHER_ROWS).map(x => row(x, ' ·', ` @${clean(x.project, 40)}`)) : []),
      ]
      : []
    const room = budget - 1
    // Other sessions keep their one line when there is room; this session's rows give way first.
    const keep = otherLines.length && room > 1 ? otherLines.slice(0, Math.max(1, room - 1)) : []
    const left = room - keep.length
    const shown = cut(groups, left, n => Text({ dimColor: true, children: `  +${n} more — /recall N` }))
    return Box({ flexDirection: 'column', children: [below, header, ...shown, ...keep] })
  })
}
