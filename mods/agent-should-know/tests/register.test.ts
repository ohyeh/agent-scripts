import { expect, mock, test } from 'claude-code/testing'
import type { EngineInterface } from 'claude-code'

import { sha16 } from '../hooks/lib/audit.ts'
import { register } from '../hooks/register.ts'
import type { Row } from '../hooks/lib/ledger.ts'
import { classified } from '../hooks/lib/align.ts'

const PLUGIN = 'agent-should-know'
const SID = '28d2c553-6d91'
const STORE = '/h/me/.claude/plugins/store'
const BUILTIN = 'cc-plugin-you-should-know_builtin-19776595df2c.json'
const start = { cwd: '/work/agent_automation', surface: 'terminal' as const, isInteractive: true }
const cmd = { command: 'heads-up', args: '', origin: { kind: 'composer' as const }, presentation: { isFullscreen: false, columns: 120 } }

const BAND = {
  plugin: PLUGIN,
  component: 'AbovePrompt',
  requestId: 'above',
  props: {
    hasSurvey: false,
    isWorking: true,
    maxRows: 20,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

const band = (bodyColumns = 120) => ({
  surface: 'terminal' as const,
  component: 'AbovePrompt' as const,
  requestId: 'above',
  props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns, scroll: { offset: 0, bodyRows: 19 }, view: {} },
})

function textOf(node: unknown): string {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  const el = node as { type?: string; props?: Record<string, unknown>; children?: unknown }
  const label = el.type === 'Button' ? `[ ${String(el.props?.label)} ]` : ''
  return `${label}${textOf(el.children)}${el.type === 'Box' && (el.props as { flexDirection?: string })?.flexDirection === 'column' ? '\n' : ''}`
}

type On = Parameters<Extract<Parameters<typeof test>[1], (...args: never[]) => unknown>>[1]

// The engine beneath the mod: a store, files, prompts and opens it records.
function world(on: On, store = new Map<string, unknown>(), isFailing = (_path: string) => false) {
  const faults = { session: false, store: (_key: string) => false }
  const messages: Msg[] = []
  const sent: string[] = []
  const opened: string[] = []
  const files = new Map<string, string>()
  on('prompt.submit', (_, e) => (sent.push(e.text), { text: e.text }))
  const toasts: string[] = []
  on('ui.toast', (_, e) => (toasts.push(String((e as { text?: unknown }).text ?? JSON.stringify(e))), { value: undefined }))
  on('ui.invalidate', () => ({ value: undefined }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('store.get', (_, e) => ({ value: store.get(e.key) }))
  on('store.set', (_, e) => {
    if (faults.store(e.key)) throw new Error('EIO')
    store.set(e.key, e.value)
    return { value: undefined }
  })
  on('fs.read', (_, e) => {
    const text = files.get(e.path)
    if (text === undefined) throw new Error('ENOENT')
    return { value: text }
  })
  on('fs.write', (_, e) => {
    if (isFailing(e.path)) throw new Error('EACCES')
    files.set(e.path, e.text)
    return { value: undefined }
  })
  const links = new Map<string, string>()
  on('fs.exists', (_, e) => ({ value: e.path === '/' || links.has(e.path) || files.has(e.path) || [...files.keys()].some(p => p.startsWith(`${e.path}/`)) }))
  on('fs.stat', (_, e) => ({ value: { kind: 'directory', size: 0, mtimeMs: 0, isLink: links.has(e.path), realPath: links.get(e.path) ?? e.path } }) as never)
  on('fs.list', (_, e) => ({
    value: [...files.keys()]
      .filter(p => p.startsWith(`${e.path}/`))
      .map(p => ({ name: p.slice(e.path.length + 1), kind: 'file' as const, size: 1, mtimeMs: 0, isLink: false })),
  }))
  // rm and mv act on the files; anything else is an open the test reads back.
  on('process.run', (_, e) => {
    const [prog, ...args] = e.argv
    if (prog === 'rm') for (const a of args.filter(a => a !== '-f')) files.delete(a)
    else if (prog === 'mv' && args[0] !== undefined && args[1] !== undefined) {
      files.set(args[1], files.get(args[0]) ?? '')
      files.delete(args[0])
    } else opened.push(e.argv.join(' '))
    return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  // The engine's $.state for this mod (the test mock answers clock, store and env only).
  const state = new Map<string, unknown>()
  on('state.get', (_, e) => ({ value: { value: state.get(e.key), version: 0 } }) as never)
  on('state.set', (_, e) => (state.set(e.key, e.value), { value: { isSet: true, version: 1 } }) as never)
  on('env.get', () => ({ value: '/h/me' }))
  on('session.id', () => ({ value: SID }))
  on('session.messages', () => {
    if (faults.session) throw new Error('EIO')
    return { value: messages } as never
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('tool.call', () => ({ result: {}, text: 'ok' }) as never)
  return { sent, opened, files, store, toasts, state, links, messages, faults }
}

// The built-in's offer card beneath the mod; other plugins' bands sit beside it,
// their costs changing on every draw.
function drawCard(on: On, line: string) {
  let draws = 0
  on('ui.render', ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    draws += 1
    return Box({
      flexDirection: 'column',
      children: [
        Text({ children: [`$2.5${draws}last $1.05 · 25% reuse1 duplicate?`] }),
        Box({
          children: [
            Text({ children: ['Heads up · ', line] }),
            Box({
              children: [
                Button({ key: 'a', label: 'Learn more', onPress: () => {} }),
                Button({ key: 'b', label: 'Knew this already', onPress: () => {} }),
              ],
            }),
          ],
        }),
        Text({ children: ['workers v0.46.14 · tmux 0'] }),
      ],
    })
  })
  return () => draws
}

test('an offer card is sent once with its Learn more, hidden, and logged with its verdict', async ($, on) => {
  const w = world(on)
  // The built-in's store holds the whole line (two sentences here) and its explanation.
  w.files.set(
    `${STORE}/${BUILTIN}`,
    JSON.stringify({
      sessions: [
        { id: 'other', tag: 'Heads up', view: { kind: 'offer', line: 'Not this one.' } },
        { id: SID, tag: 'Heads up', view: { kind: 'offer', line: '兩張單程票被加總了。來回票更便宜。.', explanation: '**Why it matters**\n- The plan page lists 2.91 萬.' } },
      ],
    }),
  )
  on('turn.complete', (_, e) => ({ text: e.turnId === 't0' ? 'Long task reply.' : 'Fixed: the fare now uses the round-trip price.' }))
  const draws = drawCard(on, '兩張單程票被加總了。.')

  await $.session.start(start)
  // The card shows while a long main turn runs; the relay is queued behind it.
  await $.turn.start({ text: 'long task', turnId: 't0' })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await ui.find({ type: 'Text', text: /Heads up/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /workers/ })).toBeDefined()
    await ui.unmount()
  }

  expect(draws()).toBe(2)
  expect(w.sent.length).toBe(1)
  expect(w.sent[0]).toContain('\n> Heads up · 兩張單程票被加總了。來回票更便宜。\n>\n> **Why it matters**\n> - The plan page lists 2.91 萬.\n')
  expect(w.sent[0]).not.toContain('Only the card')
  expect(w.sent[0]).toMatch(/needs the user's approval .* is not made: name it and ask\./)
  expect(w.sent[0]).toMatch(/\nFlagged at \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z, while a turn ran: check it against the work as it stands now\.\n/)

  // The long turn reads the line after its next main-loop tool result, once; a subagent's result does not carry it.
  const bash = { tool: 'Bash', command: 'ls', description: 'list' }
  const contextOf = async (input: object) => ((await $.tool.call(input as never)) as { context?: readonly string[] }).context ?? []
  expect(await contextOf({ ...bash, agentId: 'a1' })).toEqual([])
  const early = await contextOf(bash)
  expect(early.length).toBe(1)
  expect(early[0]).toMatch(/^A side agent .*\(at \d{4}-\d{2}-\d{2}T[\d:]{8}Z, while this turn runs\)\n> Heads up · 兩張單程票被加總了。來回票更便宜。\n>\n> \*\*Why it matters\*\*\n> - The plan page lists 2\.91 萬\.\n.*approves nothing/)
  expect(await contextOf(bash)).toEqual([])

  // One file for this session: <project>/<day>-<sid8>.log
  const fileName = /^\/h\/me\/\.local\/state\/agent-should-know\/agent_automation\/\d{4}-\d{2}-\d{2}-28d2c553\.log$/
  const logOf = () => [...w.files].find(([path]) => fileName.test(path))?.[1] ?? ''

  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't0', reason: 'answer' })
  expect(logOf()).not.toContain('Long task reply.')
  await $.turn.start({ text: w.sent[0] ?? '', turnId: 't1' })
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  expect([...w.files.keys()].filter(p => p.includes('/agent-should-know/')).length).toBe(1)
  const log = logOf()
  expect(log).toContain('# agent_automation · 28d2c553-6d91 · /work/agent_automation\n')
  // Each row leads with its ISO time and sid8, so files of one project sort into one timeline;
  // the verdict names its card by the card's time.
  const rows = log.split('\n').filter(r => r !== '' && !r.startsWith('#'))
  expect(rows.length).toBe(2)
  const flagged = /^(\d{4}-\d{2}-\d{2}T(\d{2}:\d{2}:\d{2})Z) · 28d2c553 · flagged · Heads up · 兩張單程票被加總了。來回票更便宜。$/.exec(rows[0] ?? '')
  expect(flagged).not.toBeNull()
  expect(rows[1]).toMatch(
    new RegExp(`^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z · 28d2c553 · handled ${flagged?.[2]} · Fixed: the fare now uses the round-trip price\\.$`),
  )
  expect([...rows].sort()).toEqual(rows)

  // The band counts it, and a fresh start (a reload) counts the same file again.
  expect(textOf(await $.ui.render(band(160)))).toContain('▌agent should know v0.2.0 · 0 asks open · audit — · coverage known · 1 heads-up · 1 handled')
  await $.session.start(start)
  expect(textOf(await $.ui.render(band(160)))).toContain('· 1 heads-up · 1 handled')
})

test('the card alone is hidden too; a store holding another card is not relayed', async ($, on) => {
  const w = world(on)
  // The store file lags: it still holds this session's previous card.
  w.files.set(`${STORE}/${BUILTIN}`, JSON.stringify({ sessions: [{ id: SID, tag: 'Heads up', view: { kind: 'offer', line: 'Something else.', explanation: 'Stale.' } }] }))
  on('ui.render', ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    return Box({
      children: [
        Text({ children: ['Heads up · ', 'Two one-way fares were summed.'] }),
        Box({
          children: [
            Button({ key: 'a', label: 'Learn more', onPress: () => {} }),
            Button({ key: 'b', label: 'Knew this already', onPress: () => {} }),
          ],
        }),
      ],
    })
  })
  await $.session.start(start)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await ui.find({ type: 'Text', text: /Heads up/ })).toBeUndefined()
    await ui.unmount()
  }

  expect(w.sent.length).toBe(1)
  expect(w.sent[0]).toContain("\n> Heads up · Two one-way fares were summed.\n(Only the card's line: its explanation was not read: the store's offer does not match the card on screen.)")
  expect(w.sent[0]).not.toContain('Stale.')
})

test('the band: header with its version, words or icons by width, fold kept across sessions, hide and /heads-up', async ($, on) => {
  const store = new Map<string, unknown>()
  const w = world(on, store)
  on('ui.render', ($, e) => $.ui.resolve(e).Box({}))
  await $.session.start(start)

  // Empty state, folded from the start: the header alone.
  const wide = textOf(await $.ui.render(band(120)))
  expect(wide).toContain('▌agent should know v0.2.0 · 0 asks open · audit — · coverage known')
  expect(wide).toContain('[ ⧉ log ][ ▸ open ][ hide ]')
  expect(wide).not.toContain('logged in')
  expect(textOf(await $.ui.render(band(50)))).toContain('[ ⧉ ][ ▸ ][ ✕ ]')

  // Open: one help line in the empty state; the choice is stored and kept by a fresh start.
  await $.ui.press({ plugin: PLUGIN, key: 'fold', requestId: 'above' })
  expect(store.get('agent-should-know.fold')).toBe('open')
  expect(textOf(await $.ui.render(band(120)))).toContain('logged in ~/.local/state/agent-should-know/agent_automation/')
  await $.session.start(start)
  expect(textOf(await $.ui.render(band(120)))).toContain('[ ▾ fold ]')
  await $.ui.press({ plugin: PLUGIN, key: 'fold', requestId: 'above' })
  expect(store.get('agent-should-know.fold')).toBe('folded')
  await $.session.start(start)
  expect(textOf(await $.ui.render(band(120)))).toContain('[ ▸ open ]')

  // No log yet: the log button says so and opens nothing.
  await $.ui.press({ plugin: PLUGIN, key: 'log', requestId: 'above' })
  expect(w.opened).toEqual([])

  // Hide takes the band away, kept by a fresh start; /heads-up brings it back and says the count.
  await $.ui.press({ plugin: PLUGIN, key: 'hide', requestId: 'above' })
  expect(textOf(await $.ui.render(band(120)))).not.toContain('agent should know')
  await $.session.start(start)
  expect(textOf(await $.ui.render(band(120)))).not.toContain('agent should know')
  const shown = await $.command.run(cmd)
  expect(shown.text).toContain('band shown. 0 heads-up · 0 handled this session')
  expect(textOf(await $.ui.render(band(120)))).toContain('▌agent should know v0.2.0')
  expect((await $.command.run(cmd)).text).toContain('band hidden; /heads-up shows it again.')
})

test('the log button opens the session log once a card was logged', async ($, on) => {
  const w = world(on)
  drawCard(on, 'Two one-way fares were summed.')
  await $.session.start(start)
  await $.ui.render(band(120))
  await $.ui.press({ plugin: PLUGIN, key: 'log', requestId: 'above' })
  expect(w.toasts.at(-1)).toMatch(/^opened \/h\/me\/.local\/state\/agent-should-know\/agent_automation\//)
  expect(w.opened.length).toBe(1)
  expect(w.opened[0]).toMatch(/^open \/h\/me\/\.local\/state\/agent-should-know\/agent_automation\/\d{4}-\d{2}-\d{2}-28d2c553\.log$/)
})


// --- 0.2.0 v3: the owner ledger, the hold, the turn.step audit and the gate's files ---
// Tests are named by their finding id in review-design-sol-r2.md (N*) and review-design-sol-r3.md (G*).

type Msg = { role: 'user' | 'assistant'; text: string; toolUses: { tool_use_id: string; tool: string; input: Record<string, unknown>; text?: string }[] }
const usage = { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
const answer = (o: object | string) => ({ isAnswered: true, text: typeof o === 'string' ? /^(CORRECTION|DIRECTIVE|PASSIVE)$/.test(o) ? `${o} NOCONSTRAINT` : o : JSON.stringify('verdict' in o ? { supersedes: [], constraints: [], ...o } : o), usage })
const PASS = answer({ verdict: 'PASS', complete: true, findings: [] })
const REPLY = 'Done. The tests pass.'
const F1 = { id: 'F1', check: 'a', source: 'reply', quote: 'The tests pass.', problem: 'no test run backs it' }
const FAIL = answer({ verdict: 'FAIL', complete: true, findings: [F1] })
const GATE = '/h/me/.local/state/agent-hooks/28d2c553-6d91'
const AUDIT = `${GATE}/audit`
const ASKS = /^\/h\/me\/\.local\/state\/agent-should-know\/agent_automation\/\d{4}-\d{2}-\d{2}-28d2c553\.asks\.jsonl$/
const LOG = /^\/h\/me\/\.local\/state\/agent-should-know\/agent_automation\/\d{4}-\d{2}-\d{2}-28d2c553\.log$/
const EDIT = { tool: 'Edit', file_path: '/w/band.ts', old_string: 'a', new_string: 'b' }
const user = (text: string): Msg => ({ role: 'user', text, toolUses: [] })
const assistant = (text: string, toolUses: Msg['toolUses'] = []): Msg => ({ role: 'assistant', text, toolUses })
const until = async (done: () => boolean) => {
  const later = (globalThis as unknown as { setTimeout: (f: () => void, ms: number) => void }).setTimeout
  for (let i = 0; i < 200 && !done(); i++) await new Promise<void>(r => later(r, 1))
}

type $T = Parameters<Extract<Parameters<typeof test>[1], (...args: never[]) => unknown>>[0]
const say = ($: $T, text: string, origin: object = { kind: 'composer' }, extra: object = {}) =>
  $.prompt.submit({ text, wait: false, origin, ...extra } as never) as Promise<{ text?: string }>
// A deny reads as the call's text, as the model reads it.
const call = async ($: $T, input: object) => {
  const r = (await $.tool.call(input as never)) as { text?: string; deny?: string }
  return r.deny ?? r.text
}
const asks = ($: $T, args: string, origin: object = { kind: 'composer' }) => $.command.run({ ...cmd, command: 'asks', args, origin } as never)

// Invoke a newly registered closure against the same engine mocks; no old mod instance handles these calls.
function fresh(g: ReturnType<typeof judge>) {
  const { files, store, state, faults, toasts } = g.w
  // The test host scopes $ to its scanned calls; this isolated runtime instead shares only durable data.
  const runtime = {
    session: { id: async () => SID, messages: async () => { if (faults.session) throw new Error('EIO'); return g.transcript }, model: async () => 'm' },
    env: { get: async () => '/h/me' },
    store: { get: async (key: string) => store.get(key), set: async (key: string, value: unknown) => { if (faults.store(key)) throw new Error('EIO'); store.set(key, value) } },
    state: { get: async (d: { key: string }) => ({ value: state.get(d.key) }), set: async (d: { key: string }, value: unknown) => { state.set(d.key, JSON.parse(JSON.stringify(value))) } },
    fs: {
      read: async (p: string) => { if (!files.has(p)) throw new Error('ENOENT'); return files.get(p)! },
      write: async (p: string, t: string) => { files.set(p, t) },
      exists: async (p: string) => p === '/' || files.has(p) || [...files.keys()].some(f => f.startsWith(`${p}/`)),
      list: async (p: string) => [...files.keys()].filter(f => f.startsWith(`${p}/`)).map(f => ({ name: f.slice(p.length + 1) })),
      stat: async (p: string) => ({ realPath: g.w.links.get(p) ?? p }),
    },
    process: { run: async ([prog, ...args]: string[]) => {
      if (prog === 'rm') for (const a of args.filter(a => a !== '-f')) files.delete(a)
      if (prog === 'mv') { files.set(args[1]!, files.get(args[0]!)!); files.delete(args[0]!) }
      return { exitCode: 0 }
    } },
    ui: { toast: (text: string) => toasts.push(text), invalidate: () => {} },
    command: { register: async () => ({}) },
    clock: { after: () => ({ cancel: () => {} }) },
    model: {
      fork: async (p: { prompt: string }) => { g.j.forkPrompts.push(p.prompt); return g.j.fork.shift() ?? PASS },
      complete: async (p: { prompt: string }) => { g.j.smallPrompts.push(p.prompt); return g.j.small.shift() ?? answer('PASSIVE') },
    },
  } as unknown as EngineInterface
  const hooks = new Map<string, (...args: never[]) => unknown>()
  register(((name: string, ...args: unknown[]) => {
    if (args.length === 1) hooks.set(name, args[0] as (...args: never[]) => unknown)
  }) as never, {} as never)
  const next = Object.assign(async () => ({ text: 'ok', cwd: start.cwd }), { origin: { plugin: 'engine' } })
  return {
    start: () => hooks.get('session.start')!(runtime as never, start as never, next as never),
    act: (input: object) => hooks.get('tool.call')!(runtime as never, input as never, next as never) as Promise<{ deny?: string; text?: string }>,
    finish: async (text: string) => {
      const step = async function* () { return { turnId: 'fresh', answer: text, toolUses: [], stopReason: 'end_turn' } }
      const stream = hooks.get('turn.step')!(runtime as never, {} as never, step as never) as AsyncGenerator<unknown>
      for await (const _ of stream) void _
    },
  }
}

// The models, the transcript and the turn's step beneath the mod: each answer queued, the defaults the no-answer ones.
function judge(on: On, store = new Map<string, unknown>(), isFailing?: (path: string) => boolean) {
  const w = world(on, store, isFailing)
  const transcript = w.messages
  const j = {
    fork: [] as unknown[],
    alt: [] as unknown[],
    small: [] as unknown[],
    forkPrompts: [] as string[],
    altPrompts: [] as string[],
    smallPrompts: [] as string[],
    smallRequests: [] as object[],
    wait: undefined as Promise<void> | undefined,
    step: {} as object,
    onFork: undefined as (() => void) | undefined,
  }
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('model.fork', async (_, e) => {
    j.onFork?.()
    j.forkPrompts.push(e.prompt)
    if (j.wait) await j.wait
    return { value: (j.fork.shift() ?? { isAnswered: false, reason: 'nothing-to-fork' }) as never }
  })
  on('model.complete', (_, e) => {
    if (e.model === 'haiku') return (j.smallPrompts.push(String(e.prompt)), j.smallRequests.push({ model: e.model, effort: e.effort, maxTokens: e.maxTokens, timeoutMs: e.timeoutMs }), { value: (j.small.shift() ?? answer('PASSIVE')) as never })
    j.altPrompts.push(String(e.prompt))
    return { value: (j.alt.shift() ?? { isAnswered: false, reason: 'empty-reply', usage }) as never }
  })
  on('turn.step', async function* () {
    return j.step as never
  })
  on('command.run', () => ({ text: 'ran' }) as never)
  on('ui.render', ($, e) => $.ui.resolve(e).Box({}))
  const file = (re: RegExp) => [...w.files].find(([p]) => re.test(p))
  return {
    w,
    j,
    transcript,
    rows: () => (file(ASKS)?.[1] ?? '').split('\n').filter(Boolean).map(l => JSON.parse(l) as Row),
    log: () => (file(LOG)?.[1] ?? '').split('\n').filter(r => r !== '' && !r.startsWith('#')),
    gen: () => (JSON.parse(w.files.get(`${AUDIT}/current`) ?? '{}') as { generation?: string }).generation,
    verdict: async (reply: string) => JSON.parse(w.files.get(`${AUDIT}/${await sha16(reply)}.json`) ?? 'null') as Record<string, unknown> | null,
    // The main loop's step that ends the turn: no tool use, a stop reason.
    finish: async ($: $T, text: string, extra: object = {}, event: object = {}) => {
      j.step = { turnId: 't1', index: 0, answer: text, toolUses: [], stopReason: 'end_turn', usage, ...extra }
      for await (const _ of $.turn.step({ turnId: 't1', index: 0, model: 'm', messageCount: 1, ...event } as never)) void _
    },
  }
}

test('sha: a reply ending in "\\n\\n  " hashes as the trimmed reply, the hex perl+shasum gives; U+3000 is not trimmed', async () => {
  // printf '%s' $'完成：exit=0 · 12 passed\n\n  ' | perl -0pe 's/[\t\n\x0B\f\r ]+\z//' | shasum -a 256
  // → 34965ec5a4aa22659fa20e28f97764b052485ca0ac33c6539da1b653e714e532
  expect(await sha16('完成：exit=0 · 12 passed\n\n  ')).toBe('34965ec5a4aa2265')
  expect(await sha16('完成：exit=0 · 12 passed')).toBe('34965ec5a4aa2265')
  expect(await sha16('完成：exit=0 · 12 passed　')).not.toBe('34965ec5a4aa2265')
})

test('N10: the final main-loop step is audited on r.answer verbatim; the verdict binds turnId, episode, rows, tools and generation', async ($, on) => {
  const g = judge(on)
  await $.session.start(start)
  await say($, 'run the tests')
  g.transcript.push(user('run the tests'), assistant('', [{ tool_use_id: 'tu1', tool: 'Bash', input: { command: 'npm test' }, text: '12 passed' }]), assistant(REPLY))
  g.j.fork.push(PASS)
  await g.finish($, `${REPLY}\n\n  `)
  expect(await g.verdict(REPLY)).toEqual({ verdict: 'PASS', reason: 'E1', turnId: 't1', episode: 'E1', covered: ['U1'], tools: ['tu1'], generation: g.gen() })
  expect(g.j.forkPrompts[0]).toContain(`<reply>\n${REPLY}\n\n  \n</reply>`)
  expect(g.log().some(l => / · judge · E1 · fork · .* · tok 120$/.test(l))).toBe(true)
  // Only a PASS closes an ask.
  expect(g.w.files.get(`${GATE}/asks-open.md`)).toContain('(none open)')
  expect(textOf(await $.ui.render(band(160)))).toContain('· 0 asks open · audit PASS E1 · coverage known')
})

test('N10: a step with tool uses, with no stop reason, or of a subagent is not audited', async ($, on) => {
  const g = judge(on)
  await $.session.start(start)
  await g.finish($, REPLY, { toolUses: [{ tool_use_id: 'tu1', tool: 'Bash', input: {} }] })
  await g.finish($, REPLY, { stopReason: null })
  await g.finish($, REPLY, {}, { agentId: 'a1' })
  expect(g.j.forkPrompts).toEqual([])
  expect(await g.verdict(REPLY)).toBeNull()
})

test('N10: an error in the hook is UNKNOWN hook-error:<class>', async ($, on) => {
  const g = judge(on)
  await $.session.start(start)
  g.j.fork.push({ isAnswered: true, text: '{}', usage: undefined })
  await g.finish($, REPLY)
  expect(await g.verdict(REPLY)).toMatchObject({ verdict: 'UNKNOWN', reason: 'hook-error:TypeError', turnId: 't1' })
  expect(g.w.toasts.some(t => t.includes('self-audit failed'))).toBe(true)
})

test('N10: the judge races a 60 s clock; no answer by then is UNKNOWN timeout', async ($, on) => {
  const clock = mock.clock(on)
  const g = judge(on)
  await $.session.start(start)
  g.j.wait = new Promise<void>(() => {})
  const done = g.finish($, REPLY)
  await until(() => g.j.forkPrompts.length === 1)
  await clock.advance(60_000)
  await done
  expect(await g.verdict(REPLY)).toMatchObject({ verdict: 'UNKNOWN', reason: 'timeout' })
})

test('N8: when the fork does not answer, complete gets the episode evidence whole, with no cut', async ($, on) => {
  const g = judge(on)
  await $.session.start(start)
  await say($, 'run the tests')
  const out = `${'line\n'.repeat(3000)}12 passed`
  g.transcript.push(user('run the tests'), assistant('', [{ tool_use_id: 'tu1', tool: 'Bash', input: { command: 'npm test' }, text: out }]), assistant(REPLY))
  g.j.alt.push(PASS)
  await g.finish($, REPLY)
  expect(g.j.altPrompts[0]).toContain(`[result tu1]\n${out}\n`)
  expect(g.j.altPrompts[0]).toContain(`<reply>\n${REPLY}\n</reply>`)
  expect(await g.verdict(REPLY)).toMatchObject({ verdict: 'PASS' })
  expect(g.log().some(l => / · judge · E1 · complete · /.test(l))).toBe(true)
})

test('G4: turn.start rewrites active, removes earlier verdicts, chain and missing-chain, and bumps the generation', async ($, on) => {
  const g = judge(on)
  await $.session.start(start)
  expect(g.w.files.get(`${AUDIT}/active`)).toBe('agent-should-know 0.2.0\n')
  const before = Number(g.gen() ?? 0)
  for (const n of ['0123456789abcdef.json', 'chain', 'missing-chain', 'held']) g.w.files.set(`${AUDIT}/${n}`, '{}')
  g.w.files.delete(`${AUDIT}/active`)
  await $.turn.start({ text: 'next', turnId: 't2' })
  const left = [...g.w.files.keys()].filter(p => p.startsWith(`${AUDIT}/`)).map(p => p.slice(AUDIT.length + 1))
  expect(left.sort()).toEqual(['active', 'current', 'held'])
  expect(g.gen()).toBe(String(before + 1))
})

test('G4: a judge result that lands after the generation moved is dropped; the mod does not audit its own fork', async ($, on) => {
  const g = judge(on)
  await $.session.start(start)
  await say($, 'run the tests')
  g.transcript.push(user('run the tests'))
  let open = () => {}
  g.j.wait = new Promise<void>(r => (open = r))
  g.j.fork.push(PASS)
  const done = g.finish($, REPLY)
  await until(() => g.j.forkPrompts.length === 1)
  // The fork's own final step comes back through turn.step: no second audit.
  await g.finish($, 'the fork answers')
  expect(g.j.forkPrompts.length).toBe(1)
  await say($, 'also the README')
  open()
  await done
  expect(await g.verdict(REPLY)).toBeNull()
  expect(g.log().some(l => / · audit-stale · E1 · UNKNOWN dropped · gen \d+→\d+$/.test(l))).toBe(true)
  expect(g.w.files.get(`${GATE}/asks-open.md`)).toContain('U1 [owner]')
})

test('G6: a PASS with any valid finding is UNKNOWN; N3: a PASS not complete is UNKNOWN', async ($, on) => {
  const g = judge(on)
  await $.session.start(start)
  await say($, 'run the tests')
  g.transcript.push(user('run the tests'))
  g.j.fork.push(answer({ verdict: 'PASS', complete: true, findings: [F1] }), answer({ verdict: 'PASS', complete: false, findings: [] }))
  await g.finish($, REPLY)
  expect(await g.verdict(REPLY)).toMatchObject({ verdict: 'UNKNOWN', reason: 'protocol:pass-with-findings' })
  await g.finish($, REPLY)
  expect(await g.verdict(REPLY)).toMatchObject({ verdict: 'UNKNOWN', reason: 'protocol:pass-not-complete' })
  expect(g.w.files.get(`${GATE}/asks-open.md`)).toContain('U1 [owner]')
})

test('N3: text around the object is a protocol error; a tool quote under an unrelated id is dropped; an omission quoted from the ask is valid', async ($, on) => {
  const g = judge(on)
  await $.session.start(start)
  await say($, 'run the tests and update the README')
  g.transcript.push(user('run the tests and update the README'), assistant('', [{ tool_use_id: 'tu1', tool: 'Bash', input: { command: 'npm test' }, text: '12 passed' }]))
  const fake = { id: 'F1', check: 'a', source: 'tool', tool_use_id: 'tu9', quote: '12 passed', problem: 'no such run' }
  const omission = { id: 'F2', check: 'b', source: 'ask', ask_id: 'U1', quote: 'update the README', problem: 'the README is not updated' }
  g.j.fork.push(answer(`AUDIT: PASS\n${JSON.stringify({ verdict: 'PASS', complete: true, findings: [] })}`), answer({ verdict: 'FAIL', complete: true, findings: [fake] }), answer({ verdict: 'FAIL', complete: true, findings: [omission] }))
  await g.finish($, REPLY)
  expect(await g.verdict(REPLY)).toMatchObject({ verdict: 'UNKNOWN', reason: 'protocol' })
  await g.finish($, REPLY)
  expect(await g.verdict(REPLY)).toMatchObject({ verdict: 'UNKNOWN', reason: 'protocol:fail-without-valid-finding' })
  expect(g.log().some(l => / · finding-dropped · E1 · F1 tool tu9 not in this episode$/.test(l))).toBe(true)
  await g.finish($, REPLY)
  const v = await g.verdict(REPLY)
  expect(v).toMatchObject({ verdict: 'FAIL', findings: [{ id: 'F2', problem: 'the README is not updated' }] })
  expect(String(v?.reason)).toContain('[audit] F2 the README is not updated')
})

test('G5/N4: past the FAIL cap only exact [audit] lines relay the findings: REPORTED, held, asks still open', async ($, on) => {
  const g = judge(on)
  await $.session.start(start)
  await say($, 'run the tests')
  g.transcript.push(user('run the tests'))
  g.j.fork.push(FAIL, FAIL, FAIL)
  await g.finish($, REPLY)
  expect(await g.verdict(REPLY)).toMatchObject({ verdict: 'FAIL', findings: [{ id: 'F1', problem: 'no test run backs it' }] })
  await g.finish($, REPLY)
  await g.finish($, REPLY)
  expect(String((await g.verdict(REPLY))?.reason)).toContain('one per line:\n[audit] F1 no test run backs it')
  // A claim added on the line is not the line: no relay.
  const extra = `${REPLY}\n\n[audit] F1 no test run backs it; fixed since`
  await g.finish($, extra)
  expect(await g.verdict(extra)).toMatchObject({ verdict: 'FAIL' })
  const relayed = `${REPLY}\n\n- [audit] F1 no test run backs it`
  await g.finish($, relayed)
  expect(await g.verdict(relayed)).toMatchObject({ verdict: 'REPORTED', findings: [{ id: 'F1', problem: 'no test run backs it' }] })
  expect(g.j.forkPrompts.length).toBe(3)
  expect(g.w.files.get(`${AUDIT}/held`)).toContain('REPORTED E1: F1 still open')
  expect(g.w.files.get(`${GATE}/asks-open.md`)).toContain('U1 [owner]')
  expect(await call($, EDIT)).toMatch(/^agent-should-know held Edit: REPORTED E1/)
})

test('N2: past 3 judge calls the audit is UNAUDITED judge-cap, and no ask is closed', async ($, on) => {
  const g = judge(on)
  await $.session.start(start)
  await say($, 'run the tests')
  g.transcript.push(user('run the tests'))
  for (let i = 0; i < 3; i++) {
    await g.finish($, REPLY)
    expect(await g.verdict(REPLY)).toMatchObject({ verdict: 'UNKNOWN', reason: 'judge:fork nothing-to-fork;complete empty-reply' })
  }
  await g.finish($, REPLY)
  expect(await g.verdict(REPLY)).toMatchObject({ verdict: 'UNAUDITED', reason: 'judge-cap' })
  expect(g.j.forkPrompts.length).toBe(3)
  expect(g.w.files.get(`${GATE}/asks-open.md`)).toContain('U1 [owner]')
})

test('K3: later owner text B 先不用做 supersedes ask B even when the verdict is FAIL', async ($, on) => {
  const g = judge(on)
  await $.session.start(start)
  await say($, '做 B')
  g.transcript.push(user('做 B'))
  await say($, 'B 先不用做')
  g.transcript.push(user('B 先不用做'))
  g.j.fork.push(answer({ verdict: 'FAIL', complete: true, findings: [F1], supersedes: [{ row_id: 'U1', quote: 'B 先不用做' }] }))
  await g.finish($, REPLY)
  expect(await g.verdict(REPLY)).toMatchObject({ verdict: 'FAIL' })
  expect(g.rows()[0]?.closed).toBe(true)
  expect(g.w.files.get(`${GATE}/asks-open.md`)).not.toContain('U1 [owner]')
})

test('K3: agent text, earlier or undelivered owner text, unknown rows and altered quotes cannot supersede; invalid entries are counted', async ($, on) => {
  const g = judge(on)
  await $.session.start(start)
  await say($, 'B 先不用做')
  g.transcript.push(user('B 先不用做'))
  await say($, '做 B')
  g.transcript.push(user('做 B'), assistant('B 先不用做'))
  await say($, 'B 先不用做', { kind: 'sdk' })
  g.transcript.push(user('B 先不用做'))
  await say($, 'B 先不用做\n稍後再說')
  const supersedes = [{ row_id: 'U2', quote: 'B 先不用做' }, { row_id: 'U2', quote: 'B  先不用做' }, { row_id: 'U99', quote: 'B 先不用做' }, null]
  g.j.fork.push(answer({ verdict: 'PASS', complete: true, findings: [], supersedes }))
  await g.finish($, REPLY)
  expect(await g.verdict(REPLY)).toMatchObject({ verdict: 'UNKNOWN', reason: 'protocol:pass-with-dropped-findings' })
  expect(g.rows()[1]?.closed).not.toBe(true)
  expect(g.log().filter(l => l.includes(' · finding-dropped · ')).length).toBe(4)
})

test('K3: PASS keeps a constraint open across reload; only a later owner quote closes it', async ($, on) => {
  const g = judge(on)
  await $.session.start(start)
  await say($, '不要 push')
  g.transcript.push(user('不要 push'))
  g.j.small.push(answer('DIRECTIVE CONSTRAINT'))
  g.j.fork.push(answer({ verdict: 'PASS', complete: true, findings: [], constraints: ['U1'] }), PASS)
  await g.finish($, REPLY)
  expect(await g.verdict(REPLY)).toMatchObject({ verdict: 'PASS' })
  expect(g.rows()[0]).toMatchObject({ constraint: true })
  expect(g.rows()[0]?.closed).not.toBe(true)
  await $.session.start(start)
  await g.finish($, REPLY)
  expect(g.rows()[0]?.closed).not.toBe(true)
  expect(g.w.files.get(`${GATE}/asks-open.md`)).toContain('[constraint]')
  await say($, '取消不要 push 的限制')
  g.transcript.push(user('取消不要 push 的限制'))
  g.j.fork.push(answer({ verdict: 'PASS', complete: true, findings: [], supersedes: [{ row_id: 'U1', quote: '取消不要 push 的限制' }] }))
  await g.finish($, REPLY)
  expect(g.rows()[0]?.closed).toBe(true)
})

test('judge-cap: UNKNOWN then FAIL at call 3 requires exact audit relay, never UNAUDITED', async ($, on) => {
  const g = judge(on)
  await $.session.start(start)
  await say($, 'run the tests')
  g.transcript.push(user('run the tests'))
  g.j.fork.push(answer('not JSON'), FAIL, FAIL)
  for (let i = 0; i < 3; i++) await g.finish($, REPLY)
  expect(await g.verdict(REPLY)).toMatchObject({ verdict: 'FAIL' })
  expect(String((await g.verdict(REPLY))?.reason)).toContain('[audit] F1 no test run backs it')
  await g.finish($, `${REPLY}\n[audit] F1 no test run backs it; fixed`)
  expect(await g.verdict(`${REPLY}\n[audit] F1 no test run backs it; fixed`)).toMatchObject({ verdict: 'FAIL' })
  const reply = `${REPLY}\n[audit] F1 no test run backs it`
  await g.finish($, reply)
  expect(await g.verdict(reply)).toMatchObject({ verdict: 'REPORTED', findings: [{ id: 'F1', problem: 'no test run backs it' }] })
  expect(g.j.forkPrompts.length).toBe(3)
  expect(g.rows()[0]?.closed).not.toBe(true)
})

test('F3 N2/N7: a failed ledger write is retried by the next change; two in a row read UNKNOWN store-error', async ($, on) => {
  let failing = true
  const g = judge(on, undefined, p => failing && p.endsWith('.asks.jsonl'))
  await $.session.start(start)
  await say($, 'first')
  expect(g.w.toasts.some(t => t.includes('owner ledger not written'))).toBe(true)
  failing = false
  await say($, 'second')
  expect(g.rows().map(r => [r.u, r.text])).toEqual([
    [1, 'first'],
    [2, 'second'],
  ])
  failing = true
  await say($, 'third')
  await say($, 'fourth')
  g.j.fork.push(PASS)
  await g.finish($, REPLY)
  // The engine wraps a hook's throw: its class here is HooksError.
  expect(await g.verdict(REPLY)).toMatchObject({ verdict: 'UNKNOWN', reason: 'store-error:HooksError' })
  expect(g.j.forkPrompts).toEqual([])
  expect(textOf(await $.ui.render(band(200)))).toContain('store-error:HooksError')
})

test('G3: the state queue replays a row the ledger missed; a lost queue reads coverage unknown, no PASS until /asks confirm', async ($, on) => {
  let failing = false
  const g = judge(on, undefined, p => failing && p.endsWith('.asks.jsonl'))
  await $.session.start(start)
  await say($, 'a')
  failing = true
  await say($, 'b')
  failing = false
  // Resume: the queue in the engine's state holds U2.
  await $.session.start(start)
  expect(g.rows().map(r => r.text)).toEqual(['a', 'b'])
  failing = true
  await say($, 'c')
  failing = false
  // The queue is lost (the engine restarted) while the pending count still names a row.
  g.w.state.clear()
  await $.session.start(start)
  expect(textOf(await $.ui.render(band(200)))).toContain('coverage unknown')
  g.j.fork.push(PASS, PASS)
  await g.finish($, REPLY)
  expect(await g.verdict(REPLY)).toMatchObject({ verdict: 'UNKNOWN', reason: 'coverage:unknown' })
  expect(g.j.forkPrompts.length).toBe(0)
  expect((await asks($, 'confirm', { kind: 'peer' })).text).toContain('only from the owner')
  expect((await asks($, 'confirm')).text).toContain('coverage confirmed')
  g.transcript.push(user('a'), user('b'), user('c'))
  await g.finish($, REPLY)
  expect(await g.verdict(REPLY)).toMatchObject({ verdict: 'PASS' })
})

test('G3: rows read back from the transcript are unconfirmed: no PASS until /asks confirm', async ($, on) => {
  const g = judge(on)
  g.transcript.push(user('fix the band'), assistant('Fixed.'))
  await $.session.start(start)
  expect(g.rows().map(r => [r.origin, r.text])).toEqual([['transcript', 'fix the band']])
  expect(textOf(await $.ui.render(band(200)))).toContain('coverage unconfirmed')
  g.j.fork.push(PASS, PASS)
  await g.finish($, REPLY)
  expect(await g.verdict(REPLY)).toMatchObject({ verdict: 'UNKNOWN', reason: 'coverage:unconfirmed' })
  await asks($, 'confirm')
  await g.finish($, REPLY)
  expect(await g.verdict(REPLY)).toMatchObject({ verdict: 'PASS', covered: ['U1'] })
})

test('G7: asks-open.md holds each open row verbatim, header first, the end marker with the generation last, via a temp file', async ($, on) => {
  const g = judge(on)
  await $.session.start(start)
  await say($, 'keep the band\n> quoted from a review')
  const lines = (g.w.files.get(`${GATE}/asks-open.md`) ?? '').trimEnd().split('\n')
  expect(lines[0]).toBe('## Open owner asks (agent-should-know)')
  expect(lines.at(-1)).toBe(`<!-- asks-open gen=${g.gen()} end -->`)
  expect(lines.join('\n')).toContain('U1 [owner] ')
  expect(lines.join('\n')).toContain('keep the band\n<quoted>> quoted from a review</quoted>')
  expect(g.w.files.has(`${GATE}/asks-open.md.tmp`)).toBe(false)
  const before = g.gen()
  await say($, 'one more')
  expect(Number(g.gen())).toBe(Number(before) + 1)
})

test('item 8: a peer, plugin or system message is not an owner row; sdk is unknown', async ($, on) => {
  const g = judge(on)
  await $.session.start(start)
  for (const kind of ['peer', 'task-notification', 'scheduled-trigger', 'auto-continuation', 'observer', 'observer-activity', 'projects-relay', 'peer-send-message'])
    await say($, `from ${kind}`, { kind })
  await say($, 'as if typed', { kind: 'plugin', name: 'quick-say', asUser: true })
  expect(g.rows()).toEqual([])
  await say($, 'from a script', { kind: 'sdk' })
  expect(g.rows().map(r => r.origin)).toEqual(['unknown'])
})

test('N7: a typed slash command is one row; the same text twice maps one to one', async ($, on) => {
  const g = judge(on)
  await $.session.start(start)
  await say($, '/review src', { kind: 'composer' }, { command: { name: 'review', args: 'src' } })
  await $.command.run({ ...cmd, command: 'review', args: 'src' })
  await say($, 'yes')
  await say($, 'yes')
  expect(g.rows().map(r => [r.origin, r.text])).toEqual([
    ['owner-command', '/review src'],
    ['owner', 'yes'],
    ['owner', 'yes'],
  ])
  // Only the first "yes" reached the model yet.
  g.transcript.push(user('/review src'), user('yes'), assistant('ok'))
  g.j.fork.push(PASS)
  await g.finish($, REPLY)
  expect(await g.verdict(REPLY)).toMatchObject({ verdict: 'PASS', covered: ['U1', 'U2'] })
  expect(g.w.files.get(`${GATE}/asks-open.md`)).toContain('U3 [owner]')
})

test('G1: held denies every tool that does not read, with its reason; only a composer or bridge prompt clears it', async ($, on) => {
  const g = judge(on)
  await $.session.start(start)
  const hold = () => g.w.files.set(`${AUDIT}/held`, JSON.stringify({ at: 'x', sha: 'y', reason: 'missing verdict' }))
  hold()
  expect(await call($, EDIT)).toBe('agent-should-know held Edit: missing verdict. Only tools that read run until the owner sends a message.')
  expect(await call($, { tool: 'Read', file_path: '/w/a' })).toBe('ok')
  expect(textOf(await $.ui.render(band(200)))).toContain('⚠ held: missing verdict')
  await say($, 'a peer says go', { kind: 'peer' })
  await say($, 'a plugin says go', { kind: 'plugin', name: 'x' })
  await say($, 'ran', { kind: 'task-notification' })
  expect(await call($, EDIT)).toMatch(/held Edit: missing verdict/)
  await say($, 'go on')
  expect(g.w.files.has(`${AUDIT}/held`)).toBe(false)
  expect(await call($, EDIT)).toBe('ok')
  hold()
  await say($, 'from the phone', { kind: 'bridge' })
  expect(await call($, EDIT)).toBe('ok')
})

test('G2: while held, shell shapes that write are denied and plain reads run; MCP reads by exact name', async ($, on) => {
  const g = judge(on)
  await $.session.start(start)
  g.w.files.set(`${AUDIT}/held`, JSON.stringify({ reason: 'REPORTED E1' }))
  const bash = (command: string) => call($, { tool: 'Bash', command, description: 'x' })
  const writes = ["sed -n 'w victim' input", 'sort -o victim input', 'uniq input victim', 'git log --output=victim', 'git diff --output=victim', 'rg --pre ./x foo', 'python3 x.py', '__proto__ victim', 'rg --max-c=2 foo f']
  const reads = ['rg -i foo', 'grep -i foo f', "sed -n '1,5p' f", 'git log --no-ext-diff --no-textconv', 'sort f', 'rg --max-count=2 foo f']
  const ran: string[] = []
  for (const command of [...writes, ...reads]) if (!/held Bash: REPORTED E1/.test(String(await bash(command)))) ran.push(command)
  expect(ran).toEqual(reads)
  expect(await call($, { tool: 'mcp__session-recall__recall', query: 'x' })).toBe('ok')
  expect(await call($, { tool: 'mcp__tmux-agent__tell', text: 'x' })).toMatch(/held mcp__tmux-agent__tell/)
})

test('N1: a directive needs its Align line; a correction its Retro, checked against the claims since the episode began', async ($, on) => {
  const g = judge(on)
  await $.session.start(start)
  await say($, 'add a README section')
  g.transcript.push(user('add a README section'))
  g.j.small.push(answer('DIRECTIVE'))
  expect(await call($, EDIT)).toMatch(/U1 has no alignment block in your text yet\. U1 \(verbatim\): 「add a README section」 Write the line `U1 「/)
  g.transcript.push(assistant('U1 「add a README section」 → I add it now. The tests pass.'))
  expect(await call($, EDIT)).toBe('ok')

  await say($, 'wrong: you never ran the tests')
  g.transcript.push(user('wrong: you never ran the tests'))
  g.j.small.push(answer('CORRECTION'), answer({ aligned: false, missing: ['the corrected act is not named'] }), answer({ aligned: true, missing: [] }))
  expect(await call($, EDIT)).toMatch(/U2 has no alignment block .*Retro needed/)
  // The classifier saw the claim made earlier in the episode.
  expect(g.j.smallPrompts[1]).toContain('The tests pass.')
  g.transcript.push(assistant('Retro U2: I said 「The tests pass.」; no test ran.'))
  expect(await call($, EDIT)).toMatch(/Retro for U2 does not answer the correction yet: the corrected act is not named/)
  // The same Retro is not sent again.
  expect(await call($, EDIT)).toMatch(/does not answer the correction yet/)
  expect(g.j.smallPrompts.length).toBe(3)
  g.transcript.push(assistant('Retro U2: I said 「The tests pass.」; no test ran; I missed U1; I run npm test now.'))
  expect(await call($, EDIT)).toBe('ok')
  expect(g.j.smallPrompts[3]).toContain('I run npm test now.')
})

for (const [name, commands] of [
  ['S1 quote removal', ["sort -'o' victim input", 'sort -\\o victim input', "sort '-o'victim input", "sort -'o victim' input"]],
  ['S2 ANSI-C and localized strings', ["sort $'\\x2do' victim input", 'sort $"-o" victim input']],
  ['S3 long option abbreviations', ['sort --out=victim input', 'git log --outp=victim']],
  ['S4 shell expansion', ['sort {-o,victim} input', 'sort $FLAGS input', 'sort ~opts input', 'sort * input', 'sort ? input', 'sort [a-z] input', 'sort `flags` input']],
  ['S5 unlisted exec and write flags', ['rg --hostname-bin ./x pattern path', 'rg -z pattern path', 'rg --search-zip pattern path', 'rg --pre ./x pattern path', 'rg --pre-glob=x pattern path', 'yq -s expr file', 'yq --split-exp=x file', 'yq -i expr file', 'file -C magic', 'file --compile magic', 'sort -T dir file', 'sort --compress-program=x file', 'git log --textconv', 'git diff --ext-diff', 'git -c core.pager=x log', 'git --paginate log', "sed -n '1p' -f script file"]],
] as const) {
  test(`${name}: held shell bypasses stay held`, async ($, on) => {
    const g = judge(on)
    await $.session.start(start)
    g.w.files.set(`${AUDIT}/held`, JSON.stringify({ reason: 'security test' }))
    for (const command of commands) expect(await call($, { tool: 'Bash', command, description: command })).toMatch(/held Bash: security test/)
  })
}

for (const command of ['rg -i pattern path', 'grep -n pattern file']) {
  test(`shell allowlist: ${command} runs while held`, async ($, on) => {
    const g = judge(on)
    await $.session.start(start)
    g.w.files.set(`${AUDIT}/held`, JSON.stringify({ reason: 'security test' }))
    expect(await call($, { tool: 'Bash', command, description: command })).toBe('ok')
  })
}

test('S6: audit state writes are denied without a hold and with asks off; resolved paths and shell prefixes are protected, reads run', async ($, on) => {
  const g = judge(on)
  await $.session.start(start)
  const writes = [
    { tool: 'Write', file_path: `${AUDIT}/x.json`, content: '{}' },
    { ...EDIT, file_path: `~/.local/state/agent-hooks/${SID}/audit/../audit/current` },
    { tool: 'NotebookEdit', notebook_path: `../../h/me/.local/state/agent-should-know/x.ipynb`, new_source: 'x' },
    { tool: 'Bash', command: `rm ~/.local/state/agent-hooks/${SID}/audit/held` },
    { tool: 'Bash', command: `echo '{"verdict":"PASS"}' > $HOME/.local/state/agent-hooks/${SID}/audit/a.json` },
    { tool: 'Bash', command: `mv x \${HOME}/.local/state/agent-should-know/x` },
    { tool: 'Bash', command: `rm ${AUDIT}/held` },
  ]
  for (const input of writes) expect(await call($, input)).toMatch(/denied .*cannot write, move or delete/)
  expect(g.w.toasts.filter(t => t.includes('cannot write, move or delete')).length).toBe(writes.length)
  expect(g.log().filter(l => l.includes(' · state-write-denied · ')).length).toBe(writes.length)
  expect(await call($, { tool: 'Bash', command: `cat ${AUDIT}/current` })).toBe('ok')
  expect(await call($, { tool: 'Read', file_path: `${AUDIT}/current` })).toBe('ok')
  await asks($, 'off')
  expect(await call($, writes[0]!)).toMatch(/denied Write/)
  expect(await call($, EDIT)).toBe('ok')
})

test('N1/G1: a failed Retro check keeps the hold; after 3 only the owner\'s /asks release U<n> lets the act run, and the episode cannot PASS', async ($, on) => {
  const g = judge(on)
  await $.session.start(start)
  await say($, 'wrong: you never ran the tests')
  g.transcript.push(user('wrong: you never ran the tests'), assistant('Retro U1: I said 「The tests pass.」; I run npm test now.'))
  g.j.small.push(answer('CORRECTION'), { isAnswered: false, reason: 'timeout', usage }, answer('not json'), { isAnswered: false, reason: 'timeout', usage })
  expect(await call($, EDIT)).toMatch(/Retro check for U1 is unavailable \(timeout\); the hold stays/)
  expect(await call($, EDIT)).toMatch(/unavailable \(protocol\)/)
  expect(await call($, EDIT)).toMatch(/failed its substance check 3 times\. Only the owner can release it, with \/asks release U1/)
  expect(await call($, EDIT)).toMatch(/Only the owner can release it/)
  expect(g.j.smallPrompts.length).toBe(4)
  expect(textOf(await $.ui.render(band(200)))).toContain('U1 Retro stuck: /asks release U1')
  expect((await asks($, 'release U1', { kind: 'peer' })).text).toContain('only from the owner')
  expect((await asks($, 'release U1')).text).toContain('U1 released')
  expect(await call($, EDIT)).toBe('ok')
  g.j.fork.push(PASS)
  await g.finish($, REPLY)
  expect(await g.verdict(REPLY)).toMatchObject({ verdict: 'UNKNOWN', reason: 'align-unchecked:U1' })
  expect(g.w.files.get(`${AUDIT}/held`)).toContain('align-unchecked:U1')
})

test('N1 #q7: passive rows carry no duty; a failed or cut-off check is a correction with a toast, never aligned; haiku runs at xhigh', async ($, on) => {
  const g = judge(on)
  await $.session.start(start)
  await say($, 'what does this do?')
  g.transcript.push(user('what does this do?'))
  g.j.small.push(answer('PASSIVE'))
  expect(await call($, EDIT)).toBe('ok')
  await say($, 'use pnpm here')
  g.transcript.push(user('use pnpm here'))
  g.j.small.push({ isAnswered: false, reason: 'timeout', usage })
  expect(await call($, EDIT)).toMatch(/U2 has no alignment block .*Retro needed: classifier timeout/)
  expect(g.w.toasts).toContain('agent-should-know: U2 not classified (classifier timeout); held as a correction')
  // An answer with no kind word that spent every token was cut off.
  await say($, 'and log it')
  g.transcript.push(user('and log it'), assistant('Retro U2: I said npm; I use pnpm now.'))
  g.j.small.push({ isAnswered: true, text: '{"aligned": tr', usage: { ...usage, output_tokens: 8000 } }, answer({ aligned: true, missing: [] }))
  g.j.small.push({ isAnswered: true, text: 'The message', usage: { ...usage, output_tokens: 4000 } })
  expect(await call($, EDIT)).toMatch(/Retro check for U2 is unavailable \(truncated\); the hold stays/)
  expect(g.w.toasts).toContain('agent-should-know: U2 Retro check failed (truncated); the hold stays')
  expect(await call($, EDIT)).toMatch(/U3 has no alignment block .*Retro needed: classifier truncated/)
  expect(g.w.toasts).toContain('agent-should-know: U3 not classified (classifier truncated); held as a correction')
  expect(textOf(await $.ui.render(band(200)))).toMatch(/U1 一般.*U2 糾正.*U3 糾正/)
  const req = { model: 'haiku', effort: 'xhigh', timeoutMs: 60_000 }
  expect(g.j.smallRequests).toEqual([4000, 4000, 8000, 8000, 4000].map(maxTokens => ({ ...req, maxTokens })))
})

test('/asks off: no hold, no audit, the gate marker removed', async ($, on) => {
  const g = judge(on)
  await $.session.start(start)
  g.w.files.set(`${AUDIT}/held`, JSON.stringify({ reason: 'missing verdict' }))
  expect((await asks($, 'off')).text).toContain('off for this session')
  expect(g.w.files.has(`${AUDIT}/active`)).toBe(false)
  expect(await call($, EDIT)).toBe('ok')
  await g.finish($, REPLY)
  expect(g.j.forkPrompts).toEqual([])
})

test('F1: ancestor, MCP, realpath symlink and interpreter state writes are denied; projection tamper holds and repairs', async ($, on) => {
  const g = judge(on)
  await $.session.start(start)
  g.w.links.set('/work/state-link', GATE)
  g.w.links.set('/work/state-link/audit/..', GATE)
  for (const input of [
    { tool: 'Bash', command: 'rm -rf /h/me/.local/state' },
    { tool: 'Bash', command: 'mv /h/me/.local /elsewhere' },
    { tool: 'Write', file_path: '/h/me/.local', content: '{}' },
    { tool: 'mcp__filesystem__write_file', path: `${AUDIT}/current`, content: '{}' },
    { tool: 'Write', file_path: '/work/state-link/audit/current', content: '{}' },
    { tool: 'Write', file_path: '/work/state-link/audit/../current', content: '{}' },
    { tool: 'Bash', command: 'python3 -c "from pathlib import Path; Path.home().joinpath(\'.local/state\',\'agent-hooks\').rmdir()"' },
  ]) expect(await call($, input)).toMatch(/denied/)
  const before = g.w.files.get(`${AUDIT}/current`)
  g.w.files.set(`${AUDIT}/current`, '{"generation":"999"}')
  expect(await call($, EDIT)).toMatch(/held Edit: tamper:current/)
  expect(g.w.files.get(`${AUDIT}/current`)).toBe(before)
  expect(g.w.toasts.some(t => t.includes('tamper:current'))).toBe(true)
  g.w.files.delete(`${AUDIT}/held`)
  expect(await call($, EDIT)).toMatch(/held Edit: tamper:current/)
  expect(g.w.files.has(`${AUDIT}/held`)).toBe(true)
  g.w.files.set(`${AUDIT}/fake.json`, '{"verdict":"PASS"}')
  expect(await call($, EDIT)).toMatch(/held Edit/)
  expect(g.w.files.has(`${AUDIT}/fake.json`)).toBe(false)
  for (const p of [...g.w.files.keys()]) if (p.startsWith(`${AUDIT}/`)) g.w.files.delete(p)
  expect(await call($, EDIT)).toMatch(/held Edit/)
  expect(g.w.files.get(`${AUDIT}/current`)).toBe(before)
  expect(g.log().some(l => l.includes('tamper:'))).toBe(true)
  await asks($, 'off')
  g.w.files.set(`${AUDIT}/current`, '{}')
  expect(await call($, EDIT)).toMatch(/held Edit: tamper:current/)
})

test('F2: held Git status and diff are denied; log and show require both execution guards', async ($, on) => {
  const g = judge(on)
  await $.session.start(start)
  g.w.files.set(`${AUDIT}/held`, JSON.stringify({ reason: 'git safety' }))
  for (const command of ['git status', 'git diff', 'git status --no-ext-diff --no-textconv', 'git diff --no-ext-diff --no-textconv', 'git log', 'git show HEAD:file', 'git log --no-ext-diff', 'git show --no-textconv', 'git show -- --no-ext-diff --no-textconv'])
    expect(await call($, { tool: 'Bash', command })).toMatch(/held Bash/)
  for (const command of ['git log --no-ext-diff --no-textconv', 'git show --no-ext-diff --no-textconv HEAD:file'])
    expect(await call($, { tool: 'Bash', command })).toBe('ok')
})

test('F3: pending replay forbids PASS; a failed close-state write leaves only UNKNOWN', async ($, on) => {
  let failing = true
  const g = judge(on, undefined, p => p.endsWith('.asks.jsonl') && failing)
  await $.session.start(start)
  await say($, 'do B')
  g.transcript.push(user('do B'))
  g.j.fork.push(PASS)
  await g.finish($, REPLY)
  expect((await g.verdict(REPLY))?.verdict).toBe('UNKNOWN')
  failing = false
  await say($, 'continue')
  g.transcript.push(user('continue'))
  const pending = [...g.w.files.keys()].find(p => p.endsWith('.pending'))!
  g.w.files.set(pending, '1')
  await g.finish($, REPLY)
  expect(await g.verdict(REPLY)).toMatchObject({ verdict: 'UNKNOWN', reason: 'coverage:unknown' })
  g.w.files.set(pending, '0')
  // Fail only the close write, after the judge has returned PASS.
  g.j.onFork = () => { failing = true }
  await g.finish($, REPLY)
  expect((await g.verdict(REPLY))?.verdict).toBe('UNKNOWN')
  expect(g.w.files.get(`${AUDIT}/${await sha16(REPLY)}.json`)).not.toContain('"verdict":"PASS"')
})

test('F4: a fresh register keeps transcript rows unconfirmed until persisted owner confirmation', async ($, on) => {
  const g = judge(on)
  g.transcript.push(user('unfinished task'))
  await $.session.start(start)
  g.w.state.clear()
  const a = fresh(g)
  await a.start()
  g.j.fork.push(PASS)
  await a.finish(REPLY)
  expect(await g.verdict(REPLY)).toMatchObject({ verdict: 'UNKNOWN', reason: 'coverage:unconfirmed' })
  await asks($, 'confirm')
  g.w.state.clear()
  const b = fresh(g)
  await b.start()
  g.j.fork.push(PASS)
  await b.finish(REPLY)
  expect((await g.verdict(REPLY))?.verdict).toBe('PASS')
})

test('F5: a failed transcript read mechanically forbids a judge PASS', async ($, on) => {
  const g = judge(on)
  await $.session.start(start)
  g.w.faults.session = true
  g.j.fork.push(PASS)
  await g.finish($, REPLY)
  expect(await g.verdict(REPLY)).toMatchObject({ verdict: 'UNKNOWN', reason: 'coverage:unknown' })
  expect(g.j.forkPrompts.length).toBe(0)
})

test('F6 constraint: malformed and truncated kind answers fail closed with constraint=true and toast', async ($, on) => {
  expect(classified('PASSIVE')).toBeUndefined()
  expect(classified('PASSIVE NOCONSTRAINT trailing')).toBeUndefined()
  expect(classified('  PASSIVE NOCONSTRAINT\n')).toEqual({ need: null, constraint: false })
  const g = judge(on)
  await $.session.start(start)
  await say($, 'wrong')
  g.transcript.push(user('wrong'))
  g.j.small.push(answer('PASSIVE NOCONSTRAINT\nCORRECTION CONSTRAINT'))
  expect(await call($, EDIT)).toMatch(/Retro needed: classifier protocol/)
  expect(g.rows()[0]?.constraint).toBe(true)
  expect(g.w.toasts.some(t => t.includes('U1 not classified'))).toBe(true)
  await say($, 'also wrong')
  g.transcript.push(user('also wrong'), assistant('Retro U1: I correct it now.'))
  g.j.small.push(answer({ aligned: true, missing: [] }), { isAnswered: true, text: 'PASSIVE NOCONSTRAINT', usage: { ...usage, output_tokens: 4000 } })
  expect(await call($, EDIT)).toMatch(/Retro needed: classifier truncated/)
  expect(g.rows()[1]?.constraint).toBe(true)
})

test('F9: a fresh register rebuilds duties and episode guards from ledger despite failed store writes', async ($, on) => {
  const g = judge(on)
  await $.session.start(start)
  g.w.faults.store = key => /^(duties|episode):/.test(key)
  await say($, 'wrong: never ran tests')
  g.transcript.push(user('wrong: never ran tests'))
  g.j.small.push(answer('CORRECTION CONSTRAINT'))
  expect(await call($, EDIT)).toMatch(/Retro needed/)
  g.w.state.clear()
  const b = fresh(g)
  await b.start()
  expect((await b.act(EDIT)).deny).toMatch(/Retro needed/)
  await asks($, 'release U1')
  g.w.state.clear()
  const a = fresh(g)
  await a.start()
  g.j.fork.push(PASS)
  await a.finish(REPLY)
  expect(await g.verdict(REPLY)).toMatchObject({ verdict: 'UNKNOWN', reason: 'align-unchecked:U1' })
})

test('F7: missing transcript cannot skip the final-step audit projection and UNKNOWN verdict', async ($, on) => {
  const g = judge(on)
  await $.session.start(start)
  const current = g.w.files.get(`${AUDIT}/current`)
  for (const p of [...g.w.files.keys()]) if (p.startsWith(`${AUDIT}/`)) g.w.files.delete(p)
  g.w.faults.session = true
  await g.finish($, REPLY)
  expect((await g.verdict(REPLY))?.verdict).toBe('UNKNOWN')
  expect(g.w.files.get(`${AUDIT}/current`)).toBe(current)
  expect(g.w.files.has(`${AUDIT}/active`)).toBe(true)
})

test('F8: a failed held projection write keeps the authoritative hold on later tool calls', async ($, on) => {
  let failHeld = false
  const g = judge(on, undefined, p => failHeld && p.endsWith('/held'))
  await $.session.start(start)
  g.w.files.delete(`${AUDIT}/current`)
  failHeld = true
  expect(await call($, EDIT)).toMatch(/held Edit: tamper:current/)
  expect(g.w.files.has(`${AUDIT}/held`)).toBe(false)
  expect(await call($, EDIT)).toMatch(/held Edit: tamper:current/)
  expect(g.w.toasts.some(t => t.includes('projection held not written'))).toBe(true)
})

test('F10: delivery requires the full 500-prefix row and command arguments', async ($, on) => {
  const g = judge(on)
  await $.session.start(start)
  const prefix = 'x'.repeat(500)
  await say($, `${prefix} do not push`)
  g.transcript.push(user(`${prefix} push now`))
  await $.command.run({ ...cmd, command: 'review', args: 'src' })
  g.transcript.push(user('/review other'))
  g.j.fork.push(PASS)
  await g.finish($, REPLY)
  expect((await g.verdict(REPLY))?.covered).toEqual([])
  expect(g.rows().every(r => !r.closed)).toBe(true)
})

test('F11: a new owner row resets FAIL and call caps once while retaining open findings', async ($, on) => {
  const g = judge(on)
  await $.session.start(start)
  await say($, 'do A')
  g.transcript.push(user('do A'))
  g.j.fork.push(FAIL, FAIL, FAIL)
  for (let i = 0; i < 3; i++) await g.finish($, REPLY)
  await say($, 'also fix B')
  g.transcript.push(user('also fix B'))
  expect(g.rows().at(-1)?.episode).toMatchObject({ calls: 0, fails: 0, findings: [F1] })
  g.j.fork.push(PASS)
  await g.finish($, REPLY)
  expect(g.j.forkPrompts.length).toBe(4)
  expect((await g.verdict(REPLY))?.verdict).toBe('PASS')
})

test('constraint: mod-classified 不要 push stays open after PASS with judge constraints empty', async ($, on) => {
  const g = judge(on)
  await $.session.start(start)
  await say($, '不要 push')
  g.transcript.push(user('不要 push'))
  g.j.small.push(answer('DIRECTIVE CONSTRAINT'))
  g.j.fork.push(answer({ verdict: 'PASS', complete: true, findings: [], constraints: [] }))
  await g.finish($, REPLY)
  expect((await g.verdict(REPLY))?.verdict).toBe('PASS')
  expect(g.rows()[0]?.constraint).toBe(true)
  expect(g.rows()[0]?.closed).not.toBe(true)
})
