import { expect, test } from 'claude-code/testing'

const BAND = {
  plugin: 'agent-should-know',
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

test('an offer card is sent once, hidden, and logged with its verdict', async ($, on) => {
  const sent: string[] = []
  on('prompt.submit', (_, e) => {
    sent.push(e.text)
    return { text: e.text }
  })
  on('ui.toast', () => ({ value: undefined }))
  const store = new Map<string, unknown>()
  on('store.get', (_, e) => ({ value: store.get(e.key) }))
  on('store.set', (_, e) => (store.set(e.key, e.value), { value: undefined }))
  const files = new Map<string, string>()
  on('fs.read', (_, e) => {
    const text = files.get(e.path)
    if (text === undefined) throw new Error('ENOENT')
    return { value: text }
  })
  on('fs.write', (_, e) => (files.set(e.path, e.text), { value: undefined }))
  // The built-in's store holds the whole line (two sentences here) and its explanation.
  const STORE = '/home/me/.claude/plugins/store'
  files.set(
    `${STORE}/cc-plugin-you-should-know_builtin-19776595df2c.json`,
    JSON.stringify({
      sessions: [
        { id: 'other', tag: 'Heads up', view: { kind: 'offer', line: 'Not this one.' } },
        {
          id: '28d2c553-6d91',
          tag: 'Heads up',
          view: { kind: 'offer', line: '兩張單程票被加總了。來回票更便宜。.', explanation: '**Why it matters**\n- The plan page lists 2.91 萬.' },
        },
      ],
    }),
  )
  on('fs.list', (_, e) => ({
    value:
      e.path === STORE
        ? [{ name: 'cc-plugin-you-should-know_builtin-19776595df2c.json', kind: 'file', size: 1, mtimeMs: 0, isLink: false }]
        : [],
  }))
  on('env.get', () => ({ value: '/home/me' }))
  on('session.id', () => ({ value: '28d2c553-6d91' }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({
    text: e.turnId === 't0' ? 'Long task reply.' : 'Fixed: the fare now uses the round-trip price.',
  }))

  // Stands for the built-in's offer card beneath the mod; other plugins' bands
  // sit beside it in the same tree, their costs changing on every draw.
  let draws = 0
  on('ui.render', ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    draws += 1
    return Box({
      children: [
        Text({ children: [`$2.5${draws}last $1.05 · 25% reuse1 duplicate?`] }),
        Box({
          children: [
            Text({ children: ['Heads up · ', '兩張單程票被加總了。.'] }),
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

  await $.session.start({ cwd: '/work/agent_automation', surface: 'terminal', isInteractive: true })
  // The card shows while a long main turn runs; the relay is queued behind it.
  await $.turn.start({ text: 'long task', turnId: 't0' })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await ui.find({ type: 'Text', text: /Heads up/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /workers/ })).toBeDefined()
    await ui.unmount()
  }

  expect(draws).toBe(2)
  expect(sent.length).toBe(1)
  // The whole line and the Learn more explanation come from the built-in's store.
  expect(sent[0]).toContain('\n> Heads up · 兩張單程票被加總了。來回票更便宜。\n>\n> **Why it matters**\n> - The plan page lists 2.91 萬.\n')
  expect(sent[0]).not.toContain('Only the card')

  // One file for this session: <project>/<day>-<sid8>.log
  const fileName = /^\/home\/me\/\.local\/state\/agent-should-know\/agent_automation\/\d{4}-\d{2}-\d{2}-28d2c553\.log$/
  const logOf = () => [...files].find(([path]) => fileName.test(path))?.[1] ?? ''

  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't0', reason: 'answer' })
  expect(logOf()).not.toContain('Long task reply.')
  await $.turn.start({ text: sent[0] ?? '', turnId: 't1' })
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  expect([...files.keys()].filter(p => p.includes('/agent-should-know/')).length).toBe(1)
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
})

test('the card alone is hidden too; a store holding another card is not relayed', async ($, on) => {
  const sent: string[] = []
  on('prompt.submit', (_, e) => (sent.push(e.text), { text: e.text }))
  on('ui.toast', () => ({ value: undefined }))
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  // The store file lags: it still holds this session's previous card.
  on('fs.list', () => ({
    value: [{ name: 'cc-plugin-you-should-know_builtin-1.json', kind: 'file', size: 1, mtimeMs: 0, isLink: false }],
  }))
  on('fs.read', (_, e) => ({
    value: e.path.endsWith('_builtin-1.json')
      ? JSON.stringify({ sessions: [{ id: '28d2c553-6d91', tag: 'Heads up', view: { kind: 'offer', line: 'Something else.', explanation: 'Stale.' } }] })
      : '',
  }))
  on('fs.write', () => ({ value: undefined }))
  on('env.get', () => ({ value: '/home/me' }))
  on('session.id', () => ({ value: '28d2c553-6d91' }))
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

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await ui.find({ type: 'Text', text: /Heads up/ })).toBeUndefined()
    await ui.unmount()
  }

  expect(sent.length).toBe(1)
  expect(sent[0]).toContain("\n> Heads up · Two one-way fares were summed.\n(Only the card's line: its explanation was not read: the store's offer does not match the card on screen.)")
  expect(sent[0]).not.toContain('Stale.')
})
