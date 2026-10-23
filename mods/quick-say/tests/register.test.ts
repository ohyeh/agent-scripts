import { expect, test } from 'claude-code/testing'

import { PHRASES } from '../hooks/register.ts'

const PLUGIN = 'quick-say'
const start = { cwd: '/work/agent-scripts', surface: 'terminal' as const, isInteractive: true }
const cmd = { command: 'quick-say', args: '', origin: { kind: 'composer' as const }, presentation: { isFullscreen: false, columns: 120 } }

const band = (bodyColumns = 120, maxRows = 20) => ({
  surface: 'terminal' as const,
  component: 'AbovePrompt' as const,
  requestId: 'above',
  props: { hasSurvey: false, isWorking: false, maxRows, bodyColumns, scroll: { offset: 0, bodyRows: maxRows - 1 }, view: {} },
})

function textOf(node: unknown): string {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  const el = node as { type?: string; props?: Record<string, unknown>; children?: unknown }
  const p = el.props ?? {}
  const label = el.type === 'Button' ? (p.plain ? `${String(p.hotkey)}: ${String(p.label)}` : `[ ${String(p.label)} ]`) : ''
  return `${label}${textOf(el.children)}${el.type === 'Box' && p.flexDirection === 'column' ? '\n' : ''}`
}

type On = Parameters<Extract<Parameters<typeof test>[1], (...args: never[]) => unknown>>[1]

// The engine beneath the mod: a store, and the prompts it submits.
function world(on: On, store = new Map<string, unknown>()) {
  const sent: { text: string; origin: unknown }[] = []
  const filled: string[] = []
  on('prompt.fill', (_, e) => (filled.push(e.text), { isFilled: true, text: e.text, cursor: e.text.length }))
  on('prompt.submit', (_, e) => (sent.push({ text: e.text, origin: e.origin }), { text: e.text }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.invalidate', () => ({ value: undefined }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('store.get', (_, e) => ({ value: store.get(e.key) }))
  on('store.set', (_, e) => (store.set(e.key, e.value), { value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  // Another plugin's row beneath the mod: one row of the budget.
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: 'workers v0.46.14 · tmux 0' }))
  return { sent, filled, store }
}

test('the band starts folded, opens, and a combo button fills its whole text into the prompt, unsent', async ($, on) => {
  const w = world(on)
  await $.session.start(start)

  const folded = textOf(await $.ui.render(band()))
  expect(folded).toContain('▌quick say v0.3.0 · 4 combos · auto · 0 nudges [ ⚡ auto ][ ▸ open ][ hide ]')
  expect(folded).not.toContain('9: 收工')

  await $.ui.press({ plugin: PLUGIN, key: 'fold', requestId: 'above' })
  expect(w.store.get('quick-say.fold')).toBe('open')
  const open = textOf(await $.ui.render(band()))
  expect(open).toContain('[ ▾ fold ]')
  expect(open).toContain('6: 審過再做  7: 進度續跑  8: 做完推送  9: 收工')

  await $.ui.press({ plugin: PLUGIN, key: 'say-9', requestId: 'above' })
  expect(w.filled).toEqual([PHRASES[3].text])
  expect(w.sent.length).toBe(0)

  // The open choice is kept for the next session; folding again is kept too.
  await $.session.start(start)
  expect(textOf(await $.ui.render(band()))).toContain('9: 收工')
  await $.ui.press({ plugin: PLUGIN, key: 'fold', requestId: 'above' })
  expect(w.store.get('quick-say.fold')).toBe('folded')
  await $.session.start(start)
  expect(textOf(await $.ui.render(band()))).toContain('[ ▸ open ]')
})

test('narrow: icons only, labels cut, never wrapped; no room: the phrase row goes, then the header', async ($, on) => {
  world(on, new Map([['quick-say.fold', 'open']]))
  await $.session.start(start)

  const narrow = textOf(await $.ui.render(band(40)))
  expect(narrow).toContain('▌quick say v0.3.0')
  expect(narrow).toContain('[ ⚡ ][ ▾ ][ ✕ ]')
  expect(narrow).toContain('6: 審過…')

  // maxRows 2 leaves one row under the workers row: the header alone; 1 leaves none.
  const tight = textOf(await $.ui.render(band(120, 2)))
  expect(tight).toContain('workers v0.46.14')
  expect(tight).toContain('▌quick say')
  expect(tight).not.toContain('6: 審過再做')
  expect(textOf(await $.ui.render(band(120, 1)))).not.toContain('quick say')
})

test('hide takes the band away across sessions until /quick-say shows it again', async ($, on) => {
  const w = world(on, new Map([['quick-say.fold', 'open']]))
  await $.session.start(start)

  await $.ui.render(band())
  await $.ui.press({ plugin: PLUGIN, key: 'hide', requestId: 'above' })
  expect(w.store.get('quick-say.hidden')).toBe('hidden')
  expect(textOf(await $.ui.render(band()))).not.toContain('quick say')
  await $.session.start(start)
  expect(textOf(await $.ui.render(band()))).not.toContain('quick say')

  const shown = await $.command.run(cmd)
  expect(shown.text).toContain('band shown')
  expect(shown.text).toContain(`9 收工: ${PHRASES[3].text}`)
  expect(w.store.get('quick-say.hidden')).toBe('shown')
  expect(textOf(await $.ui.render(band()))).toContain('▌quick say v0.3.0')

  expect((await $.command.run(cmd)).text).toContain('band hidden; /quick-say shows it again.')
})
