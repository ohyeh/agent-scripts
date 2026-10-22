#!/usr/bin/env node
// Read the tail of one Grok Bot bot's transcript over CDP, without agent-browser.
// It opens the bot (a visible change), reads the text of [role=log][aria-label="Conversation transcript"],
// then opens the bot that was open before again, unless someone opened another one meanwhile (send.mjs's restore).
// It never types, pastes or submits.
// One JSON line on stdout: { state, port, ... }. Exit 0 only for "ok".
//   ok            tail: the last N characters of the transcript text; prev: the bot open before; restored: it is open again
//   bad-id        the id is not 8–36 chars of a UUID
//   bad-port      the port is not a positive integer
//   bad-tail      --tail is not a positive integer
//   down          the port does not answer (ensure.mjs brings it back)
//   no-bot        no sidebar row for that id; ambiguous: more than one
//   not-open      the app did not open that bot within 5 s
//   no-transcript the bot opened but its transcript stayed empty or kept changing for 5 s (a bot with no messages too)
//   failed        a CDP call threw; timeout: the whole run took over 15 s
// The transcript is a virtual list: the text holds the rendered messages only (SKILL.md, What will bite you).
// Usage: transcript.mjs <bot-uuid-or-prefix> [port] [--tail N]   (port: $GROK_BOT_CDP_PORT, else 39231; N: 1500)

import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { cdp, parseArgs, restore } from './send.mjs'

const ID_RE = /^[0-9a-f-]{8,36}$/
const WAIT_MS = 5000

/** `<id> [port] [--tail N]`; --tail may stand anywhere. */
export function parseCli(argv, env = process.env) {
  const rest = [...argv]
  const at = rest.indexOf('--tail')
  const tail = at < 0 ? 1500 : Number(rest.splice(at, 2)[1])
  return { ...parseArgs(rest, env), tail }
}

/** In-page: the last n characters of the open transcript, or null when id is not the open bot or there is no transcript. */
export const TAIL = (id, n) => `(() => {
  if (!(document.querySelector('button[aria-current=page]')?.getAttribute('data-agent-id') ?? '').startsWith(${JSON.stringify(id)})) return null;
  const l = document.querySelector('[role=log][aria-label="Conversation transcript"]');
  return l ? l.innerText.slice(-${n}) : null;
})()`

/**
 * The read, over injected effects (send.mjs's effects plus tail(id, n) → text or null). The text counts once two reads
 * 250 ms apart agree: just after the click the log can still be rendering.
 */
export async function read(d, id, n) {
  const c = await d.count(id)
  if (c !== 1) return { state: c ? 'ambiguous' : 'no-bot' }
  const prev = await d.current()
  let r
  try {
    r = await open(d, id, n)
  } finally {
    // A failed read still puts the screen back; a failed restore surfaces, after the read's own error.
    await restore(d, prev, id)
  }
  const now = await d.current()
  return { ...r, bot: id, prev: prev?.slice(0, 8) ?? null, restored: !prev || !!now?.startsWith(prev) }
}

async function open(d, id, n) {
  if (!(await d.current())?.startsWith(id)) {
    await d.click(id)
    for (let t = 0; !(await d.current())?.startsWith(id); t += 250) {
      if (t >= WAIT_MS) return { state: 'not-open' }
      await d.sleep(250)
    }
  }
  let last = null
  for (let t = 0; t <= WAIT_MS; t += 250) {
    const text = await d.tail(id, n)
    // Not empty: just after the click the log is there but empty (seen live, 1.1.0).
    if (text && text === last) return { state: 'ok', tail: text }
    last = text
    await d.sleep(250)
  }
  return { state: 'no-transcript' }
}

export async function main({ id, port, tail }, connect = cdp) {
  let said = false
  const say = (state, more = {}) => {
    if (said) return
    said = true
    process.stdout.write(JSON.stringify({ state, port, ...more }) + '\n', () => process.exit(state === 'ok' ? 0 : 2))
  }
  setTimeout(() => say('timeout'), 3 * WAIT_MS).unref()
  // Validated before any connection: the id and n go into page scripts.
  const early = !ID_RE.test(id) ? 'bad-id' : !Number.isInteger(port) || port < 1 ? 'bad-port' : !Number.isInteger(tail) || tail < 1 ? 'bad-tail' : null
  if (early) return say(early)
  const c = await connect(port).catch(() => null)
  if (!c) return say('down')
  const d = { ...c.d, tail: (bot, n) => c.ev(TAIL(bot, n)) }
  read(d, id, tail).then(
    ({ state, ...more }) => (c.close(), say(state, more)),
    e => (c.close(), say('failed', { error: String(e) })),
  )
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) main(parseCli(process.argv.slice(2)))
