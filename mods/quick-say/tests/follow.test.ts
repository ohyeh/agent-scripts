import { expect, test } from 'claude-code/testing'

import { PHRASES } from '../hooks/register.ts'
import { APPROVES_NOTHING, askTail, gitDirOf, isCommit } from '../hooks/lib/follow.ts'

const PLUGIN = 'quick-say'
const start = { cwd: '/w/repo', surface: 'terminal' as const, isInteractive: true }
const done = (answer: string, more: Record<string, unknown> = {}) =>
  ({ answer, durationMs: 1, isAborted: false, turnId: `t${Math.random()}`, reason: 'answer', ...more }) as never
const typed = (text: string) => ({ text, wait: false, origin: { kind: 'composer' } }) as never

type On = Parameters<Extract<Parameters<typeof test>[1], (...args: never[]) => unknown>>[1]

// The engine beneath: one repo at /w/repo whose dirty files and unpushed commits the test sets.
function world(on: On, pick: (labels: readonly string[]) => string | undefined = () => undefined) {
  const git = { dirty: [] as string[], ahead: [] as string[], head: 'abc1234def' }
  const sent: { text: string; origin: { kind: string; asUser?: true } }[] = []
  const suggested: string[] = []
  const store = new Map<string, unknown>()
  on('prompt.submit', (_, e) => (sent.push({ text: e.text, origin: e.origin as never }), { text: e.text }))
  on('prompt.suggest', (_, e) => (suggested.push(e.text), { isShown: true }))
  on('model.classify', (_, e) => ({ value: pick(e.labels) }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.invalidate', () => ({ value: undefined }))
  on('ui.log', () => ({ value: undefined }))
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
  return { git, sent, nudges, suggested, store }
}

test('the helpers read a closing request for leave, a commit, and the folder it ran in', () => {
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

test('git gate: once per state, framed and approving nothing, at most twice until the person types', async ($, on) => {
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

  // Two in a row: the cap holds until the person types.
  w.git.dirty = ['a.ts']
  await $.turn.complete(done('又改了。'))
  expect(w.nudges().length).toBe(2)
  await $.prompt.submit(typed('好'))
  await $.turn.complete(done('又改了。'))
  expect(w.nudges().length).toBe(3)
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

  // A subagent's turn, an aborted turn, and auto off: nothing at all.
  label = PHRASES[0].label
  await $.turn.complete(done('要我繼續嗎？', { agentId: 'a1' }))
  await $.turn.complete(done('要我繼續嗎？', { reason: 'aborted', isAborted: true }))
  await $.ui.render({ surface: 'terminal', component: 'AbovePrompt', requestId: 'above', props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 120, scroll: { offset: 0, bodyRows: 19 }, view: {} } })
  await $.ui.press({ plugin: PLUGIN, key: 'auto', requestId: 'above' })
  expect(w.store.get('quick-say.auto')).toBe('off')
  await $.turn.complete(done('要我把它部署上去嗎？'))
  expect(w.nudges().length).toBe(1)
  expect(w.suggested.length).toBe(1)

  // On again, kept for the next session.
  await $.session.start(start)
  expect(w.store.get('quick-say.auto')).toBe('off')
  await $.ui.render({ surface: 'terminal', component: 'AbovePrompt', requestId: 'above', props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 120, scroll: { offset: 0, bodyRows: 19 }, view: {} } })
  await $.ui.press({ plugin: PLUGIN, key: 'auto', requestId: 'above' })
  expect(w.store.get('quick-say.auto')).toBe('on')
})
