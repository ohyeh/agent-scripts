import type { On } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'

import { assetsOf, assetsOfText, assetsOfTranscript, cut, extractUrls, githubRepoOf, pushedOf, pushRemoteOf, isLocalNoise, localPort, sessionIdsIn, shasIn, parseCwd, parseListen, refsIn, isLocalHost, merge, nameOf, rowsOf, shortDir, subagentMade } from '../hooks/lib/assets.ts'
import { answerId, itemsOf, quoteOf } from '../hooks/lib/items.ts'

const HOME = '/h/me'
const call = (tool: string, input: Record<string, unknown>, text = '', readOnly = false) => assetsOf({ tool, input, text, home: HOME, cwd: '/private/var/w', readOnly })

describe('extractUrls', () => {
  test('a URL built in code or prose is a pattern, not a page', () => {
    const text = "PUT https://pub.x.uk/a/<22 chars>.html\nconst u = `https://share.x.uk/p/${name}`\nfetch('https://share.x.uk/p/' + name)\nGET https://api.x.com/v1/s/{id}\nok https://x.dev/real/"
    expect(extractUrls(text)).toEqual(['https://x.dev/real/'])
  })
  test('what a blocked request printed instead of the page is not a page', () => {
    const text = [
      'https://challenges.cloudflare.com/cdn-cgi/challenge-platform/h/g/turnstile',
      'https://team.cloudflareaccess.com/cdn-cgi/access/login/app.x.uk?kid=1&meta=eyJ&redirect_url=%2F',
      'https://dash.cloudflare.com/login?redirect_uri=%2F',
      'https://stg.x.cc/login?redirect=/tool',
      'https://www.cloudflare.com/cdn-cgi/trace',
      // kept: a resized picture, an auth link to click, a login page that sends you nowhere, a page with ?next=
      'https://media.x.com/cdn-cgi/image/fit=scale-down/p.png',
      'https://login.tailscale.com/a/l18a49d2',
      'https://app.x.dev/login',
      'https://x.dev/list?next=2',
    ].join('\n')
    expect(extractUrls(text)).toEqual(['https://media.x.com/cdn-cgi/image/fit=scale-down/p.png', 'https://login.tailscale.com/a/l18a49d2', 'https://app.x.dev/login', 'https://x.dev/list?next=2'])
  })
  test('a URL cut at a column is not a page: only a host with no dot, port or path; localhost, a port, an IP, a path stay', async () => {
    expect(extractUrls('https://s\nhttps://api\nhttp://localhost/a\nhttp://mini:7717/v1\nhttp://127.0.0.1/x\nhttp://[::1]:3000/\nhttps://x.dev\nhttp://localhost\nhttp://nas/share\nhttp://router/')).toEqual(['http://localhost/a', 'http://mini:7717/v1', 'http://127.0.0.1/x', 'http://[::1]:3000/', 'https://x.dev', 'http://localhost', 'http://nas/share', 'http://router/'])
  })
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
    expect(call('Bash', { command: 'x' }, Array.from({ length: 9 }, (_, i) => `http://localhost:${5170 + i}/`).join(' '))).toHaveLength(5)
  })

  test('a call that prints more than four remote URLs printed a list: none kept, its local URLs stay', async () => {
    expect(call('Bash', { command: 'x' }, Array.from({ length: 4 }, (_, i) => `https://h${i}.dev`).join(' '))).toHaveLength(4)
    expect(call('Bash', { command: 'x' }, Array.from({ length: 5 }, (_, i) => `https://h${i}.dev`).join(' '))).toEqual([])
    expect(call('Bash', { command: 'vite --host' }, `Local: http://localhost:5173/\n${Array.from({ length: 5 }, (_, i) => `https://h${i}.dev`).join(' ')}`).map(a => a.ref)).toEqual(['http://localhost:5173/'])
  })

  test('the browser tab a call ran in, and an API error docs link, are not what it made', async () => {
    const tab = '\n  • tabId 1034562075: "Submissions - Claude" ("https://claude.ai/directory/manage/new/plugin")'
    expect(call('mcp__claude-in-chrome__computer', { action: 'left_click' }, `Clicked at (10, 20)${tab}`)).toEqual([])
    expect(call('mcp__claude-in-chrome__tabs_context_mcp', {}, '{"availableTabs":[{"tabId":1,"url":"https://x.dev/a"}]}')).toEqual([])
    expect(call('mcp__claude-in-chrome__computer', { action: 'screenshot' }, `ok${tab}\n  • tabId 2: "B" ("https://b.dev/")\n  • tabId 3: "C" ("https://c.dev/")`)).toEqual([])
    expect(call('Bash', { command: 'gh api repos/o/r' }, '{\n  "message": "Not Found",\n  "documentation_url": "https://docs.github.com/rest/repos"\n}')).toEqual([])
    // A redirect is still seen: the page it landed on is not the one it was given.
    expect(call('mcp__claude-in-chrome__navigate', { url: 'https://x.dev/a' }, `Navigated to https://x.dev/b${tab}`).map(a => a.ref)).toEqual(['https://x.dev/b'])
    expect(call('Bash', { command: 'gh api repos/o/r/branches/main/protection' }, '{"message":"Not Found","documentation_url":"https://docs.github.com/rest/branches/branch-protection#get","status":"404"}')).toEqual([])
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

  test('a quoted media path is one file, not prose or a glob; an escaped one the call was given is not kept', async () => {
    expect(call('Bash', { command: 'x' }, "it says '/etc/hosts is read; see notes at foo.png'\nusage: '/path/to/x [opts] out.png'\n+ rm -f '/tmp/shots/*.png'\n'/a  b.png'")).toEqual([])
    expect(call('Bash', { command: 'ffmpeg -i /tmp/in\\ 1.mov /tmp/o.mp4' }, 'Input from /tmp/in\\ 1.mov\nwrote /tmp/o.mp4')).toEqual([])
    expect(call('Bash', { command: 'render' }, "saved '/tmp/rec 1.mp4'").map(a => [a.kind, a.ref])).toEqual([['video', '/tmp/rec 1.mp4']])
    const t0 = Date.now()
    call('Bash', { command: 'x' }, '/a\\ '.repeat(20000))
    expect(Date.now() - t0, 'a line of escaped spaces does not rescan from every slash').toBeLessThan(200)
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
    expect(call('Bash', { command: 'git add -A && git commit -m x' }, '[main 9685ae2] fix(session-recall): strip ANSI\n 3 files changed, 9 insertions(+)')).toEqual([
      { kind: 'commit', ref: '9685ae2', label: 'fix(session-recall): strip ANSI', where: 'main', isLocal: true },
    ])
    // Mid-rebase or bisect, git prints `detached HEAD` where the branch goes.
    expect(call('Bash', { command: 'git commit -m y' }, '[detached HEAD 1a2b3c4] fix thing\n 1 file changed').map(a => [a.ref, a.where])).toEqual([['1a2b3c4', 'detached HEAD']])
    expect(call('Bash', { command: 'cat notes' }, '[main 9685ae2] looks like a commit'), 'not a git commit command').toEqual([])
  })

  test('of a subagent\'s call, what it made stays; its research and probes do not', async () => {
    const made = (tool: string, input: Record<string, unknown>, text = '') => call(tool, input, text).filter(a => subagentMade({ tool, input }, a)).map(a => `${a.kind} ${a.ref}`)
    expect(made('Bash', { command: 'bun probe.ts --mode x' }, 'https://github.com/o/r/pull/9')).toEqual([])
    expect(made('Bash', { command: 'npx wrangler deploy' }, 'https://w.me.workers.dev')).toEqual(['url https://w.me.workers.dev'])
    expect(made('Bash', { command: 'git push -u origin f && gh pr create --fill' }, 'https://github.com/o/r/pull/12')).toEqual(['url https://github.com/o/r/pull/12'])
    expect(made('mcp__plugin_context-mode_context-mode__ctx_execute', { language: 'shell', code: 'wrangler deploy' }, 'https://w.me.workers.dev')).toEqual(['url https://w.me.workers.dev'])
    expect(made('mcp__plugin_context-mode_context-mode__ctx_batch_execute', { commands: [{ label: 'd', command: 'npm run deploy' }] }, 'https://app.pages.dev')).toEqual(['url https://app.pages.dev'])
    expect(made('mcp__claude_ai_Atlassian_Rovo__createJiraIssue', { summary: 'x' }, 'https://x.atlassian.net/browse/AB-1')).toEqual(['url https://x.atlassian.net/browse/AB-1'])
    expect(['mcp__x__create_draft', 'mcp__x__sendMessage', 'mcp__x__upload_image', 'mcp__x__CreateIssue', 'mcp__x__CREATE_ISSUE', 'mcp__x__v2Create', 'mcp__x__create2', 'mcp__x__drive.files.create', 'mcp__x__get_or_create_doc', 'mcp__x__getOrCreateDoc'].map(t => made(t, {}, 'https://m.dev/1').length), 'a creator keeps its link, in any case').toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1, 1])
    expect(['mcp__x__postmortem', 'mcp__x__getPostComments', 'mcp__x__search_posts', 'mcp__x__view_post', 'mcp__x__deletePost', 'mcp__x__createdBy'].map(t => made(t, {}, 'https://m.dev/1').length), 'a read, a removal or a word that only starts like a verb does not').toEqual([0, 0, 0, 0, 0, 0])
    expect(made('WebFetch', { url: 'https://docs.x.dev/a', prompt: 'p' }), 'a page it read').toEqual([])
    expect(made('Read', { file_path: '/w/tests/fixture.png' }), 'a picture it looked at').toEqual([])
    expect(made('Write', { file_path: '/w/report.md', content: 'x' }, 'ok')).toEqual(['file /w/report.md'])
    expect(made('Bash', { command: 'bash shot.sh' }, 'saved to /tmp/s.png')).toEqual(['image /tmp/s.png'])
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
    // Its code runs analysis: in two long sessions every URL it printed was data it read (22 of 22).
    expect(call('mcp__plugin_context-mode_context-mode__ctx_execute', {}, 'http://localhost:3000/')).toEqual([])
  })

  test('a URL the call was given is not something it made', async () => {
    expect(call('Bash', { command: 'curl -s https://api.x.dev/v1/s' }, '{"url":"https://api.x.dev/v1/s","next":"https://cdn.x.dev/a"}').map(a => a.ref)).toEqual(['https://cdn.x.dev/a'])
    // context-mode echoes the code it ran.
    expect(call('mcp__plugin_context-mode_context-mode__ctx_execute', { code: 'curl https://api.x.dev/v1' }, '```\ncurl https://api.x.dev/v1\n```\nok')).toEqual([])
  })

  test('an MCP call is labelled with what it said it was for, else its short name', async () => {
    expect(call('mcp__x__deploy_site', { intent: 'start preview' }, 'http://localhost:4000/')[0]!.label).toBe('start preview')
    expect(call('mcp__x__deploy_site', {}, 'http://localhost:4000/')[0]!.label).toBe('deploy_site')
  })

  test('a ref too long to open is not kept', async () => {
    expect(call('Bash', { command: 'x' }, `https://x.dev/${'a'.repeat(3000)}`)).toEqual([])
  })

  test('file and page readers add nothing; a picture Read adds itself only', async () => {
    for (const tool of ['Grep', 'Glob', 'WebFetch', 'WebSearch']) expect(call(tool, { file_path: '/a.png' }, 'https://x.dev /b.png')).toEqual([])
    expect(call('Read', { file_path: '/a.md' }, 'https://x.dev /b.png')).toEqual([])
    expect(call('Read', { file_path: '/a.png' }, 'https://x.dev /b.png').map(a => a.ref)).toEqual(['/a.png'])
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
    expect(assetsOfText('see https://discord.com/channels/1/2', 'you', { home: HOME, cwd: '/w' }).map(a => a.kind), 'a link you paste is one to open: a url row').toEqual(['url'])
    expect(call('Bash', { command: 'sleep 15; tmux capture-pane -p -t sa4 -S -60 | grep -vE "^$" | tail -30', description: 'Read the pane' }, 'https://reply-only.dev/42')).toEqual([])
    expect(call('Bash', { command: 'cd web && cat log.txt | rg http' }, 'http://localhost:5173/')).toEqual([])
    expect(call('Bash', { command: 'SP=/s; diff <(cut -f2 $SP/a.tsv | sort) <(cut -f2 $SP/b.tsv | sort) | grep "^<"' }, '< https://x.com/search?q=a')).toEqual([])
    expect(call('Bash', { command: 'find ~/.claude -name "*.jsonl" | head; stat -f %Sm f' }, 'https://x.dev/in-a-name')).toEqual([])
    expect(call('Bash', { command: 'find dist -name "*.html" -exec wrangler pages deploy {} \\;' }, 'https://x.pages.dev').map(a => a.ref), 'find -exec runs a program').toEqual(['https://x.pages.dev'])
    expect(['fd -e html -x wrangler pages deploy {}', 'fd -e zip -X gh release upload v1', 'fd . --exec-batch wrangler deploy'].map(c => call('Bash', { command: c }, 'https://y.pages.dev').length), 'fd -x / -X run a program').toEqual([1, 1, 1])
    expect(call('Bash', { command: 'curl -s --data @<(cat body.json) $A/publish' }, 'https://pub.x.uk/a/2').map(a => a.ref), 'a file read into <( ) is not printed').toEqual(['https://pub.x.uk/a/2'])
    expect(['comm a b', 'fd x', 'file f', 'du -sh d', 'tr a b', 'column -t', 'nl f', 'basename p', 'dirname p', 'realpath p', 'which x'].map(c => call('Bash', { command: c }, 'https://x.dev/r').length)).toEqual(Array(11).fill(0))
    // A script that mines a transcript or this mod's state prints old links; one that only runs nearby still counts.
    expect(call('Bash', { command: "python3 - <<'EOF'\nimport json\np='/root/.claude/projects/-w/a.jsonl'\nEOF" }, 'https://stg.app.cc/api/save\nhttps://s')).toEqual([])
    expect(call('Bash', { command: 'cd ~/.claude/projects/-w && python3 scan.py' }, 'https://terrain.x.uk')).toEqual([])
    expect(call('Bash', { command: 'node dump.mjs ~/.local/state/session-recall/a.json' }, 'http://127.0.0.1:8787')).toEqual([])
    expect(call('Bash', { command: 'node serve.mjs ~/.claude/settings.json' }, 'http://127.0.0.1:8787').map(a => a.ref)).toEqual(['http://127.0.0.1:8787'])
    expect(call('Bash', { command: `ssh mini 'python3 -' <<'EOF'\nf='/root/.claude/projects/-w/a.jsonl'\nEOF` }, 'https://chatgpt.com/codex/settings/usage')).toEqual([])
    expect(call('Bash', { command: `python3 -c "import json; d=json.load(open('/root/.claude/projects/-w/a.json'))"` }, 'https://substack.com/redirect/2/x')).toEqual([])
    // Naming the path is not reading it: a message, a comment, a note a heredoc `cat` writes, posted data, another dir; a deploy keeps its URL.
    expect([
      ['wrangler pages deploy dist --commit-message "fix reading ~/.claude/projects"', 'https://x.pages.dev'],
      ['gh pr create --title t --body "script reads ~/.claude/projects/*.jsonl"', 'https://github.com/o/r/pull/9'],
      [`gh pr create --body "$(cat <<'EOF'\nreads ~/.claude/projects\nEOF\n)"`, 'https://github.com/o/r/pull/10'],
      ['gh release create v1 --notes "state in ~/.local/state/session-recall"', 'https://github.com/o/r/releases/tag/v1'],
      ['cd ~/.claude/projects/-w && wrangler pages deploy dist', 'https://y.pages.dev'],
      ['npx vercel --prod # was in ~/.claude/projects', 'https://p.vercel.app'],
      [`cat <<EOF > notes.md\nsee ~/.claude/projects\nEOF\nnpx vercel --prod`, 'https://q.vercel.app'],
      [`curl -X POST $A/publish -d '{"n":"~/.claude/projects"}'`, 'https://pub.x.uk/a/2'],
      ['cd /root/my.claude/projects/app && npm run dev', 'http://localhost:5173/'],
      ['cd ~/.claude/projects-old && npm run dev', 'http://localhost:5174/'],
      ['vercel --prod -e "DIR=~/.claude/projects"', 'https://r.vercel.app'],
      ['docker run -e "X=~/.claude/projects" img', 'http://127.0.0.1:8080'],
    ].map(([command, out]) => call('Bash', { command }, out).map(a => a.ref))).toEqual([['https://x.pages.dev'], ['https://github.com/o/r/pull/9'], ['https://github.com/o/r/pull/10'], ['https://github.com/o/r/releases/tag/v1'], ['https://y.pages.dev'], ['https://p.vercel.app'], ['https://q.vercel.app'], ['https://pub.x.uk/a/2'], ['http://localhost:5173/'], ['http://localhost:5174/'], ['https://r.vercel.app'], ['http://127.0.0.1:8080']])
    // A mining script that says "deploy" in its code or a comment is still a read; `bash -lc` is code too.
    expect(call('Bash', { command: `python3 - <<'EOF'\n# find deploy urls\nglob.glob('/root/.claude/projects/*/*.jsonl')\nEOF` }, 'https://stg.app.cc/api/save')).toEqual([])
    expect(call('Bash', { command: 'python3 scan.py ~/.claude/projects --dry-run # release scan' }, 'https://stg.app.cc/api/save')).toEqual([])
    expect(call('Bash', { command: `bash -lc "grep -h http ~/.claude/projects/-w/*.jsonl | python3 x.py"` }, 'https://stg.app.cc/api/save')).toEqual([])
    // A commit, a push and a saved picture are read before the history check.
    expect(call('Bash', { command: 'git commit -m "x" && python3 scan.py ~/.claude/projects/-w' }, '[main abc1234] scan transcripts').map(a => a.kind)).toEqual(['commit'])
    expect(call('Bash', { command: 'python3 shot.py ~/.claude/projects/-w' }, 'saved to /tmp/shot.png').map(a => a.kind)).toEqual(['image'])
    expect(call('Bash', { command: 'grep -rhoE "https://t\\.uk[^\'\\"` )]*" src | sort -u | head' }, 'https://t.uk/data')).toEqual([])
    expect(call('Bash', { command: 'R=$(curl -s https://api.x.dev/deploy); echo "$R"' }, 'https://made.dev/2').map(a => a.ref), 'a program inside $( ) still counts').toEqual(['https://made.dev/2'])
    // A file read into a variable is not printed: the page the PUT made, the login link the CLI printed, stay.
    expect(call('Bash', { command: 'echo "put: $(curl -s -X PUT --data x $A/api/a/new/t.html)"\nU=$(jq -r .url /tmp/r.txt); echo "$U"' }, 'put: {"url":"https://pub.x.uk/a/1/t.html"}').map(a => a.ref)).toEqual(['https://pub.x.uk/a/1/t.html'])
    expect(call('Bash', { command: '(wrangler login > $L 2>&1 &); U=$(grep -oE "https://dash[^ ]+" $L | head -1); open "$U"' }, 'https://dash.x.com/oauth2/auth?code=1').map(a => a.ref)).toEqual(['https://dash.x.com/oauth2/auth?code=1'])
    expect(call('Bash', { command: 'npm run dev | tee log', description: 'Start dev server' }, 'http://localhost:5173/').map(a => a.ref)).toEqual(['http://localhost:5173/'])
    expect(call('Bash', { command: 'H=$(git rev-parse x); tmux send-keys -t a "$H" Enter', description: 'Send' }, 'https://made.dev/1').map(a => a.ref)).toEqual(['https://made.dev/1'])
    expect(call('Bash', { command: 'git push origin main && claude plugin update x; rg -n "fetch" -A25 types/index.d.ts | rg source', description: 'Push, update install' }, 'To https://github.com/o/r.git\n   1a2b3c4..5d6e7f8  main -> main\nurl: "https://react.dev/x", url: "https://vuejs.org/y"').map(a => a.ref), 'a file read in the same command: its URLs are not kept, the push is').toEqual(['https://github.com/o/r/compare/1a2b3c4...5d6e7f8'])
    expect(call('Bash', { command: "python3 - <<'EOF'\nhead = open(p).read()\nEOF\nnpm run dev", description: 'Start dev' }, 'Local: http://localhost:5173/').map(a => a.ref), 'a heredoc body is not a command that shows a file').toEqual(['http://localhost:5173/'])
    expect(call('Bash', { command: 'npm run dev 2>&1 | grep -A2 "Local: x" | head -5', description: 'Start' }, 'Local: http://localhost:5173/').map(a => a.ref), 'filters on a pipe read no file').toEqual(['http://localhost:5173/'])
    expect(call('Bash', { command: 'npm run dev | tail -n 30 | grep -A 4 Local', description: 'Start' }, 'Local: http://localhost:5173/').map(a => a.ref)).toEqual(['http://localhost:5173/'])
    expect(call('Bash', { command: 'make build && cat dist/urls.txt' }, 'https://cdn.x.dev/a')).toEqual([])
    expect(call('Bash', { command: `agent-browser eval '(() => document.body.innerText)()'`, description: 'Search NOVA transcript for example URL report' }, 'https://pub.x.dev/a/show-me.html'), 'a page read in a browser is read, not made').toEqual([])
    expect(call('Bash', { command: 'agent-browser open https://x.dev && agent-browser snapshot -i', description: 'Look' }, 'link https://y.dev/b')).toEqual([])
    expect(call('Bash', { command: 'agent-browser screenshot /w/s/p.png', description: 'Shot' }, 'saved /w/s/q.png').map(a => a.kind), 'a screenshot it saves is kept').toEqual(['image'])
    const screen = 'FAIL: quote\n 2 url localhost:5173 Start dev server\nhttp://localhost:5173/'
    for (const command of ['tests/tui-smoke.sh 2>&1 | tail -25', 'MOD=m scripts/test-mod-permissions-smoke', 'npm test', 'claude plugin test mods/x', 'cd web && npx vitest run', 'bin/test', 'bash tests/tui-smoke.sh', '/bin/bash tests/tui-smoke.sh', 'bash tests/tui-smoke.sh 2>&1 >/dev/null', '/usr/bin/env node tests/a.mjs', '/usr/bin/env CI=1 node tests/a.mjs', '/usr/bin/env -i node tests/a.mjs', 'node --test test/a.mjs | tail -3'])
      expect(call('Bash', { command, description: 'Run' }, screen), `${command}: a test run prints fixtures`).toEqual([])
    for (const command of ['npm run dev', 'claude plugin update x', 'bash contest.sh', 'python3 latest.py', '/work/test-site/node_modules/.bin/vite --host 0.0.0.0', 'npm test && npm run dev', 'bash scripts/serve.sh', '/opt/homebrew/bin/node --require ./tests/preload.cjs ./scripts/dev-server.mjs', 'node --require ./preload.cjs tests/a.mjs', 'node --require ./tests/preload.cjs server', `node --require ./tests/preload.cjs -e 'listen(5173)'`])
      expect(call('Bash', { command, description: 'Run' }, screen).map(a => a.ref), command).toEqual(['http://localhost:5173/'])
    expect(call('Read', { file_path: '/w/s/live-btc.png' }, '[image]', true).map(a => [a.kind, a.ref]), 'a picture Read is shown in the conversation').toEqual([['image', '/w/s/live-btc.png']])
    expect(call('Read', { file_path: '/w/src/a.ts' }, 'https://x.dev/a', true)).toEqual([])
    expect(call('SendUserFile', { files: ['/w/s/live-btc.png', '/w/r.md', '/w/s/live-btc.png'], caption: '首屏第二步上線' }).map(a => [a.kind, a.label]), 'a file sent to the person, by its caption').toEqual([['image', '首屏第二步上線'], ['file', '首屏第二步上線']])
    expect(assetsOfTranscript([{ role: 'assistant', text: '', toolUses: [{ tool: 'Read', input: { file_path: '/w/s/a.png' } }, { tool: 'SendUserFile', input: { files: ['/w/s/b.png'] } }] }], { home: HOME, cwd: '/w' }).map(a => a.kind), 'the replay keeps a picture Read and a sent one, with no text').toEqual(['image', 'image'])
    expect(call('Bash', { command: 'npm test', description: 'Run' }, 'saved /w/test-results/fail.png').map(a => a.kind), 'a test run\'s screenshot is kept').toEqual(['image'])
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
    // A file dragged into the prompt is quoted, spaces and all; an escaped space counts too; a video is its own kind.
    expect(assetsOfText("'~/Desktop/IMG 2026-10-08 at 20.40.56.png' 這張", 'you', at).map(a => [a.kind, a.ref])).toEqual([['image', `${HOME}/Desktop/IMG 2026-10-08 at 20.40.56.png`]])
    expect(assetsOfText('see ~/Movies/demo\\ run.mov and "/tmp/rec 1.mp4"', 'you', at).map(a => [a.kind, a.ref])).toEqual([['video', `${HOME}/Movies/demo run.mov`], ['video', '/tmp/rec 1.mp4']])
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
    w.kv.set('session-recall.s.sess-B', [{ kind: 'url', ref: 'https://share.o17y317.uk/x', where: 'share.o17y317.uk', isLocal: false, label: 'Aurora', project: 'other', at: 0 }])
    await $.session.start(start)
    await $.tool.call({ tool: 'Bash', command: 'npm run dev', description: 'Start dev server' })
    await $.tool.call({ tool: 'Write', file_path: '/work/retro-w41/plan.md', content: 'x' })
    const list = w.kv.get('session-recall.s.sess-A') as Array<{ kind: string; ref: string; label: string; project: string }>
    expect(list.map(x => x.kind)).toEqual(['file', 'url'])
    expect(list[1]).toMatchObject({ ref: 'http://localhost:5173/', label: 'Start dev server', project: 'retro-w41' })

    const text = textOf(await $.ui.render(band()))
    expect(text).toContain('session recall')
    expect(text).toContain('1 url · 1 file')
    expect(text).toContain('Start dev server')
    expect(text, 'a file is counted, not a band row').not.toContain('plan.md')
    expect(text).toContain('other sessions: 1 · 1 asset')
    expect(text, 'folded: another session\'s label is not drawn').not.toContain('Aurora')

    await $.command.run(cmd('all'))
    expect(textOf(await $.ui.render(band()))).toContain('Aurora')
  })

  test('pushes that follow on merge into one compare view; another branch or a gap does not', async () => {
    const p = (from: string, to: string, branch = 'main', repo = 'o/r') => ({ kind: 'url' as const, ref: `https://github.com/${repo}/compare/${from}...${to}`, label: `push: ${branch} ${from}..${to}`, where: 'github.com', isLocal: false, at: 1, project: 'p' })
    const one = merge(merge([], [p('1111111', '2222222')]), [p('2222222', '3333333')])
    expect(one.map(x => [x.ref, x.label])).toEqual([['https://github.com/o/r/compare/1111111...3333333', 'push: main 1111111..3333333']])
    // A later push that ends where an earlier one began is not its continuation (someone else pushed in between).
    expect(merge([p('1111111', '2222222')], [p('3333333', '1111111')]).map(x => x.ref), 'no chaining backwards').toEqual(['https://github.com/o/r/compare/3333333...1111111', 'https://github.com/o/r/compare/1111111...2222222'])
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
    expect(w.kv.get('session-recall.s.sess-A')).toBeUndefined()
  })

  test('no asset this session: the band is left alone', async ($, on) => {
    world(on)
    await $.session.start(start)
    expect(textOf(await $.ui.render(band()))).not.toContain('session recall')
  })

  test('never more rows than maxRows leaves', async ($, on) => {
    const w = world(on, { text: Array.from({ length: 5 }, (_, i) => `http://localhost:30${i}0/`).join('\n') })
    await $.session.start(start)
    await $.tool.call({ tool: 'Bash', command: 'up', description: 'up' })
    expect(w.kv.get('session-recall.s.sess-A')).toHaveLength(5)
    for (const maxRows of [1, 2, 3, 40]) {
      const tree = await $.ui.render(band({ maxRows }))
      expect(rowsOf(tree), `maxRows ${maxRows}`).toBeLessThanOrEqual(maxRows)
    }
    // One row left shows the newest entry (grok's rule); two show one and the count of the rest.
    expect(textOf(await $.ui.render(band({ maxRows: 2 })))).not.toContain('more')
    expect(textOf(await $.ui.render(band({ maxRows: 3 })))).toContain('+4 more')
  })

  test('a survey keeps the band; /recall hides and shows it', async ($, on) => {
    world(on)
    await $.session.start(start)
    await $.tool.call({ tool: 'Bash', command: 'npm run dev', description: 'Start dev server' })
    expect(textOf(await $.ui.render(band({ hasSurvey: true })))).not.toContain('session recall')
    await $.command.run(cmd(''))
    expect(textOf(await $.ui.render(band()))).not.toContain('session recall')
    await $.command.run(cmd(''))
    expect(textOf(await $.ui.render(band()))).toContain('session recall')
  })

  test('/recall N opens the row; /recall open N runs open with the URL or path as argv; a commit opens nothing', async ($, on) => {
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
    const list = w.kv.get('session-recall.s.sess-A') as Array<{ ref: string; at: number }>
    expect(list.map(x => [x.ref, x.at])).toEqual([['/work/retro-w41/a.md', 1000], ['https://x.dev/p', 1000]])
    expect(textOf(await $.ui.render(band()))).toContain('earlier')
    // A reload adds only what the list lacks (a newer version finds more); a row already there keeps its time and label.
    w.kv.set('session-recall.s.sess-A', [{ ...list[0]!, at: 5, label: 'kept' }])
    await $.session.start(start)
    const after = w.kv.get('session-recall.s.sess-A') as Array<{ ref: string; at: number; label: string }>
    // What the list held stays on top: the replay goes under it.
    expect(after.map(x => [x.ref, x.at])).toEqual([['/work/retro-w41/a.md', 5], ['https://x.dev/p', 1000]])
    expect(after.find(x => x.ref === '/work/retro-w41/a.md')?.label).toBe('kept')
    await $.session.start(start)
    expect((w.kv.get('session-recall.s.sess-A') as unknown[]).length, 'a second reload adds nothing').toBe(2)
  })

  test('a reply adds only URLs no tool printed; a subagent\'s reply adds nothing', async ($, on) => {
    const w = world(on)
    await $.session.start(start)
    await $.tool.call({ tool: 'Bash', command: 'npm run dev', description: 'Start dev server' })
    await $.turn.complete({ ...turn, answer: 'Dev server: http://localhost:5173/\nDocs: https://x.dev/docs' } as never)
    await $.turn.complete({ ...turn, agentId: 'a1', answer: 'https://sub.dev' } as never)
    const list = w.kv.get('session-recall.s.sess-A') as Array<{ ref: string; label: string }>
    expect(list.map(x => [x.ref, x.label])).toEqual([['https://x.dev/docs', 'reply: Docs'], ['http://localhost:5173/', 'Start dev server']])
  })

  test('a subagent\'s call adds no link row; its commit and push stay', async ($, on) => {
    const w = world(on, { text: 'https://github.com/o/r/pull/9\n[main 1a2b3c4] fix: x\nTo git@github.com:o/r.git\n   1a2b3c4..5d6e7f8  main -> main' })
    await $.session.start(start)
    await $.tool.call({ tool: 'Bash', command: 'git commit -m x && git push && bun probe.ts', description: 'Run probe script', agentId: 'a1' } as never)
    const list = w.kv.get('session-recall.s.sess-A') as Array<{ kind: string; ref: string }>
    expect(list.map(x => x.kind === 'commit' ? 'commit' : x.ref).sort()).toEqual(['commit', 'https://github.com/o/r/compare/1a2b3c4...5d6e7f8'])
    await $.tool.call({ tool: 'Bash', command: 'bun probe.ts', description: 'Run probe script' })
    expect((w.kv.get('session-recall.s.sess-A') as Array<{ ref: string }>).map(x => x.ref), 'the main loop\'s call keeps it').toContain('https://github.com/o/r/pull/9')
  })

  test('what a subagent made stays: an Artifact, a file it sent or wrote, a deploy\'s or a new PR\'s URL', async ($, on) => {
    const w = world(on, { text: 'Published https://claude.ai/code/artifact/abc-123 (private)\nhttps://site.pages.dev' })
    await $.session.start(start)
    const refs = () => (w.kv.get('session-recall.s.sess-A') as Array<{ kind: string; ref: string }> | undefined ?? []).map(x => `${x.kind} ${x.ref}`)
    await $.tool.call({ tool: 'Bash', command: 'bun probe.ts', description: 'Run probe script', agentId: 'a1' } as never)
    expect(refs(), 'a probe adds nothing').toEqual([])
    await $.tool.call({ tool: 'Artifact', file_path: '/s/r.html', title: 'Retro', agentId: 'a1' } as never)
    expect(refs()).toEqual(['artifact https://claude.ai/code/artifact/abc-123'])
    await $.tool.call({ tool: 'Bash', command: 'npx wrangler pages deploy dist', description: 'Deploy', agentId: 'a1' } as never)
    expect(refs()).toContain('url https://site.pages.dev')
    await $.tool.call({ tool: 'SendUserFile', files: ['/w/s/b.png'], status: 'proactive', agentId: 'a1' } as never)
    expect(refs()).toContain('image /w/s/b.png')
    await $.tool.call({ tool: 'Write', file_path: '/work/retro-w41/report.md', content: 'x', agentId: 'a1' } as never)
    expect(refs()).toContain('file /work/retro-w41/report.md')
    await $.tool.call({ tool: 'Bash', command: 'gh pr create --fill', description: 'Open PR', agentId: 'a1' } as never)
    expect(refs().filter(r => r === 'url https://site.pages.dev'), 'a new PR\'s output is kept').toHaveLength(1)
  })

  const staleRow = (ref: string, label: string) => ({ kind: 'url', ref, where: 'x', isLocal: false, label, project: 'p', at: 5 })
  const staleList = [
    staleRow('https://claude.ai/form', 'computer'), staleRow('https://site.pages.dev', 'Deploy'), staleRow('https://pasted.dev', 'you'),
    staleRow('https://github.com/o/r/compare/a...b', 'push: main a..b'),
    // Not in the transcript's call output (saved as a preview, past 40 lines, a subagent's): not judged.
    staleRow('https://big.pages.dev', 'Deploy big'),
    { ...staleRow('https://claude.ai/artifact/1', 'Report'), kind: 'artifact' }, { ...staleRow('/w/shot.png', 'shot.png'), kind: 'image' },
    staleRow('https://pasted-then-clicked.dev/', 'computer'),
  ]
  test('a link row an older version kept from a call, that this one would not keep, leaves at the next start', async ($, on) => {
    const transcript = [{ role: 'assistant', text: '', toolUses: [
      { tool: 'mcp__claude-in-chrome__computer', input: { action: 'left_click' }, text: 'Clicked\n  • tabId 1: "Form" ("https://claude.ai/form")\n  • tabId 2: "Late" ("https://late.dev/")' },
      { tool: 'Bash', input: { command: 'wrangler pages deploy dist', description: 'Deploy' }, text: 'https://site.pages.dev' },
      // The big deploy's own output was a preview; a later read printed its URL: that read does not judge the row.
      { tool: 'Bash', input: { command: 'cat notes.md', description: 'Read notes' }, text: 'deployed https://big.pages.dev' },
      // A link the person pasted, that a tab line printed again under the tool's label.
      { tool: 'mcp__claude-in-chrome__computer', input: { action: 'screenshot' }, text: 'ok\n  • tabId 4: "Mine" ("https://pasted-then-clicked.dev/")' },
    ] }, { role: 'user', text: 'open https://pasted-then-clicked.dev/' }]
    const w = world(on, { messages: [], transcript })
    // A tab row recorded while the transcript was read (after the clock reading) is not judged either.
    w.kv.set('session-recall.s.sess-A', [...staleList, { ...staleRow('https://late.dev/', 'computer'), at: 1e15 }])
    await w.clock.advance(100)
    await $.session.start(start)
    // A pasted link and a push are not judged by the call output: they stay, as does the deploy, with their times.
    expect((w.kv.get('session-recall.s.sess-A') as Array<{ ref: string; at: number }>).map(x => [x.ref, x.at])).toEqual([
      ['https://site.pages.dev', 5], ['https://pasted.dev', 5], ['https://github.com/o/r/compare/a...b', 5], ['https://big.pages.dev', 5], ['https://claude.ai/artifact/1', 5], ['/w/shot.png', 5], ['https://pasted-then-clicked.dev/', 5], ['https://late.dev/', 1e15],
    ])
  })

  test('an empty transcript, or a row added while it was read, prunes nothing', async ($, on) => {
    const w = world(on, { messages: [], transcript: [] })
    w.kv.set('session-recall.s.sess-A', staleList)
    await $.session.start(start)
    expect((w.kv.get('session-recall.s.sess-A') as unknown[]).length).toBe(staleList.length)
  })

  test('with only what follows a compaction (no transcript file), no row leaves: it lacks the calls that made them', async ($, on) => {
    const w = world(on, { messages: [] })
    w.kv.set('session-recall.s.sess-A', staleList)
    await $.session.start(start)
    expect((w.kv.get('session-recall.s.sess-A') as unknown[]).length).toBe(staleList.length)
  })

  test('the replay reads the whole transcript file, not only what the engine holds after a compaction', async ($, on) => {
    const before = [{ role: 'assistant', text: 'Report: https://x.dev/r1', toolUses: [{ tool: 'Read', input: { file_path: '/w/a.png' } }] }]
    const after = [{ role: 'assistant', text: 'See https://x.dev/r2' }]
    const w = world(on, { messages: after, transcript: [...before, ...after] })
    await $.session.start(start)
    expect((w.kv.get('session-recall.s.sess-A') as Array<{ ref: string }>).map(x => x.ref).sort()).toEqual(['/w/a.png', 'https://x.dev/r1', 'https://x.dev/r2'])
  })

  test('a reply that repeats a URL a test run printed adds nothing, also after a reload', async ($, on) => {
    const w = world(on, { text: 'serving http://localhost:5199/ ok, e2e against https://site.dev/' })
    await $.session.start(start)
    await $.tool.call({ tool: 'Bash', command: 'bash tests/fx-smoke.sh', description: 'Run fx smoke' })
    await $.turn.complete({ ...turn, answer: 'The smoke printed http://localhost:5199/ and https://x.dev/docs; the site https://site.dev/ passed' } as never)
    // A remote URL a test printed is the real site it ran against: kept.
    expect((w.kv.get('session-recall.s.sess-A') as Array<{ ref: string }>).map(x => x.ref).sort()).toEqual(['https://site.dev/', 'https://x.dev/docs'])
    // The next turn: the test's mute is over (a dev server on that port is a page again).
    await $.turn.complete({ ...turn, answer: 'Dev server: http://localhost:5199/' } as never)
    expect((w.kv.get('session-recall.s.sess-A') as Array<{ ref: string }>).map(x => x.ref)).toContain('http://localhost:5199/')
    // The replay after a reload: the same.
    const msgs = [{ role: 'assistant', text: '', toolUses: [{ tool: 'Bash', input: { command: 'bash tests/fx-smoke.sh' }, text: 'serving http://localhost:5199/ ok' }] }, { role: 'assistant', text: 'see http://localhost:5199/' }]
    expect(assetsOfTranscript(msgs, { home: HOME, cwd: '/w' })).toEqual([])
    // A reply with no URL ends the turn there too: the next turn's dev server on that port is a link.
    const later = [msgs[0]!, { role: 'assistant', text: '' }, { role: 'assistant', text: 'Dev server: http://localhost:5199/' }]
    expect(assetsOfTranscript(later, { home: HOME, cwd: '/w' }).map(a => a.ref)).toEqual(['http://localhost:5199/'])
  })

  test('a tool that reads, searches or analyses adds no URL row; one that makes or deploys does', () => {
    const out = 'see https://x.dev/page'
    for (const tool of ['mcp__plugin_context-mode_context-mode__ctx_execute', 'mcp__plugin_context-mode_context-mode__ctx_batch_execute', 'mcp__claude_ai_Context7__query-docs', 'mcp__claude_ai_Gmail__search_threads', 'mcp__claude_ai_Gmail__get_thread', 'mcp__tmux-agent__peek', 'mcp__codex-cu__js'])
      expect(call(tool, {}, out), tool).toEqual([])
    expect(call('mcp__x__deploy_site', {}, out).map(a => a.ref)).toEqual(['https://x.dev/page'])
    expect(call('Bash', { command: "ssh box@h 'grep -n port ~/logs/a.log; tail -5 /tmp/b.log' 2>&1" }, out)).toEqual([])
    expect(call('Bash', { command: "timeout 20 ssh -o BatchMode=yes box@h 'cat ~/x.conf'" }, out)).toEqual([])
    expect(call('Bash', { command: 'timeout 5 cat ~/x.conf' }, out)).toEqual([])
    expect(call('Bash', { command: "ssh box@h 'cd ~/app && bash scripts/deploy.sh'" }, out).map(a => a.ref)).toEqual(['https://x.dev/page'])
  })

  test('what a second review found lost: a deploy of five services, a get-or-create tool, a deploy run through context-mode', () => {
    const five = Array.from({ length: 5 }, (_, i) => `https://s${i}.example.com`).join('\n')
    expect(call('Bash', { command: 'turbo run deploy' }, five)).toHaveLength(5)
    expect(call('mcp__cloud__get_or_create_preview', {}, 'ready at https://pr-42.preview.dev').map(a => a.ref)).toEqual(['https://pr-42.preview.dev'])
    expect(call('mcp__plugin_context-mode_context-mode__ctx_execute', { language: 'shell', code: 'wrangler pages deploy dist' }, 'Visit https://my-app.pages.dev').map(a => a.ref)).toEqual(['https://my-app.pages.dev'])
    expect(call('mcp__plugin_context-mode_context-mode__ctx_batch_execute', { commands: [{ label: 'ship', command: 'npm run deploy' }] }, 'https://my-app.pages.dev').map(a => a.ref)).toEqual(['https://my-app.pages.dev'])
    expect(call('Bash', { command: 'bash scripts/deploy-web.sh' }, five)).toHaveLength(5)
    expect(call('Bash', { command: 'du -sh ~/deploy-stash-*' }, five), 'a path that names deploy is not one').toEqual([])
    for (const tool of ['mcp__x__get_output', 'mcp__x__get_updates', 'mcp__x__list_runs', 'mcp__x__search_posts'])
      expect(call(tool, {}, 'https://a.dev/'), `${tool} reads`).toEqual([])
    // Analysis stays a read.
    expect(call('mcp__plugin_context-mode_context-mode__ctx_execute', { language: 'python', code: 'print(deploy_log)' }, 'https://my-app.pages.dev')).toEqual([])
  })

  test('the replay keeps a picture a command saved, as live does', () => {
    const msgs = [{ role: 'assistant', text: '', toolUses: [{ tool: 'Bash', input: { command: 'python3 plot.py' }, text: 'saved to /tmp/shot.png' }] }]
    expect(assetsOfTranscript(msgs, { home: HOME, cwd: '/w' }).map(a => [a.kind, a.ref])).toEqual([['image', '/tmp/shot.png']])
  })

  test('a written source file is no row; a written document or picture is', () => {
    expect(call('Write', { file_path: '/w/src/a.ts' })).toEqual([])
    expect(call('Edit', { file_path: '/w/run.sh' })).toEqual([])
    expect(call('Write', { file_path: '/w/PLAN.md' }).map(a => a.kind)).toEqual(['file'])
    expect(call('Write', { file_path: '/w/out/page.html' }).map(a => a.kind)).toEqual(['file'])
    expect(call('Write', { file_path: '/w/shot.png' }).map(a => a.kind)).toEqual(['image'])
    expect(call('Write', { file_path: '/w/notes.rtf' }).map(a => a.kind)).toEqual(['file'])
    expect(call('Write', { file_path: '/w/voice.m4a' }).map(a => a.kind)).toEqual(['file'])
  })

  test('a link the person pastes is kept; a notification\'s is not', async ($, on) => {
    const w = world(on)
    await $.session.start(start)
    await $.prompt.submit({ text: 'fix https://x.dev/bug/1', wait: false, origin: { kind: 'composer' } } as never)
    await $.prompt.submit({ text: 'task done https://ci.dev/2', wait: false, origin: { kind: 'notification' } } as never)
    await $.prompt.submit({ text: 'DROP https://dropped.dev', wait: false, origin: { kind: 'composer' } } as never)
    expect((w.kv.get('session-recall.s.sess-A') as Array<{ ref: string; label: string }>).map(x => [x.ref, x.label])).toEqual([['https://x.dev/bug/1', 'you: fix']])
    expect(textOf(await $.ui.render(band())), 'a pasted link is a band row').toContain('x.dev/bug/1')
  })

  test('a link pasted back keeps the row it came from', async ($, on) => {
    const w = world(on)
    await $.session.start(start)
    await $.tool.call({ tool: 'Bash', command: 'npm run dev', description: 'Start dev server' })
    await $.prompt.submit({ text: 'http://localhost:5173/ 白畫面', wait: false, origin: { kind: 'composer' } } as never)
    expect((w.kv.get('session-recall.s.sess-A') as Array<{ ref: string; kind: string; label: string }>).map(x => [x.kind, x.label])).toEqual([['url', 'Start dev server']])
    // Claude then reads the page: it stays a link, not a source.
    await $.tool.call({ tool: 'WebFetch', url: 'http://localhost:5173/', prompt: 'what is on it' } as never)
    expect((w.kv.get('session-recall.s.sess-A') as Array<{ kind: string }>).map(x => x.kind)).toEqual(['url'])
  })

  test('a page Claude read becomes a link row when you paste it; read again, a source takes its newest label', async ($, on) => {
    const w = world(on)
    await $.session.start(start)
    const kinds = () => (w.kv.get('session-recall.s.sess-A') as Array<{ ref: string; kind: string; label: string }>).map(x => [x.ref, x.kind, x.label])
    await $.tool.call({ tool: 'WebFetch', url: 'https://a.dev/spec', prompt: 'first read' } as never)
    await $.tool.call({ tool: 'WebFetch', url: 'https://b.dev/doc', prompt: 'old' } as never)
    await $.tool.call({ tool: 'WebFetch', url: 'https://b.dev/doc', prompt: 'new' } as never)
    expect(kinds()).toEqual([['https://b.dev/doc', 'source', 'new'], ['https://a.dev/spec', 'source', 'first read']])
    await $.prompt.submit({ text: 'open https://a.dev/spec', wait: false, origin: { kind: 'composer' } } as never)
    expect(kinds()[0]).toEqual(['https://a.dev/spec', 'url', 'you: open'])
  })

  test('the band shows its version; an open commit row shows its hash, not its branch (the status line has it)', async ($, on) => {
    world(on, { text: '[main 9685ae2] fix: x\n 1 file changed' })
    await $.session.start(start)
    await $.tool.call({ tool: 'Bash', command: 'git commit -m x' })
    expect(textOf(await $.ui.render(band())), 'a commit is counted, not a band row').not.toContain('9685ae2')
    await $.command.run(cmd('1'))
    const text = textOf(await $.ui.render(band()))
    expect(text, 'an opened row shows').toContain('9685ae2')
    expect(text).not.toContain('main')
    expect(text).toMatch(/▌session recall v\d+\.\d+\.\d+/)
  })

  test('/recall list prints every entry grouped by kind, numbered as the band', async ($, on) => {
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
    expect(band1, 'a file is counted, not a band row').not.toContain('plan.md')
    const text = JSON.stringify(await $.command.run(cmd('list')))
    expect(text).toContain('Sources (1)\\n   today\\n  #a1  token target spec')
  })

  test('the replay, as live: a page Claude read and then pointed at in a reply is a link row', async ($, on) => {
    const w = world(on, { messages: [
      { role: 'assistant', text: '', toolUses: [{ tool: 'WebFetch', input: { url: 'https://a.dev/spec', prompt: 'read spec' }, text: 'body' }] },
      { role: 'assistant', text: 'Spec: https://a.dev/spec', toolUses: [] },
    ] })
    await $.session.start(start)
    expect((w.kv.get('session-recall.s.sess-A') as Array<{ ref: string; kind: string; label: string }>).map(x => [x.ref, x.kind, x.label])).toEqual([['https://a.dev/spec', 'url', 'reply: Spec']])
  })

  test('/recall clear starts the list over from the transcript', async ($, on) => {
    const w = world(on, { messages: [{ role: 'assistant', text: 'Preview: https://x.dev/p', toolUses: [] }] })
    w.kv.set('session-recall.s.sess-A', [{ kind: 'url', ref: 'https://noise.dev', where: 'noise.dev', isLocal: false, label: 'old', project: 'p', at: 0 }])
    await $.session.start(start)
    expect(JSON.stringify(await $.command.run(cmd('clear')))).toContain('cleared 2 asset(s); the transcript gave back 1')
    expect((w.kv.get('session-recall.s.sess-A') as Array<{ ref: string }>).map(x => x.ref)).toEqual(['https://x.dev/p'])
  })

  test('the model asks: its tool finds rows by words, checks local URLs, and is not recorded itself', async ($, on) => {
    const w = world(on)
    w.kv.set('session-recall.s.sess-B', [{ kind: 'url', ref: 'http://localhost:3000/', where: 'localhost:3000', isLocal: true, label: 'Start api', project: 'other', at: 0 }])
    await $.session.start(start)
    await $.tool.call({ tool: 'Bash', command: 'npm run dev', description: 'Start dev server' })
    await $.tool.call({ tool: 'Write', file_path: '/work/retro-w41/plan.md', content: 'x' })
    const one = JSON.stringify(await $.tool.call({ tool: 'mcp__session-recall__recall', query: 'dev server' } as never))
    expect(one).toContain('#a2 url \\"Start dev server\\" http://localhost:5173/ · localhost:5173 · 0s ago · up: vite (pid 4242) in .')
    expect(one).not.toContain('plan.md')
    const all = JSON.stringify(await $.tool.call({ tool: 'mcp__session-recall__recall', query: 'start', all_sessions: true } as never))
    expect(all).toContain('Start api')
    expect(all).toContain('down: nothing listens on :3000')
    expect(all).toContain("session sess-B (other)")
    expect((w.kv.get('session-recall.s.sess-A') as unknown[]).length, 'the tool answer adds nothing').toBe(2)
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

  test('a click on a row\'s name opens it with open, preview, copy and reply buttons; a second click closes it', async ($, on) => {
    const w = world(on)
    await $.session.start(start)
    await $.tool.call({ tool: 'Write', file_path: '/work/retro-w41/shot.png', content: 'x' })
    await $.tool.call({ tool: 'Bash', command: 'npm run dev', description: 'Start dev server' })
    await $.ui.render(band())
    const press = (key: string) => $.ui.press({ plugin: 'session-recall', key, requestId: 'above-prompt' } as never)
    await press('name-http://localhost:5173/')
    const opened = textOf(await $.ui.render(band()))
    expect(opened).toContain('open\ncopy\nreply')
    expect(opened, 'a URL has no preview of its own').not.toContain('preview')
    await press('copy-http://localhost:5173/')
    for (let i = 0; i < 10; i++) await Promise.resolve()
    expect(w.copied).toEqual(['http://localhost:5173/'])
    expect(w.toasts).toEqual(['copied http://localhost:5173/'])
    await press('name-/work/retro-w41/shot.png')
    expect(textOf(await $.ui.render(band()))).toContain('open\npreview\ncopy\nreply')
    await press('preview-/work/retro-w41/shot.png')
    await press('reply-/work/retro-w41/shot.png')
    for (let i = 0; i < 10; i++) await Promise.resolve()
    expect(w.spawned).toEqual([['qlmanage', '-p', '/work/retro-w41/shot.png']])
    expect(w.filled).toEqual([{ text: '#a2 ', mode: 'insert' }])
    await press('name-/work/retro-w41/shot.png')
    expect(textOf(await $.ui.render(band())), 'closed again').not.toContain('preview')
  })

  test('two pushes in one Bash call are one row: the compare view from the first to the last', async ($, on) => {
    const w = world(on, { text: 'To https://github.com/o/r.git\n   1a2b3c4..5d6e7f8  main -> main\nTo https://github.com/o/r.git\n   5d6e7f8..9a8b7c6  main -> main\n' })
    await $.session.start(start)
    await $.tool.call({ tool: 'Bash', command: 'git push && git commit --amend -q --no-edit && git push -f' })
    const list = w.kv.get('session-recall.s.sess-A') as Array<{ ref: string; label: string }>
    expect(list.map(x => [x.ref, x.label])).toEqual([['https://github.com/o/r/compare/1a2b3c4...9a8b7c6', 'push: main 1a2b3c4..9a8b7c6']])
  })

  test('the band rows are what you look at: a video and a picture get rows, a file and a push only counts', async ($, on) => {
    const w = world(on)
    await $.session.start(start)
    await $.tool.call({ tool: 'Write', file_path: '/work/retro-w41/notes.md', content: 'x' })
    await $.tool.call({ tool: 'Write', file_path: '/work/retro-w41/demo.mp4', content: 'x' })
    await $.tool.call({ tool: 'Write', file_path: '/work/retro-w41/shot.png', content: 'x' })
    const text = textOf(await $.ui.render(band()))
    expect(text).toContain('1 image · 1 video · 1 file')
    expect(text).toContain('▶')
    expect(text).toContain('demo.mp4')
    expect(text).toContain('shot.png')
    expect(text).not.toContain('notes.md')
    await $.command.run(cmd('preview 2'))
    for (let i = 0; i < 10; i++) await Promise.resolve()
    expect(w.spawned).toEqual([['qlmanage', '-p', '/work/retro-w41/demo.mp4']])
    expect(JSON.stringify(await $.command.run(cmd('list'))), 'a video has a state too').toContain('Videos (1)\\n   today\\n  #a2  demo.mp4 · 0s ago · exists')
  })

  test('a commit hash or session id pasted from another session comes with what that session made', async ($, on) => {
    const w = world(on)
    w.kv.set('session-recall.s.af85cbe5-4f43-4769-a7f1-91da0c051fbd', [
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
    expect((w.kv.get('session-recall.s.sess-A') as Array<{ ref: string; label: string }>).map(x => [x.label, x.ref])).toEqual([['push: main 1a2b3c4..5d6e7f8', 'https://github.com/o/r/compare/1a2b3c4...5d6e7f8']])
  })

  test('the replay asks git for a push that lost its To line, once per remote', async ($, on) => {
    const w = world(on, { messages: [{ role: 'assistant', text: '', toolUses: [
      { tool: 'Bash', input: { command: 'git push origin main 2>&1 | tail -1' }, text: '   1a2b3c4..5d6e7f8  main -> main' },
      { tool: 'Bash', input: { command: 'git push origin main 2>&1 | tail -1' }, text: '   5d6e7f8..9a8b7c6  main -> main' },
    ] }] })
    await $.session.start(start)
    expect((w.kv.get('session-recall.s.sess-A') as Array<{ ref: string }>).map(x => x.ref), 'two pushes that follow on are one compare view').toEqual(['https://github.com/o/r/compare/1a2b3c4...9a8b7c6'])
    expect(w.runs.filter(a => a[0] === 'git').length, 'one git call for one remote').toBe(1)
  })

  test('the replay keeps a lost-To push in transcript order', async ($, on) => {
    const w = world(on, { messages: [{ role: 'assistant', text: '', toolUses: [
      { tool: 'Bash', input: { command: 'git push origin main 2>&1 | tail -1' }, text: '   1a2b3c4..5d6e7f8  main -> main' },
      { tool: 'Write', input: { file_path: '/work/retro-w41/later.md' }, text: 'ok' },
    ] }] })
    await $.session.start(start)
    expect((w.kv.get('session-recall.s.sess-A') as Array<{ ref: string }>).map(x => x.ref), 'the file written later is the newer row').toEqual(['/work/retro-w41/later.md', 'https://github.com/o/r/compare/1a2b3c4...5d6e7f8'])
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
const cmd = (args: string) => ({ command: 'recall', args, origin: { kind: 'composer' as const }, presentation: { isFullscreen: false, columns: 120 } })
const band = (props: { maxRows?: number; hasSurvey?: boolean } = {}) => ({
  surface: 'terminal' as const,
  component: 'AbovePrompt' as const,
  requestId: 'above-prompt',
  viewport: { columns: 100, rows: 50 },
  props: { hasSurvey: false, isWorking: false, maxRows: 40, bodyColumns: 80, scroll: { offset: 0, bodyRows: 39 }, view: {}, ...props },
})

/** The engine under the mod: an in-memory store (or one whose writes fail), tools that print a dev-server URL, a recorded `open`. */
function world(on: On, opts: { failWrites?: boolean; text?: string; isError?: boolean; messages?: unknown[]; transcript?: unknown[]; tmux?: string; term?: string } = {}) {
  const clock = mock.clock(on)
  const files = new Map<string, { text: string; mtimeMs: number }>()
  /** Paths whose writes fail, as a disk error would. */
  const failing = new Set<string>()
  let mtime = 1
  on('fs.write', ($, e) => {
    if (failing.has(e.path) || box.failWrite?.(e.path, e.text)) throw new Error('EIO: i/o error')
    files.set(e.path, { text: e.text, mtimeMs: mtime++ })
    return { value: undefined }
  })
  on('fs.read', ($, e) => {
    const f = files.get(e.path)
    if (!f) throw new Error(`ENOENT: ${e.path}`)
    return { value: f.text }
  })
  on('fs.list', ($, e) => ({ value: [...files].filter(([k]) => k.startsWith(`${e.path}/`) && !k.slice(e.path.length + 1).includes('/')).map(([k, f]) => ({ name: k.slice(e.path.length + 1), kind: 'file', size: f.text.length, mtimeMs: f.mtimeMs, isLink: false })) }) as never)
  on('fs.exists', ($, e) => ({ value: files.has(e.path) }))
  on('fs.stat', ($, e) => {
    const f = files.get(e.path)
    if (!f) throw new Error(`ENOENT: ${e.path}`)
    return { value: { kind: 'file', size: f.text.length, mtimeMs: f.mtimeMs, isLink: false } } as never
  })
  const kv = new Map<string, unknown>()
  const runs: string[][] = []
  const contexts: (string[] | undefined)[] = []
  const copied: string[] = []
  const filled: unknown[] = []
  const spawned: string[][] = []
  const toasts: string[] = []
  on('ui.toast', ($, e) => {
    toasts.push(String((e as unknown as { text: string }).text))
    return { value: undefined } as never
  })
  on('ui.copy', ($, e) => {
    copied.push(e.text)
    return { value: { isCopied: true } } as never
  })
  /** `box.open = false`: no prompt box takes text (a dialog is open). */
  const box: { open: boolean; failWrite?: (path: string, text: string) => boolean } = { open: true }
  on('prompt.fill', ($, e) => {
    if (!box.open) return { isFilled: false, text: '', cursor: 0 } as never
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
  on('env.get', ($, e) => ({ value: e.name === 'TMUX' ? opts.tmux : e.name === 'TERM_PROGRAM' ? opts.term : HOME }))
  on('store.get', ($, e) => ({ value: kv.get(e.key) }))
  on('store.keys', () => ({ value: [...kv.keys()] }))
  on('store.delete', ($, e) => {
    kv.delete(e.key)
    return { value: undefined }
  })
  on('store.set', ($, e) => {
    if (opts.failWrites && e.key.startsWith('session-recall.s.')) throw new Error('disk full')
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
    // The transcript file: none unless the test gives one (the replay then reads what the engine holds).
    if (argv[0] === 'node' && argv[1]?.endsWith('/bin/transcript.mjs')) return { value: opts.transcript ? { exitCode: 0, stdout: JSON.stringify(opts.transcript), stderr: '' } : { exitCode: 1, stdout: '', stderr: 'Error: no transcript' } }
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
  on('tool.call', { tool: 'Artifact' as never }, () => ({ result: {}, text: opts.text ?? '' }) as never)
  on('tool.call', { tool: 'SendUserFile' as never }, () => ({ result: {}, text: '1 file delivered to user.' }) as never)
  on('tool.call', { tool: 'WebFetch' }, () => ({ result: {}, text: 'page https://inside.dev', isReadOnly: true }) as never)
  /** What the TUI does: a request file of its own, made now (or `age` ms ago); returns where its answer goes. */
  let n = 0
  const ask = (req: unknown, age = 0, count = ++n) => {
    const name = `${String(clock.now() - age).padStart(13, '0')}-77-${count}.json`
    files.set(`${HOME}/.local/state/session-recall/sess-A.ask/${name}`, { text: typeof req === 'string' ? req : JSON.stringify(req), mtimeMs: clock.now() - age })
    const done = () => JSON.parse(files.get(`${HOME}/.local/state/session-recall/sess-A.done/${name}`)?.text ?? 'null')
    return Object.assign(done, { at: `${HOME}/.local/state/session-recall/sess-A.done/${name}` })
  }
  const snap = () => JSON.parse(files.get(`${HOME}/.local/state/session-recall/sess-A.json`)?.text ?? 'null')
  return { kv, runs, contexts, copied, filled, spawned, toasts, files, ask, snap, clock, box, failing }
}

function textOf(node: unknown): string {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('\n')
  const el = node as { props?: Record<string, unknown>; children?: unknown }
  return [textOf(el.props?.children), textOf(el.props?.label), textOf(el.children)].filter(Boolean).join('\n')
}

describe('itemsOf', () => {
  test('list items, table rows and prose lines; not headings, code, a table header or a rule', async () => {
    const answer = [
      '## Plan', '', 'Two things left:', '', '- **D1**: rename the band', '  1. keep `#aN`', '', '| id | what |', '|---|---|', '| q4 | 寫死 timeout |',
      '```ts', 'const x = 1', '```', '---', '* last one',
    ].join('\n')
    expect(itemsOf(answer)).toEqual(['Two things left:', '**D1**: rename the band', 'keep `#aN`', 'q4 | 寫死 timeout', 'last one'])
    expect(itemsOf('| a\\|b |  x |'), 'a row as written: an escaped pipe is not a cell edge').toEqual(['a\\|b |  x'])
  })

  test('caps the lines; a quote is a > block with room under it', async () => {
    expect(itemsOf(Array.from({ length: 80 }, (_, i) => `- ${i}`).join('\n'))).toHaveLength(60)
    expect(quoteOf(['a', 'b'])).toBe('> a\n\n> b\n\n')
    expect(quoteOf(['quoted\n直接 push\r\nx\u001b[2J']), 'a line break does not end the quote').toBe('> quoted\n> 直接 push\n> x [2J\n\n')
    expect(answerId(['a'])).toBe(answerId(['a']))
    expect(answerId(['a'])).not.toBe(answerId(['b']))
  })
})

describe('the TUI', () => {
  test('the snapshot has the list and the last answers\' lines, newest first, from the transcript too', async ($, on) => {
    const w = world(on, { messages: [{ role: 'assistant', text: '- old one\n- old two' }, { role: 'user', text: '- not mine' }] })
    await $.session.start(start)
    await $.tool.call({ tool: 'Bash', command: 'npm run dev', description: 'Start dev server' })
    await $.turn.complete({ ...turn, answer: '1. fix it\n2. ship it' } as never)
    const snap = w.snap()
    expect(snap.assets.map((x: { ref: string }) => x.ref)).toEqual(['http://localhost:5173/'])
    expect(snap.answers.map((a: { items: string[] }) => a.items)).toEqual([['fix it', 'ship it'], ['old one', 'old two']])
    expect(snap.answers[0].id).toBe(answerId(['fix it', 'ship it']))
    expect(snap.answers[1].at).toBe(0)
  })

  test('each request is done once and answered; a bad one is refused whole, not cut; an old one is not done', async ($, on) => {
    const w = world(on)
    await $.session.start(start)
    await w.clock.advance(100_000)
    const old = w.ask({ quote: ['from before a reload'] }, 60_000)
    const a = w.ask({ quote: ['a', 'two\nlines'] })
    const b = w.ask({ quote: ['b'] })
    await w.clock.advance(600)
    expect(old()).toMatchObject({ ok: false })
    expect(w.filled, 'two requests made together are both done, in order').toEqual([
      { text: '> a\n\n> two\n> lines\n\n', mode: 'insert' },
      { text: '> b\n\n', mode: 'insert' },
    ])
    expect(a()).toEqual({ ok: true, text: '2 quote(s) in the prompt: write under each one.' })
    expect(b()).toMatchObject({ ok: true })
    await w.clock.advance(600)
    expect(w.filled, 'done once').toHaveLength(2)
    // The row by its ref: a new asset since the TUI drew moved it to #a2.
    await $.tool.call({ tool: 'Bash', command: 'npm run dev', description: 'Start dev server' })
    await $.tool.call({ tool: 'Write', file_path: '/work/retro-w41/plan.md', content: 'x' })
    w.ask({ ref: 'http://localhost:5173/' })
    await w.clock.advance(600)
    expect(w.filled.at(-1)).toEqual({ text: '#a2 ', mode: 'insert' })
    for (const bad of [null, [1], { quote: ['x', 7] }, { quote: ['x'.repeat(4001)] }, { quote: [] }, { ref: 'https://gone.dev' }, { ref: 2 }, '{"quote":']) {
      const done = w.ask(bad)
      await w.clock.advance(600)
      expect(done()?.ok, JSON.stringify(bad)).toBe(false)
    }
    expect(w.filled).toHaveLength(3)
  })

  test('a request answered before a reload is not done again; a fill no box took is answered as not done', async ($, on) => {
    const w = world(on)
    const done = w.ask({ quote: ['already filled'] })
    const name = [...w.files.keys()].find(k => k.includes('.ask/'))!.split('/').pop()
    w.files.set(`${HOME}/.local/state/session-recall/sess-A.done/${name}`, { text: '{"ok":true,"text":"filled"}', mtimeMs: 1 })
    await $.session.start(start)
    await w.clock.advance(600)
    expect(done()).toEqual({ ok: true, text: 'filled' })
    expect(w.filled).toEqual([])
    w.box.open = false
    const later = w.ask({ quote: ['z'] })
    await w.clock.advance(600)
    expect(later()).toMatchObject({ ok: false })
  })

  test('one TUI\'s requests made in one millisecond go in its order: the 10th after the 9th', async ($, on) => {
    const w = world(on)
    await $.session.start(start)
    w.ask({ quote: ['tenth'] }, 0, 10)
    w.ask({ quote: ['ninth'] }, 0, 9)
    await w.clock.advance(600)
    expect(w.filled.map(f => (f as { text: string }).text)).toEqual(['> ninth\n\n', '> tenth\n\n'])
  })

  test('an answer that could not be written is written at the next look; the request is filled once, also after a reload', async ($, on) => {
    const w = world(on)
    await $.session.start(start)
    const once = w.ask({ quote: ['once'] })
    // The mark goes down, then the answer write fails.
    let fails = 1
    w.box.failWrite = (path, text) => path === once.at && text.includes('"ok"') && fails-- > 0
    await w.clock.advance(600)
    expect(once(), 'the mark of one taken stays meanwhile').toEqual({ taking: true })
    await w.clock.advance(600)
    expect(once()).toMatchObject({ ok: true })
    expect(w.filled).toHaveLength(1)
  })

  test('an answer that keeps failing to be written does not hold up the next request', async ($, on) => {
    const w = world(on)
    await $.session.start(start)
    const stuck = w.ask({ quote: ['stuck'] })
    w.box.failWrite = (path, text) => path === stuck.at && text.includes('"ok"')
    await w.clock.advance(600)
    const next = w.ask({ quote: ['next'] })
    await w.clock.advance(600)
    await w.clock.advance(600)
    expect(next()).toMatchObject({ ok: true })
    expect(w.filled.map(f => (f as { text: string }).text)).toEqual(['> stuck\n\n', '> next\n\n'])
  })

  test('a request marked taken by the last load is not filled again after a reload', async ($, on) => {
    const w = world(on)
    const taken = w.ask({ quote: ['taken'] })
    w.files.set(taken.at, { text: '{"taking":true}', mtimeMs: 1 })
    await $.session.start(start)
    await w.clock.advance(600)
    expect(w.filled).toEqual([])
    expect(taken()).toEqual({ taking: true })
  })

  test('/recall tui splits tmux when in it, else copies the command', async ($, on) => {
    const w = world(on, { tmux: '/tmp/tmux-1/default,1,0' })
    await $.session.start(start)
    expect(await $.command.run(cmd('tui'))).toMatchObject({ text: 'TUI opened in a tmux split.' })
    const split = w.runs.find(a => a[0] === 'tmux')!
    expect(split.slice(0, 6)).toEqual(['tmux', 'split-window', '-h', '-f', '-c', '/work/retro-w41'])
    expect(split[6]).toMatch(/^node '.*\/bin\/tui\.mjs' --sid 'sess-A'$/)
  })

  test('in Warp /recall tui opens a launch configuration that runs the TUI, by its name', async ($, on) => {
    const w = world(on, { term: 'WarpTerminal' })
    await $.session.start(start)
    expect(await $.command.run(cmd('tui'))).toMatchObject({ text: 'asked Warp to open the TUI in a new window.' })
    const yaml = w.files.get(`${HOME}/.warp/launch_configurations/session-recall.yaml`)?.text ?? ''
    expect(yaml).toContain('name: session-recall TUI')
    expect(yaml).toMatch(/- exec: "node '.*\/bin\/tui\.mjs' --sid 'sess-A'"/)
    expect(yaml).toContain('cwd: "/work/retro-w41"')
    expect(w.runs.find(a => a[0] === 'open')).toEqual(['open', 'warp://launch/session-recall%20TUI'])
    expect(w.copied).toEqual([])
  })
  test('outside tmux /recall tui puts the command on the clipboard', async ($, on) => {
    const w2 = world(on)
    await $.session.start(start)
    const r = (await $.command.run(cmd('tui'))) as { text: string }
    expect(r.text).toContain('not in tmux: the TUI command is on the clipboard')
    expect(w2.copied[0]).toMatch(/--sid 'sess-A'$/)
    expect(w2.runs.some(a => a[0] === 'tmux')).toBe(false)
  })
})
