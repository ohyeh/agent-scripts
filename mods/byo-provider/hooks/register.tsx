import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, ToolInfo, TurnStepChunk, TurnStepInput, TurnStepResult } from 'claude-code'
import { bandText, deadline, deferredTools, failStep, forGate, loadedTools, parseAgentDef, parseConf, redact, tierRoute, toStep } from './map'
import { SCHEMAS } from './schemas'
import type { Fail, GateTool, Msg, Step } from './map'
import type { View } from '../types'

// byo-provider: chosen loops are answered by the owner's Anthropic-format gateway by
// answering `turn.step` without `next(e)`. Env is never touched; the OAuth credential is never
// read or sent: the gate request carries only the gate token.
//
// Test-only switches, read at session.start from the claude process env (`claude -p` cannot type
// slash commands mid-run):
//   GATE_TEST_MAIN=<profile>    as `/provider-switch use <profile>`
//   GATE_TEST_AGENTS=<profile>  every new subagent/fork goes to <profile>, whatever main runs on
//   GATE_TEST_AGENTS_MODE=follow|claude  as `/provider-switch agents follow|claude`
//   GATE_TEST_STEPS=<K>       a gated loop is switched back to Claude from step index K (as /provider-switch off)
//   GATE_LOG=<path>           routing log (never a URL or token value)
//   GATE_TIMEOUT_MS=<ms>      request timeout in ms, ahead of the profile's timeout (seconds)
// Everything private (gateway URL, token, model, effort) lives in profile files the owner keeps,
// `<profiles>/<name>.conf`, never in this repo or in settings.

const VERSION = '0.5.6' // keep equal to .claude-plugin/plugin.json
const FOLD_KEY = 'byo-provider.fold' // 'open' once unfolded; else the band is its header line
const HIDE_KEY = 'byo-provider.hidden'
let options: { path: string } = { path: '~/.config/byo-provider/profiles' }
const DEFAULT = 'default' // the profile `use` and `agent` take when no name is typed
// effort → Anthropic `thinking`; the budget comes on top of MAX_TOKENS, so thinking never eats the answer.
const THINKING: Record<string, object> = {
  off: { type: 'disabled' },
  low: { type: 'enabled', budget_tokens: 2048 },
  medium: { type: 'enabled', budget_tokens: 6000 },
  high: { type: 'enabled', budget_tokens: 12000 },
  max: { type: 'enabled', budget_tokens: 15360 },
}
// shortcut: fixed room for the answer, make it a profile key if a gate model rejects it or cuts answers.
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

const loops = new Map<string, string>() // 'main' or an agentId → profile name
const types = new Map<string, string>() // a gated agentId → its subagentType (none for a fork)
let agentsMode = 'follow' // follow | claude | a profile name every new subagent uses
let testSteps: number | undefined
let envTimeoutMs: number | undefined
let logPath: string | undefined
const lines: string[] = []
const last = new Map<string, string>() // loop → its last gate step, for the pane
const routed: string[] = [] // the profile of each loop ever put on your provider
let okSteps = 0
const fails: Fail[] = [] // gate steps and tier routes that did not reach your provider
const band = { folded: true, hidden: false }

const view = atom({ plugin: 'byo-provider', key: 'view' } as const, { rows: [], agents: 'follow', profiles: '', ok: 0, fails: [] } as View, { shape: 'view-3' })

/** Copies the routing state into the atom the pane reads. */
async function sync($: EngineInterface) {
  const rows = [...loops].map(([loop, profile]) => ({ loop, profile, last: last.get(loop) ?? '-' }))
  const kv = await defaultConf($)
  const tiers = ['haiku', 'sonnet', 'opus'].filter(t => kv[t]).map(t => `${t}→${kv[t]}`).join(' ')
  await update($, view, () => ({ rows, agents: tiers ? `${agentsMode} (${tiers})` : agentsMode, profiles: options.path, ok: okSteps, fails: [...fails] }))
}

/** Rows a drawn tree takes (grok-bot-watch's rule): a column stacks, a row is its tallest child, a leaf is a line. */
function rowsOf(n: unknown): number {
  if (Array.isArray(n)) return n.reduce((a: number, c) => a + rowsOf(c), 0)
  if (!n || typeof n !== 'object') return 0
  const el = n as { type?: string; children?: unknown; props?: { flexDirection?: string; children?: unknown } }
  if (el.type === 'engine') return 0
  if (el.type !== 'Box') return 1
  const kids = [el.children ?? el.props?.children].flat(9)
  return el.props?.flexDirection === 'column' ? kids.reduce((a: number, c) => a + rowsOf(c), 0) : Math.max(1, ...kids.map(rowsOf))
}

async function log($: EngineInterface, r: Record<string, unknown>) {
  lines.push(JSON.stringify({ t: Date.now(), ...r }))
  if (logPath) await $.fs.write(logPath, lines.join('\n') + '\n')
}

type Profile = { name: string; url: string; token: string; model: string; effort: string; timeoutMs: number }

async function profilesDir($: EngineInterface) {
  return options.path.replace(/^~(?=\/|$)/, (await $.env.get('HOME')) ?? '~')
}

/** default.conf as key=value; {} when it is missing (its own errors surface at the gateway request). */
async function defaultConf($: EngineInterface): Promise<Record<string, string>> {
  return $.fs.read(`${await profilesDir($)}/default.conf`).then(t => parseConf(String(t)), () => ({}))
}

/** Reads `<profiles>/<name>.conf` (`key=value` lines, `#` comments) at each step, so an edit applies at once. */
async function loadProfile($: EngineInterface, name: string): Promise<Profile | string> {
  if (!/^[\w.-]+$/.test(name)) return `bad profile name '${name}'`
  const path = `${await profilesDir($)}/${name}.conf`
  let text: string
  try { text = String(await $.fs.read(path)) } catch { return `no profile file ${path}; copy ${$.plugin.root}/default.conf.example there` }
  const kv = parseConf(text)
  if (!kv.url || !kv.token || !kv.model) return `profile ${path} needs url, token and model`
  const effort = kv.effort ?? ''
  if (effort && !THINKING[effort]) return `profile ${path}: effort must be ${Object.keys(THINKING).join('|')}`
  // $.process.run allows ten minutes at most; a bad value fails here, never silently replaced.
  const ok = (ms: number) => ms > 0 && ms <= 590_000
  if (envTimeoutMs !== undefined && !ok(envTimeoutMs)) return `GATE_TIMEOUT_MS must be 1..590000`
  const t = kv.timeout || undefined // `timeout=` with no value means unset
  if (t !== undefined && !(Number(t) >= 1 && ok(Number(t) * 1000))) return `profile ${path}: timeout=${t} must be 1..590 seconds`
  const timeoutMs = envTimeoutMs ?? (t !== undefined ? Number(t) * 1000 : 120_000)
  return { name, url: kv.url, token: kv.token, model: kv.model, effort, timeoutMs }
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

/** The definition file of an agent type: `<plugin>:<name>` from the plugin's install folder, else
 *  `<name>` from .claude/agents then ~/.claude/agents. null for the engine's own types (general-purpose,
 *  Explore, Plan) and types registered in code: their prompt is not a file. */
async function agentDef($: EngineInterface, type: string | undefined): Promise<{ path: string; body: string; tools?: string[]; disallowed?: string[] } | null> {
  if (!type || !/^[\w.-]+(:[\w.-]+)?$/.test(type)) return null
  const home = (await $.env.get('HOME')) ?? ''
  const [plugin, name] = type.includes(':') ? type.split(':') as [string, string] : [undefined, type]
  const paths: string[] = []
  if (plugin) {
    try {
      const installed = JSON.parse(String(await $.fs.read(`${home}/.claude/plugins/installed_plugins.json`))) as { plugins?: Record<string, Array<{ installPath?: string }>> }
      const key = Object.keys(installed.plugins ?? {}).find(k => k.startsWith(`${plugin}@`))
      const dir = key ? installed.plugins![key]![0]?.installPath : undefined
      if (dir) paths.push(`${dir}/agents/${name}.md`)
    } catch { /* no plugin list: treated as not found */ }
  } else paths.push(`.claude/agents/${name}.md`, `${home}/.claude/agents/${name}.md`)
  for (const path of paths) {
    try { return { path, ...parseAgentDef(String(await $.fs.read(path))) } } catch { /* next */ }
  }
  return null
}

/** POSTs to `<url>/v1/messages` with curl: `$.http.fetch` gives up after 30 s, a long gateway answer
 *  (effort max, a long loop) takes more. The token goes in the child's env, the body on stdin: neither
 *  in argv. status 0 means curl itself failed; `text` then holds its error. */
async function post($: EngineInterface, cfg: Profile, body: string): Promise<{ status: number; ok: boolean; text: string }> {
  const r = await $.process.run(['curl', '-sS', '--max-time', String(Math.ceil(cfg.timeoutMs / 1000)), '-X', 'POST',
    '--variable', '%BYO_GATE_TOKEN', '--expand-header', 'authorization: Bearer {{BYO_GATE_TOKEN}}',
    '-H', 'content-type: application/json', '-H', 'anthropic-version: 2023-06-01',
    '--data-binary', '@-', '-w', '\n%{http_code}', `${cfg.url.replace(/\/+$/, '')}/v1/messages`],
  { stdin: body, env: { BYO_GATE_TOKEN: cfg.token }, timeoutMs: cfg.timeoutMs + 5000 })
  if (r.exitCode !== 0) return { status: 0, ok: false, text: `curl exit ${r.exitCode}: ${r.stderr.trim().slice(0, 300)}` }
  const i = r.stdout.lastIndexOf('\n')
  const status = Number(r.stdout.slice(i + 1))
  return { status, ok: status >= 200 && status < 300, text: r.stdout.slice(0, i) }
}

async function gateStep($: EngineInterface, e: TurnStepInput, name: string, signal: AbortSignal): Promise<Step> {
  const cfg = await loadProfile($, name)
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
  const def = e.agentId ? await agentDef($, types.get(e.agentId)) : null
  // A custom agent answers with its own prompt (as on Claude), not the main loop's; its `tools` list narrows the set.
  const all = await toolsFor($, available, messages, e.agentId !== undefined)
  const tools = all.filter(t => t.name === HANDBACK.name ||
    ((!def?.tools || def.tools.includes(t.name)) && !def?.disallowed?.includes(t.name)))
  const system = (def ? def.body : composed.sections.map(s => s.text).join('\n\n')) + (e.agentId ? ROLE : '')
  const model = cfg.model
  const budget = cfg.effort ? (THINKING[cfg.effort] as { budget_tokens?: number }).budget_tokens ?? 0 : 0
  const body = { model, max_tokens: MAX_TOKENS + budget, stream: false, system, messages: forGate(messages), tools, ...(cfg.effort ? { thinking: THINKING[cfg.effort] } : {}) }
  await log($, { ev: 'gate-request', loop: e.agentId ?? 'main', index: e.index, profile: name, model, effort: cfg.effort || null, url: redact(cfg.url), agentType: e.agentId ? types.get(e.agentId) ?? null : null, agentDef: def?.path ?? null,
    messages: messages.length, messageCount: e.messageCount, tools: tools.length, toolNames: tools.map(t => t.name), systemChars: system.length })
  // Failure text reaches the transcript and the log: the URL and token only ever in redacted form.
  const fail = (why: string) => failStep(e.turnId, e.index, why.split(cfg.url).join(redact(cfg.url)).split(cfg.token).join(redact(cfg.token)))
  let won
  const sent = Date.now()
  try {
    won = await deadline(post($, cfg, JSON.stringify(body)), cfg.timeoutMs, signal, (ms, fn) => $.clock.after(ms, fn))
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err))
  }
  if ('why' in won) {
    await log($, { ev: won.why === 'interrupted' ? 'gate-abort' : 'gate-timeout', loop: e.agentId ?? 'main', index: e.index, timeoutMs: cfg.timeoutMs })
    return fail(won.why)
  }
  const res = won.ok
  if (res.status === 0) return fail(res.text)
  if (!res.ok) return fail(`HTTP ${res.status}: ${res.text.slice(0, 300)}`)
  let parsed: unknown
  try { parsed = JSON.parse(res.text) } catch { return fail(`not JSON: ${res.text.slice(0, 200)}`) }
  const step = toStep(e.turnId, e.index, parsed, model)
  const content = (parsed as { content?: Array<{ type: string }> }).content ?? []
  await log($, { ev: 'gate-answer', loop: e.agentId ?? 'main', index: e.index, status: res.status, ms: Date.now() - sent, id: (parsed as { id?: string }).id,
    blocks: content.map(b => b.type), stop: step.result.stopReason })
  return step
}

/** One step answered by your provider. Every failure becomes a failed step: never a silent fall back to Claude. */
async function* answer($: EngineInterface, e: TurnStepInput, profile: string, signal: AbortSignal): AsyncGenerator<TurnStepChunk, TurnStepResult> {
  let step: Step
  try {
    step = await gateStep($, e, profile, signal)
  } catch (err) {
    step = failStep(e.turnId, e.index, err instanceof Error ? err.message : String(err))
  }
  const loop = e.agentId ?? 'main'
  if (step.result.usage === null) await log($, { ev: 'gate-fail', loop, index: e.index, answer: step.result.answer.slice(0, 300) })
  if (step.result.usage === null) fails.push({ who: types.get(loop) ?? loop, why: step.result.answer.slice(0, 80) })
  else okSteps++
  last.set(loop, `#${e.index} ${step.result.usage === null ? step.result.answer.slice(0, 80) : `ok ${step.result.stopReason}`}`)
  await sync($)
  for (const c of step.chunks) yield c
  return step.result
}

async function command($: EngineInterface, args: string): Promise<string> {
  const [word, a, b] = args.trim().split(/\s+/)
  switch (word) {
    case 'use': {
      const m = a ?? DEFAULT
      const p = await loadProfile($, m)
      if (typeof p === 'string') return p
      loops.set('main', m)
      routed.push(m)
      return `main loop: ${m} on your provider from its next step. /provider-switch off goes back to Claude.`
    }
    case 'agent': {
      const m = b ?? DEFAULT
      if (!a) return 'usage: /provider-switch agent <agentId> [profile]'
      const p = await loadProfile($, m)
      if (typeof p === 'string') return p
      if (!(await $.agent.list()).some(x => x.id === a)) return `no running agent ${a}; /provider-switch status lists them`
      loops.set(a, m)
      routed.push(m)
      return `agent ${a}: ${m} on your provider from its next step.`
    }
    case 'agents':
      if (!a) return `new subagents: ${agentsMode}. usage: /provider-switch agents follow|claude|<profile>`
      if (a !== 'follow' && a !== 'claude') {
        const p = await loadProfile($, a)
        if (typeof p === 'string') return p
      }
      agentsMode = a
      return a === 'follow' ? 'New subagents follow their parent loop onto your provider.'
        : a === 'claude' ? 'New subagents always run on Claude.' : `New subagents use profile ${a}; this loop stays where it is.`
    case 'off': {
      const loop = a ?? 'main'
      return loops.delete(loop) ? `${loop}: back to Claude from its next step.` : `${loop} is not on your provider.`
    }
    case 'band':
      band.hidden = !band.hidden
      await $.store.set(HIDE_KEY, band.hidden ? 'hidden' : 'shown')
      $.ui.invalidate('ui.render')
      return band.hidden ? 'band hidden; /provider-switch band shows it again.' : 'band shown.'
    case 'status':
    case undefined:
    case '': {
      const dir = await profilesDir($)
      const names = (await $.fs.list(dir).catch(() => [])).map(f => f.name).filter(n => n.endsWith('.conf')).map(n => n.slice(0, -5))
      const gate = `${dir}: ${names.join(', ') || 'no profiles'}`
      const on = [...loops].map(([l, m]) => `${l} → ${m}`).join(', ') || 'none'
      const agents = (await $.agent.list()).map(x => x.id).join(', ') || 'none'
      return `on your provider: ${on} · new subagents: ${agentsMode} · profiles ${gate} · running agents: ${agents}`
    }
    default:
      return 'usage: /provider-switch use [profile] | agent <agentId> [profile] | agents follow|claude|<profile> | off [agentId] | status | band'
  }
}

const SWITCH_TOOL = 'mcp__byo-provider__switch'

/** Runs one /provider-switch command and updates the band. */
async function switchAndShow($: EngineInterface, args: string): Promise<string> {
  const text = await command($, args)
  await sync($)
  return text
}

export const register: Register = (on, opts) => {
  options = { ...options, ...(opts as Partial<typeof options>) }
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    logPath = await $.env.get('GATE_LOG')
    const main = await $.env.get('GATE_TEST_MAIN')
    if (main) { loops.set('main', main); routed.push(main) }
    band.folded = (await $.store.get(FOLD_KEY)) !== 'open'
    band.hidden = (await $.store.get(HIDE_KEY)) === 'hidden'
    // default.conf `agents=` is the mode a session starts in; a bad value is shown, never silently dropped.
    const kv = await defaultConf($)
    if (kv.agents) {
      const said = await command($, `agents ${kv.agents}`)
      if (agentsMode !== kv.agents) $.ui.toast(`[byo-provider] default.conf agents=${kv.agents}: ${said}`)
    }
    await sync($)
    const testAgents = await $.env.get('GATE_TEST_AGENTS')
    if (testAgents) agentsMode = testAgents
    const k = await $.env.get('GATE_TEST_STEPS')
    testSteps = k ? Number(k) : undefined
    const mode = await $.env.get('GATE_TEST_AGENTS_MODE')
    if (mode === 'follow' || mode === 'claude') agentsMode = mode
    { const t = await $.env.get('GATE_TIMEOUT_MS'); envTimeoutMs = t ? Number(t) : undefined }
    const reg = await $.command.register({
      name: 'provider-switch',
      description: 'Answer the main loop or a subagent with a model on your own provider, or go back to Claude (byo-provider)',
      argumentHint: 'use [profile] | agent <agentId> [profile] | agents follow|claude|<profile> | off [agentId] | status | band',
      immediate: true,
    })
    await $.tool.register({
      name: 'switch',
      description: 'Route loops of this session to a profile on the owner\'s own Anthropic-format provider, or back to Claude; ' +
        'the same as the owner typing /provider-switch <args>. Use only when the owner asks. ' +
        'args: "agents <profile>" (new subagents use that profile; this loop stays on Claude), "agents follow|claude", ' +
        '"agent <agentId> [profile]", "off [agentId]", "use [profile]" (moves THIS main loop off Claude), "status".',
      inputSchema: { type: 'object', properties: { args: { type: 'string', description: 'the /provider-switch arguments' } }, required: ['args'] },
    })
    await log($, { ev: 'session-start', commandRegister: reg, testMain: main ?? null, testSteps: testSteps ?? null, agentsMode })
    return started
  })

  // The same switch as a tool the main loop can call (as tmux-agent's reload): the owner can say
  // "put new subagents on default" without typing the command. A subagent may not move loops.
  on('tool.call', { tool: SWITCH_TOOL }, async ($, e) => {
    if ((e as { agentId?: string }).agentId) return { deny: 'only the main loop can switch providers' }
    const args = String((e as unknown as { args?: unknown }).args ?? '') // a registered tool's input fields sit on e itself
    return { result: await switchAndShow($, args) }
  })

  on('command.run', { command: 'provider-switch' }, async ($, e) => ({ text: await switchAndShow($, String(e.args ?? '')) }))

  // A band above the prompt from the session's start, drawn as quick-say draws its band (fold and hide
  // stored in $.store, header only when folded): no $.ui.open, so no 144-column rule. It says only whether
  // routing works; unfolded it adds the new-subagent mode and the last failures, in the rows left below.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const below = await next(e)
    if (band.hidden) return below
    const budget = e.props.maxRows - rowsOf(below)
    if (budget < 1) return below
    const { Box, Text, Button } = $.ui.resolve(e)
    const v = await read($, view)
    const { status, rows } = bandText({ routed, ok: v.ok, fails: v.fails, agents: v.agents })
    const title = `▌byo-provider v${VERSION}`
    const buttons = `[ ${band.folded ? '▸ open' : '▾ fold'} ][ hide ] [-]` // ' [-]': the engine's collapse control, kept clear
    const width = e.props.bodyColumns
    const room = Math.max(0, width - title.length - buttons.length - 3)
    const header = (
      <Box flexDirection="row">
        <Text bold color="magenta">{title}</Text>
        <Text color={v.fails.length ? 'red' : undefined} dimColor={!v.fails.length}>{` · ${status}`.slice(0, room)} </Text>
        {Button({ key: 'fold', label: band.folded ? '▸ open' : '▾ fold', onPress: () => {
          band.folded = !band.folded
          $.ui.invalidate('ui.render')
          void $.store.set(FOLD_KEY, band.folded ? 'folded' : 'open').catch(err => $.ui.toast(`[byo-provider] fold not saved (${String(err)})`))
        } })}
        {Button({ key: 'hide', label: 'hide', onPress: () => void command($, 'band') })}
      </Box>
    )
    return (
      <Box flexDirection="column">
        {below}
        {header}
        {band.folded ? null : rows.slice(0, budget - 1).map(r => <Text dimColor={!r.startsWith('✗')} color={r.startsWith('✗') ? 'red' : undefined}>  {r.slice(0, width - 2)}</Text>)}
      </Box>
    )
  })

  // New subagents/forks are marked by the agentId the spawn resolves to.
  on('agent.spawn', async ($, e, next) => {
    const r = await next(e)
    const agentId = r && 'agentId' in r ? r.agentId : undefined
    const resolved = r && 'model' in r ? r.model : undefined
    // default.conf `haiku=` / `sonnet=` / `opus=` route by the agent's resolved model tier, ahead of `agents=`.
    const tier = tierRoute(await defaultConf($).catch(() => ({})), resolved ?? e.model ?? e.parentModel)
    let model = tier !== undefined ? (tier === 'claude' ? undefined : tier)
      : agentsMode === 'follow' ? loops.get(e.parentAgentId ?? 'main') : agentsMode === 'claude' ? undefined : agentsMode
    if (tier && tier !== 'claude') {
      const p = await loadProfile($, tier).catch((x: unknown) => String(x))
      if (typeof p === 'string') {
        $.ui.toast(`[byo-provider] ${resolved} → ${tier}: ${p}; that agent runs on Claude`)
        fails.push({ who: e.subagentType ?? 'fork', why: `${tier}: ${p}`.slice(0, 80) })
        model = undefined
      }
    }
    if (model && agentId) {
      loops.set(agentId, model)
      routed.push(model)
      if (!e.fork) types.set(agentId, e.subagentType)
      await sync($).catch(() => undefined)
    }
    else if (model) $.ui.toast(`[byo-provider] spawn gave no agent id; that agent runs on Claude, not ${model}`)
    // A failing log write must not fail the hook: the engine would skip it after the spawn.
    await log($, { ev: model && agentId ? 'spawn-marked' : 'spawn-claude', agentId, profile: model ?? null, tier: tier ?? null, fork: e.fork,
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
      await sync($)
      await log($, { ev: 'test-switch-back', loop, index: e.index })
    }
    const model = loops.get(loop)
    await log($, { ev: 'step', loop, index: e.index, turnId: e.turnId, engineModel: e.model, route: model ? `gate:${model}` : 'claude' })
    if (!model) return yield* next(e)
    return yield* answer($, e, model, next.signal)
  })
}
