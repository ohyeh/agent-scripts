#!/usr/bin/env node
// Replays grok-bot-watch event logs (~/.claude/grok-bot-watch/events/<session>.jsonl) and
// counts the four W40-3 / W42-8 classes per session and bot:
//   resent          a wake with the same reply hash as the last wake, no `armed` between: the
//                   same reply delivered twice (a defect; must be 0)
//   sameText        the same hash again after an `armed` (the bot worked again): a new reply
//                   with the same text, a correct wake
//   rewatch         a watch of a bot this session already watched, by `via` (tool = the model,
//                   command / panel = a person)
//   afterUnwatch    a wake of a generation already unwatched (a defect; must be 0), next to the
//                   unwatch count
// Usage: replay.mjs [file.jsonl ...]   (default: every file in ~/.claude/grok-bot-watch/events)
// One JSON object on stdout; exit 1 when resent or afterUnwatch is not 0.
import { readFileSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { classify } from '../hooks/lib/replay.ts'

const parse = text => text.split('\n').filter(Boolean).map(l => JSON.parse(l))

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = join(homedir(), '.claude/grok-bot-watch/events')
  let files = process.argv.slice(2)
  if (!files.length) {
    try {
      files = readdirSync(dir).filter(f => f.endsWith('.jsonl')).map(f => join(dir, f))
    } catch {
      files = []
    }
  }
  const sessions = files.map(f => ({ file: f, ...classify(parse(readFileSync(f, 'utf8'))) }))
  const sum = k => sessions.reduce((a, s) => a + s[k], 0)
  const total = { sessions: sessions.length, wakes: sum('wakes'), resent: sum('resent'), sameText: sum('sameText'), unwatch: sum('unwatch'), afterUnwatch: sum('afterUnwatch') }
  console.log(JSON.stringify({ total, sessions }))
  process.exit(total.resent || total.afterUnwatch ? 1 : 0)
}
