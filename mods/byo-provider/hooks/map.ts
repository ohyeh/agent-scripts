// Pure helpers: no `$`, so test/map.test.ts runs them under bun.
import type { TurnStepChunk, TurnStepResult, TurnUsage } from 'claude-code'

export type Block = { type: string; [k: string]: unknown }
export type Msg = { role: 'user' | 'assistant'; content: Block[] }
export type GateTool = { name: string; description: string; input_schema: Record<string, unknown> }
export type Step = { chunks: TurnStepChunk[]; result: TurnStepResult }

type StopReason = TurnStepResult['stopReason']
const STOPS = new Set(['end_turn', 'max_tokens', 'stop_sequence', 'tool_use', 'pause_turn', 'refusal'])

/** A failed gate step: one text block saying why, ending the turn. Never a fallback to Claude. */
export function failStep(turnId: string, index: number, reason: string): Step {
  const text = `[byo-provider: ${reason}]`
  return {
    chunks: [{ kind: 'text', index: 0, text }, { kind: 'stop', stopReason: 'end_turn', usage: null }],
    result: { turnId, index, answer: text, toolUses: [], stopReason: 'end_turn', usage: null },
  }
}

/** An Anthropic Messages response body → the chunks to yield and the step result. Thinking is dropped. */
export function toStep(turnId: string, index: number, body: unknown, model: string): Step {
  const r = body as { type?: string; content?: Block[]; stop_reason?: string; model?: string; usage?: Record<string, number>; error?: { message?: string } }
  if (!r || r.type === 'error' || !Array.isArray(r.content)) {
    return failStep(turnId, index, `bad response: ${r?.error?.message ?? JSON.stringify(body).slice(0, 200)}`)
  }
  const chunks: TurnStepChunk[] = []
  const toolUses: TurnStepResult['toolUses'][number][] = []
  let answer = ''
  let i = 0 // own block counter: dropped thinking blocks leave no gap
  for (const b of r.content) {
    if (b.type === 'text' && typeof b.text === 'string') {
      chunks.push({ kind: 'text', index: i++, text: b.text })
      answer += b.text
    } else if (b.type === 'tool_use' && typeof b.name === 'string' && typeof b.id === 'string') {
      chunks.push({ kind: 'tool', index: i, id: b.id, name: b.name })
      chunks.push({ kind: 'input', index: i++, json: JSON.stringify(b.input ?? {}) })
      toolUses.push({ name: b.name, input: b.input ?? {} })
    }
    // thinking / redacted_thinking: no valid Anthropic signature, so never recorded.
  }
  // Only thinking came back (the cap ran out mid-thought): the engine would end the loop without a word.
  if (!answer && !toolUses.length) return failStep(turnId, index, `answer has no text or tool call (stop_reason ${r.stop_reason}, ${r.usage?.output_tokens ?? '?'} output tokens)`)
  const stopReason: StopReason = STOPS.has(String(r.stop_reason)) ? (r.stop_reason as StopReason) : toolUses.length ? 'tool_use' : 'end_turn'
  const u = r.usage
  const usage: TurnUsage | null = u
    ? { input_tokens: u.input_tokens ?? 0, output_tokens: u.output_tokens ?? 0, cache_read_input_tokens: u.cache_read_input_tokens ?? 0,
        cache_creation_input_tokens: u.cache_creation_input_tokens ?? 0, model: r.model ?? model }
    : null
  chunks.push({ kind: 'stop', stopReason, usage })
  return { chunks, result: { turnId, index, answer, toolUses, stopReason, usage } }
}

type Ref = { type: 'tool_reference'; tool_name: string }
const isRef = (x: unknown): x is Ref => !!x && typeof x === 'object' && (x as Ref).type === 'tool_reference'

/** Tools this loop already has: those ToolSearch loaded (its tool_result carries `tool_reference`
 *  blocks) and those it already called (`tool_use`), so a call in the history keeps its schema. */
export function loadedTools(messages: readonly Msg[]): Set<string> {
  const names = new Set<string>()
  for (const m of messages) for (const b of m.content) {
    if (b.type === 'tool_use' && typeof b.name === 'string') names.add(b.name)
    if (b.type === 'tool_result' && Array.isArray(b.content)) for (const c of b.content) if (isRef(c)) names.add(c.tool_name)
  }
  return names
}

const ANNOUNCE = /The following deferred tools are now available via ToolSearch[^\n]*\n([\s\S]*?)(?:\n\s*\n|<\/system-reminder>|$)/g

/** Tools the engine told this loop are behind ToolSearch, from its system-reminder announcements.
 *  shortcut: parses the engine's prose (CC 2.1.319 wording); re-check the wording on a Claude Code update. */
export function deferredTools(messages: readonly Msg[]): Set<string> {
  const names = new Set<string>()
  for (const m of messages) for (const b of m.content) {
    if (b.type !== 'text' || typeof b.text !== 'string') continue
    for (const [, list] of b.text.matchAll(ANNOUNCE)) for (const n of (list ?? '').split('\n')) if (n.trim()) names.add(n.trim())
  }
  return names
}

/** The conversation for the gate: thinking out (Claude's signatures mean nothing there), and
 *  tool_reference blocks as text (only the Anthropic API expands them; the gate gets the schemas in `tools`). */
export function forGate(messages: readonly Msg[]): Msg[] {
  return messages.map(m => ({
    ...m,
    content: m.content.filter(b => b.type !== 'thinking' && b.type !== 'redacted_thinking').map(b =>
      b.type === 'tool_result' && Array.isArray(b.content) && b.content.some(isRef)
        ? { ...b, content: (b.content as unknown[]).map(c => (isRef(c) ? { type: 'text', text: `Tool loaded: ${c.tool_name}` } : c)) }
        : b),
  })).filter(m => m.content.length > 0)
}

/** `abcdef…(len 42)`: the only form a secret is ever mentioned in. */
export function redact(v: string | undefined): string {
  return v ? `${v.slice(0, 6)}…(len ${v.length})` : '(none)'
}

export type After = (ms: number, fn: () => void) => { cancel: () => void }

/** `work`'s value, or why it lost: no answer within `ms`, or `signal` (the turn's interrupt) aborted.
 *  The loser is not cancelled ($.process.run takes no signal): a late answer settles unseen. */
export async function deadline<T>(work: Promise<T>, ms: number, signal: AbortSignal, after: After): Promise<{ ok: T } | { why: string }> {
  work.catch(() => {}) // a loser's late rejection is not an unhandled one
  let timer: { cancel: () => void } | undefined
  let onAbort = () => {}
  const lost = new Promise<{ why: string }>(resolve => {
    if (signal.aborted) return resolve({ why: 'interrupted' })
    timer = after(ms, () => resolve({ why: `no answer in ${ms / 1000} s (GATE_TIMEOUT_MS)` }))
    onAbort = () => resolve({ why: 'interrupted' })
    signal.addEventListener('abort', onAbort)
  })
  try {
    return await Promise.race([work.then(ok => ({ ok })), lost])
  } finally {
    timer?.cancel()
    signal.removeEventListener('abort', onAbort)
  }
}

/** `key=value` lines; blank lines, `#` comments and lines without a key are skipped. */
export function parseConf(text: string): Record<string, string> {
  const kv: Record<string, string> = {}
  for (const l of text.split('\n').map(x => x.trim())) {
    const i = l.indexOf('=')
    if (!l.startsWith('#') && i > 0) kv[l.slice(0, i).trim()] = l.slice(i + 1).trim()
  }
  return kv
}

/** An agent definition file: `---` frontmatter, then the prompt. `tools` only when the frontmatter
 *  names them (`tools: A, B`); absent means the agent gets every tool. */
export function parseAgentDef(text: string): { body: string; tools?: string[] } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text)
  if (!m) return { body: text.trim() }
  const line = m[1]!.split(/\r?\n/).find(l => /^tools\s*:/.test(l))
  const tools = line?.replace(/^tools\s*:/, '').split(',').map(s => s.trim()).filter(Boolean)
  return { body: text.slice(m[0].length).trim(), ...(tools?.length ? { tools } : {}) }
}
