import type { EngineInterface, Register, ToolInfo, TurnStepChunk, TurnStepInput, TurnStepResult } from 'claude-code'
import { deadline, deferredTools, failStep, forGate, loadedTools, redact, toStep } from './map'
import { SCHEMAS } from './schemas'
import type { GateTool, Msg, Step } from './map'

// byo-provider: chosen loops are answered by the owner's Anthropic-format gateway by
// answering `turn.step` without `next(e)`. Env is never touched; the OAuth credential is never
// read or sent: the gate request carries only the gate token.
//
// Test-only switches, read at session.start from the claude process env (`claude -p` cannot type
// slash commands mid-run):
//   GATE_TEST_MAIN=<model>    as `/provider-switch use <model>`
//   GATE_TEST_AGENTS=<model>  every new subagent/fork goes to <model>, whatever main runs on
//   GATE_TEST_AGENTS_MODE=follow|claude  as `/provider-switch agents follow|claude`
//   GATE_TEST_STEPS=<K>       a gated loop is switched back to Claude from step index K (as /provider-switch off)
//   GATE_LOG=<path>           routing log (never a URL or token value)
//   GATE_URL + GATE_TOKEN     gateway, ahead of the plugin options
//   GATE_TIMEOUT_MS=<ms>      request timeout, ahead of the timeoutSeconds option
// Everything private (gateway URL, token, cc-switch provider name) lives in the plugin's userConfig
// (settings.json pluginConfigs, the token in secure storage), never in this repo.

let options: { url: string; token: string; ccSwitchProvider: string; timeoutSeconds: number; agents: string } =
  { url: '', token: '', ccSwitchProvider: '', timeoutSeconds: 120, agents: 'follow' }
// shortcut: fixed output cap, make it a /provider-switch option if a gate model rejects it or cuts answers.
const MAX_TOKENS = 16384
const ROLE = '\n\nYou are running as a subagent. Your task is the first user message. The agent that started you ' +
  'sees only your final message, so end with a complete, self-contained report.'

const HANDBACK: GateTool = {
  name: 'SubagentHandback',
  description: 'Deliver your full final report to the agent that started you. The call ends your run.',
  input_schema: { type: 'object', properties: { message: { type: 'string', description: 'Your full report' } }, required: ['message'] },
}

// The engine withholds these from subagents (REFsub vs REFmain, CC 2.1.319) and no API says so.
// shortcut: measured for general-purpose; a custom agent type's own `tools` list is not known at run time.
const MAIN_ONLY = new Set(['ScheduleWakeup', 'Workflow'])

const loops = new Map<string, string>() // 'main' or an agentId → gate model
let agentsMode: 'follow' | 'claude' = 'follow'
let testAgents: string | undefined
let testSteps: number | undefined
let timeoutMs = 120_000
let logPath: string | undefined
const lines: string[] = []

async function log($: EngineInterface, r: Record<string, unknown>) {
  lines.push(JSON.stringify({ t: Date.now(), ...r }))
  if (logPath) await $.fs.write(logPath, lines.join('\n') + '\n')
}

async function gateConfig($: EngineInterface): Promise<{ url: string; token: string; from: string } | string> {
  const url = await $.env.get('GATE_URL')
  const token = await $.env.get('GATE_TOKEN')
  if (url && token) return { url, token, from: 'env' }
  if (options.url && options.token) return { url: options.url, token: options.token, from: 'options' }
  const provider = options.ccSwitchProvider
  if (!provider) return 'no gateway configured: set url + token or ccSwitchProvider (claude plugin configure byo-provider)'
  const db = `${(await $.env.get('HOME')) ?? ''}/.cc-switch/cc-switch.db`
  // The query names the provider only; the token comes back on stdout, never in argv.
  const r = await $.process.run(['sqlite3', db, `select settings_config from providers where name = '${provider.replaceAll("'", "''")}';`])
  try {
    const env = (JSON.parse(r.stdout) as { env?: Record<string, string> }).env ?? {}
    if (env.ANTHROPIC_BASE_URL && env.ANTHROPIC_AUTH_TOKEN) return { url: env.ANTHROPIC_BASE_URL, token: env.ANTHROPIC_AUTH_TOKEN, from: 'cc-switch' }
  } catch { /* reported below */ }
  return `no gateway in cc-switch provider '${provider}' (sqlite3 exit ${r.exitCode})`
}

/** The tools the real API request carries for this loop: every tool of the loop except those the engine
 *  announced as deferred (behind ToolSearch), plus the deferred ones this loop loaded or called, plus
 *  ToolSearch. Read from messages, so it does not depend on tool.describe timing. A subagent also takes
 *  the main loop's announcement: the same engine rule defers the same tools, and its own may list fewer.
 *  shortcut: schemas are built-ins only (hooks/schemas.ts, generated); MCP and plugin tools have no
 *  schema source at run time and are left out; parse the laid claude-code-mcp types to add them. */
async function toolsFor($: EngineInterface, available: readonly ToolInfo[], messages: readonly Msg[], isAgent: boolean): Promise<GateTool[]> {
  const deferred = deferredTools(messages)
  if (isAgent) {
    const main = await $.session.messages({ as: 'api' })
    const fromMain = Array.isArray(main) ? deferredTools(main as unknown as Msg[]) : new Set<string>()
    await log($, { ev: 'deferred', own: deferred.size, main: fromMain.size,
      mainOnly: [...fromMain].filter(n => !deferred.has(n) && !n.startsWith('mcp__')), ownOnly: [...deferred].filter(n => !fromMain.has(n) && !n.startsWith('mcp__')) })
    for (const n of fromMain) deferred.add(n)
  } else await log($, { ev: 'deferred', own: deferred.size })
  const loaded = loadedTools(messages)
  const offered = available.filter(t => t.name === 'ToolSearch' ||
    ((!deferred.has(t.name) || loaded.has(t.name)) && !(isAgent && MAIN_ONLY.has(t.name))))
  const tools = offered.flatMap(t => (SCHEMAS[t.name] ? [{ name: t.name, description: t.description, input_schema: SCHEMAS[t.name]! }] : []))
  const noSchema = offered.filter(t => !SCHEMAS[t.name]).map(t => t.name)
  if (noSchema.length) await log($, { ev: 'no-schema', tools: noSchema })
  // The engine gives a subagent SubagentHandback and nudges it to report through it, but $.tool.list()
  // does not list it. shortcut: schema taken from the engine's nudge text; re-check on a Claude Code update.
  if (isAgent && !tools.some(t => t.name === HANDBACK.name)) tools.push(HANDBACK)
  return tools
}

async function gateStep($: EngineInterface, e: TurnStepInput, model: string, signal: AbortSignal): Promise<Step> {
  const cfg = await gateConfig($)
  if (typeof cfg === 'string') return failStep(e.turnId, e.index, cfg)
  const [raw, composed, available] = await Promise.all([
    e.agentId ? $.session.messages({ as: 'api', agentId: e.agentId }) : $.session.messages({ as: 'api' }),
    $.prompt.compose(),
    $.tool.list(),
  ])
  if (!Array.isArray(raw)) {
    await log($, { ev: 'messages-denied', agentId: e.agentId, deny: raw })
    return failStep(e.turnId, e.index, `this loop's conversation cannot be read (${JSON.stringify(raw)}); /provider-switch off it`)
  }
  const messages = raw as unknown as Msg[]
  const tools = await toolsFor($, available, messages, e.agentId !== undefined)
  const system = composed.sections.map(s => s.text).join('\n\n') + (e.agentId ? ROLE : '')
  const body = { model, max_tokens: MAX_TOKENS, stream: false, system, messages: forGate(messages), tools }
  await log($, { ev: 'gate-request', loop: e.agentId ?? 'main', index: e.index, model, from: cfg.from, url: redact(cfg.url),
    messages: messages.length, messageCount: e.messageCount, tools: tools.length, toolNames: tools.map(t => t.name), systemChars: system.length })
  // Failure text reaches the transcript and the log: the URL and token only ever in redacted form.
  const fail = (why: string) => failStep(e.turnId, e.index, why.split(cfg.url).join(redact(cfg.url)).split(cfg.token).join(redact(cfg.token)))
  let won
  try {
    won = await deadline($.http.fetch(`${cfg.url.replace(/\/+$/, '')}/v1/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'anthropic-version': '2023-06-01', authorization: `Bearer ${cfg.token}` },
      body: JSON.stringify(body),
    }), timeoutMs, signal, (ms, fn) => $.clock.after(ms, fn))
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err))
  }
  if ('why' in won) {
    await log($, { ev: won.why === 'interrupted' ? 'gate-abort' : 'gate-timeout', loop: e.agentId ?? 'main', index: e.index, timeoutMs })
    return fail(won.why)
  }
  const res = won.ok
  if (!res.ok) return fail(`HTTP ${res.status}: ${res.text.slice(0, 300)}`)
  let parsed: unknown
  try { parsed = JSON.parse(res.text) } catch { return fail(`not JSON: ${res.text.slice(0, 200)}`) }
  const step = toStep(e.turnId, e.index, parsed, model)
  const content = (parsed as { content?: Array<{ type: string }> }).content ?? []
  await log($, { ev: 'gate-answer', loop: e.agentId ?? 'main', index: e.index, status: res.status, id: (parsed as { id?: string }).id,
    blocks: content.map(b => b.type), stop: step.result.stopReason })
  return step
}

/** One step answered by your provider. Every failure becomes a failed step: never a silent fall back to Claude. */
async function* answer($: EngineInterface, e: TurnStepInput, model: string, signal: AbortSignal): AsyncGenerator<TurnStepChunk, TurnStepResult> {
  let step: Step
  try {
    step = await gateStep($, e, model, signal)
  } catch (err) {
    step = failStep(e.turnId, e.index, err instanceof Error ? err.message : String(err))
  }
  if (step.result.usage === null) await log($, { ev: 'gate-fail', loop: e.agentId ?? 'main', index: e.index, answer: step.result.answer.slice(0, 300) })
  for (const c of step.chunks) yield c
  return step.result
}

async function command($: EngineInterface, args: string): Promise<string> {
  const [word, a, b] = args.trim().split(/\s+/)
  switch (word) {
    case 'use':
      if (!a) return 'usage: /provider-switch use <model>'
      loops.set('main', a)
      return `main loop: ${a} on your provider from its next step. /provider-switch off goes back to Claude.`
    case 'agent': {
      if (!a || !b) return 'usage: /provider-switch agent <agentId> <model>'
      if (!(await $.agent.list()).some(x => x.id === a)) return `no running agent ${a}; /provider-switch status lists them`
      loops.set(a, b)
      return `agent ${a}: ${b} on your provider from its next step.`
    }
    case 'agents':
      if (a !== 'follow' && a !== 'claude') return `new subagents: ${agentsMode}. usage: /provider-switch agents follow|claude`
      agentsMode = a
      return a === 'follow' ? 'New subagents follow their parent loop onto your provider.' : 'New subagents always run on Claude.'
    case 'off': {
      const loop = a ?? 'main'
      return loops.delete(loop) ? `${loop}: back to Claude from its next step.` : `${loop} is not on your provider.`
    }
    case 'status':
    case undefined:
    case '': {
      const cfg = await gateConfig($)
      const gate = typeof cfg === 'string' ? cfg : `${cfg.from} ${redact(cfg.url)}, token ${redact(cfg.token)}`
      const on = [...loops].map(([l, m]) => `${l} → ${m}`).join(', ') || 'none'
      const agents = (await $.agent.list()).map(x => x.id).join(', ') || 'none'
      return `on your provider: ${on} · new subagents: ${agentsMode} · provider: ${gate} · running agents: ${agents}`
    }
    default:
      return 'usage: /provider-switch use <model> | agent <agentId> <model> | agents follow|claude | off [agentId] | status'
  }
}

export const register: Register = (on, opts) => {
  options = { ...options, ...(opts as Partial<typeof options>) }
  if (options.agents === 'follow' || options.agents === 'claude') agentsMode = options.agents
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    logPath = await $.env.get('GATE_LOG')
    const main = await $.env.get('GATE_TEST_MAIN')
    if (main) loops.set('main', main)
    testAgents = (await $.env.get('GATE_TEST_AGENTS')) || undefined
    const k = await $.env.get('GATE_TEST_STEPS')
    testSteps = k ? Number(k) : undefined
    const mode = await $.env.get('GATE_TEST_AGENTS_MODE')
    if (mode === 'follow' || mode === 'claude') agentsMode = mode
    timeoutMs = Number(await $.env.get('GATE_TIMEOUT_MS')) || options.timeoutSeconds * 1000 || 120_000
    const reg = await $.command.register({
      name: 'provider-switch',
      description: 'Answer the main loop or a subagent with a model on your own provider, or go back to Claude (byo-provider)',
      argumentHint: 'use <model> | agent <agentId> <model> | agents follow|claude | off [agentId] | status',
      immediate: true,
    })
    await log($, { ev: 'session-start', commandRegister: reg, testMain: main ?? null, testAgents: testAgents ?? null, testSteps: testSteps ?? null, agentsMode, timeoutMs })
    return started
  })

  on('command.run', { command: 'provider-switch' }, async ($, e) => ({ text: await command($, String(e.args ?? '')) }))

  // New subagents/forks are marked by the agentId the spawn resolves to.
  on('agent.spawn', async ($, e, next) => {
    const model = testAgents ?? (agentsMode === 'follow' ? loops.get(e.parentAgentId ?? 'main') : undefined)
    const r = await next(e)
    const agentId = r && 'agentId' in r ? r.agentId : undefined
    if (model && agentId) loops.set(agentId, model)
    else if (model) $.ui.toast(`[byo-provider] spawn gave no agent id; that agent runs on Claude, not ${model}`)
    // A failing log write must not fail the hook: the engine would skip it after the spawn.
    await log($, { ev: model && agentId ? 'spawn-marked' : 'spawn-claude', agentId, model: model ?? null, fork: e.fork,
      parent: e.parentAgentId ?? 'main', parentModel: e.parentModel, askedModel: e.model ?? null, resolvedModel: r && 'model' in r ? r.model : null })
      .catch(() => undefined)
    return r
  }).catch(async ($, e, next) => {
    // Only next(e) can throw here (the log write is guarded), so the spawn itself failed:
    // say so and rethrow; calling next(e) again would retry the spawn.
    $.ui.toast(`[byo-provider] agent spawn failed (${String(next.error)}); no agent was marked`)
    throw next.error
  })

  on('turn.step', async function* ($, e, next) {
    const loop = e.agentId ?? 'main'
    if (testSteps !== undefined && loops.has(loop) && e.index >= testSteps) {
      loops.delete(loop)
      await log($, { ev: 'test-switch-back', loop, index: e.index })
    }
    const model = loops.get(loop)
    await log($, { ev: 'step', loop, index: e.index, turnId: e.turnId, engineModel: e.model, route: model ? `gate:${model}` : 'claude' })
    if (!model) return yield* next(e)
    return yield* answer($, e, model, next.signal)
  })
}
