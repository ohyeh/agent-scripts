// node --test mods/grok-bot-watch/bin/sidebar.test.mjs — the helper's degraded states.
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
