// node --test skills/using-grok-bot-app/scripts/send.test.mjs — send.mjs's decisions over a fake app.
// The fake's submit is atomic, as the real one is (one Runtime.evaluate). The real send is checked live.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { send } from './send.mjs'

const A = 'aaaaaaaa-1111-4222-8333-444444444444'
const B = 'bbbbbbbb-1111-4222-8333-444444444444'
const norm = s => s.replace(/\s+/g, ' ').trim()

/**
 * Two bots, B open. Each bot keeps its own composer text and transcript, as the app does.
 * opts: drafts per bot, a bot that never opens, a paste that drops text, a form that keeps the text,
 * and `settle`: what the user does in the page's 50 ms wait between the paste and the submit.
 */
function app({ drafts = {}, stuck = false, lossy = false, deaf = false, settle = () => {}, ids = [A, B] } = {}) {
  const a = { current: B, box: { ...drafts }, log: {}, events: [], hidden: false }
  const box = () => a.box[a.current] ?? ''
  a.d = {
    count: async id => ids.filter(x => x.startsWith(id)).length,
    composer: async () => (a.hidden ? null : box()),
    current: async () => a.current,
    click: async id => {
      a.events.push('click')
      if (!stuck) a.current = ids.find(x => x.startsWith(id))
    },
    // The page's script, in one step: nothing else runs in between.
    submit: async (id, text) => {
      if (!a.current.startsWith(id)) return 'not-open'
      if (norm(box())) return 'draft'
      a.events.push('paste')
      a.box[a.current] = lossy ? text.slice(0, 3) : text
      if (norm(box()) !== norm(text)) {
        a.box[a.current] = ''
        return 'not-pasted'
      }
      const at = a.current
      settle(a)
      if (a.current !== at) return 'moved'
      if (norm(box()) !== norm(text)) return 'edited'
      a.events.push('submit')
      if (deaf) return 'pending'
      ;(a.log[a.current] ??= []).push(box())
      a.box[a.current] = ''
      return 'submitted'
    },
    shown: async text => (a.hidden ? null : (a.log[a.current] ?? []).some(m => norm(m) === norm(text))),
    unsend: async text => {
      if (norm(box()) !== norm(text)) return false
      a.events.push('unsend')
      a.box[a.current] = ''
      return true
    },
    sleep: async () => {},
  }
  return a
}

test('sends to the bot by prefix: open it, then one atomic paste-and-submit; the transcript shows it', async () => {
  const a = app()
  assert.equal(await send(a.d, 'aaaaaaaa', '[w:29a98092] hi'), 'sent')
  assert.deepEqual(a.log[A], ['[w:29a98092] hi'])
  assert.deepEqual(a.events, ['click', 'paste', 'submit'])
})

test('the bot already open is not clicked again', async () => {
  const a = app()
  a.current = A
  assert.equal(await send(a.d, 'aaaaaaaa', 'hi'), 'sent')
  assert.deepEqual(a.events, ['paste', 'submit'])
})

test('a draft in the open composer: nothing clicked, nothing typed', async () => {
  const a = app({ drafts: { [B]: 'half a thought' } })
  assert.equal(await send(a.d, 'aaaaaaaa', 'hi'), 'draft')
  assert.deepEqual(a.events, [])
  assert.equal(a.box[B], 'half a thought')
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

test('the user types into the target after the checks and before the send: draft, their text kept (Sol P1)', async () => {
  const a = app()
  const click = a.d.click
  a.d.click = async id => {
    await click(id)
    a.box[A] = 'user draft'
  }
  assert.equal(await send(a.d, 'aaaaaaaa', 'reply'), 'draft')
  assert.equal(a.box[A], 'user draft')
  assert.ok(!a.events.includes('paste'))
})

test('the user opens another bot with its own draft before the send: not-open, that draft kept (Sol P1)', async () => {
  const a = app({ drafts: { [B]: 'B user draft' } })
  a.current = A
  const current = a.d.current
  let reads = 0
  a.d.current = async () => {
    const at = await current()
    if (++reads === 1) a.current = B
    return at
  }
  assert.equal(await send(a.d, 'aaaaaaaa', 'reply'), 'not-open')
  assert.equal(a.box[B], 'B user draft')
  assert.equal(a.log[B], undefined)
})

test('another bot is opened right after the send: the message went to the checked bot; unconfirmed, never sent to B (Sol P1)', async () => {
  const a = app()
  const submit = a.d.submit
  a.d.submit = async (id, t) => {
    const r = await submit(id, t)
    a.current = B
    return r
  }
  assert.equal(await send(a.d, 'aaaaaaaa', 'reply'), 'unconfirmed')
  assert.deepEqual(a.log[A], ['reply'])
  assert.equal(a.log[B], undefined)
})

test('the paste does not land whole: removed again in the same step, never sent', async () => {
  const a = app({ lossy: true })
  assert.equal(await send(a.d, 'aaaaaaaa', 'hello there'), 'not-pasted')
  assert.equal(a.box[A], '')
  assert.ok(!a.events.includes('submit'))
})

test('the form keeps the text: removed again (it is exactly ours), not-sent', async () => {
  const a = app({ deaf: true })
  assert.equal(await send(a.d, 'aaaaaaaa', 'hi'), 'not-sent')
  assert.equal(a.box[A], '')
})

test('the form keeps the text and the user edits it: left alone, unconfirmed', async () => {
  const a = app({ deaf: true })
  const shown = a.d.shown
  a.d.shown = async t => {
    a.box[A] = 'hi, and more'
    return shown(t)
  }
  assert.equal(await send(a.d, 'aaaaaaaa', 'hi'), 'unconfirmed')
  assert.equal(a.box[A], 'hi, and more')
})

test('the transcript cannot be read after the send: unconfirmed, never sent (Sol P2)', async () => {
  const a = app()
  const submit = a.d.submit
  a.d.submit = async (id, t) => {
    const r = await submit(id, t)
    a.hidden = true
    return r
  }
  assert.equal(await send(a.d, 'aaaaaaaa', 'reply'), 'unconfirmed')
})

test('another bot is opened in the wait after the paste: moved, nothing submitted, the paste reported left in A', async () => {
  const a = app({ settle: a => (a.current = B) })
  a.current = A
  assert.equal(await send(a.d, 'aaaaaaaa', 'reply'), 'moved')
  assert.equal(a.box[A], 'reply')
  assert.equal(a.log[A], undefined)
  assert.equal(a.log[B], undefined)
})

test('the user types in the wait after the paste: edited, nothing submitted, their text kept', async () => {
  const a = app({ settle: a => (a.box[A] += ' and mine') })
  a.current = A
  assert.equal(await send(a.d, 'aaaaaaaa', 'reply'), 'edited')
  assert.equal(a.box[A], 'reply and mine')
  assert.equal(a.log[A], undefined)
})
