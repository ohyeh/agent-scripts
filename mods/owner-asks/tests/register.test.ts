import { expect, mock, test } from 'claude-code/testing'
import { messageOf, messagesOf, snapshot } from '../hooks/lib/asks.ts'
import { register } from '../hooks/register.ts'
import type { EngineInterface, On as Registrar } from 'claude-code'

const PLUGIN = 'owner-asks'
const SID = '28d2c553-6d91'
const STORE = '/h/me/.claude/plugins/store'
const BUILTIN = 'cc-plugin-you-should-know_builtin-19776595df2c.json'
const start = { cwd: '/work/agent_automation', surface: 'terminal' as const, isInteractive: true }
const cmd = { command: 'asks', args: '', origin: { kind: 'composer' as const }, presentation: { isFullscreen: false, columns: 120 } }

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
    if (e.argv[2]?.includes('os.getppid')) return { value: { exitCode: 0, stdout: 'engine-fixture', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
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
  on('classic.SessionStart', () => ({}))
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

const native = (uuid: string, text: string, kind = 'composer', door = 'prompt') => ({
  uuid, origin: { kind }, door,
  message: { type: 'user', role: 'user', content: [{ type: 'text', text }] },
}) as never
const source = `/h/me/.local/state/owner-asks/${SID}/owner.asks.jsonl`
const projected = `/h/me/.local/state/agent-hooks/${SID}/asks-open.md`
const id = { sid: SID, home: '/h/me', cwd: start.cwd }
const bash = { tool: 'Bash', command: 'true', description: 'fixture' } as const
const resume = { hook_event_name: 'SessionStart', source: 'resume', session_id: SID, transcript_path: '/fixture', cwd: start.cwd, permission_mode: 'default' } as const

test('five owner turns: one record per UUID, no notices, audits, state or repeated index', async ($, on) => {
  const w = world(on)
  await $.session.start(start)
  for (let n = 0; n < 5; n++) {
    await $.session.append(native(`u${n}`, `Owner ${n}\nKeep all words`))
    await $.session.append(native(`u${n}`, 'duplicate'))
    await $.turn.start({ text: 'fixture', turnId: `t${n}` })
    const result = await $.tool.call(bash)
    expect('deny' in result ? [] : result.context ?? []).toEqual([])
  }
  expect(messagesOf(w.files.get(source)!, id).length).toBe(5)
  expect(w.logs).toEqual([])
  expect([...w.files.keys()].some(p => /audit|diagnostics/.test(p))).toBe(false)
  expect(w.files.get(projected)).toBe(snapshot(id, messagesOf(w.files.get(source)!, id)))
})

test('engine and plugin rows never enter the owner source', async ($, on) => {
  const w = world(on)
  await $.session.start(start)
  for (const kind of ['engine', 'peer', 'model', 'tool'])
    for (const door of ['notice', 'note', 'response', 'tool-result', 'prompt', 'delivery'])
      await $.session.append(native(`${kind}-${door}`, 'not owner', kind, door))
  for (const door of ['queue', 'hook-context', 'notice', 'compaction', 'attachment'])
    await $.session.append(native(door, 'not a committed owner message', 'composer', door))
  expect(w.files.has(source)).toBe(false)
  expect(w.logs).toEqual([])
})

test('delivery wrapper is removed once at the entry boundary; typed wrapper stays literal', async ($, on) => {
  const w = world(on)
  await $.session.start(start)
  const text = '<system-reminder>\nThe user sent a new message while you were working:\n改派 SOL\n保留原始資料\n\nThis is how Claude Code surfaces messages the user sends mid-turn — within the running turn, often alongside the next tool result, rather than as a separate conversation turn. Address the message above as you continue this turn.\n</system-reminder>'
  await $.session.append(native('delivery', text, 'bridge', 'delivery'))
  await $.session.append(native('typed', text))
  const rows = messagesOf(w.files.get(source)!, id)
  expect(rows[0]!.text).toBe('改派 SOL\n保留原始資料')
  expect(text.slice(rows[0]!.owner_body.start, rows[0]!.owner_body.end)).toBe(rows[0]!.text)
  expect(rows[0]!.door).toBe('delivery')
  expect(rows[1]!.text).toBe(text)
  expect('items' in rows[0]!).toBe(false)
})

test('resume gets exactly one reminder on an engine result; projection recovery needs no items', async ($, on) => {
  const w = world(on)
  const old = messageOf(id, 'old', 'composer', 'prompt', 'Earlier owner words')
  w.files.set(source, JSON.stringify(old) + '\n')
  await $.session.start(start)
  await $.session.append(native('new', 'New owner words'))
  let reminders = 0
  for (let n = 0; n < 3; n++) {
    const result = await $.tool.call(bash)
    if (!('deny' in result)) reminders += (result.context ?? []).filter(t => t.startsWith('Owner message reminder after resume')).length
  }
  expect(reminders).toBe(1)
  expect(w.files.get(projected)).toContain('Earlier owner words')
  expect(w.files.get(projected)).toContain('New owner words')
  expect(messagesOf(w.files.get(source)!, id).length).toBe(2)
})

test('startup and compact do not trigger a resume reminder', async ($, on) => {
  const w = world(on)
  await $.session.start(start)
  for (const reason of ['startup', 'compact'] as const) {
    await $.session.append(native(reason, reason))
    const result = await $.tool.call(bash)
    expect('deny' in result ? [] : result.context ?? []).toEqual([])
  }
  expect(w.logs).toEqual([])
})

test('asks is read-only even when passed on, off or migrate; reports source and failures', async ($, on) => {
  const w = world(on)
  await $.session.start(start)
  await $.session.append(native('one', 'Owner text'))
  const before = JSON.stringify([...w.files])
  const storeBefore = JSON.stringify([...w.store])
  for (const args of ['', 'on', 'off', 'migrate']) {
    const result = await $.command.run({ ...cmd, command: 'asks', args })
    expect(result.text).toContain('records: 1')
    expect(result.text).toContain(source)
    expect(result.text).toContain(projected)
    expect(result.text).toContain('last failure: none')
  }
  expect(JSON.stringify([...w.files])).toBe(before)
  expect(JSON.stringify([...w.store])).toBe(storeBefore)
})

test('a failed source write leaves a small failure record, no notice, and the next message still saves', async ($, on) => {
  const fault = { rename: true }
  const w = world(on, new Map(), fault)
  await $.session.start(start)
  await $.session.append(native('one', 'Owner text'))
  expect(w.logs.join('\n')).not.toContain('coverage')
  fault.rename = false
  await $.session.append(native('two', 'Next owner text'))
  expect(w.files.get(source)).toContain('Next owner text')
})

test('invalid identity never writes a phantom source or disables future capture', async ($, on) => {
  const fault = { sid: '' }
  const w = world(on, new Map(), fault)
  await $.session.start(start)
  await $.session.append(native('one', 'Owner text'))
  expect(w.files.has(source)).toBe(false)
  fault.sid = SID
  await $.session.append(native('two', 'Next owner text'))
  expect(w.files.get(source)).toContain('Next owner text')
})

function hooks() {
  type Run = ($: EngineInterface, e: any, next: any) => any
  const list: { event: string; matcher?: { command?: string }; run: Run }[] = []
  const on = ((event: string, ...args: any[]) => {
    list.push({ event, matcher: args.length === 2 ? args[0] : undefined, run: args.at(-1) })
    return { catch: () => undefined }
  }) as Registrar
  register(on, {})
  return async (event: string, $: EngineInterface, e: any, result: any = {}, activate = true, origin = 'engine') => {
    const selected = list.filter(h => h.event === event && (!h.matcher?.command || h.matcher.command === e.command))
    const next = Object.assign(async () => typeof result === 'function' ? result() : result, { origin: { plugin: origin } })
    let answer = result
    for (const h of selected) answer = await h.run($, e, next)
    // A separate dispatch follows staging, as the real engine does after swap.
    if (event === 'session.start' && activate) await list.find(h => h.event === 'command.run' && h.matcher?.command === 'asks')!.run($, { ...cmd, command: 'asks', args: '' }, next)
    return answer
  }
}

function reloadWorld() {
  const files = new Map<string, string>()
  const store = new Map<string, unknown>()
  const logs: string[] = []
  const usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
  let state: any
  let version = 0
  let beforeSet: (() => Promise<void>) | undefined
  let timer: (() => void) | undefined
  const host = {
    session: { id: async () => SID, cwd: async () => start.cwd, model: async () => 'fixture-model' },
    env: { get: async () => '/h/me' }, command: { register: async () => ({}) },
    ui: { log: (s: string) => logs.push(s), invalidate: () => undefined },
    store: { keys: async () => [...store.keys()], get: async (k: string) => store.get(k), set: async (k: string, v: unknown) => { store.set(k, v) }, delete: async (k: string) => { store.delete(k) } },
    state: {
      get: async () => ({ value: structuredClone(state), version }),
      set: async (_: unknown, value: unknown, options: { ifVersion: number }) => {
        await beforeSet?.()
        if (options.ifVersion !== version) return { isSet: false, version }
        state = structuredClone(value)
        return { isSet: true, version: ++version }
      },
    },
    fs: {
      exists: async (p: string) => files.has(p) || [...files.keys()].some(k => k.startsWith(`${p}/`)),
      read: async (p: string) => { if (!files.has(p)) throw new Error('ENOENT'); return files.get(p)! },
      write: async (p: string, t: string) => { files.set(p, t) },
      list: async (p: string) => [...files].filter(([k]) => k.startsWith(`${p}/`)).map(([k, t]) => ({ name: k.slice(p.length + 1), size: new TextEncoder().encode(t).length })),
    },
    process: { run: async (argv: string[], options: { stdin: string }) => {
      if (argv[2]?.includes('os.getppid')) return { exitCode: 0, stdout: 'engine-fixture', stderr: '' }
      const [dst, tmp] = argv.slice(-2)
      if ((files.get(dst!) ?? null) !== JSON.parse(options.stdin)) return { exitCode: 1, stderr: 'integrity mismatch' }
      files.set(dst!, files.get(tmp!)!); files.delete(tmp!)
      return { exitCode: 0, stdout: '', stderr: '' }
    } },
    clock: { after: (_: number, fn: () => void) => { timer = fn; return { cancel: () => { timer = undefined } } } },
    model: { complete: async () => ({ isAnswered: false, usage, reason: 'aborted' }) },
  } as unknown as EngineInterface
  return { host, files, logs, set beforeSet(fn: (() => Promise<void>) | undefined) { beforeSet = fn }, fire: () => timer?.(), get state() { return state } }
}

test('reload drains a delayed writer before swap; staged and retired instances never write', async () => {
  const w = reloadWorld()
  const old = hooks()
  const staged = hooks()
  await old('session.start', w.host, start)
  let release!: () => void
  let entered!: () => void
  const held = new Promise<void>(r => { release = r })
  const started = new Promise<void>(r => { entered = r })
  const write = w.host.fs.write
  w.host.fs.write = async (path, text) => { if (path.endsWith('owner.asks.jsonl.tmp')) { entered(); await held } return write(path, text) }
  const row = { uuid: 'delayed', origin: { kind: 'composer' }, door: 'prompt', message: { type: 'user', role: 'user', content: [{ type: 'text', text: 'Before swap' }] } }
  const save = old('session.append', w.host, row, row)
  await started
  const before = JSON.stringify([...w.files])
  await staged('session.start', w.host, start, {}, false)
  expect(JSON.stringify([...w.files])).toBe(before)
  let swapped = false
  const swap = old('command.run', w.host, { ...cmd, command: 'reload-plugins' }, () => {
    swapped = true
    // The engine invalidates the old environment after replacing its module.
    w.host.session.id = async () => { throw new Error('retired environment') }
    return {}
  })
  await Promise.resolve()
  expect(swapped).toBe(false)
  release()
  await save
  await swap
  expect(w.files.get(source)).toContain('Before swap')
  const settled = JSON.stringify([...w.files])
  await old('session.append', w.host, row, row)
  expect(JSON.stringify([...w.files])).toBe(settled)
  w.host.session.id = async () => SID
  const later = { ...row, uuid: 'after-swap', message: { ...row.message, content: [{ type: 'text', text: 'After swap' }] } }
  await staged('session.append', w.host, later, later)
  expect(w.files.get(source)).toContain('After swap')
})

test('an unchanged reload remains active; a source failure leaves a discoverable four-field record', async () => {
  const w = reloadWorld()
  const run = hooks()
  await run('session.start', w.host, start)
  await run('command.run', w.host, { ...cmd, command: 'reload-plugins' })
  const io = w.host.process.run
  w.host.process.run = async (argv, opts) => argv.at(-2) === source ? { exitCode: 1, stdout: '', stderr: 'EIO', isStdoutTruncated: false, isStderrTruncated: false } : io(argv, opts)
  const row = { uuid: 'broken', origin: { kind: 'composer' }, door: 'prompt', message: { type: 'user', role: 'user', content: [{ type: 'text', text: 'Keep me' }] } }
  await run('session.append', w.host, row, row)
  const last = JSON.parse(w.files.get(source.replace('owner.asks.jsonl', 'last-failure.json'))!)
  expect(Object.keys(last).sort()).toEqual(['error_class', 'instance', 'operation', 'time'])
  expect(last.operation).toBe('owner message')
  expect(w.logs).toEqual([])
  const status = await run('command.run', w.host, { ...cmd, command: 'asks' })
  expect(status.text).toContain(last.instance)
  w.host.process.run = io
  await run('session.append', w.host, row, row)
  expect(w.files.get(source)).toContain('Keep me')
})

test('plugin-owned append rows and non-engine tool callbacks cannot feed the runtime', async () => {
  const w = reloadWorld()
  const run = hooks()
  await run('session.start', w.host, start)
  const row = { uuid: 'notice', origin: { kind: 'plugin', name: PLUGIN }, door: 'note', message: { type: 'system', content: [{ type: 'text', text: 'own output' }] } }
  await run('session.append', w.host, row, row)
  expect(w.files.has(source)).toBe(false)
  const result = await run('tool.call', w.host, bash, { text: 'plugin result' }, true, 'owner-asks')
  expect(result.context).toBeUndefined()
  expect(await w.host.store.get(`process:${SID}`)).toBeUndefined()
})

test('a pending resume reminder survives a staged reload and is delivered only once', async () => {
  const w = reloadWorld()
  w.files.set(source, JSON.stringify(messageOf(id, 'old', 'composer', 'prompt', 'Earlier words')) + '\n')
  const first = hooks()
  await first('session.start', w.host, start)
  const row = { uuid: 'new', origin: { kind: 'composer' }, door: 'prompt', message: { type: 'user', role: 'user', content: [{ type: 'text', text: 'New words' }] } }
  await first('session.append', w.host, row, row)
  const second = hooks()
  await second('session.start', w.host, start, {}, false)
  const result = await second('tool.call', w.host, bash, { text: 'ok' })
  expect(result.context.length).toBe(1)
  expect(result.context[0]).toContain('Earlier words')
  const third = hooks()
  await third('session.start', w.host, start)
  expect((await third('tool.call', w.host, bash, { text: 'ok' })).context).toBeUndefined()
})

test('clear keeps capture active and separates the new session source', async () => {
  const w = reloadWorld()
  const run = hooks()
  await run('session.start', w.host, start)
  const row = { uuid: 'before', origin: { kind: 'composer' }, door: 'prompt', message: { type: 'user', role: 'user', content: [{ type: 'text', text: 'Old session' }] } }
  await run('session.append', w.host, row, row)
  const before = w.files.get(source)
  await run('session.end', w.host, { sessionId: SID, reason: 'clear' })
  w.host.session.id = async () => 'next-sid'
  const next = { ...row, uuid: 'after', message: { ...row.message, content: [{ type: 'text', text: 'New session' }] } }
  await run('session.append', w.host, next, next)
  expect(w.files.get(source)).toBe(before)
  expect(w.files.get(source.replace(SID, 'next-sid'))).toContain('New session')
})

test('invalid source spans preserve bytes and report failure without switching capture off', async () => {
  const w = reloadWorld()
  const run = hooks()
  const broken = JSON.stringify({ ...messageOf(id, 'old', 'composer', 'prompt', 'Earlier'), owner_body: { start: 0, end: '7' } }) + '\n'
  w.files.set(source, broken)
  await run('session.start', w.host, start)
  const row = { uuid: 'new', origin: { kind: 'composer' }, door: 'prompt', message: { type: 'user', role: 'user', content: [{ type: 'text', text: 'New words' }] } }
  await run('session.append', w.host, row, row)
  expect(w.files.get(source)).toBe(broken)
  expect(JSON.parse(w.files.get(source.replace('owner.asks.jsonl', 'last-failure.json'))!).operation).toBe('owner message')
  w.files.set(source, '')
  await run('session.append', w.host, row, row)
  expect(w.files.get(source)).toContain('New words')
})

test('a failed reload reactivates the unchanged module and a broken resume check never blocks capture', async () => {
  const w = reloadWorld()
  const run = hooks()
  await run('session.start', w.host, start)
  try {
    await run('command.run', w.host, { ...cmd, command: 'reload-plugins' }, () => { throw new Error('reload failed') })
  } catch { /* The host failure remains a host failure. */ }
  const io = w.host.process.run
  w.host.process.run = async (argv, opts) => argv[2]?.includes('os.getppid') ? { exitCode: 1, stdout: '', stderr: 'ps failed', isStdoutTruncated: false, isStderrTruncated: false } : io(argv, opts)
  const row = { uuid: 'one', origin: { kind: 'composer' }, door: 'prompt', message: { type: 'user', role: 'user', content: [{ type: 'text', text: 'Save despite resume failure' }] } }
  await run('session.append', w.host, row, row)
  expect(w.files.get(source)).toContain('Save despite resume failure')
  const result = await run('tool.call', w.host, bash, { text: 'host result' })
  expect(result.text).toBe('host result')
  expect(JSON.parse(w.files.get(source.replace('owner.asks.jsonl', 'last-failure.json'))!).operation).toBe('resume reminder')
  await run('session.append', w.host, { ...row, uuid: 'two' }, { ...row, uuid: 'two' })
  expect(messagesOf(w.files.get(source)!, id).length).toBe(2)
})
