// node --test skills/using-grok-bot-app/scripts/send.test.mjs — send.mjs's decisions over a fake app.
// The fake's submit is atomic, as the real one is (one Runtime.evaluate). The real send is checked live.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MINE, effects, gate, loadRoles, markSent, parseArgs, send } from './send.mjs'

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
  assert.equal(await send(a.d, 'aaaaaaaa', '[w:d5e81f37] hi'), 'sent')
  assert.deepEqual(a.log[A], ['[w:d5e81f37] hi'])
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
  const p = page({ current: A, accepts: false, onSubmit: p => (p.log[A] = [{ who: 'ARIA', text: 'reply' }, { who: 'ARIA', text: 'You reply' }]) })
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
  // A bot message that ends in a list has its time after one newline, not a blank line.
  assert.equal(count('ARIA\n\n結論\n- 一\n- 二\n1:12 AM\nYou\n\n長 訊息\n\n1:12 AM\nARIA is working'), 1)
})

// The gate: an agent sends to the front or the sandbox only.
const HEAD = '[w:b7c4e910] ⟨Claude⟩ #t 問｜hi'
const ROLES = { file: '/r.json', roles: { front: A, sandbox: B } }

test('gate: every send needs the tag and the mark; a mistyped tag is refused', () => {
  for (const bad of ['hi', '[w:t254u] ⟨Claude⟩ hi', '[w:b7c4e910] hi', '[W:b7c4e910] ⟨Claude⟩ hi', '⟨Claude⟩ [w:b7c4e910] hi'])
    assert.equal(gate(ROLES, 'aaaaaaaa', bad)?.state, 'bad-header', bad)
  for (const ok of [HEAD, '[w:*] ⟨agy⟩ hi', '[w:b7c4e910] ⟨Claude⟩ no bar, as the panel sends it'])
    assert.equal(gate(ROLES, 'aaaaaaaa', ok), null, ok)
})

test('gate: the front and the sandbox by UUID from the role file; any other bot is not-front', () => {
  assert.equal(gate(ROLES, 'aaaaaaaa', HEAD), null)
  assert.equal(gate(ROLES, B, HEAD), null, 'the sandbox, by its full id')
  assert.deepEqual(gate(ROLES, 'cccccccc', HEAD), { state: 'not-front', front: 'aaaaaaaa' })
})

test('gate: no front in the role file is refused and names what is missing', () => {
  assert.deepEqual(gate({ file: '/r.json', roles: {}, error: 'ENOENT' }, 'aaaaaaaa', HEAD), { state: 'no-roles', missing: ['front'], file: '/r.json', error: 'ENOENT' })
  assert.deepEqual(gate({ file: '/r.json', roles: { sandbox: B } }, 'bbbbbbbb', HEAD), { state: 'no-roles', missing: ['front'], file: '/r.json' })
})

test('args: id and port, then $GROK_BOT_CDP_PORT, then 39231', () => {
  assert.deepEqual(parseArgs(['AAAAAAAA', '4000'], {}), { id: 'aaaaaaaa', port: 4000 })
  assert.deepEqual(parseArgs(['aaaaaaaa'], { GROK_BOT_CDP_PORT: '5000' }), { id: 'aaaaaaaa', port: 5000 })
  assert.deepEqual(parseArgs(['aaaaaaaa'], {}), { id: 'aaaaaaaa', port: 39231 })
})

/**
 * main() in a child process (it prints one line and exits, as the CLI does), over a fake connect whose bot A is
 * already open and takes the send. `call` is the line that runs main; `fake`, `std` (the CLI's own role gate) and the
 * role file (front: B) are in scope. stderr ends with CONN=1 when main connected.
 */
function runMain(call, input, { script = './send.mjs', bot = A, front = B } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'send-main-'))
  writeFileSync(join(dir, 'roles.json'), JSON.stringify({ front }))
  const runner = join(dir, 'run.mjs')
  writeFileSync(runner, `import { main, gate, loadRoles } from ${JSON.stringify(new URL(script, import.meta.url).href)}
let conn = 0
const fake = async () => { conn = 1; return { close() {}, d: {
  count: async () => 1, composer: async () => '', current: async () => ${JSON.stringify(bot)}, click: async () => {},
  sleep: async () => {}, submit: async () => ({ state: 'submitted', before: 0 }), sent: async () => 1, unsend: async () => false } } }
process.on('exit', () => process.stderr.write('CONN=' + conn))
const std = (id, text) => gate(loadRoles(), id, text)
${call}
`)
  const r = spawnSync(process.execPath, [runner], { input, encoding: 'utf8', env: { ...process.env, HOME: dir, GROK_BOT_ROLES: join(dir, 'roles.json') } })
  const lines = r.stdout.trim().split('\n')
  return { status: r.status, lines, out: JSON.parse(lines[0]), connected: r.stderr.endsWith('CONN=1') }
}

test('main: a send merges extra into its one result line and exits 0', () => {
  const r = runMain(`main({ id: 'aaaaaaaa', port: 1, extra: { direct: 'owner 14:30' } }, () => null, fake)`, '[w:b7c4e910] ⟨Claude⟩ owner 14:30 hi')
  assert.equal(r.status, 0)
  assert.equal(r.lines.length, 1)
  assert.deepEqual(r.out, { state: 'sent', port: 1, bot: 'aaaaaaaa', direct: 'owner 14:30' })
  assert.equal(r.connected, true)
})

test('main: the role gate refuses a headerless text before connecting; a check that passes reaches the send', () => {
  const refused = runMain(`main({ id: 'aaaaaaaa', port: 1 }, std, fake)`, 'hi')
  assert.deepEqual([refused.status, refused.out, refused.connected], [2, { state: 'bad-header', port: 1 }, false])
  const passed = runMain(`main({ id: 'aaaaaaaa', port: 1 }, () => null, fake)`, HEAD)
  assert.deepEqual([passed.status, passed.out, passed.connected], [0, { state: 'sent', port: 1, bot: 'aaaaaaaa' }, true])
})

for (const script of ['./send.mjs', '../../../mods/grok-bot-watch/bin/send.mjs']) {
  for (const check of ['std', '() => null']) {
    test(`${script}: 168d152a refuses a missing header before connecting with ${check}; a valid header sends`, () => {
      const id = '168d152a'
      const call = `main({ id: '${id}', port: 1 }, ${check}, fake)`
      const opts = { script, bot: id, front: id }
      const refused = runMain(call, 'hi', opts)
      assert.deepEqual([refused.status, refused.out, refused.connected], [2, { state: 'bad-header', port: 1 }, false])
      const passed = runMain(call, HEAD, opts)
      assert.deepEqual([passed.status, passed.out, passed.connected], [0, { state: 'sent', port: 1, bot: id }, true])
    })
  }
}

test('main: no check refuses (no-gate) and never connects', () => {
  const r = runMain(`main({ id: 'aaaaaaaa', port: 1 }, undefined, fake)`, '[w:b7c4e910] ⟨Claude⟩ hi')
  assert.deepEqual([r.status, r.lines.length, r.out, r.connected], [2, 1, { state: 'no-gate', port: 1 }, false])
})

test('roles: $GROK_BOT_ROLES wins, else the file under HOME; a missing or broken file is no roles with its error class', () => {
  assert.deepEqual(loadRoles({ GROK_BOT_ROLES: '/x.json' }, p => (assert.equal(p, '/x.json'), '{"front":"f"}')), { file: '/x.json', roles: { front: 'f' } })
  const home = '/h/.claude/grok-bot-watch/roles.json'
  assert.equal(loadRoles({ HOME: '/h' }, p => (assert.equal(p, home), '{}')).file, home)
  const enoent = () => {
    throw Object.assign(new Error('x'), { code: 'ENOENT' })
  }
  assert.deepEqual(loadRoles({ HOME: '/h' }, enoent), { file: home, roles: {}, error: 'ENOENT' })
  assert.equal(loadRoles({ HOME: '/h' }, () => '{not json').error, 'SyntaxError')
  assert.deepEqual(loadRoles({ HOME: '/h' }, () => 'null').roles, {})
})

test('sent mark: one file per session and bot, none for a broadcast; a write failure reaches the caller', () => {
  const wrote = []
  const fs = { mkdirSync: (d, o) => wrote.push(['mkdir', d, o.recursive]), writeFileSync: (p, c) => wrote.push(['write', p, c]) }
  markSent('[w:b7c4e910] ⟨Claude⟩ hi', 'aaaaaaaa-1111-4222', { HOME: '/h' }, 1234, fs)
  assert.deepEqual(wrote, [['mkdir', '/h/.claude/grok-bot-watch/sent', true], ['write', '/h/.claude/grok-bot-watch/sent/b7c4e910-aaaaaaaa.json', '{"at":1234}']])
  wrote.length = 0
  markSent('[w:*] ⟨Claude⟩ hi', 'aaaaaaaa', { HOME: '/h' }, 1, fs)
  assert.deepEqual(wrote, [])
  const broken = {
    mkdirSync: () => {
      throw new Error('EACCES')
    },
    writeFileSync() {},
  }
  assert.throws(() => markSent('[w:b7c4e910] ⟨Claude⟩ hi', 'aaaaaaaa', { HOME: '/h' }, 1, broken), /EACCES/)
})

test('command line: a refusal prints its state and exits 2 before any connection; an old --direct flag is refused', () => {
  const dir = mkdtempSync(join(tmpdir(), 'send-test-'))
  const roles = join(dir, 'roles.json')
  writeFileSync(roles, JSON.stringify({ front: A }))
  const run = (args, input, env = {}) => {
    const r = spawnSync(process.execPath, [fileURLToPath(new URL('./send.mjs', import.meta.url)), ...args], {
      input,
      encoding: 'utf8',
      env: { ...process.env, HOME: dir, GROK_BOT_ROLES: roles, GROK_BOT_CDP_PORT: '1', ...env },
    })
    return [r.status, JSON.parse(r.stdout)]
  }
  assert.deepEqual(run(['cccccccc'], HEAD), [2, { state: 'not-front', port: 1, front: 'aaaaaaaa' }])
  assert.deepEqual(run(['aaaaaaaa'], 'hi'), [2, { state: 'bad-header', port: 1 }])
  const none = join(dir, 'none.json')
  assert.deepEqual(run(['aaaaaaaa'], HEAD, { GROK_BOT_ROLES: none }), [2, { state: 'no-roles', port: 1, missing: ['front'], file: none, error: 'ENOENT' }])
  // Past the gate the port is tried; port 1 answers nothing.
  assert.deepEqual(run(['aaaaaaaa'], HEAD), [2, { state: 'down', port: 1 }])
  // The flag is gone: after the id it lands in the port slot, before it in the id slot. Neither reaches the gate.
  assert.deepEqual(run(['cccccccc', '--direct', 'owner 14:30'], HEAD), [2, { state: 'bad-port', port: null }])
  assert.deepEqual(run(['--direct', 'x', 'cccccccc'], HEAD), [2, { state: 'bad-id', port: null }])
})
