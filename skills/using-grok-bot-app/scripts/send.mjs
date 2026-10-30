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
//   sent         the target bot's transcript holds one more "You <message>" than just
//                before the submit (not any old copy, not another bot's transcript)
//   unconfirmed  submitted, but the transcript did not show it within 5 s (the bot
//                was switched, or the app is slow): check the app before resending
//   empty        no text on stdin
//   bad-id       the id is not 8–36 chars of a UUID
//   bad-port     the port is not a positive integer (an unknown flag in the port slot lands here)
//   bad-header   the text does not start with `[w:<sid8>] ⟨<agent>⟩` (an unmarked message reads as the owner's)
//   no-roles     the role file names no front (printed: missing, file); the default send is refused
//   not-front    the bot is neither the front nor the sandbox of the role file
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
// When it opened the bot, it opens the bot that was open before again (unless another was opened meanwhile).
// Usage: send.mjs <bot-uuid-or-prefix> [port] < message
//   port:  $GROK_BOT_CDP_PORT, else 39231
//   roles: $GROK_BOT_ROLES, else ~/.claude/grok-bot-watch/roles.json: {"front": "<uuid>", "sandbox": "<uuid>"}.
//          Kept on this machine, not in the repo: bot UUIDs differ per account.
// An agent sends to the front or the sandbox only.

import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'

const RENDERER = /app\.asar\/dist\/renderer\/index\.html$/
const ID_RE = /^[0-9a-f-]{8,36}$/
/** How long the app gets to open the bot, and to show the message in its transcript. */
const WAIT_MS = 5000

const norm = s => s.replace(/\s+/g, ' ').trim()

/**
 * What an agent's message starts with: its session's tag and its mark, or `[w:*]` for a broadcast. The `｜` and the rest
 * of the header are not checked: the grok-bot-watch panel sends `<tag> ⟨Claude⟩ <text>` without them. This still stops a
 * mistyped tag such as `[w:t254u]` from reading as one of the owner's untagged messages.
 */
export const HEADER_RE = /^\s*\[w:([0-9a-z]{8}|\*)\] ⟨[A-Za-z]+⟩/

/** `<id> [port]` */
export function parseArgs(argv, env = process.env) {
  return { id: (argv[0] ?? '').toLowerCase(), port: Number(argv[1] || env.GROK_BOT_CDP_PORT || 39231) }
}

/** The role file; a missing or unreadable one gives no roles and its error class, never a throw. */
export function loadRoles(env = process.env, read = p => readFileSync(p, 'utf8')) {
  const file = env.GROK_BOT_ROLES || `${env.HOME || homedir()}/.claude/grok-bot-watch/roles.json`
  try {
    const roles = JSON.parse(read(file))
    return { file, roles: roles && typeof roles === 'object' ? roles : {} }
  } catch (e) {
    return { file, roles: {}, error: e?.code ?? e?.name }
  }
}

/**
 * Who an agent may send to: the front and the sandbox of the role file, by UUID and never by name (names are each
 * account's own habit). The header is checked on every send. Returns null to go on, else the state to print.
 */
export function gate({ roles, file, error }, id, text) {
  if (!HEADER_RE.test(text)) return { state: 'bad-header' }
  if (typeof roles.front !== 'string' || !roles.front) return { state: 'no-roles', missing: ['front'], file, ...(error && { error }) }
  const ok = [roles.front, roles.sandbox].some(u => typeof u === 'string' && u.toLowerCase().startsWith(id))
  return ok ? null : { state: 'not-front', front: roles.front.slice(0, 8) }
}

/**
 * After a send, one small file per session and bot: grok-bot-watch reads it to tell "you messaged this bot and a reply came
 * back without your tag" (its answer may sit above an option card) from a chat between the owner and the bot. A broadcast
 * has no session to mark. The message already went, so the caller treats a failure here as a stderr line, not a state.
 */
export function markSent(text, id, env = process.env, now = Date.now(), fs = { mkdirSync, writeFileSync }) {
  const sid = HEADER_RE.exec(text)?.[1]
  if (!sid || sid === '*') return
  const dir = `${env.HOME || homedir()}/.claude/grok-bot-watch/sent`
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(`${dir}/${sid}-${id.slice(0, 8)}.json`, JSON.stringify({ at: now }))
}

/**
 * The send, over injected effects so the test drives it without an app. d: count(id) → rows matching,
 * composer() → its text or null, current() → the open bot's id, click(id), sleep(ms),
 * submit(id, text) → { state, before }: the in-page step's verdict (one evaluate: 'submitted' | 'pending' |
 * 'not-open' | 'draft' | 'not-pasted' | 'moved' | 'edited') and how many "You <text>" the target's transcript
 * held just before the submit; sent(id, text) → that count now (null: the target is not open or no
 * transcript); unsend(id, text) → clears the composer only while the target is open and it holds this text.
 */
export async function send(d, id, text) {
  if (!norm(text) || !ID_RE.test(id)) return deliver(d, id, text)
  const prev = await d.current()
  const state = await deliver(d, id, text)
  await restore(d, prev, id)
  return state
}

/** Put the screen back: the bot that was open before (prev), unless someone has since opened another one than id. */
export async function restore(d, prev, id) {
  if (prev && !prev.startsWith(id) && (await d.current())?.startsWith(id) && (await d.count(prev)) === 1) await d.click(prev)
}

async function deliver(d, id, text) {
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
  const { state, before } = await d.submit(id, text)
  if (state !== 'submitted' && state !== 'pending') return state
  // One more copy from "You" in the target's own transcript: an old copy or another bot's text never counts (Sol r2).
  // No transcript to count before the submit: nothing to compare with, so at best unconfirmed (Sol r3 P2).
  if (before >= 0 && (await until(async () => ((await d.sent(id, text)) ?? -1) > before))) return 'sent'
  // Still in the target's composer, as pasted: the form did not take it. Another bot's draft is never touched (Sol r2 P1).
  if (state === 'pending' && (await d.unsend(id, text))) return 'not-sent'
  return 'unconfirmed'
}

/**
 * In-page: how many messages of the open transcript are from "You" with exactly this body, split as
 * sidebar.mjs splits them (sender line, blank line, body, then a "9:58 PM" line). A bot's reply that
 * quotes the text is not one (Sol r3 P2). -1: no transcript.
 */
export const MINE = text => `(() => {
  const l = document.querySelector('[role=log][aria-label="Conversation transcript"]');
  if (!l) return -1;
  const want = ${JSON.stringify(norm(text))};
  const parts = l.innerText.split(/\\n\\n?(?:Show (?:more|less)\\n)?(\\d{1,2}:\\d{2} [AP]M)(?:\\n|$)/);
  let n = 0;
  for (let i = 0; i + 1 < parts.length; i += 2) {
    const c = parts[i].replace(/^\\n+/, '');
    const k = c.indexOf('\\n\\n');
    if (k >= 0 && c.slice(0, k).split('\\n').pop() === 'You' && c.slice(k + 2).replace(/\\s+/g, ' ').trim() === want) n++;
  }
  return n;
})()`
const OPEN = id => `(document.querySelector('button[aria-current=page]')?.getAttribute('data-agent-id') ?? '').startsWith(${JSON.stringify(id)})`

/**
 * The in-page send. Its checks and the paste are one synchronous run, and so are the re-checks and the
 * submit: a click or keystroke can land only in the 50 ms wait, and then nothing is sent or cleared.
 */
// Held on window until it settles: a promise nothing references is collected mid-wait (CDP
// "Promise was collected", seen live after the submit had gone).
const SUBMIT = (id, text) => `window.__grokBotSend = (async () => {
  const norm = s => s.replace(/\\s+/g, ' ').trim();
  const want = ${JSON.stringify(norm(text))};
  const mine = () => ${MINE(text)};
  const open = () => (document.querySelector('button[aria-current=page]')?.getAttribute('data-agent-id') ?? '').startsWith(${JSON.stringify(id)});
  const box = () => document.querySelector('div[contenteditable=true]');
  let c = box();
  if (!c || !open()) return { state: 'not-open' };
  if (norm(c.innerText)) return { state: 'draft' };
  c.focus();
  const dt = new DataTransfer();
  dt.setData('text/plain', ${JSON.stringify(text)});
  c.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  if (norm(c.innerText) !== want || !c.closest('form')) {
    c.focus(); document.execCommand('selectAll'); document.execCommand('delete');
    return { state: 'not-pasted' };
  }
  await new Promise(r => setTimeout(r, 50));
  c = box();
  if (!open()) return { state: 'moved' };
  if (!c || norm(c.innerText) !== want) return { state: 'edited' };
  const before = mine();
  c.closest('form').requestSubmit();
  return { state: norm(c.innerText) ? 'pending' : 'submitted', before };
})()`

/** The app's renderer over CDP: { d: effects, ev(expression), close }, or null when the port has no renderer. */
export async function cdp(port) {
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
  return { close: () => ws.close(), d: effects(ev), ev }
}

/** The send's effects as page expressions, over ev(expression) → value: CDP here, a fake DOM in the test. */
export function effects(ev) {
  const row = id => `document.querySelectorAll('button[data-agent-id^=${JSON.stringify(id)}]')`
  const box = `document.querySelector('div[contenteditable=true]')`
  return {
    count: id => ev(`${row(id)}.length`),
    composer: () => ev(`${box}?.innerText ?? null`),
    current: () => ev(`document.querySelector('button[aria-current=page]')?.getAttribute('data-agent-id') ?? null`),
    click: id => ev(`${row(id)}[0].click()`),
    submit: (id, text) => ev(SUBMIT(id, text)),
    sent: (id, text) => ev(`(() => { if (!${OPEN(id)}) return null; const n = ${MINE(text)}; return n < 0 ? null : n })()`),
    unsend: (id, text) => ev(`(() => { const c = ${box}; if (!${OPEN(id)} || !c || c.innerText.replace(/\\s+/g, ' ').trim() !== ${JSON.stringify(norm(text))}) return false; c.focus(); document.execCommand('selectAll'); document.execCommand('delete'); return true })()`),
    sleep: ms => new Promise(r => setTimeout(r, ms)),
  }
}

/**
 * One CLI run: read stdin, refuse early (empty, bad-id, bad-port, bad-header) or by check(id, text), connect, send, then print one
 * JSON line and exit (0 only for "sent"). check(id, text) → null to go on, else { state, ... }; a missing check refuses
 * (no-gate). extra is merged into the result of a send. connect(port) → { d, close }: the app's CDP port by default,
 * a fake in tests. This file's own CLI always passes the role gate.
 */
export async function main({ id, port, extra = {} }, check, connect = cdp) {
  let said = false
  const say = (state, more = {}) => {
    if (said) return
    said = true
    process.stdout.write(JSON.stringify({ state, port, ...more }) + '\n', () => process.exit(state === 'sent' ? 0 : 2))
  }
  setTimeout(() => say('timeout'), 3 * WAIT_MS).unref()
  let text = ''
  for await (const chunk of process.stdin) text += chunk
  // Validated before any connection: the id goes into page scripts.
  const early = !norm(text) ? 'empty' : !ID_RE.test(id) ? 'bad-id' : !Number.isInteger(port) || port < 1 ? 'bad-port' : !HEADER_RE.test(text) ? 'bad-header' : null
  const refused = early ? null : typeof check !== 'function' ? { state: 'no-gate' } : check(id, text)
  if (early) say(early)
  else if (refused) {
    const { state, ...why } = refused
    say(state, why)
  } else {
    const c = await connect(port).catch(() => null)
    if (!c) say('down')
    else {
      send(c.d, id, text).then(
        s => {
          c.close()
          // Marked on "unconfirmed" too: it may have gone, and a mark with no reply only means no caveat wake.
          if (s === 'sent' || s === 'unconfirmed') {
            try {
              markSent(text, id)
            } catch (e) {
              process.stderr.write(`marker not written: ${e?.code ?? e?.name}\n`)
            }
          }
          say(s, { bot: id, ...extra })
        },
        e => (c.close(), say('failed', { error: String(e) })),
      )
    }
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url))
  main(parseArgs(process.argv.slice(2)), (id, text) => gate(loadRoles(), id, text))
