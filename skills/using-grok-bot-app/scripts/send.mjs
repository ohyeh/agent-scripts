#!/usr/bin/env node
// Send one message to one Grok Bot bot over CDP: open the bot, paste the text into
// the composer, press Enter (a trusted CDP key event, the one the app accepts).
// The message is stdin, never an argument. A draft already in the composer is
// someone typing: nothing is touched. Read-only callers use sidebar.mjs instead.
// One JSON line on stdout: { state, port, ... }. Exit 0 only for "sent".
//   sent        the composer emptied after Enter: the app took the message
//   empty       no text on stdin
//   bad-id      the id is not 8–36 chars of a UUID
//   down        the port does not answer (ensure.mjs brings it back)
//   no-bot      no sidebar row for that id; ambiguous: more than one
//   draft       the composer already holds text; nothing changed
//   not-open    the app did not open that bot within 5 s
//   not-pasted  the composer does not hold the text after the paste (cleared again)
//   not-sent    Enter did not empty the composer within 5 s
//   failed      a CDP call threw; timeout: the whole run took over 15 s
// Usage: send.mjs <bot-uuid-or-prefix> [port] < message   (port: $GROK_BOT_CDP_PORT, else 39231)

import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const RENDERER = /app\.asar\/dist\/renderer\/index\.html$/
const ID_RE = /^[0-9a-f-]{8,36}$/
/** How long the app gets to open the bot, and to take the message after Enter. */
const WAIT_MS = 5000

const norm = s => s.replace(/\s+/g, ' ').trim()

/**
 * The send, over injected effects so the test drives it without an app. d: count(id) → rows matching,
 * composer() → its text or null, current() → the open bot's id, click(id), paste(text), clear(),
 * enter(), sleep(ms).
 */
export async function send(d, id, text) {
  if (!norm(text)) return 'empty'
  if (!ID_RE.test(id)) return 'bad-id'
  const n = await d.count(id)
  if (n !== 1) return n ? 'ambiguous' : 'no-bot'
  // Checked before the click too: a draft for another bot must not be lost to the switch.
  if (norm((await d.composer()) ?? '')) return 'draft'
  const until = async (ok, ms = WAIT_MS) => {
    for (let t = 0; ; t += 250) {
      if (await ok()) return true
      if (t >= ms) return false
      await d.sleep(250)
    }
  }
  await d.click(id)
  if (!(await until(async () => (await d.current())?.startsWith(id) && (await d.composer()) !== null))) return 'not-open'
  if (norm((await d.composer()) ?? '')) return 'draft'
  await d.paste(text)
  // Pasted into an empty composer, so whatever is there now is ours to clear.
  if (norm((await d.composer()) ?? '') !== norm(text)) {
    await d.clear()
    return 'not-pasted'
  }
  // The open bot is checked again right before Enter: a click elsewhere meanwhile must not send there.
  if (!(await d.current())?.startsWith(id)) {
    await d.clear()
    return 'not-open'
  }
  await d.enter()
  return (await until(async () => !norm((await d.composer()) ?? ''))) ? 'sent' : 'not-sent'
}

async function cdp(port) {
  let pages
  try {
    pages = await (await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(1500) })).json()
  } catch {
    return null
  }
  const page = pages.find(p => p.type === 'page' && RENDERER.test(p.url))
  if (!page) return null
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((res, rej) => {
    ws.onopen = res
    ws.onerror = () => rej(new Error('websocket error'))
  })
  let seq = 0
  const waiting = new Map()
  ws.onmessage = m => {
    const r = JSON.parse(m.data)
    waiting.get(r.id)?.(r)
    waiting.delete(r.id)
  }
  const call = (method, params) => new Promise(res => {
    waiting.set(++seq, res)
    ws.send(JSON.stringify({ id: seq, method, params }))
  })
  const ev = async expr => (await call('Runtime.evaluate', { expression: expr, returnByValue: true })).result?.result?.value
  const row = id => `document.querySelectorAll('button[data-agent-id^=${JSON.stringify(id)}]')`
  const box = `document.querySelector('div[contenteditable=true]')`
  return {
    close: () => ws.close(),
    d: {
      count: id => ev(`${row(id)}.length`),
      composer: () => ev(`${box}?.innerText ?? null`),
      current: () => ev(`document.querySelector('button[aria-current=page]')?.getAttribute('data-agent-id') ?? null`),
      click: id => ev(`${row(id)}[0].click()`),
      paste: text => ev(`(() => { const c = ${box}; c.focus(); const dt = new DataTransfer(); dt.setData('text/plain', ${JSON.stringify(text)}); c.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })) })()`),
      clear: () => ev(`(() => { const c = ${box}; c.focus(); document.execCommand('selectAll'); document.execCommand('delete') })()`),
      enter: async () => {
        for (const type of ['keyDown', 'keyUp']) await call('Input.dispatchKeyEvent', { type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, ...(type === 'keyDown' ? { text: '\r' } : {}) })
      },
      sleep: ms => new Promise(r => setTimeout(r, ms)),
    },
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.argv[3] || process.env.GROK_BOT_CDP_PORT || 39231)
  const say = (state, extra = {}) =>
    process.stdout.write(JSON.stringify({ state, port, ...extra }) + '\n', () => process.exit(state === 'sent' ? 0 : 2))
  setTimeout(() => say('timeout'), 3 * WAIT_MS).unref()
  let text = ''
  for await (const chunk of process.stdin) text += chunk
  const id = (process.argv[2] ?? '').toLowerCase()
  // Validated before any connection: the id goes into page scripts.
  const early = !norm(text) ? 'empty' : !ID_RE.test(id) ? 'bad-id' : null
  if (early) say(early)
  else {
    const c = await cdp(port).catch(() => null)
    if (!c) say('down')
    else send(c.d, id, text).then(s => (c.close(), say(s, { bot: id })), e => (c.close(), say('failed', { error: String(e) })))
  }
}
