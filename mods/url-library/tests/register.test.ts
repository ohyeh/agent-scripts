import type { On } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'

import { extractUrls, groupOf, isLocalHost, merge } from '../hooks/lib/urls.ts'

const DAY = 86_400_000

describe('extractUrls', () => {
  test('trims punctuation and unbalanced closers, keeps balanced ones, dedups', async () => {
    const text = 'Local: http://localhost:5173/, see (https://x.dev/a) and https://en.wikipedia.org/wiki/A_(b). again http://localhost:5173/'
    expect(extractUrls(text)).toEqual(['http://localhost:5173/', 'https://x.dev/a', 'https://en.wikipedia.org/wiki/A_(b)'])
  })

  test('caps at five per result', async () => {
    const text = Array.from({ length: 9 }, (_, i) => `https://h${i}.dev`).join(' ')
    expect(extractUrls(text)).toHaveLength(5)
  })
})

describe('isLocalHost', () => {
  test('loopback, private, tailnet are local; public is remote', async () => {
    for (const h of ['localhost:3000', '127.0.0.1:8080', '[::1]:9', '192.168.1.4', '172.20.0.2', '100.101.1.1', 'box.tail1.ts.net', 'mac.local'])
      expect(isLocalHost(h), h).toBe(true)
    for (const h of ['share.o17y317.uk', '172.32.0.1', '8.8.8.8', 'github.com'])
      expect(isLocalHost(h), h).toBe(false)
  })
})

describe('library', () => {
  test('a URL seen again moves to the top with its new label', async () => {
    const e = (url: string, label: string, at: number) => ({ url, host: '', isLocal: true, label, project: 'p', at })
    const out = merge([e('a', 'old', 1), e('b', 'b', 0)], [e('a', 'new', 2)])
    expect(out.map(x => `${x.url}:${x.label}`)).toEqual(['a:new', 'b:b'])
  })

  test('groups by day and week', async () => {
    const now = new Date(2026, 9, 9, 12).getTime()
    expect(groupOf(now - 1000, now)).toBe('Today')
    expect(groupOf(now - 2 * DAY, now)).toBe('This week')
    expect(groupOf(now - 10 * DAY, now)).toBe('Older')
  })

  test('a Bash result with a URL lands in the store and the pane draws it', async ($, on) => {
    const kv = world(on)
    await $.session.start({ cwd: '/work/retro-w41', surface: 'terminal', isInteractive: true })
    await $.tool.call({ tool: 'Bash', command: 'npm run dev', description: 'Start dev server' })
    const [first] = kv.get('entries') as Array<{ url: string; label: string; project: string; isLocal: boolean }>
    expect(first).toMatchObject({ url: 'http://localhost:5173/', label: 'Start dev server', project: 'retro-w41', isLocal: true })

    const tree = nodes(await $.ui.render({ surface: 'terminal', component: 'Pane', requestId: 'url-library', props: { title: 'URLs' } } as never))
    expect(tree.some(n => n.type === 'Link' && n.props?.href === 'http://localhost:5173/' && n.props?.label === 'Start dev server')).toBe(true)
    expect(JSON.stringify(tree)).toContain('Today')
    expect(JSON.stringify(tree)).toContain('retro-w41')
  })

  test('a failed store write still returns the tool result', async ($, on) => {
    world(on, true)
    await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
    const r = await $.tool.call({ tool: 'Bash', command: 'npm run dev', description: 'Start dev server' })
    expect((r as { text?: string }).text).toContain('http://localhost:5173/')
  })
})

/** The engine under the mod: an in-memory store (or one whose writes fail) and a Bash that prints a dev-server URL. */
function world(on: On, failWrites = false) {
  mock.clock(on)
  const kv = new Map<string, unknown>()
  on('store.get', ($, e) => ({ value: kv.get(e.key) }))
  on('store.set', ($, e) => {
    if (failWrites) throw new Error('disk full')
    kv.set(e.key, e.value)
    return { value: undefined }
  })
  on('ui.invalidate', () => ({ value: undefined }))
  on('ui.log', () => ({ value: undefined }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: '' }, text: '  ➜  Local:   http://localhost:5173/\n' }) as never)
  return kv
}

type Node = { type?: string; children?: unknown; props?: Record<string, unknown> }
const kidsOf = (n: Node) => [n.children ?? n.props?.children].flat() as Node[]
const nodes = (n: unknown): Node[] =>
  Array.isArray(n) ? n.flatMap(nodes) : n && typeof n === 'object' ? [n as Node, ...nodes(kidsOf(n as Node))] : []
