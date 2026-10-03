// node --test skills/using-grok-bot-app/scripts/send.test.mjs — send.mjs's decisions over a fake app.
// The fake's submit is atomic, as the real one is (one Runtime.evaluate). The real send is checked live.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MINE, effects, send } from './send.mjs'

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
  /** The open transcript's copies of this text sent by "You". */
  const mine = text => (a.log[a.current] ?? []).filter(m => norm(m) === norm(text)).length
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
      if (!a.current.startsWith(id)) return { state: 'not-open' }
      if (norm(box())) return { state: 'draft' }
      a.events.push('paste')
      a.box[a.current] = lossy ? text.slice(0, 3) : text
      if (norm(box()) !== norm(text)) {
        a.box[a.current] = ''
        return { state: 'not-pasted' }
      }
      const at = a.current
      settle(a)
      if (a.current !== at) return { state: 'moved' }
      if (norm(box()) !== norm(text)) return { state: 'edited' }
      const before = mine(text)
      a.events.push('submit')
      if (deaf) return { state: 'pending', before }
      ;(a.log[a.current] ??= []).push(box())
      a.box[a.current] = ''
      return { state: 'submitted', before }
    },
    sent: async (id, text) => (a.hidden || !a.current.startsWith(id) ? null : mine(text)),
    unsend: async (id, text) => {
      if (!a.current.startsWith(id) || norm(box()) !== norm(text)) return false
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
  assert.deepEqual(a.events, ['click', 'paste', 'submit', 'click'])
  assert.equal(a.current, B, 'the bot open before the send is open again')
})

test('the screen is left alone when the user opened another bot during the send', async () => {
  const C = 'cccccccc-1111-4222-8333-444444444444'
  const a = app({ ids: [A, B, C], settle: () => {} })
  const sent = a.d.sent
  a.d.sent = async (id, text) => {
    const n = await sent(id, text)
    a.current = C
    return n
  }
  assert.equal(await send(a.d, 'aaaaaaaa', 'hi'), 'sent')
  assert.equal(a.current, C)
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
    if (++reads === 2) a.current = B // read 1 is send's own note of the open bot
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
  const sent = a.d.sent
  a.d.sent = async (id, t) => {
    a.box[A] = 'hi, and more'
    return sent(id, t)
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

test('the form keeps the text and the user opens B, whose draft is the same text: B\'s draft kept, unconfirmed (Sol r2 P1)', async () => {
  const a = app({ deaf: true, drafts: { [B]: 'reply' } })
  a.current = A
  const sent = a.d.sent
  a.d.sent = async (id, t) => {
    a.current = B
    return sent(id, t)
  }
  assert.equal(await send(a.d, 'aaaaaaaa', 'reply'), 'unconfirmed')
  assert.equal(a.box[B], 'reply')
  assert.equal(a.box[A], 'reply')
})

test('an old copy of the same text in the transcript is not this send: the form kept it, not-sent (Sol r2 P2)', async () => {
  const a = app({ deaf: true })
  a.current = A
  a.log[A] = ['reply']
  assert.equal(await send(a.d, 'aaaaaaaa', 'reply'), 'not-sent')
})

test('another bot\'s transcript holding the text is not this send: unconfirmed (Sol r2 P2)', async () => {
  const a = app()
  a.log[B] = ['reply', 'reply']
  const submit = a.d.submit
  a.d.submit = async (id, t) => {
    const r = await submit(id, t)
    a.log[A] = []
    a.current = B
    return r
  }
  a.current = A
  assert.equal(await send(a.d, 'aaaaaaaa', 'reply'), 'unconfirmed')
})

/**
 * The REAL page expressions (effects) over a minimal fake DOM: one composer per bot, a transcript per bot
 * drawn as "You\n\n<text>\n\n<time>" as the app does. accepts: the form takes a submit. onWait: what the
 * user does in the in-page 50 ms wait. onSubmit: what happens right as the form is submitted.
 */
function page({ bots = [A, B], current = B, drafts = {}, log = {}, accepts = true, onWait = () => {}, onSubmit = () => {} } = {}) {
  const p = { current, box: { ...drafts }, log: structuredClone(log), cleared: [], submitted: [] }
  const form = {
    requestSubmit() {
      const at = p.current
      onSubmit(p)
      p.noLog = false
      if (!accepts) return
      p.submitted.push(at)
      ;(p.log[at] ??= []).push(p.box[at])
      p.box[at] = ''
    },
  }
  const composer = {
    get innerText() {
      return p.box[p.current] ?? ''
    },
    focus() {},
    dispatchEvent(e) {
      if (e.type === 'paste') p.box[p.current] = (p.box[p.current] ?? '') + e.clipboardData.getData('text/plain')
      return true
    },
    closest: () => form,
  }
  const document = {
    querySelector(sel) {
      if (sel === 'button[aria-current=page]') return { getAttribute: () => p.current }
      if (sel === 'div[contenteditable=true]') return composer
      // An entry is a string (from You) or { who, text }; no transcript at all while p.noLog.
      if (sel.startsWith('[role=log]')) return p.noLog ? null : { innerText: (p.log[p.current] ?? []).map(m => `${m.who ?? 'You'}\n\n${m.text ?? m}\n\n1:58 PM`).join('\n\n') }
      return null
    },
    querySelectorAll(sel) {
      const id = /\^="([^"]+)"/.exec(sel)[1]
      return bots.filter(b => b.startsWith(id)).map(b => ({ click: () => (p.current = b) }))
    },
    execCommand(cmd) {
      if (cmd === 'delete') {
        p.cleared.push(p.current)
        p.box[p.current] = ''
      }
      return true
    },
  }
  class DataTransfer {
    d = {}
    setData(k, v) {
      this.d[k] = v
    }
    getData(k) {
      return this.d[k]
    }
  }
  class ClipboardEvent {
    constructor(type, init) {
      this.type = type
      this.clipboardData = init.clipboardData
    }
  }
  const wait = f => {
    onWait(p)
    f()
  }
  const ev = async expr =>
    new Function('document', 'DataTransfer', 'ClipboardEvent', 'window', 'setTimeout', `return (${expr})`)(document, DataTransfer, ClipboardEvent, {}, wait)
  p.d = { ...effects(ev), sleep: async () => {} }
  return p
}

test('real page script: sends to A from B, once, and the transcript count proves it', async () => {
  const p = page()
  assert.equal(await send(p.d, 'aaaaaaaa', 'reply'), 'sent')
  assert.deepEqual(p.submitted, [A])
  assert.deepEqual(p.log[A], ['reply'])
  assert.deepEqual(p.cleared, [])
})

test('real page script: hostile text goes through literally, nothing in it runs', async () => {
  const text = "it's `x` ${globalThis.pwned = 1} \\   \"q\""
  const p = page({ current: A })
  assert.equal(await send(p.d, 'aaaaaaaa', text), 'sent')
  assert.deepEqual(p.log[A], [text])
  assert.equal(globalThis.pwned, undefined)
})

test('real page script: a draft is refused, never cleared', async () => {
  const p = page({ current: A, drafts: { [A]: 'mine' } })
  assert.equal(await send(p.d, 'aaaaaaaa', 'reply'), 'draft')
  assert.equal(p.box[A], 'mine')
  assert.deepEqual(p.cleared, [])
})

test('real page script: B opened in the wait → moved; A keeps the paste, nothing submitted or cleared', async () => {
  const p = page({ current: A, onWait: p => (p.current = B) })
  assert.equal(await send(p.d, 'aaaaaaaa', 'reply'), 'moved')
  assert.equal(p.box[A], 'reply')
  assert.deepEqual([p.submitted, p.cleared], [[], []])
})

test('real page script: a keystroke in the wait → edited; left as is', async () => {
  const p = page({ current: A, onWait: p => (p.box[A] += '!') })
  assert.equal(await send(p.d, 'aaaaaaaa', 'reply'), 'edited')
  assert.equal(p.box[A], 'reply!')
  assert.deepEqual([p.submitted, p.cleared], [[], []])
})

test('real page script: an old copy in the transcript and a form that refuses → not-sent, only A\'s own paste cleared (Sol r2 P2)', async () => {
  const p = page({ current: A, log: { [A]: ['reply'] }, accepts: false })
  assert.equal(await send(p.d, 'aaaaaaaa', 'reply'), 'not-sent')
  assert.deepEqual(p.cleared, [A])
})

test('real page script: the form refuses and B, with the same text as its draft, is opened → B kept, unconfirmed (Sol r2 P1)', async () => {
  const p = page({ current: A, drafts: { [B]: 'reply' }, accepts: false, onSubmit: p => (p.current = B) })
  assert.equal(await send(p.d, 'aaaaaaaa', 'reply'), 'unconfirmed')
  assert.equal(p.box[B], 'reply')
  assert.equal(p.box[A], 'reply')
  assert.deepEqual(p.cleared, [])
})

test('real page script: B, whose transcript holds the text, is open after the send → unconfirmed, not sent (Sol r2 P2)', async () => {
  const p = page({ current: A, log: { [B]: ['reply', 'reply'] }, onSubmit: p => (p.current = B) })
  assert.equal(await send(p.d, 'aaaaaaaa', 'reply'), 'unconfirmed')
  assert.deepEqual(p.submitted, [A])
})

test('real page script: a bot echoing the text, or quoting "You reply", is not a message from You: not-sent (Sol r3 P2)', async () => {
  const p = page({ current: A, accepts: false, onSubmit: p => (p.log[A] = [{ who: 'NOVA', text: 'reply' }, { who: 'NOVA', text: 'You reply' }]) })
  assert.equal(await send(p.d, 'aaaaaaaa', 'reply'), 'not-sent')
})

test('real page script: no transcript before the submit gives no baseline: at best unconfirmed (Sol r3 P2)', async () => {
  const p = page({ current: A, log: { [A]: ['reply'] }, accepts: false })
  p.noLog = true
  assert.equal(await send(p.d, 'aaaaaaaa', 'reply'), 'not-sent')
  const q = page({ current: A })
  q.noLog = true
  assert.equal(await send(q.d, 'aaaaaaaa', 'reply'), 'unconfirmed')
  assert.deepEqual(q.submitted, [A])
})

test('a long message folded behind "Show more" still counts as mine', () => {
  const count = text => new Function('document', `return ${MINE('長 訊息')}`)({ querySelector: () => ({ innerText: text }) })
  assert.equal(count('You\n\n長 訊息\n\nShow more\n1:09 AM\nsandbox\n\n好\n\n1:10 AM'), 1)
  assert.equal(count('You\n\n長 訊息\n\n1:09 AM'), 1)
})
