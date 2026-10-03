// node --test skills/using-grok-bot-app/scripts/lib/tui.test.ts — the TUI's drawing, no terminal.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderLines, type View } from './tui.node.ts'
import { cells } from './core.ts'

const UUID = '201040cc-5be6-4d04-9f18-62f181a84677'
const row = { id: UUID, name: 'NOVA 替身', unread: false, preview: '收到，處理中', busy: 'idle', current: true }
const plain = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '')
const view = (over: Partial<View> = {}): View => ({ now: 10_000, at: 8_000, detail: false, port: 9231, read: { state: 'ok', rows: [row] }, ...over })

test('a row shows key, name, uuid8, state and preview', () => {
  const lines = renderLines(view(), 120, 40).map(plain)
  assert.match(lines[0]!, /1 bot · read 2s ago/)
  assert.match(lines[3]!, /^1 ● NOVA 替身 201040cc idle · open 「收到，處理中」$/)
})

test('draft, replying and unread come from the shared row model', () => {
  const rows = [{ ...row, preview: 'Draft: hi' }, { ...row, busy: 'working' }, { ...row, unread: true }]
  const lines = renderLines(view({ read: { state: 'ok', rows } }), 120, 40).map(plain)
  assert.match(lines[3]!, /draft in composer/)
  assert.match(lines[4]!, /◐ .* replying/)
  assert.match(lines[5]!, /✦ .* unread/)
})

test('a degraded read says which state, with no rows', () => {
  const lines = renderLines(view({ read: { state: 'port-down', error: 'ECONNREFUSED' } }), 80, 40).map(plain)
  assert.match(lines[0]!, /▲ port-down/)
  assert.match(lines[3]!, /ECONNREFUSED/)
})

test('detail of the open bot shows its conversation', () => {
  const read = { state: 'ok', rows: [row], convo: [{ who: 'NOVA', text: '好', at: '9:58 PM' }] }
  const lines = renderLines(view({ read, sel: 0, detail: true }), 80, 40).map(plain)
  assert.ok(lines.some(l => l.includes('9:58 PM NOVA · 「好」')))
})

test('no line is wider than the terminal, CJK included', () => {
  const long = { ...row, name: '很長的名字'.repeat(10), preview: '中文預覽'.repeat(40) }
  for (const l of renderLines(view({ read: { state: 'ok', rows: [long] } }), 40, 40)) assert.ok(cells(plain(l)) <= 40, l)
})
