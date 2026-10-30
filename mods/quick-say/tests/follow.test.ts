import { expect, test } from 'claude-code/testing'

import { PHRASES } from '../hooks/register.ts'
import { APPROVES_NOTHING, askPrompt, askTail, gitDirOf, gitPrompt, isCommit, questionTail } from '../hooks/lib/follow.ts'

const PLUGIN = 'quick-say'
const start = { cwd: '/w/repo', surface: 'terminal' as const, isInteractive: true }
const done = (answer: string, more: Record<string, unknown> = {}) =>
  ({ answer, durationMs: 1, isAborted: false, turnId: `t${Math.random()}`, reason: 'answer', ...more }) as never
const typed = (text: string) => ({ text, wait: false, origin: { kind: 'composer' } }) as never
const mode = (args: string) => ({ command: PLUGIN, args: `mode ${args}`, origin: { kind: 'composer' as const }, presentation: { isFullscreen: false, columns: 120 } })

type On = Parameters<Extract<Parameters<typeof test>[1], (...args: never[]) => unknown>>[1]

// The engine beneath: one repo at /w/repo whose dirty files and unpushed commits the test sets.
function world(on: On, pick: (labels: readonly string[]) => string | undefined = () => undefined, submit?: (text: string) => Promise<{ text: string }>) {
  const git = { dirty: [] as string[], ahead: [] as string[], head: 'abc1234def' }
  const sent: { text: string; origin: { kind: string; asUser?: true } }[] = []
  const suggested: string[] = []
  const store = new Map<string, unknown>()
  const files = new Map<string, string>()
  const disk = { fail: false }
  const debug: string[] = []
  const logged = { written: () => {}, debug: () => {} }
  on('session.id', () => ({ value: '12345678-session' }))
  on('env.get', () => ({ value: '/h/me' }))
  on('fs.exists', (_, e) => ({ value: files.has(e.path) }))
  on('fs.read', (_, e) => ({ value: files.get(e.path) ?? '' }))
  on('fs.write', (_, e) => {
    if (disk.fail) return { deny: 'disk full' }
    files.set(e.path, e.text)
    logged.written()
    return { value: undefined }
  })
  on('prompt.submit', (_, e) => (sent.push({ text: e.text, origin: e.origin as never }), submit ? submit(e.text) : { text: e.text }))
  on('prompt.suggest', (_, e) => (suggested.push(e.text), { isShown: true }))
  on('model.classify', (_, e) => ({ value: pick(e.labels) }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.invalidate', () => ({ value: undefined }))
  on('ui.log', (_, e) => (debug.push(e.text), logged.debug(), { value: undefined }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('store.get', (_, e) => ({ value: store.get(e.key) }))
  on('store.set', (_, e) => (store.set(e.key, e.value), { value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('turn.complete', (_, e) => ({ text: e.answer }) as never)
  on('tool.call', () => ({ result: {}, text: 'ok' }) as never)
  on('ui.render', ($, e) => $.ui.resolve(e).Text({ children: '' }))
  on('process.run', (_, e) => {
    const a = e.argv.join(' ')
    const out = a.endsWith('--show-toplevel')
      ? '/w/repo\n'
      : a.includes(' status --porcelain')
        ? git.dirty.map(f => ` M ${f}\n`).join('')
        : a.endsWith('rev-parse HEAD')
          ? `${git.head}\n`
          : a.endsWith('rev-list @{u}..HEAD')
            ? git.ahead.join('\n')
            : ''
    return { value: { exitCode: 0, stdout: out, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  const nudges = () => sent.filter(x => x.origin.kind === 'plugin')
  return { git, sent, nudges, suggested, store, files, disk, debug, logged }
}

test('the helpers read a closing request for leave, a commit, and the folder it ran in', () => {
  expect(questionTail('A 還是 B？\n✈\n')).toBe(true)
  expect(questionTail('Which one?\n\n✈')).toBe(true)
  expect(questionTail('A?\n完成。\n✈')).toBe(false)
  expect(askTail('做好了。\n\n要我現在 push 嗎？\n\n✈')).toBe('要我現在 push 嗎？')
  expect(askTail('Tests pass.\nShall I open the PR?')).toBe('Shall I open the PR?')
  expect(askTail('要你決定：A 還是 B？')).toBeUndefined()
  expect(askTail('做好了，已推送。')).toBeUndefined()
  expect(isCommit('cd /w/repo && git add x && git commit -q -m "y"')).toBe(true)
  expect(isCommit('git commit --dry-run')).toBe(false)
  expect(isCommit('git log --oneline')).toBe(false)
  expect(gitDirOf('git -C /a/b commit -m x', '/w')).toBe('/a/b')
  expect(gitDirOf('cd /a/c && git commit -m x', '/w')).toBe('/a/c')
  expect(gitDirOf('git commit -m x', '/w')).toBe('/w')
})

// mods/README.md, Mod prompts: a reminder that names an action (push) grants no scope; it ends saying it approves nothing.
test('a gate reminder that names an action without a scope approves nothing, as its last line', () => {
  expect(askPrompt('要我現在 push 嗎？').split('\n').at(-1)).toBe(APPROVES_NOTHING)
  expect(gitPrompt([{ repo: '/w/repo', dirty: ['a.ts'], unpushed: ['abc1234'] }]).split('\n').at(-1)).toBe(APPROVES_NOTHING)
})

test('git gate: once per state, framed and approving nothing, at most four times until the person types', async ($, on) => {
  const w = world(on)
  await $.session.start(start)

  await $.tool.call({ tool: 'Edit', file_path: '/w/repo/a.ts', old_string: 'x', new_string: 'y' } as never)
  w.git.dirty = ['a.ts']
  await $.turn.complete(done('改好了。'))
  expect(w.nudges().length).toBe(1)
  expect(w.nudges()[0]!.text).toContain('/w/repo：未 commit：a.ts')
  expect(w.nudges()[0]!.text).toContain(APPROVES_NOTHING)
  expect(w.nudges()[0]!.text).not.toMatch(/請 push|push 吧/)
  expect(w.nudges()[0]!.origin.asUser).toBeUndefined()

  // The agent's reply to it leaves the same state: no second reminder.
  await $.turn.complete(done('未推送：沒有核可。'))
  expect(w.nudges().length).toBe(1)

  // A commit this session made, not on the upstream: a new state.
  await $.tool.call({ tool: 'Bash', command: 'git commit -q -m "a"', description: 'commit' } as never)
  w.git.dirty = []
  w.git.ahead = ['abc1234def', 'ffff000other']
  await $.turn.complete(done('commit 好了。'))
  expect(w.nudges().length).toBe(2)
  expect(w.nudges()[1]!.text).toContain('未 push 的 commit：abc1234')
  expect(w.nudges()[1]!.text).not.toContain('ffff000')

  for (const file of ['b.ts', 'c.ts']) {
    await $.tool.call({ tool: 'Edit', file_path: `/w/repo/${file}` } as never)
    w.git.dirty = [file]
    await $.turn.complete(done('又改了。'))
  }
  expect(w.nudges().length).toBe(4)
  w.git.dirty = ['a.ts']
  await $.turn.complete(done('又改了。'))
  expect(w.nudges().length).toBe(4)
  await $.prompt.submit(typed('好'))
  await $.turn.complete(done('又改了。'))
  expect(w.nudges().length).toBe(5)
})

test('ask gate and the suggestion: a closing "shall I?" is answered once; else the likely combo shows dim', async ($, on) => {
  let label: string | undefined
  const w = world(on, labels => labels.find(l => label !== undefined && l.startsWith(label)))
  await $.session.start(start)
  await $.prompt.submit(typed('改一下 band'))

  await $.turn.complete(done('改好了。\n\n要我順便更新 README 嗎？\n\n✈'))
  expect(w.nudges().length).toBe(1)
  expect(w.nudges()[0]!.text).toContain('「要我順便更新 README 嗎？」')
  expect(w.nudges()[0]!.text).toContain(APPROVES_NOTHING)
  expect(w.suggested).toEqual([])

  // No gate: the model's pick shows dim; 'none' shows nothing.
  label = PHRASES[1].label
  await $.turn.complete(done('第一步做完了，接著做第二步之前先回報。'))
  expect(w.suggested).toEqual([PHRASES[1].text])
  label = 'none'
  await $.turn.complete(done('都好了。'))
  expect(w.suggested.length).toBe(1)

  // A subagent's turn, an aborted turn, and manual mode: nothing at all.
  label = PHRASES[0].label
  await $.turn.complete(done('要我繼續嗎？', { agentId: 'a1' }))
  await $.turn.complete(done('要我繼續嗎？', { reason: 'aborted', isAborted: true }))
  await $.ui.render({ surface: 'terminal', component: 'AbovePrompt', requestId: 'above', props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 120, scroll: { offset: 0, bodyRows: 19 }, view: {} } })
  await $.ui.press({ plugin: PLUGIN, key: 'mode', requestId: 'above' })
  await $.command.run({ command: PLUGIN, args: 'mode manual', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } })
  expect(w.store.get('quick-say.mode')).toBe('手動')
  await $.turn.complete(done('要我把它部署上去嗎？'))
  expect(w.nudges().length).toBe(1)
  expect(w.suggested.length).toBe(1)

  // Manual persists; the next press returns to semi-auto.
  await $.session.start(start)
  expect(w.store.get('quick-say.mode')).toBe('手動')
  await $.ui.render({ surface: 'terminal', component: 'AbovePrompt', requestId: 'above', props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 120, scroll: { offset: 0, bodyRows: 19 }, view: {} } })
  await $.ui.press({ plugin: PLUGIN, key: 'mode', requestId: 'above' })
  expect(w.store.get('quick-say.mode')).toBe('半自動')
})

test('auto sends continue and acceptance as the mod, then stops on none until an owner prompt', async ($, on) => {
  let pick = '續跑'
  const w = world(on, labels => labels.find(l => l === pick))
  await $.session.start(start)
  await $.command.run(mode('auto'))
  await $.turn.complete(done('第一步完成。'))
  expect(w.nudges()[0]!.text).toBe(`quick-say 自動：沒有待決事項就接著做到結束條件達成；已授權範圍內的事直接做，不用再問使用者。\n${APPROVES_NOTHING}`)
  pick = '驗收'
  await $.turn.complete(done('可以驗收。'))
  expect(w.nudges()[1]!.text).toBe(`${PHRASES.find(p => p.hotkey === '9')!.text}\n${APPROVES_NOTHING}`)
  expect(w.nudges().every(p => p.origin.asUser === undefined && p.text.endsWith(APPROVES_NOTHING))).toBe(true)
  pick = 'none'
  await $.turn.complete(done('停在這。'))
  pick = '續跑'
  await $.turn.complete(done('還在這。'))
  expect(w.nudges().length).toBe(2)
  const rows = [...w.files.values()].join('').trim().split('\n').map(l => JSON.parse(l))
  expect(rows.map(r => r.event)).toEqual(['sent', 'sent', 'stopped'])
  expect(rows.at(-1).reason).toBe('猜不到下一句')
  expect(rows.every(r => r.mode === '自動' && !Number.isNaN(Date.parse(r.at)))).toBe(true)
  expect([...w.files.keys()][0]).toMatch(/^\/h\/me\/\.local\/state\/quick-say\/\d{4}-\d{2}-\d{2}-12345678\.log$/)
  await $.prompt.submit(typed('繼續'))
  await $.turn.complete(done('開始。'))
  expect(w.nudges().length).toBe(3)
})

test('auto stops on a question after gates, and the stopped header is not dim', async ($, on) => {
  const w = world(on, labels => labels[0])
  await $.session.start(start)
  await $.command.run(mode('自動'))
  await $.turn.complete(done('A 還是 B？\n\n✈'))
  expect(w.nudges().length).toBe(0)
  const tree = await $.ui.render({ surface: 'terminal', component: 'AbovePrompt', requestId: 'above', props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 160, scroll: { offset: 0, bodyRows: 19 }, view: {} } })
  expect(JSON.stringify(tree)).toContain('停：agent 在問問題')
  expect(JSON.stringify(tree)).toContain('"dimColor":false')
  await $.turn.complete(done('繼續。'))
  expect(w.nudges().length).toBe(0)
  await $.prompt.submit({ text: 'A', wait: false, origin: { kind: 'bridge' } } as never)
  await $.turn.complete(done('要我繼續嗎？\n✈'))
  expect(w.nudges().length).toBe(1)
  expect(w.nudges()[0]!.text).toContain('「要我繼續嗎？」')
  await $.turn.complete(done('要我繼續嗎？\n✈'))
  expect(w.nudges().length).toBe(1)
})

test('a mode change clears auto stop from the header and lets auto send again', async ($, on) => {
  const w = world(on, labels => labels[0])
  const band = { surface: 'terminal' as const, component: 'AbovePrompt' as const, requestId: 'above', props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 160, scroll: { offset: 0, bodyRows: 19 }, view: {} } }
  await $.session.start(start)
  await $.command.run(mode('自動'))
  await $.turn.complete(done('A 還是 B？'))
  expect(JSON.stringify(await $.ui.render(band))).toContain('停：agent 在問問題')
  // The auto button cycles to manual; the command returns directly to auto.
  await $.ui.press({ plugin: PLUGIN, key: 'mode', requestId: 'above' })
  const manual = JSON.stringify(await $.ui.render(band))
  expect(manual).toContain('手動')
  expect(manual).not.toContain('停：')
  await $.command.run(mode('自動'))
  const auto = JSON.stringify(await $.ui.render(band))
  expect(auto).toContain('自動')
  expect(auto).not.toContain('停：')
  await $.turn.complete(done('繼續。'))
  expect(w.nudges().length).toBe(1)
})

test('turn.complete returns before either a gate or auto prompt finishes submission', async ($, on) => {
  let entered = () => {}
  let release = () => {}
  const w = world(on, labels => labels[0], text => new Promise(resolve => {
    release = () => resolve({ text })
    entered()
  }))
  await $.session.start(start)
  for (const [selected, answer] of [['semi', '要我繼續嗎？'], ['auto', '繼續。']]) {
    await $.command.run(mode(selected!))
    const submitting = new Promise<void>(resolve => { entered = resolve })
    let returned = false
    const turn = $.turn.complete(done(answer!)).then(() => { returned = true })
    await submitting
    // Drain the dispatch microtasks while the next prompt remains pending.
    for (let i = 0; i < 100; i += 1) await Promise.resolve()
    const returnedBeforeSubmit = returned
    const rowsBeforeSubmit = [...w.files.values()].join('')
    const written = new Promise<void>(resolve => { w.logged.written = resolve })
    release()
    await turn
    await written
    expect(returnedBeforeSubmit).toBe(true)
    const rows = [...w.files.values()].join('').trim().split('\n').map(l => JSON.parse(l))
    expect(rows.filter(r => r.event === 'sent').length).toBe(selected === 'semi' ? 1 : 2)
    expect(rowsBeforeSubmit.split('"event":"sent"').length - 1).toBe(selected === 'semi' ? 0 : 1)
  }
})

test('auto and both gates share four sends; mod prompts do not reset it, owner prompts do', async ($, on) => {
  const w = world(on, labels => labels[0])
  await $.session.start(start)
  await $.command.run(mode('auto'))
  await $.turn.complete(done('繼續。'))
  await $.turn.complete(done('要我繼續嗎？'))
  await $.tool.call({ tool: 'Edit', file_path: '/w/repo/a.ts' } as never)
  w.git.dirty = ['a.ts']
  await $.turn.complete(done('繼續。'))
  await $.turn.complete(done('繼續。'))
  expect(w.nudges().length).toBe(4)
  w.git.dirty = ['b.ts']
  await $.turn.complete(done('要我做下一步嗎？'))
  expect(w.nudges().length).toBe(4)
  // The question wins before the streak reason; an owner prompt starts another streak.
  await $.prompt.submit(typed('好'))
  w.git.dirty = []
  for (let i = 0; i < 5; i += 1) await $.turn.complete(done('繼續。'))
  expect(w.nudges().length).toBe(8)
  const rows = [...w.files.values()].join('').trim().split('\n').map(l => JSON.parse(l))
  expect(rows.at(-1).reason).toBe('連續送滿 4 句')
  expect(rows.filter(r => r.event === 'gate').map(r => r.reason)).toEqual(['ask', 'git'])
  await $.prompt.submit({ text: '再來', wait: false, origin: { kind: 'bridge' } } as never)
  await $.turn.complete(done('繼續。'))
  expect(w.nudges().length).toBe(9)
})

test('manual sends and suggests nothing; logging failure does not stop an auto send', async ($, on) => {
  const w = world(on, labels => labels[0])
  await $.session.start(start)
  await $.command.run(mode('manual'))
  await $.turn.complete(done('要我繼續嗎？'))
  expect(w.nudges()).toEqual([])
  expect(w.suggested).toEqual([])
  await $.command.run(mode('auto'))
  w.disk.fail = true
  const logged = new Promise<void>(resolve => { w.logged.debug = resolve })
  await $.turn.complete(done('繼續。'))
  await logged
  expect(w.nudges().length).toBe(1)
  expect(w.debug.join('')).toContain('log not written (quick-say: $.fs.write: disk full)')
})
