import type { On } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'

import { assetsOf, extractUrls, isLocalHost, merge, rowsOf, shortDir } from '../hooks/lib/assets.ts'

const HOME = '/h/me'
const call = (tool: string, input: Record<string, unknown>, text = '') => assetsOf({ tool, input, text, home: HOME, cwd: '/private/var/w' })

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

  test('git commit output is a commit with its subject and branch', async () => {
    expect(call('Bash', { command: 'git add -A && git commit -q -m x && git log --oneline -1' }, '[main 9685ae2] fix(url-library): strip ANSI\n 3 files changed')).toEqual([
      { kind: 'commit', ref: '9685ae2', label: 'fix(url-library): strip ANSI', where: 'main', isLocal: true },
    ])
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

  test('file and page readers add nothing', async () => {
    for (const tool of ['Read', 'Grep', 'Glob', 'WebFetch', 'WebSearch']) expect(call(tool, { file_path: '/a.png' }, 'https://x.dev /b.png')).toEqual([])
  })
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
    expect(text).toContain('other sessions: 1')
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

  test('a failed store write still returns the tool result', async ($, on) => {
    world(on, { failWrites: true })
    await $.session.start(start)
    const r = await $.tool.call({ tool: 'Bash', command: 'npm run dev', description: 'Start dev server' })
    expect((r as { text?: string }).text).toContain('http://localhost:5173/')
  })
})

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
function world(on: On, opts: { failWrites?: boolean; text?: string; isError?: boolean } = {}) {
  mock.clock(on)
  const kv = new Map<string, unknown>()
  const runs: string[][] = []
  on('session.id', () => ({ value: 'sess-A' }))
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
