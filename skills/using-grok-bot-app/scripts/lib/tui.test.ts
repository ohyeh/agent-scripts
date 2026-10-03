// node --test skills/using-grok-bot-app/scripts/lib/tui.test.ts — the TUI's drawing, no terminal.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderLines, type View } from './tui.node.ts'
import { cells } from './core.ts'

const UUID = '201040cc-5be6-4d04-9f18-62f181a84677'
const row = { id: UUID, name: 'NOVA 替身', unread: false, preview: '收到，處理中', busy: 'idle', current: true }
const plain = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '')
const view = (over: Partial<View> = {}): View => ({ now: 10_000, at: 8_000, detail: false, read: { state: 'ok', port: 39231, rows: [row] }, ...over })

test('a row shows key, name, uuid8, state and preview', () => {
  const lines = renderLines(view(), 120, 40).map(plain)
  assert.match(lines[0]!, /1 bot · read 2s ago/)
  assert.match(lines[3]!, /^1 ● NOVA 替身 201040cc idle · open\s+「收到，處理中」$/)
})

test('draft, replying and unread come from the shared row model', () => {
  const rows = [{ ...row, preview: 'Draft: hi' }, { ...row, busy: 'working' }, { ...row, unread: true }]
  const lines = renderLines(view({ read: { state: 'ok', rows } }), 120, 40).map(plain)
  assert.match(lines[3]!, /draft in composer/)
  assert.match(lines[4]!, /◐ .* replying/)
  assert.match(lines[5]!, /✦ .* unread/)
})

test('a degraded read says which state, with no rows', () => {
  const lines = renderLines(view({ read: { state: 'port-down', port: 39231, error: 'ECONNREFUSED' } }), 80, 40).map(plain)
  assert.match(lines[0]!, /▲ port-down/)
  assert.ok(lines.join('\n').includes('--remote-debugging-port=39231'), 'says how to fix it')
  assert.ok(lines.some(l => l.includes('ECONNREFUSED')))
})

test('detail of the open bot shows its conversation', () => {
  const read = { state: 'ok', rows: [row], convo: [{ who: 'NOVA', text: '好', at: '9:58 PM' }] }
  const lines = renderLines(view({ read, sel: 0, detail: true }), 80, 40).map(plain)
  assert.ok(lines.some(l => l.includes('9:58 PM · NOVA')))
  assert.ok(lines.some(l => l.trim() === '好'))
})

test('no line is wider than the terminal, CJK included', () => {
  const long = { ...row, name: '很長的名字'.repeat(10), preview: '中文預覽'.repeat(40) }
  for (const l of renderLines(view({ read: { state: 'ok', rows: [long] } }), 40, 40)) assert.ok(cells(plain(l)) <= 40, l)
})

test('the list scrolls to keep the selection in view, with a more line', () => {
  const rows = Array.from({ length: 20 }, (_, i) => ({ ...row, id: `${String(i).padStart(8, '0')}-x`, name: `bot${i}` }))
  const lines = renderLines(view({ read: { state: 'ok', rows }, sel: 15 }), 80, 10)
  assert.equal(lines.length, 10)
  const sel = lines.find(l => l.startsWith('\x1b[7m'))
  assert.ok(sel && plain(sel).includes('bot15'), 'the selected row is drawn')
  assert.match(plain(lines.at(-1)!), /↓ 4 more/)
})

test('a long message wraps in detail instead of being cut', () => {
  const read = { state: 'ok', rows: [row], convo: [{ who: 'NOVA', text: '字'.repeat(60), at: '9:58 PM' }] }
  const body = renderLines(view({ read, sel: 0, detail: true }), 40, 40).map(plain).filter(l => l.includes('字'))
  assert.ok(body.length >= 3)
  assert.equal(body.join('').replace(/\s/g, ''), '字'.repeat(60))
})

test('a detail taller than the terminal keeps the newest lines and says how many are hidden', () => {
  const convo = Array.from({ length: 5 }, (_, i) => ({ who: 'NOVA', text: `msg${i}`, at: `9:5${i} PM` }))
  const lines = renderLines(view({ read: { state: 'ok', rows: [row], convo }, sel: 0, detail: true }), 80, 9).map(plain)
  assert.equal(lines.length, 9)
  assert.match(lines[4]!, /↑ 6 earlier lines/)
  assert.match(lines[3]!, /NOVA 替身 · 201040cc/)
  assert.equal(lines.at(-1)!.trim(), 'msg4')
})
