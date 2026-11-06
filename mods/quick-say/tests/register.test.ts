import { expect, test } from 'claude-code/testing'

import { PHRASES, phrasesOf } from '../hooks/register.ts'
import { cells } from '../hooks/lib/band.ts'

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
  const files = new Map<string, string>()
  on('prompt.fill', (_, e) => (filled.push(e.text), { isFilled: true, text: e.text, cursor: e.text.length }))
  on('prompt.submit', (_, e) => (sent.push({ text: e.text, origin: e.origin }), { text: e.text }))
  on('session.id', () => ({ value: '12345678-session' }))
  on('env.get', () => ({ value: '/h/me' }))
  on('fs.exists', (_, e) => ({ value: files.has(e.path) }))
  on('fs.read', (_, e) => ({ value: files.get(e.path) ?? '' }))
  on('fs.write', (_, e) => (files.set(e.path, e.text), { value: undefined }))
  on('ui.log', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.invalidate', () => ({ value: undefined }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('store.get', (_, e) => ({ value: store.get(e.key) }))
  on('store.set', (_, e) => (store.set(e.key, e.value), { value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  // Another plugin's row changes on every draw, with no space at the joint.
  let draws = 0
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: `workers v0.46.14 · tmux ${++draws}` }))
  return { sent, filled, store, files }
}

test('the band starts folded, opens, and a combo button fills its whole text into the prompt, unsent', async ($, on) => {
  const w = world(on)
  await $.session.start(start)

  const folded = textOf(await $.ui.render(band()))
  expect(folded).toContain('▌quick say v0.6.1 · 7 combos · 半自動 [ ◐ 半自動 ][ ▸ open ][ hide ]')
  expect(folded).not.toContain('0: 收工')

  await $.ui.press({ plugin: PLUGIN, key: 'fold', requestId: 'above' })
  expect(w.store.get('quick-say.fold')).toBe('open')
  const open = textOf(await $.ui.render(band()))
  expect(open).toContain('[ ▾ fold ]')
  expect(open).toContain('4: 更深的問題  5: 前情提要  6: 規劃期  7: 指揮  8: 指揮＋loop  9: 驗收  0: 收工')

  await $.ui.press({ plugin: PLUGIN, key: 'say-0', requestId: 'above' })
  expect(w.filled).toEqual([PHRASES[6]!.text])
  expect(w.sent.length).toBe(0)

  // The open choice is kept for the next session; folding again is kept too.
  await $.session.start(start)
  expect(textOf(await $.ui.render(band()))).toContain('0: 收工')
  await $.ui.press({ plugin: PLUGIN, key: 'fold', requestId: 'above' })
  expect(w.store.get('quick-say.fold')).toBe('folded')
  await $.session.start(start)
  expect(textOf(await $.ui.render(band()))).toContain('[ ▸ open ]')
})

test('narrow: icons only, labels cut, never wrapped; no room: the phrase row goes, then the header', async ($, on) => {
  world(on, new Map([['quick-say.fold', 'open']]))
  await $.session.start(start)

  const narrow = textOf(await $.ui.render(band(40)))
  expect(narrow).toContain('▌quick say v0.6.1')
  expect(narrow).toContain('[ ◐ ][ ▾ ][ ✕ ]')
  // Seven labels use two rows; each label fits its share.
  expect(narrow).toContain('4: 更深…  5: 前情…  6: 規劃…  7: 指揮')
  expect(narrow).toContain('8: 指揮…  9: 驗收  0: 收工')
  // Room for one phrase row only: one row, labels cut.
  expect(textOf(await $.ui.render(band(40, 3)))).toContain('4: ')

  // maxRows 2 leaves one row under the workers row: the header alone; 1 leaves none.
  const tight = textOf(await $.ui.render(band(120, 2)))
  expect(tight).toContain('workers v0.46.14')
  expect(tight).toContain('▌quick say')
  expect(tight).not.toContain('6: 規劃期')
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
  expect(shown.text).toContain(`0 收工: ${PHRASES[6]!.text}`)
  expect(w.store.get('quick-say.hidden')).toBe('shown')
  expect(textOf(await $.ui.render(band()))).toContain('▌quick say v0.6.1')

  expect((await $.command.run(cmd)).text).toContain('band hidden; /quick-say shows it again.')
})

test('phrasesOf checks the list once: fields, unique hotkeys, and {{hotkey}} embeds', () => {
  const p = (hotkey: string, text = 't') => ({ hotkey, label: `l${hotkey}`, when: 'w', text })
  expect(phrasesOf([p('7', 'cmd'), p('8', 'loop\n{{7}}\nend')])[1]!.text).toBe('loop\ncmd\nend')
  expect(() => phrasesOf([])).toThrow('non-empty array')
  expect(() => phrasesOf([{ ...p('1'), when: ' ' }])).toThrow('entry 0 needs a non-empty "when"')
  expect(() => phrasesOf([p('1'), p('1')])).toThrow('hotkey "1" appears twice')
  expect(() => phrasesOf([p('1', '{{9}}')])).toThrow('unknown hotkey {{9}}')
  expect(() => phrasesOf([p('1', '{{2}}'), p('2', '{{3}}'), p('3')])).toThrow('one level only')
  expect(() => phrasesOf([p('1', 'a{{1}}')])).toThrow('one level only')
  expect(() => phrasesOf([p('7', '{{8}}'), p('8', '{{7}}')])).toThrow('one level only')
})

test('every combo in phrases.ts fills its own whole text into the box, unsent', async ($, on) => {
  const w = world(on, new Map([['quick-say.fold', 'open']]))
  await $.session.start(start)
  const expected = PHRASES.map(p => p.text)
  expect(new Set(PHRASES.map(p => p.hotkey)).size).toBe(PHRASES.length)
  expect(PHRASES.find(p => p.hotkey === '8')!.text).toContain(PHRASES.find(p => p.hotkey === '7')!.text)
  expect(PHRASES.every(p => !/\{\{\w+\}\}/.test(p.text))).toBe(true)
  for (const p of PHRASES) {
    await $.ui.render(band())
    await $.ui.press({ plugin: PLUGIN, key: `say-${p.hotkey}`, requestId: 'above' })
  }
  expect(w.filled).toEqual(expected)
  expect(w.sent).toEqual([])
  // Let the last fill callback's append finish, then check every row survived.
  await $.session.start(start)
  const rows = [...w.files.values()].join('').trim().split('\n').map(l => JSON.parse(l))
  expect(rows.map(r => r.combo)).toEqual(PHRASES.map(p => p.label))
  expect(rows.every(r => r.event === 'shown')).toBe(true)
})

test('mode button cycles, commands reverse it, and each saved choice is read on session start', async ($, on) => {
  const w = world(on)
  w.store.set('quick-say.auto', 'off')
  await $.session.start(start)
  expect(textOf(await $.ui.render(band()))).toContain('[ ◐ 半自動 ]')
  for (const [saved, current, label] of [
    ['自動', '半自動', '◐ 半自動'],
    ['手動', '手動', '○ 手動'],
    ['半自動', '半自動', '◐ 半自動'],
  ]) {
    // The previous start resets auto; restore it to test auto -> manual.
    if (saved === '手動') await $.command.run({ ...cmd, args: 'mode auto' })
    await $.ui.render(band())
    await $.ui.press({ plugin: PLUGIN, key: 'mode', requestId: 'above' })
    expect(w.store.get('quick-say.mode')).toBe(saved)
    expect(textOf(await $.ui.render(band()))).toContain(`[ ${saved === '自動' ? '⚡ 自動' : saved === '手動' ? '○ 手動' : '◐ 半自動'} ]`)
    await $.session.start(start)
    expect(w.store.get('quick-say.mode')).toBe(saved)
    expect(textOf(await $.ui.render(band()))).toContain(`[ ${label} ]`)
    expect((await $.command.run({ ...cmd, args: 'mode' })).text).toBe(`mode: ${current}`)
  }
  for (const [arg, saved] of [['manual', '手動'], ['auto', '自動'], ['semi', '半自動'], ['手動', '手動'], ['半自動', '半自動'], ['自動', '自動']]) {
    await $.command.run({ ...cmd, args: `mode ${arg}` })
    expect(w.store.get('quick-say.mode')).toBe(saved)
    expect(textOf(await $.ui.render(band()))).toContain(saved!)
    await $.session.start(start)
    expect(w.store.get('quick-say.mode')).toBe(saved)
    expect((await $.command.run({ ...cmd, args: 'mode' })).text).toBe(`mode: ${saved === '手動' ? '手動' : '半自動'}`)
  }
  expect((await $.command.run({ ...cmd, args: 'auto' })).text).toContain('[mode')
  expect((await $.command.run({ ...cmd, args: 'mode nope' })).text).toContain('manual|semi|auto')
})

// Read each row as the engine draws it, with the collapse control's four cells reserved.
function linesOf(node: unknown): string[] {
  if (!node || typeof node !== 'object') return []
  if (Array.isArray(node)) return node.flatMap(linesOf)
  const el = node as { type?: string; children?: unknown; props?: { flexDirection?: string; dimColor?: boolean } }
  if (el.type !== 'Box') return [textOf(node)]
  const kids = [el.children].flat(9).flatMap(linesOf)
  return el.props?.flexDirection === 'column' ? kids : [kids.join('')]
}

test('all mode headers fit wide and narrow cells and actionable buttons are not dim', async ($, on) => {
  world(on, new Map([['quick-say.fold', 'open']]))
  await $.session.start(start)
  for (const [mode, label, icon] of [['manual', '○ 手動', '○'], ['semi', '◐ 半自動', '◐'], ['auto', '⚡ 自動', '⚡']]) {
    await $.command.run({ ...cmd, args: `mode ${mode}` })
    for (const width of [120, 80, 40, 35, 20]) {
      const tree = await $.ui.render(band(width))
      const text = textOf(tree)
      if (width < 36) expect(text).not.toContain('quick say')
      else {
        expect(text).toContain('▌quick say v0.6.1')
        expect(text).toContain(`[ ${width >= 80 ? label : icon} ]`)
      }
      for (const line of linesOf(tree).filter(l => !l.startsWith('workers v0.46.14'))) expect(cells(line) + (line.includes('▌quick say') ? 4 : 0)).toBeLessThanOrEqual(width)
      const walk = (n: unknown, dim = false) => {
        if (!n || typeof n !== 'object') return
        if (Array.isArray(n)) { n.forEach(x => walk(x, dim)); return }
        const el = n as { type?: string; props?: { dimColor?: boolean }; children?: unknown }
        const isDim = dim || el.props?.dimColor === true
        if (el.type === 'Button') expect(isDim).toBe(false)
        walk(el.children, isDim)
      }
      walk(tree)
    }
  }
})
