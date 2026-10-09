import type { EngineInterface, Register } from 'claude-code'

import { type Asset, type Entry, ago, assetsOf, assetsOfText, assetsOfTranscript, cells, clean, cut, fit, glyphOf, merge, rowsOf } from './lib/assets.ts'

const MOD_VERSION = '0.2.1'
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

/** Other sessions' entries, newest first, and how many sessions they come from. */
async function others(s: State, $: $): Promise<{ list: Entry[]; sessions: number }> {
  const list: Entry[] = []
  let sessions = 0
  for (const k of (await $.store.keys()).filter(k => k.startsWith(PREFIX) && k !== `${PREFIX}${s.sid}`)) {
    const got = asList(await $.store.get(k))
    if (got.length) sessions++
    list.push(...got)
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
async function record(s: State, $: $, found: readonly Asset[], at: number, onlyNew = false) {
  if (!found.length) return
  await enqueue(s, async () => {
    let list = await mine(s, $)
    for (const a of found) if (!onlyNew || !list.some(x => x.ref === a.ref)) list = merge(list, [{ ...a, project: s.project, at }])
    await $.store.set(`${PREFIX}${s.sid}`, list)
  })
  // A new asset moves the rows: an open row would point at another entry.
  s.open = undefined
  $.ui.invalidate('ui.render')
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
    await $.command.register({ name: 'assets', description: `Session assets v${MOD_VERSION}: /assets (show/hide), /assets N (open row N), /assets open N, /assets all` })
    // Loaded mid-session, or a session resumed from before the mod: the transcript says what it made so far.
    try {
      if (!(await mine(s, $)).length) {
        const found = assetsOfTranscript(await $.session.messages(), s)
        // shortcut: the transcript rows carry no time, so a replayed asset is dated at the session's start; take times from `as: 'api'` if ages matter.
        if (found.length) await record(s, $, found, (await $.session.usage()).startedAt)
      }
    } catch (err) {
      $.ui.log(`session-assets: transcript replay failed (${errText(err)})`, { to: 'debug' })
    }
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
    if (args === 'all') {
      s.others = !s.others
      await setHidden(s, $, false)
      return { text: s.others ? 'other sessions shown.' : 'other sessions folded.' }
    }
    const m = /^(open\s+)?(\d+)$/.exec(args)
    if (!m) return { text: 'usage: /assets | /assets N | /assets open N | /assets all' }
    const i = Number(m[2]) - 1
    const item = list[i]
    if (!item) return { text: `no row ${m[2]}: this session has ${list.length} asset(s).` }
    if (m[1]) return { text: await openAsset($, item) }
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
    // After `next`: the prompt reaches the model first; a slow store never sits between Enter and the model.
    const sent = await next(e)
    // A dropped prompt never entered; an entered one is read as it entered (a hook may have rewritten it).
    if (typeof sent.text === 'string' && (e.origin.kind === 'composer' || e.origin.kind === 'bridge')) {
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
        Text({ dimColor: true, children: fit(`${counts} · /assets N opens a row `, width - title.length - 9) }),
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
      const tail = fit(`  ${ago(now - x.at)} ago · ${x.kind === 'commit' ? x.ref.slice(0, 7) : clean(x.where, 120)}${where}`, Math.max(0, width - cells(head) - cells(label)))
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
    const groups = list.map((x, i) => [row(x, String(i + 1).padStart(2), ''), ...(i === s.open ? [detail(x, i)] : [])])
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
