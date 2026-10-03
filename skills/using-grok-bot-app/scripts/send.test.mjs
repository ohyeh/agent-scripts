// node --test skills/using-grok-bot-app/scripts/send.test.mjs — send.mjs's decisions over a fake app.
// The real send (CDP click, paste, Enter) is checked live.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { send } from './send.mjs'

const A = 'aaaaaaaa-1111-4222-8333-444444444444'
const B = 'bbbbbbbb-1111-4222-8333-444444444444'

/** Two bots, one open; opts: draft text, a bot that never opens, a paste that drops text, an Enter that is ignored. */
function app({ draft = '', stuck = false, lossy = false, deaf = false, ids = [A, B] } = {}) {
  const a = { current: B, box: draft, events: [] }
  a.d = {
    count: async id => ids.filter(x => x.startsWith(id)).length,
    composer: async () => a.box,
    current: async () => a.current,
    click: async id => {
      a.events.push('click')
      if (!stuck) a.current = ids.find(x => x.startsWith(id))
    },
    paste: async text => {
      a.events.push('paste')
      a.box += lossy ? text.slice(0, 3) : text
    },
    clear: async () => {
      a.events.push('clear')
      a.box = ''
    },
    enter: async () => {
      a.events.push('enter')
      if (!deaf) [a.sent, a.box] = [a.box, '']
    },
    sleep: async () => {},
  }
  return a
}

test('sends to the bot by prefix: click, paste, Enter; the composer empties', async () => {
  const a = app()
  assert.equal(await send(a.d, 'aaaaaaaa', '[w:29a98092] hi'), 'sent')
  assert.equal(a.sent, '[w:29a98092] hi')
  assert.deepEqual(a.events, ['click', 'paste', 'enter'])
})

test('a draft in the composer: nothing clicked, nothing typed', async () => {
  const a = app({ draft: 'half a thought' })
  assert.equal(await send(a.d, 'aaaaaaaa', 'hi'), 'draft')
  assert.deepEqual(a.events, [])
  assert.equal(a.box, 'half a thought')
})

test('no text, a bad id, no such bot, two matching bots: refused before any click', async () => {
  for (const [id, text, want, ids] of [
    ['aaaaaaaa', '  \n', 'empty'],
    ["aaaa'); x(", 'hi', 'bad-id'],
    ['cccccccc', 'hi', 'no-bot'],
    ['aaaaaaaa', 'hi', 'ambiguous', [A, A]],
  ]) {
    const a = app(ids ? { ids } : {})
    assert.equal(await send(a.d, id, text), want)
    assert.deepEqual(a.events, [], want)
  }
})

test('the app does not open the bot: not-open, nothing typed', async () => {
  const a = app({ stuck: true })
  assert.equal(await send(a.d, 'aaaaaaaa', 'hi'), 'not-open')
  assert.deepEqual(a.events, ['click'])
})

test('the paste does not land whole: cleared again, never sent', async () => {
  const a = app({ lossy: true })
  assert.equal(await send(a.d, 'aaaaaaaa', 'hello there'), 'not-pasted')
  assert.deepEqual(a.events, ['click', 'paste', 'clear'])
  assert.equal(a.box, '')
})

test('another bot is opened between paste and Enter: cleared, not sent there', async () => {
  const a = app()
  const paste = a.d.paste
  a.d.paste = async t => {
    await paste(t)
    a.current = B
  }
  assert.equal(await send(a.d, 'aaaaaaaa', 'hi'), 'not-open')
  assert.ok(!a.events.includes('enter'))
})

test('Enter that the app ignores: not-sent', async () => {
  const a = app({ deaf: true })
  assert.equal(await send(a.d, 'aaaaaaaa', 'hi'), 'not-sent')
})
