// Unit check of the gate response → TurnStepChunk mapping. Run: bun test <run dir>/test/map.test.ts
import { expect, test } from 'claude-code/testing'
import { deadline, deferredTools, failStep, forGate, loadedTools, parseAgentDef, parseConf, tierRoute, toStep } from '../hooks/map'
import { SCHEMAS } from '../hooks/schemas'

const resp = {
  id: 'msg_x', type: 'message', role: 'assistant', model: 'gate-m', stop_reason: 'tool_use',
  usage: { input_tokens: 11, output_tokens: 7 },
  content: [
    { type: 'thinking', thinking: 'secret plan', signature: 'bogus' },
    { type: 'text', text: 'Reading it.' },
    { type: 'redacted_thinking', data: 'x' },
    { type: 'tool_use', id: 'toolu_1', name: 'Read', input: { file_path: '/a/b.txt' } },
  ],
}

test('text, tool_use with input, thinking dropped, stop with usage', () => {
  const { chunks, result } = toStep('t1', 2, resp, 'fallback')
  expect(chunks).toEqual([
    { kind: 'text', index: 0, text: 'Reading it.' },
    { kind: 'tool', index: 1, id: 'toolu_1', name: 'Read' },
    { kind: 'input', index: 1, json: '{"file_path":"/a/b.txt"}' },
    { kind: 'stop', stopReason: 'tool_use', usage: { input_tokens: 11, output_tokens: 7, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, model: 'gate-m' } },
  ])
  expect(chunks.some(c => c.kind === 'thinking')).toBe(false)
  expect(result).toMatchObject({ turnId: 't1', index: 2, answer: 'Reading it.', toolUses: [{ name: 'Read', input: { file_path: '/a/b.txt' } }], stopReason: 'tool_use' })
})

test('error body and failStep end the turn with a visible reason, no tools', () => {
  const bad = toStep('t1', 0, { type: 'error', error: { type: 'x', message: 'quota' } }, 'm')
  expect(bad.result).toMatchObject({ answer: '[byo-provider: bad response: quota]', toolUses: [], stopReason: 'end_turn', usage: null })
  expect(bad.chunks.at(-1)).toEqual({ kind: 'stop', stopReason: 'end_turn', usage: null })
  expect(failStep('t', 1, 'HTTP 502: down').chunks[0]).toEqual({ kind: 'text', index: 0, text: '[byo-provider: HTTP 502: down]' })
})

test('unknown stop_reason falls back by content', () => {
  expect(toStep('t', 0, { type: 'message', content: [{ type: 'text', text: 'hi' }], stop_reason: 'stop' }, 'm').result.stopReason).toBe('end_turn')
})

test('loaded tools from tool_reference and tool_use; thinking stripped and tool_reference made text outbound; Read/Bash schemas', () => {
  const msgs = [
    { role: 'assistant' as const, content: [{ type: 'thinking', thinking: 'z', signature: 's' }, { type: 'tool_use', id: 'a', name: 'ToolSearch', input: {} }] },
    { role: 'user' as const, content: [{ type: 'tool_result', tool_use_id: 'a', content: [{ type: 'tool_reference', tool_name: 'WebFetch' }] }] },
  ]
  expect([...loadedTools(msgs)].sort()).toEqual(['ToolSearch', 'WebFetch'])
  const out = forGate(msgs)
  expect(out[0]!.content.map(b => b.type)).toEqual(['tool_use'])
  expect(out[1]!.content[0]!.content).toEqual([{ type: 'text', text: 'Tool loaded: WebFetch' }])
  expect(SCHEMAS.Read!.required).toEqual(['file_path'])
  expect(SCHEMAS.Bash!.required).toContain('command')
})

test('deferred tools from the engine announcement, as it reads in the first user message', () => {
  const text = '<system-reminder>\nThe following deferred tools are now available via ToolSearch. Their schemas are NOT loaded — calling them ' +
    'directly will fail with InputValidationError. Use ToolSearch with query "select:<name>[,<name>...]" to load tool schemas before calling them:\n' +
    'CronCreate\nMonitor\nmcp__x__y\n</system-reminder>'
  const msgs = [{ role: 'user' as const, content: [{ type: 'text', text: 'hi' }, { type: 'text', text }] }]
  expect([...deferredTools(msgs)]).toEqual(['CronCreate', 'Monitor', 'mcp__x__y'])
  expect(deferredTools([{ role: 'user' as const, content: [{ type: 'text', text: 'nothing here' }] }]).size).toBe(0)
})

const after = (ms: number, fn: () => void) => { const t = setTimeout(fn, ms); return { cancel: () => clearTimeout(t) } }

test('deadline: answer in time, timeout, interrupt, and a rejection passes through', async () => {
  const never = new Promise<string>(() => {})
  expect(await deadline(Promise.resolve('a'), 50, new AbortController().signal, after)).toEqual({ ok: 'a' })
  expect(await deadline(never, 20, new AbortController().signal, after)).toEqual({ why: 'no answer in 0.02 s' })
  const stop = new AbortController()
  const r = deadline(never, 5000, stop.signal, after)
  stop.abort()
  expect(await r).toEqual({ why: 'interrupted' })
  const gone = new AbortController(); gone.abort()
  expect(await deadline(never, 5000, gone.signal, after)).toEqual({ why: 'interrupted' })
  await expect(deadline(Promise.reject(new Error('ECONNREFUSED')), 50, new AbortController().signal, after)).rejects.toThrow('ECONNREFUSED')
  // timeout path wired as the hook wires it: the reason becomes a visible failed step
  const lost = await deadline(never, 10, new AbortController().signal, after)
  expect('why' in lost && failStep('t', 0, lost.why).result.answer).toBe('[byo-provider: no answer in 0.01 s]')
})

test('parseConf: key=value, comments and blanks skipped, = kept in the value', () => {
  const kv = parseConf('# gate\nurl = http://h:1\n\ntoken=a=b\nnoequals\n=novalue\nmodel=m\neffort=low\n')
  expect(kv).toEqual({ url: 'http://h:1', token: 'a=b', model: 'm', effort: 'low' })
})

test('parseAgentDef: frontmatter tools list, body without frontmatter, no tools line', () => {
  expect(parseAgentDef('---\nname: x\ntools: Read, Bash\nmodel: opus\n---\n\nYou review.\n')).toEqual({ body: 'You review.', tools: ['Read', 'Bash'] })
  expect(parseAgentDef('---\nname: x\nmodel: opus\n---\nBody')).toEqual({ body: 'Body' })
  expect(parseAgentDef('No frontmatter')).toEqual({ body: 'No frontmatter' })
})

test('a thinking-only answer is a failed step, not a silent end', () => {
  const r = toStep('t', 0, { type: 'message', content: [{ type: 'thinking', thinking: 'x' }], stop_reason: 'max_tokens', usage: { output_tokens: 16384 } }, 'm').result
  expect(r.usage).toBeNull()
  expect(r.answer).toContain('max_tokens')
})

test('agent tools: comma, flow and block-list forms', () => {
  const def = (fm: string) => parseAgentDef(`---\nname: x\n${fm}\n---\nbody`).tools
  expect(def('tools: Read, Grep')).toEqual(['Read', 'Grep'])
  expect(def('tools: [Read, "Grep"]')).toEqual(['Read', 'Grep'])
  expect(def('tools:\n  - Read\n  - Grep\nmodel: x')).toEqual(['Read', 'Grep'])
  expect(def('tools:')).toBeUndefined()
  expect(def('tools:\n  - Read\n  # needs bash\n\n  - Bash')).toEqual(['Read', 'Bash'])
  expect(def('tools: ["Read", "Grep"]  # read-only')).toEqual(['Read', 'Grep'])
  expect(def('tools: Read, Grep  # read-only')).toEqual(['Read', 'Grep'])
  expect(def('tools: # ro\n  - Read')).toEqual(['Read'])
  expect(def('tools: [Read,\n  Grep]')).toEqual(['Read', 'Grep'])
  expect(parseAgentDef('---\ndisallowedTools: Edit, Write\n---\nb').disallowed).toEqual(['Edit', 'Write'])
})

test('context-window stop is passed on, not turned into end_turn', () => {
  const r = toStep('t', 0, { type: 'message', content: [{ type: 'text', text: 'part' }], stop_reason: 'model_context_window_exceeded' }, 'm').result
  expect(r.stopReason).toBe('model_context_window_exceeded')
})

test('tierRoute: model tier picks the default.conf line; no tier or no line gives undefined', () => {
  const kv = { haiku: 'default', sonnet: 'default', opus: 'claude', agents: 'default' }
  expect(tierRoute(kv, 'claude-haiku-5-5')).toBe('default')
  expect(tierRoute(kv, 'claude-sonnet-5-5[1m]')).toBe('default')
  expect(tierRoute(kv, 'claude-opus-5-5')).toBe('claude')
  expect(tierRoute(kv, 'Haiku')).toBe('default')
  expect(tierRoute({ opus: 'claude' }, 'claude-haiku-5-5')).toBeUndefined()
  expect(tierRoute(kv, 'deepseek-v4.1-flash')).toBeUndefined()
  expect(tierRoute(kv, undefined)).toBeUndefined()
})
