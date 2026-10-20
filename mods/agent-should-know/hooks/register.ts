import type { EngineInterface, Register } from 'claude-code'

const MOD_VERSION = '0.1.0'
const NAME = 'agent-should-know'

// The built-in's offer card carries these two buttons; its other views do not.
const OFFER_LABELS = ['Learn more', 'Knew this already']
const KEPT = 20
const PREFIX = 'A side agent watching this session flagged this for you, the main agent:'
const VERDICT_CHARS = 600

type Node = { type?: string; props?: { label?: string }; children?: unknown[] }

function walk(node: unknown, labels: string[], words: string[]) {
  if (typeof node === 'string' || typeof node === 'number') {
    words.push(String(node))
    return
  }
  if (Array.isArray(node)) {
    for (const child of node) walk(child, labels, words)
    return
  }
  if (node === null || typeof node !== 'object') return
  const el = node as Node
  if (el.type === 'Button') {
    labels.push(el.props?.label ?? '')
    return
  }
  walk(el.children ?? [], labels, words)
}

// The band joins every plugin's rows (live costs among them), so the line is cut
// out by its tag. shortcut: a two-sentence card keeps its first sentence only;
// match on the card's own node if that loss matters.
const LINE = /(?:Heads up|You should know) · .*?(?:。|\.(?=\s|$))/

function cardLine(node: unknown): string | null {
  const labels: string[] = []
  const words: string[] = []
  walk(node, labels, words)
  if (!OFFER_LABELS.every(l => labels.includes(l))) return null
  return LINE.exec(words.join('').replace(/\s+/g, ' '))?.[0] ?? null
}

// The card's line ("Heads up · ..."), or null when the tree holds no offer card.
export const offerLine = (tree: unknown): string | null => cardLine(tree)

// The tree without the card: the deepest node that still holds it is dropped,
// the other plugins' rows beside it stay.
export function withoutCard(node: unknown): unknown {
  if (node === null || typeof node !== 'object' || Array.isArray(node)) return node
  const el = node as Node
  const kids = el.children ?? []
  const at = kids.findIndex(k => cardLine(k) !== null)
  // No child holds the card: the node is the card itself (the built-in's tree alone).
  if (at === -1) return cardLine(node) === null ? node : null
  const kid = kids[at]
  const isDeeper = ((kid as Node).children ?? []).some(k => cardLine(k) !== null)
  return { ...el, children: isDeeper ? kids.map((k, i) => (i === at ? withoutCard(k) : k)) : kids.filter((_, i) => i !== at) }
}

async function log($: EngineInterface, text: string) {
  const path = `${await $.env.get('HOME')}/.local/state/${NAME}/log.md`
  const before = await $.fs.read(path).catch(() => '# You should know: flagged and handled\n')
  await $.fs.write(path, `${before}${text}\n`)
}

export const register: Register = on => {
  const sent = new Set<string>()
  let cwd = ''
  // The relayed prompt, and the turn it was queued behind (its answer is not the verdict).
  let pending: { over: string | undefined } | null = null

  on('session.start', async ($, e, next) => {
    cwd = e.cwd
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    const o = e.origin
    if (o?.kind === 'plugin' && (o.name === NAME || o.name.startsWith(`${NAME}@`))) pending = { over: e.turnId }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (e.agentId !== undefined || pending === null || e.turnId === pending.over) return r
    pending = null
    const verdict = r.text.trim().replace(/\s+/g, ' ').slice(0, VERDICT_CHARS)
    await log($, `  - ${e.reason === 'answer' ? 'handled' : e.reason}: ${verdict}`).catch(err =>
      $.ui.toast(`${NAME} v${MOD_VERSION}: log not written (${err instanceof Error ? err.message : String(err)})`),
    )
    return r
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const tree = await next(e)
    const line = offerLine(tree)
    if (line === null) return tree
    const hidden = (withoutCard(tree) ?? $.ui.resolve(e).Box({})) as typeof tree
    if (sent.has(line)) return hidden
    sent.add(line)

    // Kept in the store too, so a hot reload does not send the card on show again.
    const kept = ((await $.store.get('sent')) as string[] | undefined) ?? []
    if (kept.includes(line)) return hidden
    await $.store.set('sent', [...kept, line].slice(-KEPT))

    const at = new Date().toISOString().slice(0, 16).replace('T', ' ')
    const session = (await $.session.id()).slice(0, 8)
    await log($, `- ${at} · ${cwd.split('/').pop()} · ${session} · ${line}`).catch(err =>
      $.ui.toast(`${NAME} v${MOD_VERSION}: log not written (${err instanceof Error ? err.message : String(err)})`),
    )

    // A plugin's prompt waits until the running turn ends: no interruption.
    $.prompt
      .submit({ text: `${PREFIX}\n> ${line}\nCheck it against the work. If it holds, correct the work; if not, say why in one line.` })
      .then(r => {
        if (r.drop !== undefined) pending = null
        $.ui.toast(r.drop === undefined ? `${NAME} v${MOD_VERSION}: sent to the main session` : `${NAME}: not sent (${r.drop})`)
      })
      .catch(err => $.ui.toast(`${NAME}: not sent (${err instanceof Error ? err.message : String(err)})`))

    return hidden
  })
}
