// node --test skills/using-grok-bot-app/scripts/sidebar.test.mjs — the helper's degraded states.
// The ok path needs a CDP WebSocket; it is checked live against the app (T1 note).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { execFile } from 'node:child_process'

const HELPER = new URL('./sidebar.mjs', import.meta.url).pathname

const run = port => new Promise(res =>
  execFile('node', [HELPER, String(port)], (err, stdout) =>
    res({ code: err?.code ?? 0, out: JSON.parse(stdout) })))

const serve = handler => new Promise(res => {
  const s = createServer(handler).listen(0, '127.0.0.1', () => res(s))
})

const json = body => (req, rsp) => rsp.end(JSON.stringify(body))

test('empty target list → renderer-missing', async () => {
  const s = await serve(json([]))
  const r = await run(s.address().port)
  s.close()
  assert.deepEqual([r.code, r.out.state], [2, 'renderer-missing'])
})

test('pages but none is the renderer → wrong-url', async () => {
  const s = await serve(json([{ type: 'page', url: 'about:blank' }]))
  const r = await run(s.address().port)
  s.close()
  assert.deepEqual([r.code, r.out.state], [2, 'wrong-url'])
})

test('nothing listening → port-down', async () => {
  const s = await serve(json([]))
  const port = s.address().port
  await new Promise(r => s.close(r))
  const r = await run(port)
  assert.deepEqual([r.code, r.out.state], [2, 'port-down'])
})

test('server never answers → timeout within the deadline', async () => {
  const s = await serve(() => {})
  const t0 = Date.now()
  const r = await run(s.address().port)
  s.closeAllConnections(); s.close()
  assert.deepEqual([r.code, r.out.state], [2, 'timeout'])
  assert.ok(Date.now() - t0 < 3000)
})

test('no global WebSocket (Node < 22) → node-too-old', async () => {
  const r = await new Promise(res =>
    execFile('node', ['--no-experimental-websocket', HELPER, '1'], (err, stdout) =>
      res({ code: err?.code ?? 0, out: JSON.parse(stdout) })))
  assert.deepEqual([r.code, r.out.state], [2, 'node-too-old'])
})

// The eval's transcript parse, run on the text the app renders (0.59.1 shapes plus review 0.4.0 cases).
test('convo: sender before the first blank line, body whole, badges and date lines dropped', async () => {
  const { readFileSync } = await import('node:fs')
  const src = readFileSync(HELPER, 'utf8').match(/const READ = `([\s\S]*?)`\n/)[1].replace(/\\\\/g, '\\')
  const parse = text => new Function('document', `return ${src}`)({
    querySelectorAll: () => [],
    querySelector: sel => (sel.includes('transcript') ? { innerText: text } : null),
  }).convo
  assert.deepEqual(parse('x\n\n11:45 PM\nToday 1:33 AM\nYou\n\nmeet at 9:58 PM\n\n1:33 AM\nNEW\nNOVA 替身\n\n收到\nline 2\n\n1:34 AM\nNOVA 替身 is working'), [
    { who: 'You', text: 'meet at 9:58 PM', at: '1:33 AM' },
    { who: 'NOVA 替身', text: '收到 line 2', at: '1:34 AM' },
  ])
  assert.deepEqual(parse('x\n\n9:11 AM\nUS_STOCK\n\n我先核對\n\n9:11 AM\nNew email\nReady to send\nFrom\na@b.c\nTo\nCc\nSubject\n\nterrain 每日\n\n9:12 AM\n'), [
    { who: 'US_STOCK', text: '我先核對', at: '9:11 AM' },
    { who: 'US_STOCK · New email', text: 'terrain 每日', at: '9:12 AM' },
  ])
  assert.deepEqual(parse('x\n\n1:08 AM\nYou\n\n長訊息\n\nShow more\n1:09 AM\nsandbox\n\n好\n\n1:10 AM'), [
    { who: 'You', text: '長訊息', at: '1:09 AM' },
    { who: 'sandbox', text: '好', at: '1:10 AM' },
  ])
  assert.deepEqual(parse('x\n\n1:11 AM\nNOVA\n\n結論\n- 一\n1:12 AM\nYou\n\n好\n\n1:12 AM'), [
    { who: 'NOVA', text: '結論 - 一', at: '1:12 AM' },
    { who: 'You', text: '好', at: '1:12 AM' },
  ])
  assert.deepEqual(parse(''), [])
})
