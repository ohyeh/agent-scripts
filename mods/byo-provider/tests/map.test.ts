// Unit check of the gate response → TurnStepChunk mapping. Run: bun test <run dir>/test/map.test.ts
import { expect, test } from 'claude-code/testing'
import { deadline, deferredTools, failStep, forGate, loadedTools, parseAgentDef, parseConf, tierRoute, toStep, bandText, resultsFor } from '../hooks/map'
import { SCHEMAS } from '../hooks/schemas'
import { maxTimeoutSeconds, relayStep, RELAY_TOOL, bindingPlan, cliAllowed, cliProfile, finishStop, reportStep, roundPrompt, withAnswer } from '../hooks/map'

test('failed stop keeps binding and guard; only confirmed stop releases them', async () => {
  const state = { binding: true, guard: true }
  const release = async () => { state.binding = false; state.guard = false }
  for (const receipt of ['stop for "worker" exited 1; row dropped anyway', 'not stopping "worker"', 'Stopped other-worker2', '']) {
    let failed = false
    try { await finishStop('worker', async () => receipt, release) } catch { failed = true }
    expect(failed).toBe(true)
    expect(state).toEqual({ binding: true, guard: true })
  }
  await finishStop('worker', async () => 'stopped "worker" on agy-flash; cancelled episode(s) 1', release)
  expect(state).toEqual({ binding: false, guard: false })
  for (const receipt of ['Stopped agy-flash-worker', 'Already stopped: agy-flash-worker']) {
    let released = false
    await finishStop('worker', async () => receipt, async () => { released = true })
    expect(released).toBe(true)
  }
})

test('stored CLI bindings split by live agent id without losing route metadata', () => {
  const first = { agentId: 'a1', worker: 'byo-one.abcde', profile: 'coding', workerProfile: 'agy-flash', kind: 'general-purpose', ledger: '/state/.v3', name: 'mate', cwd: '/repo', owner: { sessionId: 'own', pid: 123, procStart: 'start' } }
  const second = { ...first, agentId: 'a2', worker: 'byo-two.abcde' }
  const stored = JSON.parse(JSON.stringify([first, second]))
  expect(bindingPlan(stored, ['a1', 'unrelated'], 'own', [])).toEqual({ rebind: [first], stop: [second], keep: [] })
  expect(bindingPlan(stored, [], 'own', [])).toEqual({ rebind: [], stop: [first, second], keep: [] })
  expect(bindingPlan(stored, ['a1', 'a2'], 'own', [])).toEqual({ rebind: [first, second], stop: [], keep: [] })
  expect(stored).toEqual([first, second])
  expect(bindingPlan(undefined, [], 'own', [])).toEqual({ rebind: [], stop: [], keep: [] })
  expect(bindingPlan([], [], 'own', [])).toEqual({ rebind: [], stop: [], keep: [] })
})

test('own/foreign owners and live/dead agents select rebind, stop or keep', () => {
  const own = { agentId: 'a1', worker: 'byo-one.abcde', profile: 'coding', workerProfile: 'agy-flash', kind: 'general-purpose', ledger: '/state/.v3', owner: { sessionId: 'own', pid: 123, procStart: 'start' } }
  const foreign = { ...own, worker: 'byo-two.abcde', owner: { sessionId: 'other', pid: 456, procStart: 'later' } }
  for (const protectedOwners of [[], [own.owner]]) {
    expect(bindingPlan([own], ['a1'], 'own', protectedOwners)).toEqual({ rebind: [own], stop: [], keep: [] })
    expect(bindingPlan([own], [], 'own', protectedOwners)).toEqual({ rebind: [], stop: [own], keep: [] })
  }
  for (const ids of [[], ['a1']]) {
    expect(bindingPlan([foreign], ids, 'own', [foreign.owner])).toEqual({ rebind: [], stop: [], keep: [foreign] })
    expect(bindingPlan([foreign], ids, 'own', [])).toEqual({ rebind: [], stop: [foreign], keep: [] })
  }
  expect(bindingPlan([own, foreign], ['a1'], 'own', [foreign.owner])).toEqual({ rebind: [own], stop: [], keep: [foreign] })
  const dead = { ...foreign, worker: 'byo-old.abcde', owner: { ...foreign.owner, procStart: 'older process' } }
  expect(bindingPlan([foreign, dead], [], 'own', [foreign.owner])).toEqual({ rebind: [], stop: [dead], keep: [foreign] })
})

test('invalid stored bindings fail before they can name a worker to stop', () => {
  for (const stored of [null, {}, [null], [{ agentId: 'a1' }], [{ agentId: 'a1', worker: '../other', profile: 'coding', workerProfile: 'agy-flash', kind: 'workflow', ledger: '/state/.v3' }]])
    expect(() => bindingPlan(stored, [], 'own', [])).toThrow()
  const binding = { agentId: 'a1', worker: 'byo-one.abcde', profile: 'coding', workerProfile: 'agy-flash', kind: 'workflow', ledger: '/state/.v3' }
  for (const owner of [undefined, {}, { sessionId: 'own', pid: '123', procStart: 'start' }, { sessionId: 'own', pid: 0, procStart: 'start' }, { sessionId: 'own', pid: 123, procStart: '' }])
    expect(() => bindingPlan([{ ...binding, owner }], [], 'own', [])).toThrow()
})

test('CLI profile needs no gateway fields and rejects unsafe or empty names', () => {
  expect(cliProfile(parseConf('cli=sol'))).toBe('sol')
  expect(cliProfile(parseConf('cli=tmux/agy-flash'))).toBe('tmux/agy-flash')
  expect(cliProfile(parseConf('model=x'))).toBe(undefined)
  for (const cli of ['', '../sol', 'tmux/', 'sol;id', 'tmux/a/b']) expect(() => cliProfile({ cli })).toThrow()
})

test('CLI opt-in is exact, including separate workflow and fork tokens', () => {
  const kv = { cli_types: ' general-purpose, workflow, fork ' }
  expect(cliAllowed(kv, 'general-purpose')).toBe(true)
  expect(cliAllowed(kv, 'general')).toBe(false)
  expect(cliAllowed(kv, 'Explore')).toBe(false)
  expect(cliAllowed({}, 'general-purpose')).toBe(false)
  expect(cliAllowed({ cli_types: ',' }, undefined)).toBe(false)
  expect(cliAllowed(kv, undefined, true)).toBe(true)
  expect(cliAllowed(kv, undefined, false, true)).toBe(true)
  expect(cliAllowed({ cli_types: 'general-purpose' }, 'general-purpose', true)).toBe(false)
  expect(cliAllowed({ cli_types: 'general-purpose' }, 'general-purpose', false, true)).toBe(false)
})

test('CLI reports end one step and failed, blocked, malformed reports never succeed', () => {
  const report = { schema_version: 1, status: 'success', summary: 'answer', artifacts: [], errors: [] }
  const step = reportStep('t', 3, report)
  expect(step.ok).toBe(true)
  expect(step.result).toMatchObject({ answer: JSON.stringify(report), index: 3, stopReason: 'end_turn', toolUses: [] })
  expect(step.chunks.at(-1)).toEqual({ kind: 'stop', stopReason: 'end_turn', usage: null })
  for (const status of ['failed', 'blocked', 'needs-input', 'pending', undefined]) {
    const failed = reportStep('t', 0, { ...report, status, errors: ['reason'] })
    expect(failed.ok).not.toBe(true)
    expect(failed.result.answer).toContain('CLI status')
  }
  for (const bad of [null, {}, { ...report, schema_version: '1' }, { ...report, summary: '' }])
    expect(reportStep('t', 0, bad).ok).not.toBe(true)
})

test('the full answer file goes ahead of a successful report only', () => {
  const report = { schema_version: 1, status: 'success', summary: 'short', artifacts: [], errors: [] }
  const step = withAnswer(reportStep('t', 1, report), 'line 1\nline 2\n')
  expect(step.result.answer).toBe(`line 1\nline 2\n\n${JSON.stringify(report)}`)
  expect(step.chunks[0]).toEqual({ kind: 'text', index: 0, text: step.result.answer })
  expect(step.chunks.at(-1)).toEqual({ kind: 'stop', stopReason: 'end_turn', usage: null })
  expect(withAnswer(reportStep('t', 1, report), '  \n').result.answer).toBe(JSON.stringify(report))
  const failed = reportStep('t', 1, { ...report, status: 'failed' })
  expect(withAnswer(failed, 'full text')).toBe(failed)
})

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
  // an earlier round's answer stays ahead of the failure
  expect(failStep('t', 1, 'CLI timeout', 'ONE\n').result.answer).toBe('ONE\n\n[byo-provider: CLI timeout]')
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

test('bandText: the header says whether routing works; failures show, finished agents do not', () => {
  expect(bandText({ routed: [], ok: 0, fails: [], agents: 'default' }).status).toBe('agents=default · nothing routed yet')
  const ok = bandText({ routed: Array(13).fill('default'), ok: 400, fails: [], agents: 'default' })
  expect(ok.status).toBe('agents=default · ✓ routing ok · 13 → default · 400 steps ok')
  expect(ok.rows).toEqual([])
  const bad = bandText({ routed: ['default', 'default'], ok: 5, fails: [{ who: 'Explore', why: 'gate 502' }], agents: 'default' })
  expect(bad.status).toBe('agents=default · ✗ 1 failed (Explore: gate 502) · 2 → default · 5 steps ok')
  expect(bad.rows).toEqual(['✗ Explore: gate 502'])
})

test('resultsFor: a kept record answers each tool_use by id, else in order; a missing one is an error', () => {
  const last = { role: 'assistant' as const, content: [{ type: 'text', text: 'reading' }, { type: 'tool_use', id: 'call_00_a', name: 'Read', input: {} }, { type: 'tool_use', id: 'call_01_b', name: 'Bash', input: {} }] }
  expect(resultsFor(last, [{ id: 'call_01_b', text: 'B', isError: true }, { id: 'call_00_a', text: 'A', isError: false }])).toEqual({ role: 'user', content: [
    { type: 'tool_result', tool_use_id: 'call_00_a', content: 'A' },
    { type: 'tool_result', tool_use_id: 'call_01_b', content: 'B', is_error: true }] })
  expect(resultsFor(last, [{ id: 'toolu_x', text: 'A', isError: false }])).toEqual({ role: 'user', content: [
    { type: 'tool_result', tool_use_id: 'call_00_a', content: 'A' },
    { type: 'tool_result', tool_use_id: 'call_01_b', content: 'no result was recorded for this call', is_error: true }] })
  expect(resultsFor({ role: 'assistant', content: [{ type: 'text', text: 'done' }] }, [])).toBeNull()
})

test('a CLI round runs new messages, the spawn prompt only on round 1, never round 1 again', () => {
  expect(roundPrompt([], undefined, 'task')).toBe('task')
  expect(roundPrompt(['m1', 'm2'], 1, 'task')).toBe('m1\n\nm2')
  expect(roundPrompt([], 1, 'task')).toBe('')
})

test('a relay step links on with one call of the no-op tool; an answer step keeps its text', () => {
  const step = relayStep('t1', 3)
  expect(step.ok).toBe(true)
  expect(step.result).toMatchObject({ turnId: 't1', index: 3, answer: '', stopReason: 'tool_use', toolUses: [{ name: RELAY_TOOL, input: {} }] })
  expect(step.chunks.map(c => c.kind)).toEqual(['tool', 'input', 'stop'])
  const answered = relayStep('t1', 4, { ...failStep('t1', 4, 'x'), ok: true })
  expect(answered.result.answer).toBe('[byo-provider: x]')
  expect(answered.result.stopReason).toBe('tool_use')
  expect(answered.chunks.map(c => c.kind)).toEqual(['text', 'tool', 'input', 'stop'])
  expect(answered.chunks[1]).toMatchObject({ kind: 'tool', index: 1, name: RELAY_TOOL })
})

test('timeout limit: CLI routes allow an hour; a gateway keeps the ten-minute limit', () => {
  expect(maxTimeoutSeconds('tmux/agy-flash')).toBe(3600)
  expect(maxTimeoutSeconds('agy-flash')).toBe(3600)
  expect(maxTimeoutSeconds(undefined)).toBe(590)
})
