import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, ToolInfo, TurnStepChunk, TurnStepInput, TurnStepResult } from 'claude-code'
import { maxTimeoutSeconds, ownedByTmuxAgent, relayStep, RELAY_SLICE_MS, RELAY_TOOL, bandText, bindingPlan, parseBindings, cliAllowed, cliProfile, finishStop, stopReceipt, reportStep, withAnswer, roundPrompt, deadline, resultsFor, deferredTools, failStep, forGate, loadedTools, parseAgentDef, parseConf, redact, tierRoute, toStep } from './map'
import { SCHEMAS } from './schemas'
import type { CliBinding, CliOwner, Fail, GateTool, Msg, Ran, Step } from './map'
import type { View } from '../types'

// byo-provider: chosen loops are answered by the owner's Anthropic-format gateway by
// answering `turn.step` without `next(e)`. Env is never touched; the OAuth credential is never
// read or sent: the gate request carries only the gate token.
//
// Test-only switches, read at session.start from the claude process env (`claude -p` cannot type
// slash commands mid-run):
//   GATE_TEST_MAIN=<profile>    as `/provider-switch use <profile>`
//   GATE_TEST_AGENTS=<profile>  the agents= mode is <profile> (a matching tier line still wins)
//   GATE_TEST_AGENTS_MODE=follow|claude  as `/provider-switch agents follow|claude`
//   GATE_TEST_STEPS=<K>       a gated loop is switched back to Claude from step index K (as /provider-switch off)
//   GATE_LOG=<path>           routing log (never a URL or token value)
//   GATE_TIMEOUT_MS=<ms>      request timeout in ms, ahead of the profile's timeout (seconds)
//   GATE_RELAY_SLICE_MS=<ms>  a tmux CLI step hands the turn on after this long (default and max 540000)
// Everything private (gateway URL, token, model, effort) lives in profile files the owner keeps,
// `<profiles>/<name>.conf`, never in this repo or in settings.

const VERSION = '0.8.1' // keep equal to .claude-plugin/plugin.json
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
let relaySliceMs = RELAY_SLICE_MS
let logPath: string | undefined
const lines: string[] = []
const last = new Map<string, string>() // loop → its last gate step, for the pane
const routed: string[] = [] // the profile of each loop ever put on your provider
let okSteps = 0
const fails: Fail[] = [] // gate steps and tier routes that did not reach your provider
const band = { folded: true, hidden: false }
// A workflow agent's conversation is closed to hooks ($.session.messages gives {deny}), so the mod keeps its
// own: the task at spawn, each gate answer, and each tool result tool.call hands back. agentId → record.
const own = new Map<string, { msgs: Msg[]; ran: Ran[] }>()
const cliLoops = new Map<string, { prompt: string; kind: string; name?: string; cwd?: string; teammate: boolean; worker?: string; workerProfile?: string; ledger?: string; owner?: CliOwner; closed?: boolean; rounds?: number; pending: string[]; guard?: ReturnType<EngineInterface['process']['spawn']>; guardPath?: string; stopHeadless?: () => void; relay?: Relay; carry?: string }>()
/** A CLI task that outlives a step: its deadline, its answer file, and (headless) the running process. */
type Relay = { until: number; answerPath: string; job?: HeadlessJob }
type HeadlessJob = { resultPath: string; exitPath: string; pid: number }
const BINDINGS_KEY = 'byo-provider.cli-bindings'
let bindingWrites: Promise<void> = Promise.resolve()
let bindingError: string | undefined
let cleanupBin: string | undefined

function saveBinding($: EngineInterface, agentId: string, binding?: CliBinding, ownerId?: string): Promise<void> {
  const write = bindingWrites.catch(() => undefined).then(async () => {
    const sessionId = ownerId ?? await $.session.id()
    const key = `${BINDINGS_KEY}.${sessionId}`
    const stored = parseBindings(await $.store.get(key)).filter(b => b.agentId !== agentId)
    if (binding) stored.push(binding)
    if (stored.some(b => b.owner.sessionId !== sessionId)) throw new Error('CLI binding owner does not match its store key')
    if (stored.length) await $.store.set(key, stored)
    else await $.store.delete(key)
  })
  bindingWrites = write
  return write
}

async function currentOwner($: EngineInterface): Promise<CliOwner> {
  const sessionId = await $.session.id()
  const dir = `${await $.env.get('HOME')}/.claude/sessions`
  for (const entry of await $.fs.list(dir)) {
    if (!/^\d+\.json$/.test(entry.name)) continue
    const row = await $.fs.read(`${dir}/${entry.name}`).then(t => JSON.parse(String(t)), () => null).catch(() => null)
    if (row?.sessionId === sessionId && row.pid === Number(entry.name.slice(0, -5)) && typeof row.procStart === 'string' && row.procStart) {
      const owner = { sessionId, pid: row.pid, procStart: row.procStart }
      if (await ownerState($, owner) === 'live') return owner
    }
  }
  throw new Error('current Claude session has no registry entry')
}

async function ownerState($: EngineInterface, owner: CliOwner): Promise<'live' | 'dead' | 'unknown'> {
  try {
    const dir = `${await $.env.get('HOME')}/.claude/sessions`
    const name = `${owner.pid}.json`
    if (!(await $.fs.list(dir)).some(f => f.name === name)) return 'dead'
    const row = JSON.parse(String(await $.fs.read(`${dir}/${name}`)))
    if (!row || typeof row.sessionId !== 'string') return 'unknown'
    if (row.sessionId !== owner.sessionId) return 'dead'
    if (!Number.isSafeInteger(row.pid) || typeof row.procStart !== 'string' || !row.procStart) return 'unknown'
    if (row.pid !== owner.pid || row.procStart !== owner.procStart) return 'dead'
    // Registry procStart is UTC; ps otherwise uses the host's time zone.
    const ps = await $.process.run(['ps', '-p', String(owner.pid), '-o', 'lstart='], { env: { TZ: 'UTC', LC_ALL: 'C' }, timeoutMs: 5000 })
    if (ps.exitCode === 1 && !ps.stdout.trim() && !ps.stderr.trim()) return 'dead'
    if (ps.exitCode !== 0 || !ps.stdout.trim()) return 'unknown'
    return ps.stdout.trim().replace(/\s+/g, ' ') === owner.procStart.trim().replace(/\s+/g, ' ') ? 'live' : 'dead'
  } catch { return 'unknown' }
}

async function releaseGuard($: EngineInterface, record: NonNullable<ReturnType<typeof cliLoops.get>>, idle = false) {
  if (!record.guardPath) return
  await $.fs.write(record.guardPath, idle ? JSON.stringify({ owner: record.owner }) : 'keep')
  await record.guard?.return({ code: null, signal: 'SIGTERM' })
  record.guard = undefined
}

async function armGuard($: EngineInterface, loop: string, selector?: string) {
  const record = cliLoops.get(loop)!
  if (record.guard || (!record.worker && !selector) || !record.workerProfile || !record.ledger) return
  await releaseGuard($, record)
  const state = logPath?.includes('/') ? logPath.slice(0, logPath.lastIndexOf('/')) : `${await $.env.get('HOME')}/.local/state/byo-provider`
  record.guardPath = `${state}/byo-${loop}-${Date.now()}.guard`
  await $.fs.write(record.guardPath, JSON.stringify({ state: 'armed', owner: record.owner }))
  record.guard = $.process.spawn({ argv: ['python3', `${$.plugin.root}/scripts/cli.py`, '--guard', await tmuxBin($), record.workerProfile, selector ?? record.worker!, record.guardPath, record.ledger] })
  const ready = await record.guard.next()
  if (ready.done || ready.value.text.trim() !== 'ready') throw new Error('worker cleanup guard did not start')
  await log($, { ev: 'cli-guard', loop, worker: record.worker, resultPath: `${record.guardPath}.cleanup.json` })
}

async function restoreBindings($: EngineInterface) {
  const sessionId = await $.session.id()
  const stored: CliBinding[] = []
  const states = new Map<CliOwner, 'live' | 'dead' | 'unknown'>()
  for (const key of await $.store.keys()) {
    if (!key.startsWith(`${BINDINGS_KEY}.`)) continue
    let bindings: CliBinding[]
    try {
      bindings = parseBindings(await $.store.get(key))
      if (bindings.some(b => key !== `${BINDINGS_KEY}.${b.owner.sessionId}`)) throw new Error('CLI binding owner does not match its store key')
    } catch (error) {
      if (key === `${BINDINGS_KEY}.${sessionId}`) throw error
      await log($, { ev: 'cli-binding-foreign-unknown', key, error: String(error) })
      continue
    }
    stored.push(...bindings)
    for (const b of bindings) if (b.owner.sessionId !== sessionId) states.set(b.owner, await ownerState($, b.owner))
  }
  const plan = bindingPlan(stored, (await $.agent.list()).map(a => a.id), sessionId, [...states].filter(([, state]) => state !== 'dead').map(([owner]) => owner))
  for (const b of plan.keep) await log($, { ev: states.get(b.owner) === 'live' ? 'cli-binding-foreign-live' : 'cli-binding-foreign-unknown', loop: b.agentId, worker: b.worker, owner: b.owner, observer: sessionId })
  for (const b of plan.rebind) cliLoops.set(b.agentId, { ...b, prompt: '', teammate: true, pending: [] })
  for (const b of plan.rebind) {
    b.owner = await currentOwner($)
    cliLoops.get(b.agentId)!.owner = b.owner
    await saveBinding($, b.agentId, b)
    await armGuard($, b.agentId)
    await releaseGuard($, cliLoops.get(b.agentId)!, true)
    loops.set(b.agentId, b.profile)
    if (b.kind !== 'fork' && b.kind !== 'workflow') types.set(b.agentId, b.kind)
    routed.push(b.profile)
    await log($, { ev: 'cli-rebind', loop: b.agentId, worker: b.worker, profile: b.profile })
  }
  for (const b of plan.stop) {
    try {
      await stopRecord($, b.agentId, { ...b, prompt: '', teammate: true, pending: [] })
      if (b.owner.sessionId === sessionId) cliLoops.delete(b.agentId)
      await log($, { ev: 'cli-orphan-stop', loop: b.agentId, worker: b.worker, owner: b.owner })
    } catch (error) {
      fails.push({ who: b.agentId, why: String(error).slice(0, 80) })
      await log($, { ev: 'cli-orphan-stop-fail', loop: b.agentId, worker: b.worker, error: String(error) })
    }
  }
}

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

type GateProfile = { name: string; url: string; token: string; model: string; effort: string; timeoutMs: number }
type CliProfile = { name: string; cli: string; timeoutMs: number }
type Profile = GateProfile | CliProfile

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
  let cli: string | undefined
  try { cli = cliProfile(kv) } catch (err) { return String(err) }
  if (!cli && (!kv.url || !kv.token || !kv.model)) return `profile ${path} needs url, token and model`
  const effort = kv.effort ?? ''
  if (effort && !THINKING[effort]) return `profile ${path}: effort must be ${Object.keys(THINKING).join('|')}`
  // A bad value fails here, never silently replaced; the limit depends on the route (maxTimeoutSeconds).
  const max = maxTimeoutSeconds(cli)
  const ok = (ms: number) => ms > 0 && ms <= max * 1000
  if (envTimeoutMs !== undefined && !ok(envTimeoutMs)) return `GATE_TIMEOUT_MS must be 1..${max * 1000} for profile ${name}`
  const t = kv.timeout || undefined // `timeout=` with no value means unset
  if (t !== undefined && !(Number(t) >= 1 && ok(Number(t) * 1000))) return `profile ${path}: timeout=${t} must be 1..${max} seconds`
  const timeoutMs = envTimeoutMs ?? (t !== undefined ? Number(t) * 1000 : 120_000)
  if (cli) return { name, cli, timeoutMs }
  return { name, url: kv.url!, token: kv.token!, model: kv.model!, effort, timeoutMs }
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
async function post($: EngineInterface, cfg: GateProfile, body: string): Promise<{ status: number; ok: boolean; text: string }> {
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
  if ('cli' in cfg) return cliStep($, e, cfg, signal)
  const kept = e.agentId ? own.get(e.agentId) : undefined
  if (kept) {
    const answered = resultsFor(kept.msgs.at(-1), kept.ran)
    if (answered) kept.msgs.push(answered)
    kept.ran = []
  }
  const [raw, composed, available] = await Promise.all([
    kept ? kept.msgs : e.agentId ? $.session.messages({ as: 'api', agentId: e.agentId }) : $.session.messages({ as: 'api' }),
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
  if (kept && step.result.usage !== null) kept.msgs.push({ role: 'assistant', content: content.filter(b => b.type === 'text' || b.type === 'tool_use') as Msg['content'] })
  await log($, { ev: 'gate-answer', loop: e.agentId ?? 'main', index: e.index, status: res.status, ms: Date.now() - sent, id: (parsed as { id?: string }).id,
    blocks: content.map(b => b.type), stop: step.result.stopReason })
  return step
}

async function cliTool($: EngineInterface, input: { tool: `mcp__tmux-agent__${'assign' | 'await' | 'tell' | 'stop'}`; [key: string]: unknown }): Promise<string> {
  const r = await $.tool.call(input)
  if ('deny' in r || r.isError) throw new Error(r.deny ?? r.text ?? 'CLI tool failed')
  return typeof r.result === 'string' ? r.result : r.text ?? JSON.stringify(r.result)
}

async function tmuxBin($: EngineInterface): Promise<string> {
  if (cleanupBin) return cleanupBin
  const found = await $.process.run(['sh', '-c', 'command -v agent-tmux'])
  if (found.exitCode === 0 && found.stdout.trim()) return cleanupBin = found.stdout.trim()
  const home = await $.env.get('HOME')
  for (const relative of ['.claude/plugins/marketplaces/tmux-agent-tools/skills/tmux-agent-tools/scripts', '.agents/skills/tmux-agent-tools/scripts']) {
    const dir = `${home}/${relative}`
    if ((await $.fs.list(dir).catch(() => [])).some(f => f.name === 'agent-tmux')) return cleanupBin = `${dir}/agent-tmux`
  }
  throw new Error('agent-tmux not found for worker cleanup')
}

/** True when the loop's profile routes it to a CLI; gateway-routed agents have a record too. */
async function onCli($: EngineInterface, loop: string): Promise<boolean> {
  const name = loops.get(loop)
  if (!cliLoops.has(loop) || !name) return false
  const p = await loadProfile($, name).catch(() => undefined)
  return !!p && typeof p !== 'string' && 'cli' in p
}

async function stopCli($: EngineInterface, loop: string, aborted = false) {
  const record = cliLoops.get(loop)
  if (record) await stopRecord($, loop, record, aborted)
}

async function stopRecord($: EngineInterface, loop: string, record: NonNullable<ReturnType<typeof cliLoops.get>>, aborted = false) {
  record.relay = undefined
  record.carry = undefined
  if (!record.worker) {
    record.stopHeadless?.() // a running headless step ends now: its runner gets SIGTERM and stops the CLI's group
    record.stopHeadless = undefined
    if (record.guard) await record.guard.return({ code: null, signal: 'SIGTERM' })
    return
  }
  const worker = record.worker
  if (aborted && record.guard) {
    await record.guard.return({ code: null, signal: 'SIGTERM' })
    await log($, { ev: 'cli-abort-cleanup', loop, worker, resultPath: `${record.guardPath}.cleanup.json` })
    return // The detached guard owns confirmation; retain the persisted binding until then.
  } else {
    try {
      await finishStop(worker, async () => {
        try {
          const receipt = await cliTool($, { tool: 'mcp__tmux-agent__stop', name: worker })
          if (!stopReceipt(worker, receipt)) throw new Error(`unconfirmed CLI stop: ${receipt}`)
          return receipt
        } catch (error) {
          if (!record.workerProfile || !record.ledger) throw error
          const stopped = await $.process.run(['zsh', await tmuxBin($), record.workerProfile, 'stop', worker], { env: { TMUX_AGENT_DIR: record.ledger }, timeoutMs: 30_000 })
          if (stopped.exitCode !== 0) throw new Error(`CLI stop exit ${stopped.exitCode}: ${stopped.stderr.slice(-300)}`)
          await log($, { ev: 'cli-stop-via-process', loop, worker, exitCode: stopped.exitCode })
          return stopped.stdout
        }
      }, async () => {
        await releaseGuard($, record)
        await saveBinding($, loop, undefined, record.owner?.sessionId)
      })
      await log($, { ev: 'cli-stop', loop, worker })
    } catch (error) {
      await log($, { ev: 'cli-stop-fail', loop, worker, error: String(error) })
      throw error
    }
  }
  record.worker = undefined
  record.guard = undefined
}

const RELAY = Symbol('relay')

async function cliStep($: EngineInterface, e: TurnStepInput, cfg: CliProfile, signal: AbortSignal): Promise<Step> {
  const loop = e.agentId ?? 'main'
  const record = cliLoops.get(loop)
  if (!e.agentId || !record) return failStep(e.turnId, e.index, 'CLI profiles require an opted-in spawned agent')
  if (!cliAllowed(await defaultConf($), record.kind)) {
    await stopCli($, loop)
    return failStep(e.turnId, e.index, 'agent type is not opted in by cli_types')
  }
  const route = `cli:${cfg.cli}`
  const state = logPath?.includes('/') ? logPath.slice(0, logPath.lastIndexOf('/')) : `${await $.env.get('HOME')}/.local/state/byo-provider`
  await log($, { ev: 'cli-step', loop, index: e.index, route })
  // A relay step goes on waiting for the worker the step before it started: no new task, no round.
  const relay = record.relay
  record.relay = undefined
  if (relay && record.closed) return failStep(e.turnId, e.index, 'CLI teammate has ended')
  const prompt = relay ? '' : roundPrompt(record.pending.splice(0), record.rounds, record.prompt)
  if (!relay && !prompt.trim()) return failStep(e.turnId, e.index, 'no new message for this CLI teammate')
  const def = await agentDef($, types.get(loop))
  const answerPath = relay?.answerPath ?? `${state}/byo-${e.turnId.replace(/[^\w.-]/g, '')}-${e.index}.answer.md`
  const full = `Write the complete output this task asks for (the full text, not a recap) to ${answerPath}. Keep the report summary to one paragraph.`
  const task = `${def?.body ?? ''}\n\n${prompt}\n\n${full}`
  const answerText = async () => String(await $.fs.read(answerPath).catch(() => ''))
  const counted = (step: Step) => { if (step.ok) record.rounds = (record.rounds ?? 0) + 1; return step }
  // A teammate message that arrived while this round ran (a relayed round has tool rounds) starts the next round now.
  const nextRound = (step: Step) => {
    const carried = record.carry
    record.carry = undefined
    const full = carried ? withAnswer(step, carried) : step
    if (!(step.ok && record.teammate && record.pending.length && !record.closed)) return full
    // The parent sees only the turn's last answer: keep this round's for it, then run the next round.
    record.carry = full.result.answer
    return relayStep(e.turnId, e.index, step)
  }
  let resultPath: string | undefined
  try {
    if (!relay) await $.fs.write(answerPath, '')
    if (signal.aborted) throw new Error('interrupted')
    if (cfg.cli.startsWith('tmux/')) {
      if (relay) {
        await armGuard($, loop)
        await log($, { ev: 'cli-relay-resume', loop, worker: record.worker, index: e.index })
      } else if (record.worker) {
        await armGuard($, loop)
        const receipt = await cliTool($, { tool: 'mcp__tmux-agent__tell', name: record.worker, text: task })
        await log($, { ev: 'cli-tell', loop, worker: record.worker, receipt })
      } else {
        const name = `byo-${loop.replace(/[^\w.-]/g, '').slice(-24)}-${Date.now().toString(36)}`
        record.owner = await currentOwner($)
        record.workerProfile = cfg.cli.slice(5)
        const override = (await $.env.get('TMUX_AGENT_DIR'))?.trim().replace(/\/+$/, '')
        const xdg = (await $.env.get('XDG_STATE_HOME'))?.trim().replace(/\/+$/, '')
        const root = override?.startsWith('/') ? override.replace(/\/\.v3$/, '') : xdg?.startsWith('/') ? `${xdg}/tmux-agent-tools` : `${await $.env.get('HOME')}/.local/state/tmux-agent-tools`
        record.ledger = `${root}/.v3`
        await armGuard($, loop, JSON.stringify({ prefix: `${name}.`, owner: record.owner.sessionId }))
        let receipt: string
        try {
          receipt = await cliTool($, { tool: 'mcp__tmux-agent__assign', profile: cfg.cli.slice(5), name,
            dir: record.cwd ?? await $.session.cwd(), brief: `GOAL\n${task}\nACCEPTANCE\nComplete the supplied task and report its outcome.\nMODEL\nThe supplied task defines the system and constraints. Run this whole task in this CLI.\nREPORT\nWrite the required result report. Do not spawn additional workers.` })
        } catch (error) {
          if (!signal.aborted) {
            await $.fs.write(record.guardPath!, 'no-launch')
            await log($, { ev: 'cli-no-launch', loop, name, error: String(error) })
            await record.guard?.return({ code: null, signal: 'SIGTERM' })
            record.guard = undefined
          }
          throw error
        }
        if (await $.env.get('GATE_TEST_ABORT_AFTER_ASSIGN') === '1') {
          await log($, { ev: 'cli-test-abort-after-assign', loop, receipt })
          await $.process.run(['kill', '-INT', String(record.owner.pid)])
          throw new Error('injected abort after assign')
        }
        record.worker = /launch requested for "([^"]+)"/.exec(receipt)?.[1]
        record.workerProfile = cfg.cli.slice(5)
        if (!record.worker) throw new Error(`assign gave no worker name: ${receipt}`)
        const workerDir = /\(launch log: (.+)\/mod-assign.log\)/.exec(receipt)?.[1]
        if (!workerDir) throw new Error('assign gave no worker state path')
        const ledger = workerDir.slice(0, workerDir.lastIndexOf('/'))
        if (record.ledger !== ledger) throw new Error('assign worker state path differs from cleanup ledger')
        await saveBinding($, loop, { agentId: loop, worker: record.worker, profile: cfg.name, workerProfile: record.workerProfile, kind: record.kind, ledger, owner: record.owner, name: record.name, cwd: record.cwd })
        await log($, { ev: 'cli-assign', loop, worker: record.worker, route })
      }
      // One step may not run past ten minutes (the engine aborts it), so a long task is waited for in slices:
      // a slice that ends with the worker still alive hands the turn on with a tool call (relayStep).
      const until = relay?.until ?? Date.now() + cfg.timeoutMs
      const sliceEnd = Math.min(until, Date.now() + relaySliceMs)
      const work = async (): Promise<unknown> => {
        while (!signal.aborted && Date.now() < sliceEnd && record.worker) {
          const wait = Math.max(1, Math.min(30, Math.ceil((sliceEnd - Date.now()) / 1000)))
          const text = await cliTool($, { tool: 'mcp__tmux-agent__await', name: record.worker, max_seconds: wait })
          const receipt = JSON.parse(text.split('\n')[0]!) as { status: string; result?: string; episode?: number; progress?: { state?: string } }
          if (receipt.status !== 'pending') {
            if (!receipt.result) throw new Error('await gave no result.json path')
            resultPath = receipt.result
            const body = JSON.parse(String(await $.fs.read(resultPath)))
            if (body.episode !== receipt.episode) throw new Error('CLI report episode does not match await')
            return body
          }
          if (receipt.progress?.state === 'pane gone') throw new Error('CLI worker pane is gone and it wrote no report')
          const exit = String(await $.fs.read(`${record.ledger}/${record.worker}/launch.exit`).catch(() => '0')).trim()
          if (exit !== '0') throw new Error(`CLI worker launch failed (launch.exit ${exit}); see ${record.ledger}/${record.worker}/mod-assign.log`)
        }
        if (signal.aborted) throw new Error('interrupted')
        if (!record.worker || record.closed) throw new Error('CLI teammate has ended')
        if (Date.now() >= until) throw new Error('CLI timeout')
        return RELAY
      }
      const got = await deadline(work(), sliceEnd - Date.now() + 45_000, signal, (ms, fn) => $.clock.after(ms, fn))
      if ('why' in got) throw new Error(got.why)
      if (got.ok === RELAY) {
        record.relay = { until, answerPath }
        await releaseGuard($, record, true)
        await log($, { ev: 'cli-relay', loop, worker: record.worker, index: e.index, leftMs: until - Date.now() })
        return relayStep(e.turnId, e.index)
      }
      const step = counted(withAnswer(reportStep(e.turnId, e.index, got.ok), await answerText()))
      await log($, { ev: 'cli-result', loop, route, worker: record.worker, resultPath, status: (got.ok as { status?: unknown }).status })
      if (!step.ok || !record.teammate) await stopCli($, loop)
      else await releaseGuard($, record, true)
      return nextRound(step)
    }
    // Headless: one runner for the whole task, kept on the record across steps; each step waits one slice.
    const until = relay?.until ?? Date.now() + cfg.timeoutMs
    let job = relay?.job
    if (!job) {
      const jobResult = `${state}/byo-${e.turnId.replace(/[^\w.-]/g, '')}-${e.index}.json`
      const exitPath = `${jobResult}.exit`
      await $.fs.write(jobResult, '')
      await $.fs.write(exitPath, '')
      const input = `Write final JSON to this exact path: ${jobResult}\nInclude schema_version: 1, status: success|failed|blocked|needs-input, summary, artifacts: [], errors: [].\n\n${task}\n\nReturn a complete report. Do not spawn additional workers.`
      record.owner = record.owner ?? await currentOwner($)
      // The runner is detached: the engine ends a step's processes when the step ends, and a task spans steps.
      const started = await $.process.run(['python3', `${$.plugin.root}/scripts/cli.py`, '--detach', cfg.cli, String(cfg.timeoutMs / 1000), exitPath, JSON.stringify(record.owner)],
        { stdin: input, cwd: record.cwd, timeoutMs: 15_000 })
      const pid = Number(/^ready (\d+)$/m.exec(started.stdout)?.[1])
      if (started.exitCode !== 0 || !pid) throw new Error(`CLI runner did not start: ${(started.stderr || started.stdout).slice(-300)}`)
      job = { resultPath: jobResult, exitPath, pid }
      // A shutdown, TaskStop or interrupt stops the runner, whichever step the task is in.
      record.stopHeadless = () => { $.process.run(['kill', '-TERM', String(pid)]).catch(() => {}) }
      await log($, { ev: 'cli-runner', loop, pid, route })
    } else await log($, { ev: 'cli-relay-resume', loop, index: e.index })
    resultPath = job.resultPath
    const exitPath = job.exitPath
    const sliceEnd = Math.min(until, Date.now() + relaySliceMs)
    let code = ''
    // Wait in a process, not on $.clock: a $.clock wait counts against the hook's 10 s budget, a $ call does not.
    // Short waits keep an interrupt answered within the 5 s linger.
    while (!signal.aborted && Date.now() < sliceEnd && !record.closed) {
      const seconds = Math.max(0.1, Math.min(4, (sliceEnd - Date.now()) / 1000))
      code = (await $.process.run(['python3', `${$.plugin.root}/scripts/cli.py`, '--wait', exitPath, String(seconds)], { timeoutMs: 15_000 })
        .catch(error => { if (signal.aborted) throw new Error('interrupted'); throw error })).stdout.trim()
      if (code) break
    }
    if (signal.aborted) throw new Error('interrupted')
    if (record.closed) throw new Error('CLI teammate has ended')
    if (!code) {
      if (Date.now() >= until) throw new Error('CLI timeout')
      record.relay = { until, answerPath, job }
      await log($, { ev: 'cli-relay', loop, index: e.index, leftMs: until - Date.now() })
      return relayStep(e.turnId, e.index)
    }
    record.stopHeadless = undefined
    if (code !== '0') {
      const stderr = String(await $.fs.read(`${exitPath}.stderr`).catch(() => ''))
      throw new Error(/BYO_CLI_ERROR: ([^\n]+)/.exec(stderr)?.[1] ?? `CLI exit ${code}`)
    }
    const body = JSON.parse(String(await $.fs.read(job.resultPath)))
    await log($, { ev: 'cli-result', loop, route, resultPath, status: body.status })
    return nextRound(counted(withAnswer(reportStep(e.turnId, e.index, body), await answerText())))
  } catch (err) {
    let why = String(err)
    // An earlier round of this turn finished: keep its answer ahead of the failure (stopCli clears carry).
    const carried = record.carry
    try { await stopCli($, loop, signal.aborted) } catch (stopError) { why += `; worker stop failed: ${String(stopError)}` }
    record.stopHeadless = undefined
    record.carry = undefined
    return failStep(e.turnId, e.index, why, carried)
  }
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
  const failed = !step.ok && step.result.usage === null
  if (failed) await log($, { ev: 'gate-fail', loop, index: e.index, answer: step.result.answer.slice(0, 300) })
  if (failed) fails.push({ who: types.get(loop) ?? loop, why: step.result.answer.slice(0, 80) })
  else okSteps++
  last.set(loop, `#${e.index} ${failed ? step.result.answer.slice(0, 80) : `ok ${step.result.stopReason}`}`)
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
      if ('cli' in p) return 'CLI profiles apply only to opted-in spawned agents; use agents <profile>'
      loops.set('main', m)
      routed.push(m)
      return `main loop: ${m} on your provider from its next step. /provider-switch off goes back to Claude.`
    }
    case 'agent': {
      const m = b ?? DEFAULT
      if (!a) return 'usage: /provider-switch agent <agentId> [profile]'
      const p = await loadProfile($, m)
      if (typeof p === 'string') return p
      if ('cli' in p && !cliAllowed(await defaultConf($), cliLoops.get(a)?.kind)) return 'agent type is not opted in by cli_types'
      if (!(await $.agent.list()).some(x => x.id === a)) return `no running agent ${a}; /provider-switch status lists them`
      if (loops.get(a) !== m) await stopCli($, a)
      loops.set(a, m)
      routed.push(m)
      return `agent ${a}: ${m} on your provider from its next step.`
    }
    case 'agents':
      if (!a) return `new subagents: ${agentsMode}. usage: /provider-switch agents follow|claude|<profile>`
      if (a !== 'follow' && a !== 'claude') {
        const p = await loadProfile($, a)
        if (typeof p === 'string') {
          const raw = parseConf(String(await $.fs.read(`${await profilesDir($)}/${a}.conf`).catch(() => '')))
          if (!Object.hasOwn(raw, 'cli')) return p
          // Keep a bad CLI route marked so its next step fails visibly.
        }
      }
      agentsMode = a
      return a === 'follow' ? 'New subagents follow their parent loop onto your provider.'
        : a === 'claude' ? 'New subagents always run on Claude.' : `New subagents use profile ${a}; this loop stays where it is.`
    case 'off': {
      const loop = a ?? 'main'
      await stopCli($, loop)
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
      const on = [...loops].map(([l, m]) => `${l} → ${m}${cliLoops.get(l)?.closed ? ' (ended)' : ''}`).join(', ') || 'none'
      const agents = (await $.agent.list()).map(x => `${x.id} (${x.status})`).join(', ') || 'none'
      const kv = await defaultConf($)
      const tiers = ['haiku', 'sonnet', 'opus'].map(t => `${t}→${kv[t] || '(agents)'}`).join(' ')
      return `on your provider: ${on} · new subagents: ${agentsMode} · tiers: ${tiers} · cli_types: ${kv.cli_types || 'none'} · profiles ${gate} · engine agents: ${agents}`
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
    try { await restoreBindings($) }
    catch (error) {
      bindingError = String(error)
      fails.push({ who: 'bindings', why: bindingError.slice(0, 80) })
      await log($, { ev: 'cli-bindings-fail', error: bindingError })
    }
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
    { const r = Number(await $.env.get('GATE_RELAY_SLICE_MS')); relaySliceMs = r > 0 && r <= RELAY_SLICE_MS ? r : RELAY_SLICE_MS }
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
    await $.tool.register({
      name: 'cli_next',
      description: 'byo-provider internal: links two steps of a long CLI task and returns at once. byo-provider issues this call itself; never call it.',
      inputSchema: { type: 'object', properties: {} },
    })
    await log($, { ev: 'session-start', commandRegister: reg, testMain: main ?? null, testSteps: testSteps ?? null, agentsMode })
    return started
  })

  // The link between two steps of a long CLI task (relayStep): it only lets the engine start the next step.
  on('tool.call', { tool: RELAY_TOOL }, async () => ({ result: 'continuing' }))

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
    const { Box, Text, Button, Link } = $.ui.resolve(e)
    const v = await read($, view)
    const { status, rows } = bandText({ routed, ok: v.ok, fails: v.fails, agents: agentsMode })
    const conf = `${await profilesDir($)}/default.conf`
    const title = `▌byo-provider v${VERSION}`
    const buttons = ` default.conf [ ${band.folded ? '▸ open' : '▾ fold'} ][ hide ] [-]` // ' [-]': the engine's collapse control, kept clear
    const width = e.props.bodyColumns
    const room = Math.max(0, width - title.length - buttons.length - 3)
    const header = (
      <Box flexDirection="row">
        <Text bold color="magenta">{title}</Text>
        <Text color={v.fails.length ? 'red' : undefined} dimColor={!v.fails.length}>{` · ${status}`.slice(0, room)} </Text>
        <Link href={`file://${conf}`}>default.conf</Link>
        <Text> </Text>
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

  // A tool a kept-record agent ran: its result goes into that record for the next gate step.
  on('tool.call', async ($, e, next) => {
    if (e.tool === 'SendMessage' && typeof e.message === 'object' && e.message.type === 'shutdown_request') {
      const target = (await $.agent.list()).find(a => a.name === e.to || a.id === e.to)
      const id = target?.id ?? [...cliLoops].find(([id, r]) => id === e.to || r.name === e.to)?.[0]
      if (id && await onCli($, id)) { // tmux and headless CLI teammates; a gateway teammate gets the request as a message
        await stopCli($, id)
        cliLoops.get(id)!.closed = true
        if (target && ['pending', 'running', 'idle'].includes(target.status)) {
          const stopped = await $.tool.call({ tool: 'TaskStop', task_id: target.id })
          const failed = 'deny' in stopped || stopped.isError
          // A finished named agent is listed as live, but TaskStop says it is not running: nothing is left to stop.
          const after = failed ? (await $.agent.list()).find(a => a.id === target.id)?.status : undefined
          await log($, { ev: 'cli-shutdown', loop: id, status: target.status, taskStop: failed ? String(stopped.deny ?? stopped.text).slice(0, 120) : 'ok', after: after ?? null })
          if (failed && after && ['pending', 'running'].includes(after)) return { deny: stopped.deny ?? stopped.text ?? 'CLI teammate stop failed' }
        }
        return { result: { success: true, message: `CLI teammate ${e.to} stopped` } }
      }
    }
    if (e.tool === 'TaskStop') {
      const id = cliLoops.has(e.task_id) ? e.task_id : [...cliLoops].find(([, r]) => r.name === e.task_id)?.[0] ?? (await $.agent.list()).find(a => a.name === e.task_id || a.teammateId === e.task_id)?.id
      if (id) {
        await stopCli($, id)
        if (await onCli($, id)) cliLoops.get(id)!.closed = true
      }
    }
    const r = await next(e)
    const kept = e.agentId ? own.get(e.agentId) : undefined
    if (kept) {
      const x = r as { deny?: string; text?: string; result?: unknown; isError?: boolean; context?: readonly string[] }
      const text = x.deny ?? [x.text ?? JSON.stringify(x.result ?? ''), ...(x.context ?? [])].join('\n')
      const id = (e as { tool_use_id?: string }).tool_use_id
      kept.ran.push({ id, text, isError: x.deny !== undefined || x.isError === true })
      await log($, { ev: 'kept-result', agentId: e.agentId, tool: e.tool, id: id ?? null, isError: x.deny !== undefined || x.isError === true, chars: text.length }).catch(() => undefined)
    }
    return r
  })

  // New subagents/forks are marked by the agentId the spawn resolves to.
  on('agent.spawn', async ($, e, next) => {
    if (e.resume && cliLoops.get(e.resume.agentId)?.closed) return { deny: 'CLI teammate has ended' }
    const r = await next(e)
    const agentId = r && 'agentId' in r ? r.agentId : undefined
    const resolved = r && 'model' in r ? r.model : undefined
    // default.conf `haiku=` / `sonnet=` / `opus=` route by the agent's resolved model tier, ahead of `agents=`.
    const defaults = await defaultConf($).catch(() => ({}))
    const tier = tierRoute(defaults, resolved ?? e.model ?? e.parentModel)
    // A workflow agent is routed from its own record (see `own`), which needs the task text to start.
    const noTask = e.workflow !== undefined && !e.prompt?.trim()
    const tmuxOwned = ownedByTmuxAgent(e.subagentType, e.prompt)
    const modeRoute = agentsMode === 'follow' ? loops.get(e.parentAgentId ?? 'main') : agentsMode === 'claude' ? undefined : agentsMode
    let model = noTask || tmuxOwned ? undefined : tier !== undefined ? (tier === 'claude' ? undefined : tier) : modeRoute
    const candidate = model ? parseConf(String(await $.fs.read(`${await profilesDir($)}/${model}.conf`).catch(() => ''))) : {}
    const isCli = Object.hasOwn(candidate, 'cli')
    if (isCli && !cliAllowed(defaults, e.subagentType, !!e.workflow, e.fork)) {
      model = modeRoute !== model ? modeRoute : undefined
      const fallback = model ? parseConf(String(await $.fs.read(`${await profilesDir($)}/${model}.conf`).catch(() => ''))) : {}
      if (Object.hasOwn(fallback, 'cli')) model = undefined
      if (agentId) { await stopCli($, agentId); loops.delete(agentId) }
    }
    if (tier && tier !== 'claude' && !noTask && !tmuxOwned) {
      const p = await loadProfile($, tier).catch((x: unknown) => String(x))
      if (typeof p === 'string' && !isCli) {
        $.ui.toast(`[byo-provider] ${resolved} → ${tier}: ${p}; that agent runs on Claude`)
        fails.push({ who: e.subagentType ?? 'fork', why: `${tier}: ${p}`.slice(0, 80) })
        model = undefined
      }
    }
    if (model && agentId) {
      loops.set(agentId, model)
      const previous = cliLoops.get(agentId)
      if (previous) {
        if (e.resume && e.prompt?.trim() && !previous.pending.includes(e.prompt)) previous.pending.push(e.prompt)
      } else cliLoops.set(agentId, { prompt: e.prompt, kind: e.workflow ? 'workflow' : e.fork ? 'fork' : e.subagentType, name: e.name, cwd: e.cwd, teammate: !!e.isTeammate || !!e.name, pending: [] })
      routed.push(model)
      if (e.workflow) own.set(agentId, { msgs: [{ role: 'user', content: [{ type: 'text', text: e.prompt }] }], ran: [] })
      if (!e.fork) types.set(agentId, e.subagentType)
      await sync($).catch(() => undefined)
    }
    else if (model) $.ui.toast(`[byo-provider] spawn gave no agent id; that agent runs on Claude, not ${model}`)
    // A failing log write must not fail the hook: the engine would skip it after the spawn.
    await log($, { ev: model && agentId ? 'spawn-marked' : 'spawn-claude', agentId, profile: model ?? null, tier: tier ?? null, fork: e.fork, tmuxOwned, subagentType: e.subagentType ?? null,
      workflow: e.workflow ? e.workflow.runId : null, kept: e.workflow !== undefined && !noTask, promptChars: e.prompt?.length ?? 0, parent: e.parentAgentId ?? 'main', parentModel: e.parentModel, askedModel: e.model ?? null, resolvedModel: r && 'model' in r ? r.model : null })
      .catch(() => undefined)
    return r
  }).catch(async ($, e, next) => {
    // Only next(e) can throw here (the log write is guarded), so the spawn itself failed:
    // say so and rethrow; calling next(e) again would retry the spawn.
    $.ui.toast(`[byo-provider] agent spawn failed (${String(next.error)}); no agent was marked`)
    throw next.error
  })

  on('turn.step', async function* ($, e, next) {
    if (e.agentId && bindingError) {
      const step = failStep(e.turnId, e.index, `CLI bindings could not be restored: ${bindingError}`)
      for (const chunk of step.chunks) yield chunk
      return step.result
    }
    const loop = e.agentId ?? 'main'
    if (testSteps !== undefined && loops.has(loop) && e.index >= testSteps) {
      await stopCli($, loop)
      loops.delete(loop)
      await sync($)
      await log($, { ev: 'test-switch-back', loop, index: e.index })
    }
    const model = loops.get(loop)
    const cfg = model ? await loadProfile($, model) : undefined
    await log($, { ev: 'step', loop, index: e.index, turnId: e.turnId, engineModel: e.model, route: cfg && typeof cfg !== 'string' && 'cli' in cfg ? `cli:${cfg.cli}` : model ? `gate:${model}` : 'claude' })
    if (!model) return yield* next(e)
    return yield* answer($, e, model, next.signal)
  }).catch(async function* ($, e, next) {
    if (!loops.has(e.agentId ?? 'main')) throw next.error
    const step = failStep(e.turnId, e.index, String(next.error))
    fails.push({ who: e.agentId ?? 'main', why: step.result.answer.slice(0, 80) })
    for (const chunk of step.chunks) yield chunk
    return step.result
  })

  on('session.receive', async ($, e, next) => {
    if (e.agentId && e.text?.trim()) cliLoops.get(e.agentId)?.pending.push(e.text)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId && e.reason !== 'answer') {
      await log($, { ev: 'cli-turn-ended', loop: e.agentId, reason: e.reason })
      await stopCli($, e.agentId, e.reason === 'aborted')
    }
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    const started = Date.now()
    const jobs = [...cliLoops.values()].filter(r => r.worker && r.workerProfile && r.ledger).map(r => ({ binary: cleanupBin!, profile: r.workerProfile!, worker: r.worker!, marker: r.guardPath ?? `${r.ledger}/byo-${r.worker}.guard`, ledger: r.ledger! }))
    if (jobs.length) {
      const resultPath = `${jobs[0]!.marker}.session-cleanup.json`
      try {
        const receipt = await $.process.run(['python3', `${$.plugin.root}/scripts/cli.py`, '--batch', JSON.stringify(jobs), resultPath], { timeoutMs: 1000 })
        if (receipt.exitCode !== 0 || receipt.stdout.trim() !== 'ready') throw new Error(`cleanup handoff failed: ${receipt.stderr}`)
        await log($, { ev: 'cli-session-cleanup-handoff', workers: jobs.map(j => j.worker), ms: Date.now() - started, resultPath })
      } catch (error) { await log($, { ev: 'cli-stop-fail', error: String(error) }) }
    }
    return next(e)
  })
}
