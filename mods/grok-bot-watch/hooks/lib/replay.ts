// The W42-8 replay classes over one session's grok-bot-watch events; bin/replay.mjs reads the files.
export type Event = { ev: string; bot: string; gen: number; h?: string; via?: string; prior?: boolean }

/** Counts the classes over one session's events, in file order. */
export function classify(events: Event[]) {
  const out = { wakes: 0, resent: 0, sameText: 0, rewatch: { tool: 0, command: 0, panel: 0 } as Record<string, number>, unwatch: 0, afterUnwatch: 0 }
  const last = new Map<string, { h?: string; armed: boolean }>()
  const gone = new Set<string>() // `${bot}#${gen}` unwatched
  for (const e of events) {
    if (e.ev === 'watch') {
      if (e.prior) out.rewatch[e.via ?? '?'] = (out.rewatch[e.via ?? '?'] ?? 0) + 1
      last.delete(e.bot)
    } else if (e.ev === 'armed') {
      const l = last.get(e.bot)
      if (l) l.armed = true
    } else if (e.ev === 'unwatch') {
      out.unwatch += 1
      gone.add(`${e.bot}#${e.gen}`)
    } else if (e.ev === 'wake') {
      out.wakes += 1
      if (gone.has(`${e.bot}#${e.gen}`)) out.afterUnwatch += 1
      const l = last.get(e.bot)
      if (l && l.h === e.h) {
        if (l.armed) out.sameText += 1
        else out.resent += 1
      }
      last.set(e.bot, { h: e.h, armed: false })
    }
  }
  return out
}

