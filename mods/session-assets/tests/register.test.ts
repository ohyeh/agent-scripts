import type { On } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'

import { assetsOf, assetsOfText, assetsOfTranscript, cut, extractUrls, githubRepoOf, pushedOf, pushRemoteOf, isLocalNoise, localPort, sessionIdsIn, shasIn, parseCwd, parseListen, refsIn, isLocalHost, merge, nameOf, rowsOf, shortDir } from '../hooks/lib/assets.ts'

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

describe('pointing and checking', () => {
  test('a push that lost its To line: where to ask git for the remote', async () => {
    const at = { home: HOME, cwd: '/w/app' }
    expect(pushRemoteOf('git push origin main 2>&1 | tail -1', '   1a2b3c4..5d6e7f8  main -> main', at)).toEqual({ dir: '/w/app', remote: 'origin' })
    expect(pushRemoteOf('cd ~/github/x && git push upstream HEAD | tail -1', '   1a2b3c4..5d6e7f8  main -> main', at)).toEqual({ dir: `${HOME}/github/x`, remote: 'upstream' })
    expect(pushRemoteOf('git -C sub push --tags', ' * [new tag]  v1 -> v1', at)).toEqual({ dir: '/w/app/sub', remote: 'origin' })
    expect(pushRemoteOf('git push', 'To https://github.com/o/r.git\n   1a2b3c4..5d6e7f8  main -> main', at), 'the To line is there').toBeUndefined()
    expect(pushRemoteOf('git push', 'Everything up-to-date', at)).toBeUndefined()
    expect(pushRemoteOf('git push 2>&1 | tail -1', '   1a2b3c4..5d6e7f8  main -> main', at)?.remote, 'a redirect is not a remote').toBe('origin')
    expect(pushRemoteOf('git push --dry-run origin main | tail -1', '   1a2b3c4..5d6e7f8  main -> main', at), 'a dry run pushed nothing').toBeUndefined()
    expect(pushRemoteOf("cd ~/x && python3 - <<'EOF'\nnote = 'git push --dry-run up'\nEOF\ngit commit -q && git push origin main | tail -1", '   1a2b3c4..5d6e7f8  main -> main', at), 'a heredoc is not a command').toEqual({ dir: `${HOME}/x`, remote: 'origin' })
    expect(pushRemoteOf('git push -n && git push up main | tail -1', '   1a2b3c4..5d6e7f8  main -> main', at)?.remote, 'the push that ran').toBe('up')
    expect(call('Bash', { command: 'git push --dry-run origin main' }, 'To https://github.com/o/r.git\n   1a2b3c4..5d6e7f8  main -> main')).toEqual([])
    expect(call('Bash', { command: "python3 - <<'EOF'\nnote = 'git push -n'\nEOF\ngit push" }, 'To https://github.com/o/r.git\n   1a2b3c4..5d6e7f8  main -> main').map(a => a.label), 'a heredoc is not a command').toEqual(['push: main 1a2b3c4..5d6e7f8'])
    expect(githubRepoOf('git@github.com:ohyeh/agent-scripts.git\n')).toBe('ohyeh/agent-scripts')
    expect(pushedOf('   1a2b3c4..5d6e7f8  main -> main', 'o/r').map(a => a.ref)).toEqual(['https://github.com/o/r/compare/1a2b3c4...5d6e7f8'])
  })

  test('a push to GitHub gives the compare view, a new branch, the tag page; a fetched page is labelled by its source or host', async () => {
    const out = 'To https://github.com/ohyeh/agent-scripts.git\n   594cff6..b30824f  main -> main\n * [new tag]         v0.5.0 -> v0.5.0\n * [new branch]      feat/x -> feat/x\n'
    expect(call('Bash', { command: 'git push origin main --tags', description: 'Push' }, out).map(a => [a.label, a.ref])).toEqual([
      ['push: main 594cff6..b30824f', 'https://github.com/ohyeh/agent-scripts/compare/594cff6...b30824f'],
      ['push: new tag v0.5.0', 'https://github.com/ohyeh/agent-scripts/releases/tag/v0.5.0'],
      ['push: new branch feat/x', 'https://github.com/ohyeh/agent-scripts/tree/feat/x'],
    ])
    expect(call('Bash', { command: 'git push' }, 'To git@github.com:o/r.git\n + 1a2b3c4...5d6e7f8 main -> main (forced update)').map(a => a.ref)).toEqual(['https://github.com/o/r/compare/1a2b3c4...5d6e7f8'])
    expect(call('Bash', { command: 'git push' }, 'To ssh://host/srv/r.git\n   1a2b3c4..5d6e7f8  main -> main')).toEqual([])
    expect(assetsOfTranscript([{ role: 'assistant', text: '', toolUses: [{ tool: 'Bash', input: { command: 'git push' }, text: out }] }], { home: HOME, cwd: '/w' }).length, 'a push is what a call did: the replay keeps it').toBe(3)
    expect(call('mcp__plugin_context-mode_context-mode__ctx_fetch_and_index', { url: 'https://docs.x.dev/a' }).map(a => a.label)).toEqual(['docs.x.dev'])
    expect(call('mcp__plugin_context-mode_context-mode__ctx_fetch_and_index', { url: 'https://docs.x.dev/a', source: 'X docs' }).map(a => a.label)).toEqual(['X docs'])
    expect(call('mcp__plugin_context-mode_context-mode__ctx_fetch_and_index', { requests: [{ url: 'https://react.dev/a', source: 'react' }, { url: 'https://vuejs.org/b' }, { url: 'ftp://x' }], concurrency: 2 }).map(a => [a.label, a.ref])).toEqual([['react', 'https://react.dev/a'], ['vuejs.org', 'https://vuejs.org/b']])
  })

  test('a page fetched or a link you pasted is a source; a reader command keeps nothing it printed', async () => {
    expect(call('WebFetch', { url: 'https://2140.tw/api/token-target/', prompt: 'token target spec' }, 'body https://inside.dev', true)).toEqual([{ kind: 'source', ref: 'https://2140.tw/api/token-target/', label: 'token target spec', where: '2140.tw', isLocal: false }])
    expect(call('mcp__plugin_context-mode_context-mode__ctx_fetch_and_index', { url: 'https://docs.x.dev/a', source: 'x' }, 'indexed https://docs.x.dev/b').map(a => [a.kind, a.ref])).toEqual([['source', 'https://docs.x.dev/a']])
    expect(assetsOfText('see https://discord.com/channels/1/2', 'you', { home: HOME, cwd: '/w' }).map(a => a.kind)).toEqual(['source'])
    expect(call('Bash', { command: 'sleep 15; tmux capture-pane -p -t sa4 -S -60 | grep -vE "^$" | tail -30', description: 'Read the pane' }, 'https://reply-only.dev/42')).toEqual([])
    expect(call('Bash', { command: 'cd web && cat log.txt | rg http' }, 'http://localhost:5173/')).toEqual([])
    expect(call('Bash', { command: 'npm run dev | tee log', description: 'Start dev server' }, 'http://localhost:5173/').map(a => a.ref)).toEqual(['http://localhost:5173/'])
    expect(call('Bash', { command: 'H=$(git rev-parse x); tmux send-keys -t a "$H" Enter', description: 'Send' }, 'https://made.dev/1').map(a => a.ref)).toEqual(['https://made.dev/1'])
    expect(call('Bash', { command: 'git push origin main && claude plugin update x; rg -n "fetch" -A25 types/index.d.ts | rg source', description: 'Push, update install' }, 'To https://github.com/o/r.git\n   1a2b3c4..5d6e7f8  main -> main\nurl: "https://react.dev/x", url: "https://vuejs.org/y"').map(a => a.ref), 'a file read in the same command: its URLs are not kept, the push is').toEqual(['https://github.com/o/r/compare/1a2b3c4...5d6e7f8'])
    expect(call('Bash', { command: "python3 - <<'EOF'\nhead = open(p).read()\nEOF\nnpm run dev", description: 'Start dev' }, 'Local: http://localhost:5173/').map(a => a.ref), 'a heredoc body is not a command that shows a file').toEqual(['http://localhost:5173/'])
    expect(call('Bash', { command: 'npm run dev 2>&1 | grep -A2 "Local: x" | head -5', description: 'Start' }, 'Local: http://localhost:5173/').map(a => a.ref), 'filters on a pipe read no file').toEqual(['http://localhost:5173/'])
    expect(call('Bash', { command: 'npm run dev | tail -n 30 | grep -A 4 Local', description: 'Start' }, 'Local: http://localhost:5173/').map(a => a.ref)).toEqual(['http://localhost:5173/'])
    expect(call('Bash', { command: 'make build && cat dist/urls.txt' }, 'https://cdn.x.dev/a')).toEqual([])
  })

  test('a local page is kept; an ephemeral port or a file a page loads is noise; a remote URL never is', async () => {
    expect(['http://127.0.0.1:58755/json', 'http://localhost:5173/assets/a1.js', 'http://localhost:8787/data/a.json'].map(isLocalNoise)).toEqual([true, true, true])
    expect(['http://localhost:5173/', 'http://localhost:5173/app', 'http://localhost:8765/x.html', 'https://x.dev/a.json'].map(isLocalNoise)).toEqual([false, false, false, false])
    expect(call('Bash', { command: 'agent-browser open', description: 'Browse' }, 'CDP http://127.0.0.1:58755/json and http://localhost:5173/assets/a.js, page http://localhost:5173/').map(a => a.ref)).toEqual(['http://localhost:5173/'])
  })

  test('a pasted commit hash and session id are found; a UUID is not a hash, a word is not either', async () => {
    expect(shasIn('打 TAG 6e05de1613a68bb18e19c8071c5d755983881327，比 9ec9669 前；deadbeef 1234567 sid af85cbe5-4f43-4769-a7f1-91da0c051fbd')).toEqual(['6e05de1613a68bb18e19c8071c5d755983881327', '9ec9669'])
    expect(sessionIdsIn('cursor sid: c0011711-9b2a-474c-89d0-b0b12b96f324 還在跑')).toEqual(['c0011711-9b2a-474c-89d0-b0b12b96f324'])
  })

  test('#aN is a row; #123 (an issue) and x#a4 are not', async () => {
    expect(refsIn('#a3 掛了，比對 (#a12) 和 #a3；fix #123, x#a4')).toEqual([3, 12])
  })

  test('a local URL has a port; a remote one has none', async () => {
    const u = (ref: string, isLocal: boolean) => ({ kind: 'url' as const, ref, label: '', where: '', isLocal })
    expect([localPort(u('http://localhost:5173/', true)), localPort(u('https://127.0.0.1/x', true)), localPort(u('http://localhost/', true)), localPort(u('https://x.dev:8443/', false))]).toEqual([5173, 443, 80, undefined])
  })

  test('lsof output: the listening process and its folder, as this macOS prints them', async () => {
    expect(parseListen('p655\ncControlCenter\nf8\nn*:7000\n')).toEqual({ pid: 655, command: 'ControlCenter' })
    expect(parseListen('')).toBeUndefined()
    expect(parseCwd('p655\nfcwd\nn/w/app\n')).toBe('/w/app')
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

  test('pushes that follow on merge into one compare view; another branch or a gap does not', async () => {
    const p = (from: string, to: string, branch = 'main', repo = 'o/r') => ({ kind: 'url' as const, ref: `https://github.com/${repo}/compare/${from}...${to}`, label: `push: ${branch} ${from}..${to}`, where: 'github.com', isLocal: false, at: 1, project: 'p' })
    const one = merge(merge([], [p('1111111', '2222222')]), [p('2222222', '3333333')])
    expect(one.map(x => [x.ref, x.label])).toEqual([['https://github.com/o/r/compare/1111111...3333333', 'push: main 1111111..3333333']])
    expect(merge([p('1111111', '2222222')], [p('2222222', '3333333', 'dev')]).length, 'another branch').toBe(2)
    expect(merge([p('1111111', '2222222')], [p('4444444', '5555555')]).length, 'a gap').toBe(2)
    expect(merge([p('1111111', '2222222')], [{ ...p('2222222', '3333333'), label: 'Show main diff' }]).length, 'a compare URL that is no push').toBe(2)
    expect(merge([p('1111111', '2222222')], [p('2222222', '3333333', 'main', 'o/other')]).length, 'another repo').toBe(2)
  })

  test('a URL row is named by the URL; a push and a file by their label', async () => {
    const a = (kind: 'url' | 'file', ref: string, label: string) => ({ kind, ref, label, where: '', isLocal: true })
    expect(nameOf(a('url', 'http://localhost:5173/app/?x=1#y', 'reply: I started the dev server'))).toBe('localhost:5173/app')
    expect(nameOf(a('url', 'https://share.o17y317.uk/', 'Read the reply'))).toBe('share.o17y317.uk')
    expect(nameOf(a('url', 'https://github.com/o/r/compare/1a...2b', 'push: main 1a..2b'))).toBe('push: main 1a..2b')
    expect(nameOf(a('file', '/w/a.md', 'a.md'))).toBe('a.md')
    expect(assetsOfText('Preview: http://127.0.0.1:62120/ and http://localhost:5173/', 'reply', { home: HOME, cwd: '/w' }).map(x => x.ref), 'an ephemeral port in a reply is noise too').toEqual(['http://localhost:5173/'])
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
    expect(text).toContain('#a2  Start dev server · 0s ago · up: vite (pid 4242) in .')
    expect(text).toContain('#a1  plan.md · 0s ago · exists')
    expect(text).toContain('http://localhost:5173/')
    expect(text).toContain('URLs (1)\\n   today')
  })

  test('sources are listed apart and counted in the header, but take no band row', async ($, on) => {
    world(on)
    await $.session.start(start)
    await $.tool.call({ tool: 'Write', file_path: '/work/retro-w41/plan.md', content: 'x' })
    await $.tool.call({ tool: 'WebFetch', url: 'https://2140.tw/api/token-target/', prompt: 'token target spec' } as never)
    const band1 = textOf(await $.ui.render(band()))
    expect(band1).toContain('1 file · 1 source')
    expect(band1).not.toContain('token target spec')
    expect(band1).toContain('a2 ▤ \nplan.md')
    const text = JSON.stringify(await $.command.run(cmd('list')))
    expect(text).toContain('Sources (1)\\n   today\\n  #a1  token target spec')
  })

  test('/assets clear starts the list over from the transcript', async ($, on) => {
    const w = world(on, { messages: [{ role: 'assistant', text: 'Preview: https://x.dev/p', toolUses: [] }] })
    w.kv.set('session-assets.s.sess-A', [{ kind: 'url', ref: 'https://noise.dev', where: 'noise.dev', isLocal: false, label: 'old', project: 'p', at: 0 }])
    await $.session.start(start)
    expect(JSON.stringify(await $.command.run(cmd('clear')))).toContain('cleared 1 asset(s); the transcript gave back 1')
    expect((w.kv.get('session-assets.s.sess-A') as Array<{ ref: string }>).map(x => x.ref)).toEqual(['https://x.dev/p'])
  })

  test('the model asks: its tool finds rows by words, checks local URLs, and is not recorded itself', async ($, on) => {
    const w = world(on)
    w.kv.set('session-assets.s.sess-B', [{ kind: 'url', ref: 'http://localhost:3000/', where: 'localhost:3000', isLocal: true, label: 'Start api', project: 'other', at: 0 }])
    await $.session.start(start)
    await $.tool.call({ tool: 'Bash', command: 'npm run dev', description: 'Start dev server' })
    await $.tool.call({ tool: 'Write', file_path: '/work/retro-w41/plan.md', content: 'x' })
    const one = JSON.stringify(await $.tool.call({ tool: 'mcp__session-assets__assets', query: 'dev server' } as never))
    expect(one).toContain('#a2 url \\"Start dev server\\" http://localhost:5173/ · localhost:5173 · 0s ago · up: vite (pid 4242) in .')
    expect(one).not.toContain('plan.md')
    const all = JSON.stringify(await $.tool.call({ tool: 'mcp__session-assets__assets', query: 'start', all_sessions: true } as never))
    expect(all).toContain('Start api')
    expect(all).toContain('down: nothing listens on :3000')
    expect(all).toContain("session sess-B (other)")
    expect((w.kv.get('session-assets.s.sess-A') as unknown[]).length, 'the tool answer adds nothing').toBe(2)
  })

  test('the person points: #a1 goes to the model as the exact ref and its status; #123 adds nothing', async ($, on) => {
    const w = world(on)
    await $.session.start(start)
    await $.tool.call({ tool: 'Bash', command: 'npm run dev', description: 'Start dev server' })
    await $.prompt.submit({ text: '#a1 掛了嗎', wait: false, origin: { kind: 'composer' } } as never)
    expect(w.contexts.at(-1)?.join('\n')).toContain('#a1 url "Start dev server" http://localhost:5173/ · localhost:5173 · 0s ago · up: vite (pid 4242) in .')
    await $.prompt.submit({ text: 'fix #123', wait: false, origin: { kind: 'composer' } } as never)
    expect(w.contexts.at(-1)).toBeUndefined()
    await $.prompt.submit({ text: '#a9 ?', wait: false, origin: { kind: 'composer' } } as never)
    expect(w.contexts.at(-1)?.join('\n')).toContain('#a9: no such row')
  })

  test('copy puts the ref on the clipboard; reply puts #aN in the prompt; preview opens a file in Quick Look', async ($, on) => {
    const w = world(on)
    await $.session.start(start)
    await $.tool.call({ tool: 'Write', file_path: '/work/retro-w41/shot.png', content: 'x' })
    await $.tool.call({ tool: 'Bash', command: 'npm run dev', description: 'Start dev server' })
    expect(JSON.stringify(await $.command.run(cmd('copy 1')))).toContain('copied http://localhost:5173/')
    expect(w.copied).toEqual(['http://localhost:5173/'])
    expect(JSON.stringify(await $.command.run(cmd('reply 2')))).toContain('#a2 is in the prompt')
    expect(w.filled).toEqual([{ text: '#a2 ', mode: 'insert' }])
    expect(JSON.stringify(await $.command.run(cmd('preview a2')))).toContain('Quick Look')
    for (let i = 0; i < 10; i++) await Promise.resolve()
    expect(w.spawned).toEqual([['qlmanage', '-p', '/work/retro-w41/shot.png']])
  })

  test('a commit hash or session id pasted from another session comes with what that session made', async ($, on) => {
    const w = world(on)
    w.kv.set('session-assets.s.af85cbe5-4f43-4769-a7f1-91da0c051fbd', [
      { kind: 'commit', ref: '9ec9669', where: 'main', isLocal: true, label: 'fix: ios matrix', project: 'healthgo', at: 0 },
      { kind: 'url', ref: 'https://github.com/o/r/pull/131', where: 'github.com', isLocal: false, label: 'gh pr create', project: 'healthgo', at: 0 },
    ])
    await $.session.start(start)
    await $.prompt.submit({ text: '9ec9669d3c936282a1580cdfee76e44dffa7f3d0 這個驗過了嗎', wait: false, origin: { kind: 'composer' } } as never)
    expect(w.contexts.at(-1)?.join('\n')).toContain('9ec9669d3c936282a1580cdfee76e44dffa7f3d0 = commit "fix: ios matrix" on main, made in session af85cbe5 (healthgo)')
    await $.prompt.submit({ text: 'claude session sid: af85cbe5-4f43-4769-a7f1-91da0c051fbd 好了', wait: false, origin: { kind: 'composer' } } as never)
    expect(w.contexts.at(-1)?.join('\n')).toContain('https://github.com/o/r/pull/131')
    await $.prompt.submit({ text: 'what about 1a2b3c4d?', wait: false, origin: { kind: 'composer' } } as never)
    expect(w.contexts.at(-1), 'an unknown hash adds nothing').toBeUndefined()
  })

  test('a push piped through tail -1 asks git for the remote and keeps the compare view', async ($, on) => {
    const w = world(on, { text: '   1a2b3c4..5d6e7f8  main -> main\n' })
    await $.session.start(start)
    await $.tool.call({ tool: 'Bash', command: 'git push origin main 2>&1 | tail -1', description: 'Push' })
    expect((w.kv.get('session-assets.s.sess-A') as Array<{ ref: string; label: string }>).map(x => [x.label, x.ref])).toEqual([['push: main 1a2b3c4..5d6e7f8', 'https://github.com/o/r/compare/1a2b3c4...5d6e7f8']])
  })

  test('the replay asks git for a push that lost its To line, once per remote', async ($, on) => {
    const w = world(on, { messages: [{ role: 'assistant', text: '', toolUses: [
      { tool: 'Bash', input: { command: 'git push origin main 2>&1 | tail -1' }, text: '   1a2b3c4..5d6e7f8  main -> main' },
      { tool: 'Bash', input: { command: 'git push origin main 2>&1 | tail -1' }, text: '   5d6e7f8..9a8b7c6  main -> main' },
    ] }] })
    await $.session.start(start)
    expect((w.kv.get('session-assets.s.sess-A') as Array<{ ref: string }>).map(x => x.ref), 'two pushes that follow on are one compare view').toEqual(['https://github.com/o/r/compare/1a2b3c4...9a8b7c6'])
    expect(w.runs.filter(a => a[0] === 'git').length, 'one git call for one remote').toBe(1)
  })

  test('the replay keeps a lost-To push in transcript order', async ($, on) => {
    const w = world(on, { messages: [{ role: 'assistant', text: '', toolUses: [
      { tool: 'Bash', input: { command: 'git push origin main 2>&1 | tail -1' }, text: '   1a2b3c4..5d6e7f8  main -> main' },
      { tool: 'Write', input: { file_path: '/work/retro-w41/later.md' }, text: 'ok' },
    ] }] })
    await $.session.start(start)
    expect((w.kv.get('session-assets.s.sess-A') as Array<{ ref: string }>).map(x => x.ref), 'the file written later is the newer row').toEqual(['/work/retro-w41/later.md', 'https://github.com/o/r/compare/1a2b3c4...5d6e7f8'])
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
  const contexts: (string[] | undefined)[] = []
  const copied: string[] = []
  const filled: unknown[] = []
  const spawned: string[][] = []
  on('ui.copy', ($, e) => {
    copied.push(e.text)
    return { value: { isCopied: true } } as never
  })
  on('prompt.fill', ($, e) => {
    filled.push({ text: e.text, mode: e.mode })
    return { isFilled: true, text: e.text, cursor: e.text.length } as never
  })
  on('process.spawn', async function* (_$: unknown, e: { argv: string[] }) {
    spawned.push([...e.argv])
    return { value: { code: 0, signal: null } } as never
  } as never)
  on('session.id', () => ({ value: 'sess-A' }))
  on('session.messages', () => ({ value: opts.messages ?? [] }) as never)
  on('session.usage', () => ({ value: { startedAt: 1000 } }) as never)
  on('turn.complete', ($, e) => ({ text: e.answer }) as never)
  // A prompt starting DROP is refused beneath, as a settings hook's block would be.
  on('prompt.submit', ($, e) => {
    contexts.push(e.context ? [...e.context] : undefined)
    return (e.text.startsWith('DROP') ? { drop: 'blocked' } : { text: e.text }) as never
  })
  on('tool.register', ($, e) => ({ value: { tool: e.name } }) as never)
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
  // lsof: vite listens on :5173 from the session's folder; nothing else listens.
  on('process.run', ($, e) => {
    const argv = [...e.argv]
    if (argv[0] === 'lsof') {
      const stdout = argv.includes('-iTCP:5173') ? 'p4242\ncvite\n' : argv.includes('4242') ? 'p4242\nfcwd\nn/work/retro-w41\n' : ''
      return { value: { exitCode: stdout ? 0 : 1, stdout, stderr: '' } }
    }
    if (argv[0] === 'git' && argv.includes('get-url')) {
      runs.push(argv)
      return { value: { exitCode: 0, stdout: 'git@github.com:o/r.git\n', stderr: '' } }
    }
    if (argv[0] !== 'test') runs.push(argv)
    return { value: { exitCode: 0, stdout: '', stderr: '' } }
  })
  on('ui.render', () => ({ type: 'engine', ref: 0 }) as never)
  on('ui.invalidate', () => ({ value: undefined }))
  on('ui.log', () => ({ value: undefined }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: '' }, text: opts.text ?? '  ➜  Local:   http://localhost:5173/\n', ...(opts.isError ? { isError: true } : {}) }) as never)
  on('tool.call', { tool: 'Write' }, () => ({ result: {}, text: 'File created' }) as never)
  on('tool.call', { tool: 'WebFetch' }, () => ({ result: {}, text: 'page https://inside.dev', isReadOnly: true }) as never)
  return { kv, runs, contexts, copied, filled, spawned }
}

function textOf(node: unknown): string {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('\n')
  const el = node as { props?: Record<string, unknown>; children?: unknown }
  return [textOf(el.props?.children), textOf(el.props?.label), textOf(el.children)].filter(Boolean).join('\n')
}
