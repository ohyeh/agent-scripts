#!/usr/bin/env node
// The whole transcript of a session, as the replay reads it: `$.session.messages()` holds only what follows the last
// compaction, and the file is too big for the mod to read (24-79 MB against a 4 MiB read). Prints JSON, the messages
// `assetsOfTranscript` takes, cut to the lines it reads. Usage: transcript.mjs <session id>
import { createReadStream, existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { createInterface } from 'node:readline'

const sid = process.argv[2]
if (!/^[\w-]+$/.test(sid ?? '')) throw new Error('usage: transcript.mjs <session id>')
const root = `${process.env.CLAUDE_CONFIG_DIR || `${homedir()}/.claude`}/projects`
const file = readdirSync(root).map(d => `${root}/${d}/${sid}.jsonl`).find(existsSync)
if (!file) throw new Error(`no transcript ${sid}.jsonl under ${root}`)

// A reply's URLs and pictures are labelled by their own line; a tool's output is read for a commit, a push, an
// Artifact's URL, a picture a command saved, or a test run's URLs (to mute their echo in a reply).
const MEDIA = /\.(?:png|jpe?g|gif|webp|svg|heic|mp4|mov|m4v|webm|mkv)\b/i
const replyLines = t => t.split('\n').filter(l => /https?:\/\//.test(l) || MEDIA.test(l)).join('\n')
const toolLines = t => t.split('\n').filter(l => /^\[[^\]]+ [0-9a-f]{7,40}\]|^To \S|->|https?:\/\//.test(l) || MEDIA.test(l)).slice(0, 40).join('\n')
// What a call wrote is not read; the rest (a command, a path, a description) is.
const BIG = new Set(['content', 'new_string', 'old_string', 'edits', 'new_source'])
const slim = input => Object.fromEntries(Object.entries(input ?? {}).filter(([k]) => !BIG.has(k)))

const msgs = []
const results = new Map()
for await (const line of createInterface({ input: createReadStream(file) })) {
  if (!line.includes('"assistant"') && !line.includes('"user"')) continue
  let d
  try { d = JSON.parse(line) } catch { continue }
  if (d.isSidechain) continue
  const c = d.message?.content
  // What the person wrote (a pasted link): the prune never takes a row whose URL they gave.
  if (d.type === 'user' && !d.isMeta) {
    const said = typeof c === 'string' ? c : Array.isArray(c) ? c.filter(b => b.type === 'text').map(b => b.text).join('\n') : ''
    const text = replyLines(said)
    if (text) msgs.push({ role: 'user', text, toolUses: [], said: true })
  }
  if (!Array.isArray(c)) continue
  if (d.type === 'user') for (const b of c) if (b.type === 'tool_result') {
    const text = typeof b.content === 'string' ? b.content : Array.isArray(b.content) ? b.content.filter(x => x.type === 'text').map(x => x.text).join('\n') : ''
    results.set(b.tool_use_id, { text: toolLines(text), ...(b.is_error ? { isError: true } : {}) })
  }
  // A reply with nothing to keep still counts: it ends a turn (a test's mute ends with it).
  if (d.type === 'assistant') msgs.push({ role: 'assistant', text: replyLines(c.filter(b => b.type === 'text').map(b => b.text).join('\n')), toolUses: c.filter(b => b.type === 'tool_use').map(b => ({ id: b.id, tool: b.name, input: slim(b.input) })), said: c.some(b => b.type === 'text' && b.text.trim()) })
}
// An answered use has its text (an empty one too); an unanswered one has none.
for (const m of msgs) for (const u of m.toolUses) { Object.assign(u, results.get(u.id) ?? {}); delete u.id }
process.stdout.write(JSON.stringify(msgs.filter(m => m.said || m.toolUses.length).map(({ said: _, ...m }) => m)))
