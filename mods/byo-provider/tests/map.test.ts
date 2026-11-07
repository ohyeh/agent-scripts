// Unit check of the gate response → TurnStepChunk mapping. Run: bun test <run dir>/test/map.test.ts
import { expect, test } from 'claude-code/testing'
import { deadline, deferredTools, failStep, forGate, loadedTools, toStep } from '../hooks/map'
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
  expect(await deadline(never, 20, new AbortController().signal, after)).toEqual({ why: 'no answer in 0.02 s (GATE_TIMEOUT_MS)' })
  const stop = new AbortController()
  const r = deadline(never, 5000, stop.signal, after)
  stop.abort()
  expect(await r).toEqual({ why: 'interrupted' })
  const gone = new AbortController(); gone.abort()
  expect(await deadline(never, 5000, gone.signal, after)).toEqual({ why: 'interrupted' })
  await expect(deadline(Promise.reject(new Error('ECONNREFUSED')), 50, new AbortController().signal, after)).rejects.toThrow('ECONNREFUSED')
  // timeout path wired as the hook wires it: the reason becomes a visible failed step
  const lost = await deadline(never, 10, new AbortController().signal, after)
  expect('why' in lost && failStep('t', 0, lost.why).result.answer).toBe('[byo-provider: no answer in 0.01 s (GATE_TIMEOUT_MS)]')
})
