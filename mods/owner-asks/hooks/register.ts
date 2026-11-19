import type { EngineInterface, Register } from 'claude-code'
import { atomic, messageOf, messagesOf, projectionOf, rootOf, snapshot, validIdentity } from './lib/asks.ts'
import type { Identity, Message } from './lib/asks.ts'

const NAME = 'owner-asks'
const MOD_VERSION = '0.1.0'
const iso = () => new Date().toISOString()
const errText = (err: unknown) => err instanceof Error ? err.message : String(err)

type Failure = { error_class: string; operation: string; instance: string; time: string }
type Observer = {
  retired: boolean; closing: boolean; instance: string; id: Identity | null
  rows: Message[]; history: boolean; resume: boolean; activated: string; process: string; writing: Promise<void>; last: Failure | null
}

const failure = async ($: EngineInterface, o: Observer, operation: string, err: unknown) => {
  if (o.retired) return
  o.last = { error_class: err instanceof Error ? err.name : typeof err, operation, instance: o.instance, time: iso() }
  try {
    const id = o.id ?? { sid: await $.session.id(), home: (await $.env.get('HOME')) ?? '', cwd: await $.session.cwd() }
    if (validIdentity(id) && !o.retired) {
      const path = `${rootOf(id)}/last-failure.json`
      const before = await $.fs.exists(path) ? await $.fs.read(path) : null
      await atomic($, path, JSON.stringify(o.last), before)
    }
  } catch (recordError) {
    // No transcript notice: a failure must not feed a session.append loop.
    $.ui.log(`${NAME}: failure record: ${errText(recordError)}`, { to: 'debug' })
  }
}
const serial = ($: EngineInterface, o: Observer, operation: string, run: () => Promise<void>) => {
  if (o.retired || o.closing) return Promise.resolve()
  o.writing = o.writing.then(async () => { if (!o.retired) await run() }).catch(err => failure($, o, operation, err))
  return o.writing
}
const ready = async ($: EngineInterface, o: Observer, activate = true) => {
  const id = { sid: await $.session.id(), home: (await $.env.get('HOME')) ?? '', cwd: await $.session.cwd() }
  if (!validIdentity(id)) throw new Error('identity unready')
  if (o.retired) return null
  const path = `${rootOf(id)}/owner.asks.jsonl`
  const before = await $.fs.exists(path) ? await $.fs.read(path) : null
  o.rows = messagesOf(before ?? '', id)
  if (o.id?.sid !== id.sid) o.history = o.rows.length > 0
  o.id = id
  if (activate && o.activated !== id.sid) {
    // The parent is the engine, stable across module reloads and different on resume.
    const process = await $.process.run(['python3', '-c', 'import os,subprocess\np=os.getppid()\nprint(str(p)+":"+subprocess.check_output(["ps","-o","lstart=","-p",str(p)],text=True).strip())'], { timeoutMs: 5000 })
    if (process.exitCode !== 0 || !process.stdout.trim()) throw new Error('engine process identity unavailable')
    const key = `process:${id.sid}`
    const previous = await $.store.get(key) as { token?: string; reminded?: boolean } | undefined
    o.process = process.stdout.trim()
    o.resume = o.history && (previous?.token !== o.process || !previous.reminded)
    if (o.retired) return null
    await $.store.set(key, { token: o.process, reminded: !o.resume })
    o.activated = id.sid
  }
  return { id, path, before }
}
const writeProjection = async ($: EngineInterface, o: Observer, id: Identity) => {
  if (o.retired) return
  const path = projectionOf(id)
  const before = await $.fs.exists(path) ? await $.fs.read(path) : null
  const text = snapshot(id, o.rows)
  if (before !== text && !o.retired) await atomic($, path, text, before)
}
const retire = async (o: Observer) => { o.closing = true; await o.writing; o.retired = true }



// Staged instances do no source IO at start; all writes share one queue.
export const register: Register = on => {
  const o: Observer = { retired: false, closing: false, instance: crypto.randomUUID(), id: null, rows: [], history: false, resume: false, activated: '', process: '', writing: Promise.resolve(), last: null }

  on('command.run', { command: 'reload-plugins' }, async ($, e, next) => {
    await retire(o)
    try { return await next(e) }
    finally {
      // A failed reload must also reactivate the unchanged module.
      try { await $.session.id(); o.retired = false; o.closing = false } catch { /* Swapped environments stay retired. */ }
    }
  }).catch(async ($, e, next) => { await failure($, o, 'reload', next.error); return next(e) })

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'asks', description: 'Read owner message source, count, projection and last failure' })
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    o.closing = true
    await o.writing
    o.id = null; o.rows = []; o.activated = ''; o.resume = false
    const result = await next(e)
    o.closing = false
    return result
  })

  on('command.run', { command: 'asks' }, async ($) => {
    // Read-only: do not repair the projection, change controls or persist state.
    await o.writing
    try {
      const state = await ready($, o, false)
      if (!state) return { text: 'asks: instance retired' }
      const path = `${rootOf(state.id)}/last-failure.json`
      const last = o.last ? JSON.stringify(o.last) : await $.fs.exists(path) ? await $.fs.read(path) : 'none'
      return { text: `owner-asks v${MOD_VERSION}\nsource: ${state.path}\nrecords: ${o.rows.length}\nprojection: ${projectionOf(state.id)}\nlast failure: ${last}\nfailure path: ${path}` }
    } catch (err) { return { text: `asks: ${errText(err)}` } }
  })

  on('session.append', { origin: [{ kind: 'composer' }, { kind: 'bridge' }], door: ['prompt', 'delivery', 'command'] }, async ($, e, next) => {
    const result = await next(e)
    // Only committed owner messages enter the index; notices and plugin rows never do.
    if (e.agentId !== undefined || 'deny' in result || !['prompt', 'delivery', 'command'].includes(e.door) ||
        !['composer', 'bridge'].includes(e.origin.kind) || result.message.role === 'assistant') return result
    await serial($, o, 'owner message', async () => {
      // Saving owner text does not depend on the resume check or its store.
      const state = await ready($, o, false)
      if (!state || o.retired) return
      if (!o.rows.some(r => r.uuid === result.uuid)) {
        const rendered = result.message.content.flatMap(b => b.type === 'text' ? [b.text] : []).join('\n')
        const row = messageOf(state.id, result.uuid, e.origin.kind, e.door, rendered)
        const text = (state.before ?? '') + (state.before && !state.before.endsWith('\n') ? '\n' : '') + JSON.stringify(row) + '\n'
        if (o.retired) return
        await atomic($, state.path, text, state.before)
        o.rows.push(row)
      }
      await writeProjection($, o, state.id)
    })
    return result
  }).catch(async ($, e, next) => { await failure($, o, 'session.append', next.error); return next(e) })

  on('tool.call', async ($, e, next) => {
    const result = await next(e)
    if (next.origin.plugin !== 'engine' || e.agentId !== undefined || 'deny' in result) return result
    const context = [...(result.context ?? [])]
    await serial($, o, 'resume reminder', async () => {
      if (o.activated && !o.resume) return
      const state = await ready($, o)
      if (!state || o.retired || !o.resume) return
      await writeProjection($, o, state.id)
      await $.store.set(`process:${state.id.sid}`, { token: o.process, reminded: true })
      context.push(`Owner message reminder after resume (owner-asks):\n${snapshot(state.id, o.rows)}`)
      o.resume = false
    })
    return context.length === (result.context ?? []).length ? result : { ...result, context }
  }).catch(async ($, e, next) => { await failure($, o, 'tool.call', next.error); return next(e) })

}
