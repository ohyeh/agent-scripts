import type { EngineInterface, Register } from 'claude-code'

import { type Asset, type Entry, ago, assetsOf, assetsOfText, assetsOfTranscript, cells, clean, cut, findAssets, fit, glyphOf, localPort, merge, parseCwd, parseListen, refsIn, rowsOf, sessionIdsIn, shasIn, shortDir } from './lib/assets.ts'

const MOD_VERSION = '0.4.0'
/** The model calls it as this: `mcp__<plugin>__<name>`. */
const TOOL = 'mcp__session-assets__assets'
/** Checks run per answer at most: each local URL is two `lsof` runs. */
const MAX_CHECKS = 10
/** One store key per session: a shared list would be a read-modify-write race between sessions. */
const PREFIX = 'session-assets.s.'
const PANEL_KEY = 'session-assets.panel'
const PRUNE_MS = 30 * 86_400_000
/** Rows the band takes at most: header + this many entries; an open row and the other sessions add their own. */
const PANEL_ROWS = 4
const OTHER_ROWS = 4
const ACCENT = 'blue'

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
  await $.store.set(PANEL_KEY, hidden ? 'hidden' : 'shown').catch(err => $.ui.log(`session-assets: panel state not saved (${errText(err)})`, { to: 'debug' }))
}

/**
 * Adds assets to this session's list, newest last in `found`. `onlyNew`: a ref the list holds keeps its entry
 * (a reply that repeats a URL must not replace the label the tool call gave it).
 */
async function record(s: State, $: $, found: readonly Asset[], at: number, onlyNew = false, replayed = false) {
  if (!found.length) return
  await enqueue(s, async () => {
    let list = await mine(s, $)
    for (const a of found) if (!onlyNew || !list.some(x => x.ref === a.ref)) list = merge(list, [{ ...a, project: s.project, at, ...(replayed ? { replayed: true as const } : {}) }])
    await $.store.set(`${PREFIX}${s.sid}`, list)
  })
  // A new asset moves the rows: an open row would point at another entry.
  s.open = undefined
  $.ui.invalidate('ui.render')
}

const KIND_TITLE: Record<Entry['kind'], string> = { url: 'URLs', artifact: 'Artifacts', image: 'Images', file: 'Files', commit: 'Commits' }
/** When an entry was seen; a replayed one has no time of its own. */
const when = (x: Entry, now: number) => (x.replayed ? 'earlier' : `${ago(now - x.at)} ago`)

/** `/assets list`: every entry, grouped by kind, numbered as the band numbers them (so `/assets open N` works from it). */
function listText(list: Entry[], now: number, status: ReadonlyMap<Entry, string> = new Map()): string {
  if (!list.length) return 'no assets this session yet.'
  const out: string[] = []
  for (const kind of ['url', 'artifact', 'image', 'file', 'commit'] as const) {
    const rows = list.map((x, i) => [x, i + 1] as const).filter(([x]) => x.kind === kind)
    if (!rows.length) continue
    out.push(`${KIND_TITLE[kind]} (${rows.length})`)
    for (const [x, n] of rows) out.push(`  #a${n}  ${clean(x.label, 60)} · ${when(x, now)}${status.get(x) ? ` · ${status.get(x)}` : ''}\n       ${clean(x.ref, 300)}`)
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
  if ((x.kind === 'file' || x.kind === 'image') && x.ref.startsWith('/')) return (await $.process.run(['test', '-e', x.ref], { timeoutMs: 3000 })).exitCode === 0 ? 'exists' : 'missing'
  return ''
}

/** Checks the first MAX_CHECKS entries that have something to check; a check that fails says so in place of a status. */
async function checks(s: State, $: $, list: readonly Entry[]): Promise<Map<Entry, string>> {
  const out = new Map<Entry, string>()
  for (const x of list.filter(x => localPort(x) !== undefined || ((x.kind === 'file' || x.kind === 'image') && x.ref.startsWith('/'))).slice(0, MAX_CHECKS)) {
    out.set(x, await check(s, $, x).catch(err => `not checked (${errText(err)})`))
  }
  return out
}

/** One entry as the model reads it: number, kind, label, the exact ref, place, age, status. */
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

/** Rebuilds this session's list from its transcript (dated at the session's start), adding to what is there. */
async function replay(s: State, $: $): Promise<number> {
  try {
    const found = assetsOfTranscript(await $.session.messages(), s)
    // shortcut: the transcript rows carry no time, so a replayed asset is shown as `earlier`; take times from `as: 'api'` if ages matter.
    if (found.length) await record(s, $, found, (await $.session.usage()).startedAt, false, true)
    return found.length
  } catch (err) {
    $.ui.log(`session-assets: transcript replay failed (${errText(err)})`, { to: 'debug' })
    return 0
  }
}

/** Opens a URL in the browser or a path in its default app; a commit has nothing to open. */
async function openAsset($: $, e: Entry): Promise<string> {
  // The one trust boundary: only http(s) or an absolute path reaches `open`, as an argv, never a shell.
  const ok = e.kind === 'url' || e.kind === 'artifact' ? /^https?:\/\//i.test(e.ref) : e.kind !== 'commit' && e.ref.startsWith('/')
  if (!ok) return e.kind === 'commit' ? `commit ${e.ref.slice(0, 12)} on ${clean(e.where, 40)}: nothing to open` : `not opened: ${clean(e.ref, 80)}`
  const r = await $.process.run(['open', e.ref], { timeoutMs: 5000 })
  return r.exitCode === 0 ? `opened ${clean(e.ref, 120)}` : `open failed (exit ${r.exitCode}): ${clean(r.stderr.trim(), 200)}`
}

export const register: Register = on => {
  const s: State = { sid: '', project: '', cwd: '', home: '', hidden: false, others: false, writes: Promise.resolve() }

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
      name: 'assets',
      description:
        'What this session made or was shown, kept by the session-assets mod: URLs (dev servers, deploys, previews), ' +
        'published Artifacts, files written, pictures (screenshots), commits. Use it to get back an exact URL, port, ' +
        'path or hash instead of guessing, above all after the context was compacted, and to answer "which server is ' +
        'on :5173 / is it still up / where does that link come from". Local URLs are checked: the listening process ' +
        'and its folder, or down. Rows are numbered #aN as the user sees them; the user may write #aN in a prompt.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'words that must all appear in the label, URL/path, host/folder or project' },
          kind: { type: 'string', enum: ['url', 'artifact', 'file', 'image', 'commit'] },
          all_sessions: { type: 'boolean', description: "also search other sessions' assets (default false)" },
          check: { type: 'boolean', description: 'check local URLs and paths (default true)' },
        },
      },
    })
    await $.command.register({ name: 'assets', description: `Session assets v${MOD_VERSION}: /assets (show/hide), /assets N (show row N), /assets open|copy|reply|preview N, /assets list, /assets clear, /assets all` })
    // Loaded mid-session, or a session resumed from before the mod: the transcript says what it made so far.
    // A store that cannot be read is left alone: a replay would write over what it holds.
    const have = await mine(s, $).catch(() => undefined)
    if (have && !have.length) await replay(s, $)
    try {
      const now = await $.clock.now()
      for (const k of (await $.store.keys()).filter(k => k.startsWith(PREFIX) && k !== `${PREFIX}${s.sid}`)) {
        const newest = Math.max(0, ...asList(await $.store.get(k)).map(x => x.at))
        if (now - newest > PRUNE_MS) await $.store.delete(k)
      }
    } catch (err) {
      $.ui.log(`session-assets: prune failed (${errText(err)})`, { to: 'debug' })
    }
    return next(e)
  })

  on('command.run', { command: 'assets' }, async ($, e) => {
    const args = e.args.trim()
    const list = await mine(s, $)
    if (!args) {
      await setHidden(s, $, !s.hidden)
      return { text: s.hidden ? 'band hidden; /assets shows it again.' : `band shown: ${list.length} asset(s) this session.` }
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
    if (args === 'all') {
      s.others = !s.others
      await setHidden(s, $, false)
      return { text: s.others ? 'other sessions shown.' : 'other sessions folded.' }
    }
    const m = /^(open\s+|copy\s+|reply\s+|preview\s+)?#?a?(\d+)$/.exec(args)
    if (!m) return { text: 'usage: /assets | /assets N | /assets open|copy|reply|preview N | /assets list | /assets clear | /assets all' }
    const i = Number(m[2]) - 1
    const item = list[i]
    if (!item) return { text: `no row ${m[2]}: this session has ${list.length} asset(s).` }
    const verb = m[1]?.trim()
    if (verb === 'open') return { text: await openAsset($, item) }
    // Copy: the exact ref on the clipboard, to paste into another session, a PR, a chat.
    if (verb === 'copy') {
      const c = await $.ui.copy({ text: item.ref })
      return { text: c.isCopied ? `copied ${clean(item.ref, 200)}` : `not copied (${'reason' in c ? c.reason : 'no clipboard'})` }
    }
    // Reply: `#aN ` at the cursor, so the next prompt is about this row and Claude gets its ref and state with it.
    if (verb === 'reply') {
      const f = await $.prompt.fill({ text: `#a${i + 1} `, mode: 'insert' })
      return { text: f.isFilled ? `#a${i + 1} is in the prompt: write the rest.` : 'no prompt box to fill here.' }
    }
    // Preview: a file or picture in Quick Look (no app switch); a URL in the browser.
    if (verb === 'preview') {
      if ((item.kind === 'file' || item.kind === 'image') && item.ref.startsWith('/')) {
        // Quick Look stays open until closed: run it on its own, not awaited.
        void (async () => {
          for await (const _ of $.process.spawn({ argv: ['qlmanage', '-p', item.ref] })) void _
        })().catch(err => $.ui.log(`session-assets: preview failed (${errText(err)})`, { to: 'debug' }))
        return { text: `previewing ${clean(item.ref, 160)} (Quick Look; space or esc closes it).` }
      }
      return { text: await openAsset($, item) }
    }
    s.open = s.open === i ? undefined : i
    await setHidden(s, $, false)
    return { text: `${item.kind} · ${item.label}: ${item.ref}` }
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if (('deny' in ran && ran.deny) || ran.isError) return ran
    // Bookkeeping must never cost the model its tool result.
    try {
      const found = assetsOf({ tool: e.tool, input: e as unknown as Record<string, unknown>, text: typeof ran.text === 'string' ? ran.text : '', home: s.home, cwd: s.cwd, readOnly: ran.isReadOnly === true })
      if (found.length) await record(s, $, [...found].reverse(), await $.clock.now())
    } catch (err) {
      $.ui.log(`session-assets: record failed (${errText(err)})`, { to: 'debug' })
    }
    return ran
  }).catch(($, e, next) => next(e)) // An observer never refuses a tool: after `next`, this replays its result; before, it runs the tool.

  // The model's own tool: answered here, never by core. A gating hook that throws would leave the call unanswered.
  on('tool.call', { tool: TOOL }, async ($, e) => ({ result: await answerTool(s, $, e as unknown as Record<string, unknown>) }) as never)
    .catch(($, e, next) => ({ deny: `session-assets: lookup failed: ${String(next.error)}` }))

  // A URL only in Claude's reply (no tool printed it): kept, labelled with the rest of its line. The main loop's replies only.
  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId === undefined && e.answer) {
      try {
        await record(s, $, assetsOfText(e.answer, 'reply', s).reverse(), await $.clock.now(), true)
      } catch (err) {
        $.ui.log(`session-assets: reply not read (${errText(err)})`, { to: 'debug' })
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
          notes.push(`session-assets: the user's #aN refer to these rows of the session's asset list:\n${lines.join('\n')}`)
        }
        const kn = pasted ? await known(s, $, e.text, now) : []
        if (kn.length) notes.push(`session-assets: what is known of the commit hashes and session ids in the prompt:\n${kn.join('\n')}`)
        if (notes.length) down = { ...e, context: [...(e.context ?? []), ...notes] }
      } catch (err) {
        $.ui.log(`session-assets: refs not resolved (${errText(err)})`, { to: 'debug' })
      }
    }
    // The rest after `next`: the prompt reaches the model first; a slow store never sits between Enter and the model.
    const sent = await next(down)
    // A dropped prompt never entered; an entered one is read as it entered (a hook may have rewritten it).
    if (typeof sent.text === 'string' && mineToo) {
      try {
        await record(s, $, assetsOfText(sent.text, 'you', s).reverse(), await $.clock.now())
      } catch (err) {
        $.ui.log(`session-assets: prompt not read (${errText(err)})`, { to: 'debug' })
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
    const counts = (['url', 'artifact', 'file', 'image', 'commit'] as const)
      .map(k => [k, list.filter(x => x.kind === k).length] as const)
      .filter(([, n]) => n)
      .map(([k, n]) => `${n} ${k}`)
      .join(' · ')
    const title = '▌session assets '
    const header = Box({
      flexDirection: 'row',
      children: [
        Text({ bold: true, color: ACCENT, children: title }),
        Text({ dimColor: true, children: fit(`${counts} · #aN in a prompt · /assets list `, width - title.length - 9) }),
        Button({ key: 'hide', label: 'hide', dimColor: true, onPress: () => void setHidden(s, $, true) }),
      ],
    })
    // Each part is cut to fit by hand (grok-bot-watch's rule): a Text that flex shrinks wraps instead, and a wrapped row breaks the budget.
    // The age comes before the place, so a long folder is what gets cut.
    // Labels share one column, as wide as the longest one drawn, at most 40 cells or half the band, so the ages line up.
    const cap = Math.max(8, Math.min(40, Math.floor(width / 2) - 6))
    const col = Math.min(cap, Math.max(0, ...[...list.slice(0, PANEL_ROWS), ...(s.others ? rest.slice(0, OTHER_ROWS) : [])].map(x => cells(clean(x.label, 80)))))
    const row = (x: Entry, n: string, where: string) => {
      const [glyph, color] = glyphOf(x)
      const head = `  ${n} ${glyph} `
      const short = fit(clean(x.label, 80), col)
      const label = short + ' '.repeat(Math.max(0, col - cells(short)))
      // A commit shows its hash: the status line already shows the branch.
      const tail = fit(`  ${when(x, now)} · ${x.kind === 'commit' ? x.ref.slice(0, 7) : clean(x.where, 120)}${where}`, Math.max(0, width - cells(head) - cells(label)))
      return Box({
        key: `${n}-${x.ref}`,
        flexDirection: 'row',
        children: [Text({ color, children: head }), Text({ bold: true, children: label }), Text({ dimColor: true, children: tail })],
      })
    }
    // The open row: the URL as a link (cmd-click in most terminals), a path or hash as text, and `/assets open N` for any terminal.
    const detail = (x: Entry, i: number) =>
      Box({
        key: 'open',
        flexDirection: 'row',
        children: [
          Text({ children: '       ' }),
          x.kind === 'url' || x.kind === 'artifact' ? Link({ href: x.ref, label: fit(x.ref, width - 30) }) : Text({ children: fit(clean(x.ref, 400), width - 30) }),
          Text({ dimColor: true, children: x.kind === 'commit' ? '' : `  /assets open ${i + 1}` }),
        ],
      })
    // One group per asset, the open row's detail inside its group: `+N more` counts assets, never a detail line.
    const groups = list.map((x, i) => [row(x, `a${i + 1}`.padStart(3), ''), ...(i === s.open ? [detail(x, i)] : [])])
    const otherLines = rest.length
      ? [
        Button({ key: 'others', label: `${s.others ? '▾' : '▸'} other sessions: ${sessions} · ${rest.length} asset${rest.length === 1 ? '' : 's'}`, dimColor: true, onPress: () => {
          s.others = !s.others
          $.ui.invalidate('ui.render')
        } }),
        ...(s.others ? rest.slice(0, OTHER_ROWS).map(x => row(x, ' ·', ` @${clean(x.project, 40)}`)) : []),
      ]
      : []
    const room = budget - 1
    // Other sessions keep their one line when there is room; this session's rows give way first.
    const keep = otherLines.length && room > 1 ? otherLines.slice(0, Math.max(1, room - 1)) : []
    const left = room - keep.length
    const shown = cut(groups, left, n => Text({ dimColor: true, children: `  +${n} more — /assets N` }))
    return Box({ flexDirection: 'column', children: [below, header, ...shown, ...keep] })
  })
}
