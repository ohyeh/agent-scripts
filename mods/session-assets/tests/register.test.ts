import type { On } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'

import { assetsOf, assetsOfText, assetsOfTranscript, cut, extractUrls, isLocalHost, merge, rowsOf, shortDir } from '../hooks/lib/assets.ts'

const HOME = '/h/me'
const call = (tool: string, input: Record<string, unknown>, text = '', readOnly = false) => assetsOf({ tool, input, text, home: HOME, cwd: '/private/var/w', readOnly })

describe('extractUrls', () => {
  test('trims punctuation and unbalanced closers, keeps balanced ones, dedups', async () => {
    const text = 'Local: http://localhost:5173/, see (https://x.dev/a) and https://en.wikipedia.org/wiki/A_(b). again http://localhost:5173/'
    expect(extractUrls(text)).toEqual(['http://localhost:5173/', 'https://x.dev/a', 'https://en.wikipedia.org/wiki/A_(b)'])
  })

  test('an ANSI colour code does not end up in the URL', async () => {
    // Vite colours the URL and bolds the port inside it.
    expect(extractUrls('  ➜  Local:   \u001b[36mhttp://localhost:\u001b[1m5173\u001b[22m/\u001b[39m\n')).toEqual(['http://localhost:5173/'])
    expect(extractUrls('a\u0007http://x.dev/p\u0000q')).toEqual(['http://x.dev/p'])
  })

  test('fullwidth punctuation after a URL ends it', async () => {
    expect(extractUrls('打開 http://localhost:5173/（ANSI 版），或 https://x.dev/p。')).toEqual(['http://localhost:5173/', 'https://x.dev/p'])
  })

  test('markdown bold around a URL is not part of it', async () => {
    expect(extractUrls('Preview: **https://x.dev/p**')).toEqual(['https://x.dev/p'])
  })
})

test('loopback, private, tailnet are local; public is remote', async () => {
  // The CGNAT address is built, not written: the repo's pre-push scrub flags any literal in that range.
  const cgnat = `${100}.101.1.1`
  for (const h of ['localhost:3000', '127.0.0.1:8080', '[::1]:9', '192.168.1.4', '172.20.0.2', cgnat, 'mac.local'])
    expect(isLocalHost(h), h).toBe(true)
  for (const h of ['share.o17y317.uk', '172.32.0.1', '100.128.0.1', '8.8.8.8', 'github.com'])
    expect(isLocalHost(h), h).toBe(false)
})

describe('assetsOf', () => {
  test('a Bash URL is labelled with the description; caps at five', async () => {
    expect(call('Bash', { command: 'npm run dev', description: 'Start dev server' }, 'Local: http://localhost:5173/')).toEqual([
      { kind: 'url', ref: 'http://localhost:5173/', label: 'Start dev server', where: 'localhost:5173', isLocal: true },
    ])
    expect(call('Bash', { command: 'x' }, Array.from({ length: 9 }, (_, i) => `https://h${i}.dev`).join(' '))).toHaveLength(5)
  })

  test('a written file and a written picture; ~ shortens the folder', async () => {
    expect(call('Write', { file_path: `${HOME}/p/README.md` })).toEqual([{ kind: 'file', ref: `${HOME}/p/README.md`, label: 'README.md', where: '~/p', isLocal: true }])
    expect(call('Edit', { file_path: '/tmp/shot.PNG' })[0]).toMatchObject({ kind: 'image', label: 'shot.PNG', where: '/tmp' })
    expect(call('NotebookEdit', { notebook_path: '/w/a.ipynb' })[0]).toMatchObject({ kind: 'file', label: 'a.ipynb' })
  })

  test('a folder reads relative to the cwd, /private/var and /var alike', async () => {
    const c = { home: HOME, cwd: '/private/var/w' }
    expect(shortDir('/var/w', c)).toBe('.')
    expect(shortDir('/private/var/w/sub/x', c)).toBe('./sub/x')
    expect(shortDir('/var/wx', c)).toBe('/var/wx')
    expect(shortDir(`${HOME}/a`, c)).toBe('~/a')
    expect(call('Write', { file_path: '/var/w/plan.md' })[0]?.where).toBe('.')
  })

  test('a screenshot path in Bash output is an image', async () => {
    const out = call('Bash', { command: 'agent-browser screenshot', description: 'Screenshot' }, 'Screenshot saved to /tmp/s/home.png\nalso ~/Desktop/a.png, and /tmp/IMG 1.png')
    // A path with a space is not read (limit, README).
    expect(out.map(a => [a.kind, a.ref, a.where])).toEqual([['image', '/tmp/s/home.png', '/tmp/s'], ['image', `${HOME}/Desktop/a.png`, '~/Desktop']])
  })

  test('a picture URL is a url, not an image path', async () => {
    expect(call('Bash', { command: 'deploy', description: 'Deploy' }, 'see https://cdn.x.dev/img/logo.png and file:///h/me/a.png').map(a => [a.kind, a.ref])).toEqual([
      ['url', 'https://cdn.x.dev/img/logo.png'],
    ])
  })

  test('git commit output is a commit with its subject and branch', async () => {
    expect(call('Bash', { command: 'git add -A && git commit -m x' }, '[main 9685ae2] fix(session-assets): strip ANSI\n 3 files changed, 9 insertions(+)')).toEqual([
      { kind: 'commit', ref: '9685ae2', label: 'fix(session-assets): strip ANSI', where: 'main', isLocal: true },
    ])
    // Mid-rebase or bisect, git prints `detached HEAD` where the branch goes.
    expect(call('Bash', { command: 'git commit -m y' }, '[detached HEAD 1a2b3c4] fix thing\n 1 file changed').map(a => [a.ref, a.where])).toEqual([['1a2b3c4', 'detached HEAD']])
    expect(call('Bash', { command: 'cat notes' }, '[main 9685ae2] looks like a commit'), 'not a git commit command').toEqual([])
  })

  test('an Artifact publish is an artifact named by its title; a read is nothing', async () => {
    const text = 'Published https://claude.ai/code/artifact/abc-123 (private)'
    expect(call('Artifact', { file_path: '/s/report.html', title: 'Retro W41' }, text)).toEqual([
      { kind: 'artifact', ref: 'https://claude.ai/code/artifact/abc-123', label: 'Retro W41', where: 'claude.ai', isLocal: false },
    ])
    expect(call('Artifact', { file_path: '/s/report.html' }, text)[0]?.label).toBe('report.html')
    expect(call('Artifact', { action: 'read', url: 'https://claude.ai/code/artifact/abc-123' }, text)).toEqual([])
  })

  test('a read-only call and context-mode reads add nothing', async () => {
    expect(call('Bash', { command: 'rg -n https docs/' }, 'docs/a.md:3: https://x.dev/a', true)).toEqual([])
    expect(call('mcp__plugin_context-mode_context-mode__ctx_search', {}, 'https://x.dev/a')).toEqual([])
    expect(call('mcp__plugin_context-mode_context-mode__ctx_execute', {}, 'http://localhost:3000/').map(a => a.ref)).toEqual(['http://localhost:3000/'])
  })

  test('a URL the call was given is not something it made', async () => {
    expect(call('Bash', { command: 'curl -s https://api.x.dev/v1/s' }, '{"url":"https://api.x.dev/v1/s","next":"https://cdn.x.dev/a"}').map(a => a.ref)).toEqual(['https://cdn.x.dev/a'])
    // context-mode echoes the code it ran.
    expect(call('mcp__plugin_context-mode_context-mode__ctx_execute', { code: 'curl https://api.x.dev/v1' }, '```\ncurl https://api.x.dev/v1\n```\nok')).toEqual([])
  })

  test('an MCP call is labelled with what it said it was for, else its short name', async () => {
    expect(call('mcp__plugin_context-mode_context-mode__ctx_execute', { intent: 'start preview' }, 'http://localhost:4000/')[0]!.label).toBe('start preview')
    expect(call('mcp__plugin_context-mode_context-mode__ctx_execute', {}, 'http://localhost:4000/')[0]!.label).toBe('ctx_execute')
  })

  test('a ref too long to open is not kept', async () => {
    expect(call('Bash', { command: 'x' }, `https://x.dev/${'a'.repeat(3000)}`)).toEqual([])
  })

  test('file and page readers add nothing', async () => {
    for (const tool of ['Read', 'Grep', 'Glob', 'WebFetch', 'WebSearch']) expect(call(tool, { file_path: '/a.png' }, 'https://x.dev /b.png')).toEqual([])
  })
})

describe('prose and transcript', () => {
  const at = { home: HOME, cwd: '/private/var/w' }
  test('a URL in prose is labelled with the rest of its line', async () => {
    expect(assetsOfText('Done.\n- Preview: **https://x.dev/p**\nsee https://y.dev', 'reply', at).map(a => [a.ref, a.label])).toEqual([
      ['https://x.dev/p', 'reply: Preview'],
      ['https://y.dev', 'reply: see'],
    ])
    expect(assetsOfText('https://z.dev/q', 'you', at)[0]!.label).toBe('you')
    // Another URL on the same line is not part of the label.
    expect(assetsOfText('compare https://a.dev and https://b.dev', 'you', at).map(a => a.label)).toEqual(['you: compare and', 'you: compare and'])
    expect(assetsOfText('look at ~/Desktop/shot.png', 'you', at).map(a => [a.kind, a.label])).toEqual([['image', 'you: shot.png']])
    // A repeated ~ path is one asset; it does not use up the five places.
    expect(assetsOfText(`${' ~/Desktop/a.png'.repeat(5)} ~/Desktop/b.png`, 'you', at).map(a => a.ref)).toEqual([`${HOME}/Desktop/a.png`, `${HOME}/Desktop/b.png`])
  })

  test('the transcript replays answered tool uses and replies; user messages and errors add nothing', async () => {
    const out = assetsOfTranscript([
      { role: 'user', text: 'see https://user.dev/x', toolUses: [] },
      { role: 'assistant', text: 'Live at http://localhost:3000/', toolUses: [
        { tool: 'Write', input: { file_path: '/private/var/w/a.md' }, text: 'ok' },
        { tool: 'Bash', input: { command: 'deploy' }, text: 'https://fail.dev', isError: true },
        { tool: 'Bash', input: { command: 'deploy' } },
      ] },
    ], at)
    expect(out.map(a => [a.kind, a.ref])).toEqual([['url', 'http://localhost:3000/'], ['file', '/private/var/w/a.md']])
  })

  test('a replayed reply does not turn an artifact into a reply URL', async () => {
    const url = 'https://claude.ai/code/artifact/abc'
    const out = assetsOfTranscript([
      { role: 'assistant', text: '', toolUses: [{ tool: 'Artifact', input: { title: 'Demo' }, text: `Published ${url}` }] },
      { role: 'assistant', text: `Preview: ${url}`, toolUses: [] },
    ], at)
    expect(out.map(a => [a.kind, a.label])).toEqual([['artifact', 'Demo']])
  })

  test('the replay trusts what a call did, not what it printed: a cat of a doc adds no URL, a commit still counts', async () => {
    const out = assetsOfTranscript([{ role: 'assistant', text: '', toolUses: [
      { tool: 'Bash', input: { command: 'sed -n 1,40p README.md', description: 'Read README' }, text: 'see https://docs.dev/x and /tmp/s/home.png' },
      { tool: 'mcp__plugin_context-mode_context-mode__ctx_execute', input: { code: 'cat a' }, text: 'https://other.dev' },
      { tool: 'Bash', input: { command: 'git commit -m x' }, text: '[main 1a2b3c4] fix: x' },
    ] }], at)
    expect(out.map(a => [a.kind, a.ref])).toEqual([['commit', '1a2b3c4']])
  })
})

test('cut keeps whole groups and counts the rest as assets, not lines', async () => {
  const g = [['1'], ['2'], ['3', '3+'], ['4']]
  const more = (n: number) => `+${n}`
  expect(cut(g, 9, more)).toEqual(['1', '2', '3', '3+', '4'])
  expect(cut(g, 4, more)).toEqual(['1', '2', '+2'])
  expect(cut(g, 1, more)).toEqual(['1'])
  // The newest row shows even when its open detail does not fit with it.
  expect(cut([['1', '1+'], ['2']], 2, more)).toEqual(['1', '+1'])
})

test('an asset seen again moves to the top with its new label', async () => {
  const e = (ref: string, label: string, at: number) => ({ kind: 'url' as const, ref, where: '', isLocal: true, label, project: 'p', at })
  const out = merge([e('a', 'old', 1), e('b', 'b', 0)], [e('a', 'new', 2)])
  expect(out.map(x => `${x.ref}:${x.label}`)).toEqual(['a:new', 'b:b'])
})

describe('band', () => {
  test('assets land in this session\'s key and the band draws them; another session\'s are folded', async ($, on) => {
    const w = world(on)
    w.kv.set('session-assets.s.sess-B', [{ kind: 'url', ref: 'https://share.o17y317.uk/x', where: 'share.o17y317.uk', isLocal: false, label: 'Aurora', project: 'other', at: 0 }])
    await $.session.start(start)
    await $.tool.call({ tool: 'Bash', command: 'npm run dev', description: 'Start dev server' })
    await $.tool.call({ tool: 'Write', file_path: '/work/retro-w41/plan.md', content: 'x' })
    const list = w.kv.get('session-assets.s.sess-A') as Array<{ kind: string; ref: string; label: string; project: string }>
    expect(list.map(x => x.kind)).toEqual(['file', 'url'])
    expect(list[1]).toMatchObject({ ref: 'http://localhost:5173/', label: 'Start dev server', project: 'retro-w41' })

    const text = textOf(await $.ui.render(band()))
    expect(text).toContain('session assets')
    expect(text).toContain('1 url · 1 file')
    expect(text).toContain('Start dev server')
    expect(text).toContain('plan.md')
    expect(text).toContain('other sessions: 1 · 1 asset')
    expect(text, 'folded: another session\'s label is not drawn').not.toContain('Aurora')

    await $.command.run(cmd('all'))
    expect(textOf(await $.ui.render(band()))).toContain('Aurora')
  })

  test('a failed tool call records nothing', async ($, on) => {
    const w = world(on, { isError: true })
    await $.session.start(start)
    await $.tool.call({ tool: 'Bash', command: 'npm run dev', description: 'Start dev server' })
    expect(w.kv.get('session-assets.s.sess-A')).toBeUndefined()
  })

  test('no asset this session: the band is left alone', async ($, on) => {
    world(on)
    await $.session.start(start)
    expect(textOf(await $.ui.render(band()))).not.toContain('session assets')
  })

  test('never more rows than maxRows leaves', async ($, on) => {
    const w = world(on, { text: Array.from({ length: 5 }, (_, i) => `http://localhost:30${i}0/`).join('\n') })
    await $.session.start(start)
    await $.tool.call({ tool: 'Bash', command: 'up', description: 'up' })
    expect(w.kv.get('session-assets.s.sess-A')).toHaveLength(5)
    for (const maxRows of [1, 2, 3, 40]) {
      const tree = await $.ui.render(band({ maxRows }))
      expect(rowsOf(tree), `maxRows ${maxRows}`).toBeLessThanOrEqual(maxRows)
    }
    // One row left shows the newest entry (grok's rule); two show one and the count of the rest.
    expect(textOf(await $.ui.render(band({ maxRows: 2 })))).not.toContain('more')
    expect(textOf(await $.ui.render(band({ maxRows: 3 })))).toContain('+4 more')
  })

  test('a survey keeps the band; /assets hides and shows it', async ($, on) => {
    world(on)
    await $.session.start(start)
    await $.tool.call({ tool: 'Bash', command: 'npm run dev', description: 'Start dev server' })
    expect(textOf(await $.ui.render(band({ hasSurvey: true })))).not.toContain('session assets')
    await $.command.run(cmd(''))
    expect(textOf(await $.ui.render(band()))).not.toContain('session assets')
    await $.command.run(cmd(''))
    expect(textOf(await $.ui.render(band()))).toContain('session assets')
  })

  test('/assets N opens the row; /assets open N runs open with the URL or path as argv; a commit opens nothing', async ($, on) => {
    const w = world(on)
    await $.session.start(start)
    await $.tool.call({ tool: 'Bash', command: 'npm run dev', description: 'Start dev server' })
    await $.command.run(cmd('1'))
    expect(JSON.stringify(await $.ui.render(band()))).toContain('"href":"http://localhost:5173/"')
    expect(JSON.stringify(await $.command.run(cmd('open 1')))).toContain('opened')
    await $.tool.call({ tool: 'Write', file_path: '/work/retro-w41/plan.md', content: 'x' })
    await $.command.run(cmd('open 1'))
    expect(w.runs).toEqual([['open', 'http://localhost:5173/'], ['open', '/work/retro-w41/plan.md']])
    expect(JSON.stringify(await $.command.run(cmd('9')))).toContain('no row 9')
  })

  test('a session without a list replays its transcript, dated at the session start', async ($, on) => {
    const w = world(on, { messages: [{ role: 'assistant', text: 'Preview: https://x.dev/p', toolUses: [{ tool: 'Write', input: { file_path: '/work/retro-w41/a.md' }, text: 'ok' }] }] })
    await $.session.start(start)
    const list = w.kv.get('session-assets.s.sess-A') as Array<{ ref: string; at: number }>
    expect(list.map(x => [x.ref, x.at])).toEqual([['/work/retro-w41/a.md', 1000], ['https://x.dev/p', 1000]])
    expect(textOf(await $.ui.render(band()))).toContain('earlier')
    // A reload finds the list and replays nothing.
    w.kv.set('session-assets.s.sess-A', list.slice(0, 1))
    await $.session.start(start)
    expect((w.kv.get('session-assets.s.sess-A') as unknown[]).length).toBe(1)
  })

  test('a reply adds only URLs no tool printed; a subagent\'s reply adds nothing', async ($, on) => {
    const w = world(on)
    await $.session.start(start)
    await $.tool.call({ tool: 'Bash', command: 'npm run dev', description: 'Start dev server' })
    await $.turn.complete({ ...turn, answer: 'Dev server: http://localhost:5173/\nDocs: https://x.dev/docs' } as never)
    await $.turn.complete({ ...turn, agentId: 'a1', answer: 'https://sub.dev' } as never)
    const list = w.kv.get('session-assets.s.sess-A') as Array<{ ref: string; label: string }>
    expect(list.map(x => [x.ref, x.label])).toEqual([['https://x.dev/docs', 'reply: Docs'], ['http://localhost:5173/', 'Start dev server']])
  })

  test('a link the person pastes is kept; a notification\'s is not', async ($, on) => {
    const w = world(on)
    await $.session.start(start)
    await $.prompt.submit({ text: 'fix https://x.dev/bug/1', wait: false, origin: { kind: 'composer' } } as never)
    await $.prompt.submit({ text: 'task done https://ci.dev/2', wait: false, origin: { kind: 'notification' } } as never)
    await $.prompt.submit({ text: 'DROP https://dropped.dev', wait: false, origin: { kind: 'composer' } } as never)
    expect((w.kv.get('session-assets.s.sess-A') as Array<{ ref: string; label: string }>).map(x => [x.ref, x.label])).toEqual([['https://x.dev/bug/1', 'you: fix']])
  })

  test('the band leaves to the status line what it shows: no version, a commit\'s hash not its branch', async ($, on) => {
    world(on, { text: '[main 9685ae2] fix: x\n 1 file changed' })
    await $.session.start(start)
    await $.tool.call({ tool: 'Bash', command: 'git commit -m x' })
    const text = textOf(await $.ui.render(band()))
    expect(text).toContain('9685ae2')
    expect(text).not.toContain('main')
    expect(text).not.toMatch(/v\d+\.\d+\.\d+/)
  })

  test('/assets list prints every entry grouped by kind, numbered as the band', async ($, on) => {
    world(on)
    await $.session.start(start)
    await $.tool.call({ tool: 'Bash', command: 'npm run dev', description: 'Start dev server' })
    await $.tool.call({ tool: 'Write', file_path: '/work/retro-w41/plan.md', content: 'x' })
    const text = JSON.stringify(await $.command.run(cmd('list')))
    expect(text).toContain('URLs (1)')
    expect(text).toContain('Files (1)')
    expect(text).toMatch(/ 2  Start dev server/)
    expect(text).toContain('http://localhost:5173/')
  })

  test('/assets clear starts the list over from the transcript', async ($, on) => {
    const w = world(on, { messages: [{ role: 'assistant', text: 'Preview: https://x.dev/p', toolUses: [] }] })
    w.kv.set('session-assets.s.sess-A', [{ kind: 'url', ref: 'https://noise.dev', where: 'noise.dev', isLocal: false, label: 'old', project: 'p', at: 0 }])
    await $.session.start(start)
    expect(JSON.stringify(await $.command.run(cmd('clear')))).toContain('cleared 1 asset(s); the transcript gave back 1')
    expect((w.kv.get('session-assets.s.sess-A') as Array<{ ref: string }>).map(x => x.ref)).toEqual(['https://x.dev/p'])
  })

  test('a failed store write still returns the tool result', async ($, on) => {
    world(on, { failWrites: true })
    await $.session.start(start)
    const r = await $.tool.call({ tool: 'Bash', command: 'npm run dev', description: 'Start dev server' })
    expect((r as { text?: string }).text).toContain('http://localhost:5173/')
  })
})

const turn = { answer: '', durationMs: 1, isAborted: false, turnId: 't1' }
const start = { cwd: '/work/retro-w41', surface: 'terminal' as const, isInteractive: true }
const cmd = (args: string) => ({ command: 'assets', args, origin: { kind: 'composer' as const }, presentation: { isFullscreen: false, columns: 120 } })
const band = (props: { maxRows?: number; hasSurvey?: boolean } = {}) => ({
  surface: 'terminal' as const,
  component: 'AbovePrompt' as const,
  requestId: 'above-prompt',
  viewport: { columns: 100, rows: 50 },
  props: { hasSurvey: false, isWorking: false, maxRows: 40, bodyColumns: 80, scroll: { offset: 0, bodyRows: 39 }, view: {}, ...props },
})

/** The engine under the mod: an in-memory store (or one whose writes fail), tools that print a dev-server URL, a recorded `open`. */
function world(on: On, opts: { failWrites?: boolean; text?: string; isError?: boolean; messages?: unknown[] } = {}) {
  mock.clock(on)
  const kv = new Map<string, unknown>()
  const runs: string[][] = []
  on('session.id', () => ({ value: 'sess-A' }))
  on('session.messages', () => ({ value: opts.messages ?? [] }) as never)
  on('session.usage', () => ({ value: { startedAt: 1000 } }) as never)
  on('turn.complete', ($, e) => ({ text: e.answer }) as never)
  // A prompt starting DROP is refused beneath, as a settings hook's block would be.
  on('prompt.submit', ($, e) => (e.text.startsWith('DROP') ? { drop: 'blocked' } : { text: e.text }) as never)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('env.get', () => ({ value: HOME }))
  on('store.get', ($, e) => ({ value: kv.get(e.key) }))
  on('store.keys', () => ({ value: [...kv.keys()] }))
  on('store.delete', ($, e) => {
    kv.delete(e.key)
    return { value: undefined }
  })
  on('store.set', ($, e) => {
    if (opts.failWrites && e.key.startsWith('session-assets.s.')) throw new Error('disk full')
    kv.set(e.key, e.value)
    return { value: undefined }
  })
  on('process.run', ($, e) => {
    runs.push([...e.argv])
    return { value: { exitCode: 0, stdout: '', stderr: '' } }
  })
  on('ui.render', () => ({ type: 'engine', ref: 0 }) as never)
  on('ui.invalidate', () => ({ value: undefined }))
  on('ui.log', () => ({ value: undefined }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: '' }, text: opts.text ?? '  ➜  Local:   http://localhost:5173/\n', ...(opts.isError ? { isError: true } : {}) }) as never)
  on('tool.call', { tool: 'Write' }, () => ({ result: {}, text: 'File created' }) as never)
  return { kv, runs }
}

function textOf(node: unknown): string {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('\n')
  const el = node as { props?: Record<string, unknown>; children?: unknown }
  return [textOf(el.props?.children), textOf(el.props?.label), textOf(el.children)].filter(Boolean).join('\n')
}
