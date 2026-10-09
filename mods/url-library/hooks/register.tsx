import type { Register } from 'claude-code'

import { type Entry, extractUrls, groupOf, hostOf, isLocalHost, merge } from './lib/urls.ts'

const PANE = 'url-library'
const KEY = 'entries'
// Tools whose output is file or page content: their URLs are noise, not things this session made.
const SKIP = new Set(['Read', 'Grep', 'Glob', 'WebFetch', 'WebSearch', 'NotebookEdit'])

const asList = (v: unknown) => (v as Entry[] | undefined) ?? []

export const register: Register = on => {
  let project = ''

  on('session.start', async ($, e, next) => {
    project = e.cwd.split('/').filter(Boolean).pop() ?? ''
    await $.command.register({ name: 'urls', description: 'Open the library of URLs seen in sessions' })
    return next(e)
  })

  on('command.run', { command: 'urls' }, async $ => {
    await $.ui.open({ id: PANE, title: 'URLs' })
    return { text: 'URL library opened.' }
  })

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    if ('deny' in ran && ran.deny) return ran
    if (SKIP.has(e.tool) || typeof ran.text !== 'string') return ran
    const urls = extractUrls(ran.text)
    if (urls.length === 0) return ran
    const input = e as unknown as { description?: unknown; command?: unknown }
    const label =
      e.tool === 'Bash'
        ? String(input.description || String(input.command ?? '').slice(0, 60) || 'Bash')
        : e.tool.replace(/^mcp__/, '')
    // Bookkeeping must never cost the model its tool result.
    try {
      const at = await $.clock.now()
      const fresh: Entry[] = urls.map(url => ({ url, host: hostOf(url), isLocal: isLocalHost(hostOf(url)), label, project, at }))
      await $.store.set(KEY, merge(asList(await $.store.get(KEY)), fresh))
      $.ui.invalidate('ui.render')
    } catch (err) {
      $.ui.log(`url-library: store write failed (${(err as Error)?.name ?? 'Error'}): ${String((err as Error)?.message ?? err)}`, { to: 'debug' })
    }
    return ran
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Link } = $.ui.resolve(e)
    const list = asList(await $.store.get(KEY))
    const now = await $.clock.now()
    const room = Math.max(1, Math.floor(((e.viewport?.rows ?? 24) - 2) / 2))
    let last = ''

    return (
      <Box flexDirection="column">
        {list.length === 0 && <Text dimColor>No URLs yet. They appear here as tools print them.</Text>}
        {list.slice(0, room).flatMap(item => {
          const group = groupOf(item.at, now)
          const head = group === last ? [] : [<Text bold>{group}</Text>]
          last = group
          return [
            ...head,
            <Box flexDirection="column" marginLeft={1}>
              <Text>
                <Text color={item.isLocal ? 'green' : 'cyan'}>{item.isLocal ? 'local ' : 'remote'}</Text>{' '}
                <Link href={item.url} label={item.label} />
              </Text>
              <Text dimColor>
                {'       '}
                {item.host}
                {item.project ? ` · ${item.project}` : ''}
              </Text>
            </Box>,
          ]
        })}
      </Box>
    )
  })
}
