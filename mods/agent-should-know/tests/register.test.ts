import { expect, mock, test } from 'claude-code/testing'
import { judgeResult, ownerRow } from '../hooks/lib/records.ts'
import type { Bundle } from '../hooks/lib/records.ts'

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
function world(on: On, store = new Map<string, unknown>(), fault: { deleteKey?: string; keys?: boolean; read?: boolean; write?: boolean; rename?: boolean; sid?: string; offSave?: boolean; cas?: boolean; getKey?: string; hostDeny?: boolean; toolThrow?: boolean; echo?: (row: { uuid: string; origin: { kind: 'engine' }; door: 'notice'; message: { type: 'system'; content: { type: 'text'; text: string }[] } }) => Promise<unknown> } = {}) {
  const clock = mock.clock(on)
  const sent: string[] = []
  const opened: string[] = []
  const ran: string[] = []
  const files = new Map<string, string>()
  const logs: string[] = []
  const listeners: { text: string; resolve: () => void }[] = []
  const waitForLog = (text: string, after = 0) => logs.slice(after).some(l => l.includes(text)) ? Promise.resolve() : new Promise<void>(resolve => { listeners.push({ text, resolve }) })
  let state: unknown
  let version = 0
  const echoed: Promise<unknown>[] = []
  const reads: number[] = []
  on('ui.log', (_, e) => {
    logs.push(e.text)
    for (const listener of listeners) if (e.text.includes(listener.text)) listener.resolve()
    // The engine keeps a transcript line as a row and raises session.append for it (ed52bad5:
    // 13491 such rows). Capped so a feedback loop fails the test instead of hanging it.
    if (fault.echo && e.to === 'transcript' && echoed.length < 50)
      echoed.push(fault.echo({ uuid: `log-${echoed.length}`, origin: { kind: 'engine' }, door: 'notice', message: { type: 'system', content: [{ type: 'text', text: e.text }] } }))
    return { value: undefined }
  })
  on('store.keys', () => {
    if (fault.keys) throw new Error('injected keys EIO')
    return { value: [...store.keys()] }
  })
  on('store.delete', (_, e) => {
    if (fault.deleteKey === e.key) throw new Error('injected delete EIO')
    store.delete(e.key)
    return { value: undefined }
  })
  on('state.get', () => ({ value: { value: state, version } }))
  on('state.set', (_, e) => {
    if (fault.cas || e.ifVersion !== undefined && e.ifVersion !== version) return { value: { isSet: false, version } }
    state = e.value
    return { value: { isSet: true, version: ++version } }
  })
  on('prompt.submit', (_, e) => (sent.push(e.text), { text: e.text }))
  const toasts: string[] = []
  on('ui.toast', (_, e) => (toasts.push(String((e as { text?: unknown }).text ?? JSON.stringify(e))), { value: undefined }))
  on('ui.invalidate', () => ({ value: undefined }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('store.get', (_, e) => {
    if (fault.getKey === e.key) throw new Error('injected store read EIO')
    return { value: store.get(e.key) }
  })
  on('store.set', (_, e) => {
    if (fault.offSave && e.value === 'off') throw new Error('injected off EIO')
    store.set(e.key, e.value)
    return { value: undefined }
  })
  on('fs.read', (_, e) => {
    if (fault.read) throw new Error('injected read EACCES')
    const text = files.get(e.path)
    if (text === undefined) throw new Error('ENOENT')
    reads.push(text.length)
    return { value: text }
  })
  on('fs.write', (_, e) => {
    if (fault.write) throw new Error('injected write EACCES')
    // The engine's cap (a thrown hook passes to the real write, which fails on /h/me too).
    if (e.text.length > 4 * 1024 * 1024) throw new Error(`write of ${e.text.length} bytes over 4 MiB`)
    files.set(e.path, e.text)
    return { value: undefined }
  })
  on('fs.exists', (_, e) => ({ value: files.has(e.path) || [...files.keys()].some(p => p.startsWith(`${e.path}/`)) }))
  on('fs.list', (_, e) => ({
    value: [...files.keys()]
      .filter(p => p.startsWith(`${e.path}/`))
      .map(p => ({ name: p.slice(e.path.length + 1), kind: 'file' as const, size: new TextEncoder().encode(files.get(p)!).length, mtimeMs: 0, isLink: false })),
  }))
  on('process.run', (_, e) => {
    if (e.argv[0] === 'python3' && e.argv[2]?.includes('os.replace')) {
      if (fault.rename) return { value: { exitCode: 1, stdout: '', stderr: 'injected rename EACCES', isStdoutTruncated: false, isStderrTruncated: false } }
      const dst = e.argv[3]!, tmp = e.argv[4]!
      files.set(dst, files.get(tmp)!)
      files.delete(tmp)
    } else opened.push(e.argv.join(' '))
    return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('env.get', () => ({ value: '/h/me' }))
  on('session.id', () => ({ value: fault.sid ?? SID }))
  on('session.cwd', () => ({ value: start.cwd }))
  on('session.model', () => ({ value: 'claude-sonnet-4-6' }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('tool.call', (_, e) => {
    ran.push(e.tool)
    if (fault.toolThrow) throw new Error('injected host tool error')
    return (fault.hostDeny ? { deny: 'host permission denied fixture' } : { result: {}, text: 'ok' }) as never
  })
  // Waits until the engine rows the mod's own log lines raised stop raising more.
  const quiet = async () => { for (let n = -1; n !== echoed.length;) { n = echoed.length; await Promise.all(echoed) } }
  return { sent, opened, files, store, toasts, logs, clock, ran, waitForLog, echoed, quiet, reads }
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
  expect([...w.files.keys()].filter(p => p.endsWith('.log')).length).toBe(1)
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
  expect(textOf(await $.ui.render(band()))).toContain('▌agent should know v0.3.2 · 1 heads-up · 1 handled')
  await $.session.start(start)
  expect(textOf(await $.ui.render(band()))).toContain('· 1 heads-up · 1 handled')
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
  expect(wide).toContain('▌agent should know v0.3.2 · no heads-up yet')
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
  expect(textOf(await $.ui.render(band(120)))).toContain('▌agent should know v0.3.2')
  expect((await $.command.run(cmd)).text).toContain('band hidden; /heads-up shows it again.')
})

test('the log button opens the session log once a card was logged', async ($, on) => {
  const w = world(on)
  drawCard(on, 'Two one-way fares were summed.')
  await $.session.start(start)
  await $.ui.render(band(120))
  await $.ui.press({ plugin: PLUGIN, key: 'log', requestId: 'above' })
  expect(w.toasts.some(t => /^opened \/h\/me\/.local\/state\/agent-should-know\/agent_automation\//.test(t))).toBe(true)
  expect(w.opened.length).toBe(1)
  expect(w.opened[0]).toMatch(/^open \/h\/me\/\.local\/state\/agent-should-know\/agent_automation\/\d{4}-\d{2}-\d{2}-28d2c553\.log$/)
})

test('startup-cleans-empty-sid-only', async ($, on) => {
  const empty = ['file:', 'asks:', 'off:', 'duties:', 'episode:']
  const store = new Map<string, unknown>(empty.map(k => [k, 'old owner text']))
  store.set(`asks:${SID}`, { owner: 'resume me' })
  store.set('unrelated:', 'keep')
  store.set('guard', { sid: '', owner: 'keep' })
  const w = world(on, store)
  w.files.set('/h/me/old.asks.jsonl', 'owner text\n')
  await $.session.start(start)
  for (const key of empty) expect(store.has(key)).toBe(false)
  expect(store.get(`asks:${SID}`)).toEqual({ owner: 'resume me' })
  expect(store.get('unrelated:')).toBe('keep')
  expect(store.get('guard')).toEqual({ sid: '', owner: 'keep' })
  expect(w.files.get('/h/me/old.asks.jsonl')).toBe('owner text\n')
  expect(w.logs.join('\n')).not.toContain('cleanup incomplete')
})

test('startup-cleans-empty-sid-only: injected delete failure reports cleanup incomplete and passes tools', async ($, on) => {
  const store = new Map<string, unknown>([['file:', 'keep on failure'], ['asks:', 'delete'], [`off:${SID}`, 'keep']])
  const w = world(on, store, { deleteKey: 'file:' })
  await $.session.start(start)
  expect(store.get('file:')).toBe('keep on failure')
  expect(store.has('asks:')).toBe(false)
  expect(store.get(`off:${SID}`)).toBe('keep')
  expect(w.logs.join('\n')).toContain('cleanup incomplete')
  await $.tool.call({ tool: 'Bash', command: 'git log -15', description: 'fixture' })
  expect(w.ran).toEqual(['Bash'])
})

test('identity-unready-pass-through: no phantom writes and no empty sid state', async ($, on) => {
  const w = world(on, new Map(), { sid: '' })
  await $.session.start(start)
  await $.tool.call({ tool: 'Bash', command: 'rg --glob "*.ts" x fixture', description: 'fixture' })
  expect(w.ran).toEqual(['Bash'])
  expect([...w.files]).toEqual([])
  expect([...w.store]).toEqual([])
  expect(w.logs.join('\n')).toContain('identity unready')
})

test('all-tools-next-once-including-state-paths: IO faults remain report only', async ($, on) => {
  const fault = { write: false }
  const w = world(on, new Map(), fault)
  await $.session.start(start)
  fault.write = true
  for (const call of [
    { tool: 'Bash', command: 'git status --short', description: 'fixture' },
    { tool: 'Write', file_path: '/h/me/.local/state/agent-should-know/state', content: 'owner edit' },
    { tool: 'Edit', file_path: '/h/me/.local/state/agent-should-know/state', old_string: 'x', new_string: 'y' },
  ]) expect((await $.tool.call(call as never) as { text: string }).text).toBe('ok')
  expect(w.ran).toEqual(['Bash', 'Write', 'Edit'])
  expect(w.logs.join('\n')).toContain('diagnostics not saved')
})

test('off-wins-under-fault: memory stops before control persistence', async ($, on) => {
  const w = world(on, new Map(), { offSave: true })
  await $.session.start(start)
  const r = await $.command.run({ ...cmd, command: 'asks', args: 'off' })
  expect(r.text).toContain('off in memory; not saved')
  await $.tool.call({ tool: 'Bash', command: 'git diff', description: 'fixture' })
  expect(w.ran).toEqual(['Bash'])
})

test('ask-items-have-native-owner-provenance and judge rejects missing evidence', () => {
  const owner = ownerRow({ sid: SID, home: '/h/me', cwd: '/work' }, 'native-uuid', 'composer', 'Do A\nKeep B')
  expect(owner.items.map(i => owner.text.slice(i.start, i.end))).toEqual(['Do A', 'Keep B'])
  const b: Bundle = { schema_version: 1, sid: SID, epoch: 1, instance: 'fixture', turn: 't1', reply: 'A done; B kept', owners: [owner], calls: [{ id: 'call1', tool: 'Bash', input: {}, result: 'ok' }], messages: [], coverage: [] }
  const result = { verdict: 'PASS', reason: 'covered', findings: [], items: [
    { id: owner.items[0]!.id, kind: 'task', answer: 'A done', evidence: ['call1'] },
    { id: owner.items[1]!.id, kind: 'constraint', answer: 'B kept', evidence: [] },
  ] }
  const pass = judgeResult(JSON.stringify(result), b)
  expect(pass.verdict).toBe('PASS')
  expect(pass.owners[0]!.items[1]!.answer).toBeUndefined()
  expect(judgeResult(JSON.stringify(result), { ...b, coverage: ['missing result call2'] }).verdict).toBe('UNKNOWN')
  expect(judgeResult(JSON.stringify({ ...result, items: [] }), b).verdict).toBe('UNKNOWN')
  expect(judgeResult(JSON.stringify({ ...result, verdict: 'FAIL', findings: [{ source: 'call2', quote: 'ok', problem: 'missing' }] }), b).verdict).toBe('UNKNOWN')
  const later = ownerRow({ sid: SID, home: '/h/me', cwd: '/work' }, 'later-owner', 'bridge', 'Drop Do A; keep B')
  const changed = { ...result, items: [...result.items, { id: later.items[0]!.id, kind: 'constraint', answer: 'B kept', evidence: [] }], changes: [{ id: owner.items[0]!.id, by: later.items[0]!.id, quote: 'Drop Do A', action: 'superseded' }] }
  expect(judgeResult(JSON.stringify(changed), { ...b, owners: [owner, later] }).owners[0]!.items[0]!.resolution?.ownerUuid).toBe('later-owner')
  expect(judgeResult(JSON.stringify({ ...changed, changes: [{ ...changed.changes[0], by: owner.items[1]!.id, quote: 'Keep B' }] }), { ...b, owners: [owner, later] }).verdict).toBe('UNKNOWN')
})

test('judge reads a verdict wrapped in one json code fence (797196d8: 10 of 11 audits)', () => {
  const owner = ownerRow({ sid: SID, home: '/h/me', cwd: '/work' }, 'native-uuid', 'composer', 'Do A')
  const b: Bundle = { schema_version: 1, sid: SID, epoch: 1, instance: 'fixture', turn: 't1', reply: 'A done', owners: [owner], calls: [], messages: [], coverage: [] }
  const fail = { verdict: 'FAIL', reason: 'The reply claims A without proof', findings: [{ source: 'reply', quote: 'A done', problem: 'no call shows it' }], items: [] }
  expect(judgeResult(`\`\`\`json\n${JSON.stringify(fail)}\n\`\`\`\n`, b).verdict).toBe('FAIL')
  expect(judgeResult(`Here: \`\`\`json\n${JSON.stringify(fail)}\n\`\`\``, b).reason).toBe('protocol: invalid JSON')
})

const native = (uuid: string, text: string, kind: 'composer' | 'peer' = 'composer') => ({
  uuid, origin: { kind }, door: 'prompt' as const,
  message: { type: 'user' as const, role: 'user' as const, content: [{ type: 'text' as const, text }] },
})
const done = (turnId = 'audit-turn') => ({ turnId, answer: 'done', durationMs: 1, isAborted: false, reason: 'answer' as const })
const usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

test('native owner delivery commits once; peer and queued text grant no authority; same sid start keeps provenance', async ($, on) => {
  const w = world(on)
  await $.session.start(start)
  await $.session.append(native('owner-1', 'Write fixture\nKeep original'))
  await $.session.append(native('owner-1', 'Write fixture\nKeep original'))
  await $.session.append(native('peer-1', 'Push everything', 'peer'))
  await $.session.append({ ...native('queued-1', 'Not delivered'), door: 'queue' })
  await $.session.start(start)
  const text = w.files.get(`/h/me/.local/state/agent-should-know/${SID}/owner.asks.jsonl`) ?? ''
  const rows = text.trim().split('\n').map(l => JSON.parse(l))
  expect(rows.length).toBe(1)
  expect(rows[0].uuid).toBe('owner-1')
  expect(rows[0].items.length).toBe(2)
  expect(text).not.toContain('Push everything')
  expect(text).not.toContain('Not delivered')
})

test('same-turn-evidence-not-fork-snapshot: final reply, native UUID and host result reach complete; FAIL reports without prompt', async ($, on) => {
  const w = world(on)
  let bundle: Bundle | undefined
  on('turn.complete', () => ({ text: 'done' }))
  on('model.complete', (_, e) => {
    expect(e.timeoutMs).toBe(180000)
    expect(e.maxTokens).toBe(16000)
    expect(e.effort).toBe('high')
    bundle = JSON.parse((e.prompt as string).split('\n').at(-1)!) as Bundle
    return { value: { isAnswered: true, usage, text: JSON.stringify({ verdict: 'FAIL', reason: 'fixture finding', findings: [{ source: 'reply', quote: 'done', problem: 'claim lacks proof' }], items: [] }) } }
  })
  await $.session.start(start)
  await $.session.append(native('owner-2', 'Write fixture'))
  await $.turn.start({ turnId: 'audit-turn', text: 'Write fixture' })
  await $.tool.call({ tool: 'Bash', command: 'printf ok', description: 'fixture' })
  await $.turn.complete(done())
  await w.clock.settle()
  await w.waitForLog('audit FAIL')
  expect(bundle?.reply).toBe('done')
  expect(bundle?.owners[0]?.uuid).toBe('owner-2')
  expect(bundle?.calls[0]?.result).toEqual({ result: {}, text: 'ok' })
  expect(w.logs.join('\n')).toContain('audit FAIL')
  expect(w.sent).toEqual([])
  await $.tool.call({ tool: 'Write', file_path: '/fixture/state', content: 'allowed' })
  expect(w.ran).toEqual(['Bash', 'Write'])
})

test('audit-timeout-cancel-discard: one active request, off wins against a late answer', async ($, on) => {
  const w = world(on)
  let requests = 0
  let started!: () => void
  const modelStarted = new Promise<void>(resolve => { started = resolve })
  on('turn.complete', () => ({ text: 'done' }))
  on('model.complete', async () => {
    requests += 1
    started()
    await w.clock.sleep(60000)
    return { value: { isAnswered: true, usage, text: JSON.stringify({ verdict: 'PASS', reason: 'late', findings: [], items: [] }) } }
  })
  await $.session.start(start)
  await $.session.append(native('owner-3', 'Write fixture'))
  await $.turn.start({ turnId: 'audit-turn', text: 'Write fixture' })
  await $.turn.complete(done())
  await w.clock.settle()
  await modelStarted
  await $.turn.complete(done())
  expect(requests).toBe(1)
  await $.command.run({ ...cmd, command: 'asks', args: 'off' })
  await $.tool.call({ tool: 'Bash', command: 'git status', description: 'fixture' })
  await w.clock.advance(60000)
  expect(w.logs.join('\n')).not.toContain('audit PASS')
  expect([...w.files.keys()].filter(p => p.includes('/audit/') && !p.endsWith('.evidence.json'))).toEqual([])
  expect(w.ran).toEqual(['Bash'])
})

test('audit timeout returns UNKNOWN visibly; no automatic retry', async ($, on) => {
  const w = world(on)
  let requests = 0
  let started!: () => void
  const modelStarted = new Promise<void>(resolve => { started = resolve })
  on('turn.complete', () => ({ text: 'done' }))
  on('model.complete', async () => { requests++; started(); await w.clock.sleep(60000); return { value: { isAnswered: false, usage, reason: 'aborted' } } })
  await $.session.start(start)
  await $.turn.start({ turnId: 'audit-turn', text: 'fixture' })
  await $.turn.complete(done())
  await w.clock.settle()
  await modelStarted
  await w.clock.advance(60000)
  await w.waitForLog('audit UNKNOWN: model aborted')
  expect(requests).toBe(1)
  expect(w.logs.join('\n')).toContain('audit UNKNOWN: model aborted')
  expect(w.sent).toEqual([])
})

test('audit invalid JSON keeps the reply excerpt and output tokens in the result file', async ($, on) => {
  const w = world(on)
  on('turn.complete', () => ({ text: 'done' }))
  on('model.complete', () => ({ value: { isAnswered: true, usage: { ...usage, output_tokens: 1024 }, text: '{"verdict":"PASS","reason":"cut' } }))
  await $.session.start(start)
  await $.turn.start({ turnId: 'audit-turn', text: 'fixture' })
  await $.turn.complete(done())
  await w.clock.settle()
  await w.waitForLog('audit UNKNOWN: protocol: invalid JSON')
  const result = [...w.files.entries()].find(([p]) => p.includes('/audit/') && !p.endsWith('.evidence.json'))?.[1] ?? ''
  expect(JSON.parse(result)).toMatchObject({ verdict: 'UNKNOWN', output_tokens: 1024, excerpt: '{"verdict":"PASS","reason":"cut' })
})

test('each audit result is logged once: a later turn end does not post it again', async ($, on) => {
  const w = world(on)
  on('turn.complete', () => ({ text: 'done' }))
  on('model.complete', () => ({ value: { isAnswered: true, usage, text: 'not json' } }))
  await $.session.start(start)
  const posted = () => w.logs.filter(l => l.includes('audit UNKNOWN: protocol')).length
  for (const turnId of ['t1', 't2', 't3']) {
    await $.turn.start({ turnId, text: 'fixture' })
    const after = w.logs.length
    await $.turn.complete(done(turnId))
    // Each audit settles before the next turn ends, so none is skipped as already active.
    await w.clock.settle()
    await w.waitForLog('audit UNKNOWN: protocol', after)
    await w.clock.settle()
  }
  expect(posted()).toBe(3)
  expect(w.logs.join('\n')).not.toContain('already active')
})

test('standing warning keeps three UNKNOWN audit notices bounded without nesting', async ($, on) => {
  const w = world(on, new Map(), { echo: row => $.session.append(row) })
  w.files.set(`/h/me/.local/state/agent-should-know/${SID}/diagnostics.jsonl`, 'x'.repeat(1024 * 1024 + 1))
  on('turn.complete', () => ({ text: 'done' }))
  on('model.complete', () => ({ value: { isAnswered: true, usage, text: JSON.stringify({ verdict: 'UNKNOWN', reason: 'fixture', findings: [], items: [] }) } }))
  await $.session.start(start)
  await $.session.append(native('owner-standing', 'Write fixture'))
  const notices: string[] = []
  const bundles: Bundle[] = []
  for (const turnId of ['t1', 't2', 't3']) {
    await $.turn.start({ turnId, text: 'fixture' })
    const after = w.logs.length
    await $.turn.complete(done(turnId))
    await w.clock.settle()
    await w.waitForLog('audit UNKNOWN: coverage', after)
    const [path, text] = [...w.files].find(([p, text]) => p.endsWith('.evidence.json') && JSON.parse(text).turn === turnId)!
    await w.clock.settle()
    await w.quiet()
    bundles.push(JSON.parse(text))
    const notice = w.logs.find(l => l.endsWith(`${path.slice(0, -'.evidence.json'.length)}.json`))!
    notices.push(notice)
    expect(JSON.parse(w.files.get(path.replace('.evidence.json', '.json'))!)).toMatchObject({ verdict: 'UNKNOWN', reason: expect.stringContaining('diagnostics size warning') })
  }
  expect(notices[2]!.length).toBeLessThanOrEqual(notices[1]!.length)
  for (const notice of notices) {
    expect(notice.split('audit UNKNOWN:').length).toBe(2)
    expect(notice.length).toBeLessThanOrEqual(320)
  }
  for (const bundle of bundles) {
    expect(bundle.coverage).toContain('diagnostics size warning; owner decides retention')
    expect(bundle.coverage.some(warning => warning.includes('audit UNKNOWN'))).toBe(false)
  }
  expect(w.logs.filter(l => l.includes('audit UNKNOWN: pending')).length).toBe(3)
  expect(w.logs.filter(l => l.includes('already active')).length).toBe(0)
})

test('clear-without-start-new-session: old asks and off never move', async ($, on) => {
  const fault = { sid: SID }
  const w = world(on, new Map(), fault)
  on('session.end', (_, e) => ({ sessionId: e.sessionId }))
  await $.session.start(start)
  await $.session.append(native('owner-before-clear', 'Old task'))
  await $.command.run({ ...cmd, command: 'asks', args: 'off' })
  await $.session.end({ reason: 'clear', sessionId: SID, resume: { id: SID } } as never)
  fault.sid = 'new-session'
  await $.turn.start({ turnId: 'new-turn', text: 'new' })
  await $.session.append(native('new-owner', 'New task'))
  const text = w.files.get('/h/me/.local/state/agent-should-know/new-session/owner.asks.jsonl') ?? ''
  expect(text).toContain('New task')
  expect(text).not.toContain('Old task')
  expect(w.store.get(`control:${SID}`)).toBe('off')
  expect(w.store.has('control:new-session')).toBe(false)
})

test('failed-write-versus-external-mismatch: original stays intact; failed writes are not tamper', async ($, on) => {
  const fault = { rename: false }
  const w = world(on, new Map(), fault)
  await $.session.start(start)
  await $.session.append(native('owner-io', 'First'))
  const path = `/h/me/.local/state/agent-should-know/${SID}/owner.asks.jsonl`
  const original = w.files.get(path)
  fault.rename = true
  await $.session.append(native('owner-io2', 'Second'))
  expect(w.files.get(path)).toBe(original)
  expect(w.logs.join('\n')).toContain('atomic replace exit=1')
  expect(w.logs.join('\n')).not.toContain('integrity mismatch')
  fault.rename = false
  w.files.set(path, 'owner changed file\n')
  await $.session.append(native('owner-io3', 'Third'))
  expect(w.files.get(path)).toBe('owner changed file\n')
  expect(w.logs.join('\n')).toContain('integrity mismatch')
})

test('state-cas-conflict-no-false-commit and store read errors remain visible without tool holds', async ($, on) => {
  const w = world(on, new Map(), { cas: true })
  await $.session.start(start)
  expect(w.logs.join('\n')).toContain('state CAS conflict; not saved')
  await $.tool.call({ tool: 'Bash', command: 'git diff', description: 'fixture' })
  expect(w.ran).toEqual(['Bash'])
})

test('incident-reads-pass-host-denial-preserved', async ($, on) => {
  const w = world(on, new Map(), { hostDeny: true })
  await $.session.start(start)
  for (const command of ['rg --glob "*.ts" x fixture', 'git log -15', 'git status', 'git diff']) {
    expect(await $.tool.call({ tool: 'Bash', command, description: 'fixture' })).toEqual({ deny: 'host permission denied fixture' })
  }
  expect(w.ran.length).toBe(4)
})

test('startup cleanup keys and read-back failures are visible; no false clean', async ($, on) => {
  const fault: { keys?: boolean; getKey?: string } = { keys: true }
  const store = new Map<string, unknown>([['file:', 'old']])
  const w = world(on, store, fault)
  await $.session.start(start)
  expect(store.has('file:')).toBe(true)
  expect(w.logs.some(l => l.includes('cleanup incomplete'))).toBe(true)
  const before = w.logs.filter(l => l.includes('cleanup incomplete')).length
  fault.keys = false; fault.getKey = 'file:'
  await $.session.start(start)
  expect(w.logs.filter(l => l.includes('cleanup incomplete')).length).toBe(before + 1)
  await $.tool.call({ tool: 'Bash', command: 'git log -15', description: 'fixture' })
  expect(w.ran).toEqual(['Bash'])
})

test('corrupt-cache-not-authority-or-hold and diagnostics size warning never removes data', async ($, on) => {
  const w = world(on)
  const path = `/h/me/.local/state/agent-should-know/${SID}/owner.asks.jsonl`
  w.files.set(path, 'corrupt owner file\n')
  const diagnostics = `/h/me/.local/state/agent-should-know/${SID}/diagnostics.jsonl`
  const original = 'x'.repeat(1024 * 1024 + 1)
  w.files.set(diagnostics, original)
  await $.session.start(start)
  await $.tool.call({ tool: 'Bash', command: 'git diff', description: 'fixture' })
  expect(w.files.get(path)).toBe('corrupt owner file\n')
  expect(w.files.get(diagnostics)?.startsWith(original)).toBe(true)
  expect(w.logs.join('\n')).toContain('diagnostics size warning')
  expect(w.logs.join('\n')).toContain('disk grants no authority')
  expect(w.ran).toEqual(['Bash'])
})

test('a warning logs once: its own transcript row does not feed it again (ed52bad5 froze)', async ($, on) => {
  const w = world(on, new Map(), { echo: row => $.session.append(row) })
  // Just under the engine's 4 MiB cap: over the size warning, and the next row does not fit.
  w.files.set(`/h/me/.local/state/agent-should-know/${SID}/diagnostics.jsonl`, 'x'.repeat(4 * 1024 * 1024 - 64))
  await $.session.start(start)
  await $.session.append(native('owner-big', 'Write fixture'))
  await w.quiet()
  expect(w.logs.filter(l => l.includes('diagnostics size warning')).length).toBe(1)
  expect(w.echoed.length).toBeLessThan(5)
})

test('a trace reads one bounded segment and still saves past the 4 MiB fs limit', async ($, on) => {
  const w = world(on)
  const root = `/h/me/.local/state/agent-should-know/${SID}`
  w.files.set(`${root}/diagnostics.jsonl`, 'x'.repeat(4 * 1024 * 1024 - 64))
  await $.session.start(start)
  await $.session.append(native('owner-big', 'Write fixture'))
  await $.tool.call({ tool: 'Bash', command: 'git diff', description: 'fixture' })
  expect(w.files.get(`${root}/diagnostics.jsonl`)).toBe('x'.repeat(4 * 1024 * 1024 - 64))
  expect(w.files.get(`${root}/diagnostics.1.jsonl`)).toContain('"event"')
  expect(Math.max(...w.reads)).toBeLessThanOrEqual(256 * 1024)
  expect(w.logs.join('\n')).not.toContain('diagnostics not saved')
})

test('segments count bytes: a CJK-heavy segment stays within 256 KiB on disk', async ($, on) => {
  const w = world(on)
  const root = `/h/me/.local/state/agent-should-know/${SID}`
  // 262050 bytes in 87350 characters: one more row passes 256 KiB in bytes, not in characters.
  w.files.set(`${root}/diagnostics.jsonl`, '界'.repeat(87350))
  await $.session.start(start)
  await $.tool.call({ tool: 'Bash', command: 'git diff', description: 'fixture' })
  const segments = [...w.files].filter(([p]) => /\/diagnostics(\.\d+)?\.jsonl$/.test(p))
  expect(segments.length).toBeGreaterThan(1)
  for (const [, text] of segments) expect(new TextEncoder().encode(text).length).toBeLessThanOrEqual(256 * 1024)
})

test('diagnostics not saved shows again in a later turn after a save works and a later save fails', async ($, on) => {
  const fault: { write?: boolean; echo?: NonNullable<Parameters<typeof world>[2]>['echo'] } = { write: true, echo: row => $.session.append(row) }
  const w = world(on, new Map(), fault)
  const notSaved = () => w.logs.filter(l => l.includes('diagnostics not saved; error in the debug log')).length
  await $.session.start(start)
  await w.quiet()
  expect(notSaved()).toBe(1)
  fault.write = false
  await $.tool.call({ tool: 'Bash', command: 'git diff', description: 'fixture' })
  await w.quiet()
  fault.write = true
  await $.turn.start({ turnId: 't2', text: 'fixture' })
  await $.tool.call({ tool: 'Bash', command: 'git diff', description: 'fixture' })
  await w.quiet()
  expect(notSaved()).toBe(2)
  expect(w.echoed.length).toBeLessThan(50)
})

test('intermittent write failures show diagnostics not saved once per turn (ASK032-03 looped on its own echo)', async ($, on) => {
  let writes = 0
  // Every other write fails: the notice's own echo row traces, and that trace saves.
  const fault = { get write() { return writes++ % 2 === 0 }, echo: (row: Parameters<NonNullable<NonNullable<Parameters<typeof world>[2]>['echo']>>[0]) => $.session.append(row) }
  const w = world(on, new Map(), fault)
  const notSaved = () => w.logs.filter(l => l.includes('diagnostics not saved; error in the debug log')).length
  await $.session.start(start)
  await w.quiet()
  const before = notSaved()
  await $.turn.start({ turnId: 't1', text: 'fixture' })
  for (let n = 0; n < 5; n++) await $.tool.call({ tool: 'Bash', command: 'git diff', description: 'fixture' })
  await w.quiet()
  expect(before).toBeLessThanOrEqual(1)
  expect(notSaved() - before).toBeLessThanOrEqual(1)
  expect(w.echoed.length).toBeLessThan(5)
})

test('a segment that a row would push past 256 KiB stays as it is; the row starts the next one', async ($, on) => {
  const w = world(on)
  const root = `/h/me/.local/state/agent-should-know/${SID}`
  w.files.set(`${root}/diagnostics.jsonl`, 'x'.repeat(256 * 1024 - 10))
  await $.session.start(start)
  await $.tool.call({ tool: 'Bash', command: 'git diff', description: 'fixture' })
  expect(w.files.get(`${root}/diagnostics.jsonl`)).toBe('x'.repeat(256 * 1024 - 10))
  expect(w.files.get(`${root}/diagnostics.1.jsonl`)).toContain('"event"')
})

test('catch-before-after-next-replay-safe: a host failure never runs the tool twice', async ($, on) => {
  const w = world(on, new Map(), { toolThrow: true })
  await $.session.start(start)
  await expect($.tool.call({ tool: 'Bash', command: 'false', description: 'fixture' })).rejects.toThrow()
  expect(w.ran).toEqual(['Bash'])
  expect(w.logs.join('\n')).toContain('hook tool.call UNKNOWN')
})
