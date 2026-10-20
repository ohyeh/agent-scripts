import type { EngineInterface, Register } from 'claude-code'

const MOD_VERSION = '0.1.2'
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

// The session's log file, fixed at its first card (a verdict after midnight stays
// in it), and the time of the card last flagged, which its verdict row names.
type Log = { cwd: string; file: { path: string; head: string; sid8: string } | null; flagged: string }

const iso = () => `${new Date().toISOString().slice(0, 19)}Z`

// One file per session, `<project>/<day>-<sid8>.log`: sessions never write into
// each other's file. Every row starts `<ISO time> · <sid8> ·`, so one file reads
// in order and `sort <project>/*.log` is the project's timeline across sessions.
async function logLine($: EngineInterface, s: Log, at: string, kind: string, text: string) {
  // A failed log row must not fail the hook: the relay after it matters more.
  try {
    if (s.file === null) {
      const sid = await $.session.id()
      const project = s.cwd.split('/').pop() || 'unknown'
      const sid8 = sid.slice(0, 8)
      s.file = {
        path: `${await $.env.get('HOME')}/.local/state/${NAME}/${project}/${at.slice(0, 10)}-${sid8}.log`,
        head: `# ${project} · ${sid} · ${s.cwd}`,
        sid8,
      }
    }
    const { path, head, sid8 } = s.file
    const before = await $.fs.read(path).catch(() => `${head}\n`)
    await $.fs.write(path, `${before}${at} · ${sid8} · ${kind} · ${text}\n`)
  } catch (err) {
    $.ui.toast(`${NAME} v${MOD_VERSION}: log not written (${err instanceof Error ? err.message : String(err)})`)
  }
}

export const register: Register = on => {
  const sent = new Set<string>()
  const s: Log = { cwd: '', file: null, flagged: '' }
  // The relayed card, and the turn it was queued behind (its answer is not the verdict).
  // A plugin's submit carries no turnId, so the running main turn is tracked here.
  let pending: { over: string | undefined; card: string } | null = null
  let running: string | undefined

  on('session.start', async ($, e, next) => {
    s.cwd = e.cwd
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    // mods/types pins a TurnStartInput without agentId; the engine sends it for a subagent.
    if ((e as { agentId?: string }).agentId === undefined) running = e.turnId
    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    const o = e.origin
    if (o?.kind === 'plugin' && (o.name === NAME || o.name.startsWith(`${NAME}@`))) pending = { over: e.turnId ?? running, card: s.flagged }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (e.agentId !== undefined) return r
    if (e.turnId === running) running = undefined
    if (pending === null || e.turnId === pending.over) return r
    const { card } = pending
    pending = null
    const verdict = r.text.trim().replace(/\s+/g, ' ').slice(0, VERDICT_CHARS)
    await logLine($, s, iso(), `${e.reason === 'answer' ? 'handled' : e.reason} ${card.slice(11, 19)}`, verdict)
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

    s.flagged = iso()
    await logLine($, s, s.flagged, 'flagged', line)

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
