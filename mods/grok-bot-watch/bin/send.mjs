#!/usr/bin/env node
// Send one message to one Grok Bot bot over CDP. The message is stdin, never an argument.
// The send itself is ONE Runtime.evaluate: check the open bot and an empty composer,
// paste, check the composer holds exactly the text; then give the page 50 ms (the app's
// form reads the text from React state, set after the paste: a submit in the same tick
// sends nothing, seen live) and, with no gap before the submit, check the bot and the
// text again and submit the composer's form. The only thing it ever clears is a paste
// it just checked, never a draft (Sol review of 0.8.0, P1).
// Read-only callers use sidebar.mjs instead.
// One JSON line on stdout: { state, port, ... }. Exit 0 only for "sent".
//   sent         the transcript of the open bot shows the message
//   unconfirmed  submitted, but the transcript did not show it within 5 s (the bot
//                was switched, or the app is slow): check the app before resending
//   empty        no text on stdin
//   bad-id       the id is not 8–36 chars of a UUID
//   down         the port does not answer (ensure.mjs brings it back)
//   no-bot       no sidebar row for that id; ambiguous: more than one
//   draft        the composer already holds text; nothing changed
//   not-open     the app did not open that bot (or another bot was open at the send)
//   not-pasted   the paste did not land as given; the paste was removed again
//   moved        another bot was opened in the 50 ms after the paste: not sent, and the
//                text stays in the first bot's composer
//   edited       someone typed into the composer in those 50 ms: not sent, left as is
//   not-sent     the form kept the text; it was removed again
//   failed       a CDP call threw; timeout: the whole run took over 15 s (the
//                message may or may not have gone: check the app)
// Usage: send.mjs <bot-uuid-or-prefix> [port] < message   (port: $GROK_BOT_CDP_PORT, else 39231)

import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const RENDERER = /app\.asar\/dist\/renderer\/index\.html$/
const ID_RE = /^[0-9a-f-]{8,36}$/
/** How long the app gets to open the bot, and to show the message in its transcript. */
const WAIT_MS = 5000

const norm = s => s.replace(/\s+/g, ' ').trim()

/**
 * The send, over injected effects so the test drives it without an app. d: count(id) → rows matching,
 * composer() → its text or null, current() → the open bot's id, click(id), sleep(ms),
 * submit(id, text) → the in-page step's verdict (one evaluate: 'submitted' | 'pending' | 'not-open' |
 * 'draft' | 'not-pasted' | 'moved' | 'edited'), shown(text) → the open transcript holds it (null: unreadable),
 * unsend(text) → removes the composer's text only when it is exactly this text.
 */
export async function send(d, id, text) {
  if (!norm(text)) return 'empty'
  if (!ID_RE.test(id)) return 'bad-id'
  const n = await d.count(id)
  if (n !== 1) return n ? 'ambiguous' : 'no-bot'
  // Before the click too: someone typing to another bot is not switched away from.
  if (norm((await d.composer()) ?? '')) return 'draft'
  const until = async ok => {
    for (let t = 0; ; t += 250) {
      if (await ok()) return true
      if (t >= WAIT_MS) return false
      await d.sleep(250)
    }
  }
  if (!(await d.current())?.startsWith(id)) {
    await d.click(id)
    if (!(await until(async () => (await d.current())?.startsWith(id) && (await d.composer()) !== null))) return 'not-open'
  }
  const step = await d.submit(id, text)
  if (step !== 'submitted' && step !== 'pending') return step
  if (await until(async () => (await d.shown(text)) === true)) return 'sent'
  // Still in the composer, exactly as pasted: the form did not take it. Anything else is not ours to touch.
  if (step === 'pending' && (await d.unsend(text))) return 'not-sent'
  return 'unconfirmed'
}

/**
 * The in-page send. Its checks and the paste are one synchronous run, and so are the re-checks and the
 * submit: a click or keystroke can land only in the 50 ms wait, and then nothing is sent or cleared.
 */
// Held on window until it settles: a promise nothing references is collected mid-wait (CDP
// "Promise was collected", seen live after the submit had gone).
const SUBMIT = (id, text) => `window.__grokBotSend = (async () => {
  const norm = s => s.replace(/\\s+/g, ' ').trim();
  const want = ${JSON.stringify(norm(text))};
  const open = () => (document.querySelector('button[aria-current=page]')?.getAttribute('data-agent-id') ?? '').startsWith(${JSON.stringify(id)});
  const box = () => document.querySelector('div[contenteditable=true]');
  let c = box();
  if (!c || !open()) return 'not-open';
  if (norm(c.innerText)) return 'draft';
  c.focus();
  const dt = new DataTransfer();
  dt.setData('text/plain', ${JSON.stringify(text)});
  c.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  if (norm(c.innerText) !== want || !c.closest('form')) {
    c.focus(); document.execCommand('selectAll'); document.execCommand('delete');
    return 'not-pasted';
  }
  await new Promise(r => setTimeout(r, 50));
  c = box();
  if (!open()) return 'moved';
  if (!c || norm(c.innerText) !== want) return 'edited';
  c.closest('form').requestSubmit();
  return norm(c.innerText) ? 'pending' : 'submitted';
})()`

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
  // An evaluate that throws in the page, or a CDP error, rejects: it must never read as "empty".
  const ev = expr => new Promise((res, rej) => {
    waiting.set(++seq, r => (r.error || r.result?.exceptionDetails ? rej(new Error(JSON.stringify(r.error ?? r.result.exceptionDetails).slice(0, 200))) : res(r.result?.result?.value)))
    ws.send(JSON.stringify({ id: seq, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true, awaitPromise: true } }))
  })
  const row = id => `document.querySelectorAll('button[data-agent-id^=${JSON.stringify(id)}]')`
  const box = `document.querySelector('div[contenteditable=true]')`
  return {
    close: () => ws.close(),
    d: {
      count: id => ev(`${row(id)}.length`),
      composer: () => ev(`${box}?.innerText ?? null`),
      current: () => ev(`document.querySelector('button[aria-current=page]')?.getAttribute('data-agent-id') ?? null`),
      click: id => ev(`${row(id)}[0].click()`),
      submit: (id, text) => ev(SUBMIT(id, text)),
      shown: text => ev(`(() => { const l = document.querySelector('[role=log][aria-label="Conversation transcript"]'); return l ? l.innerText.replace(/\\s+/g, ' ').includes(${JSON.stringify(norm(text))}) : null })()`),
      unsend: text => ev(`(() => { const c = ${box}; if (!c || c.innerText.replace(/\\s+/g, ' ').trim() !== ${JSON.stringify(norm(text))}) return false; c.focus(); document.execCommand('selectAll'); document.execCommand('delete'); return true })()`),
      sleep: ms => new Promise(r => setTimeout(r, ms)),
    },
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.argv[3] || process.env.GROK_BOT_CDP_PORT || 39231)
  let said = false
  const say = (state, extra = {}) => {
    if (said) return
    said = true
    process.stdout.write(JSON.stringify({ state, port, ...extra }) + '\n', () => process.exit(state === 'sent' ? 0 : 2))
  }
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
