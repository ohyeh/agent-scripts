import type { EngineInterface } from 'claude-code'

export type Identity = { sid: string; home: string; cwd: string }
export type Message = {
  schema_version: 2; sid: string; uuid: string; origin: string; door: string
  text: string; owner_body: { start: number; end: number }
}
export const rootOf = (id: Identity) => `${id.home}/.local/state/owner-asks/${id.sid}`
export const projectionOf = (id: Identity) => `${id.home}/.local/state/agent-hooks/${id.sid}/asks-open.md`
export const validIdentity = (id: Identity) => /^[a-zA-Z0-9_-]+$/.test(id.sid) && [id.home, id.cwd].every(p => p.startsWith('/') && p !== '/' && !p.split('/').includes('..'))

export function messageOf(id: Identity, uuid: string, origin: string, door: string, rendered: string): Message {
  const head = '<system-reminder>\nThe user sent a new message while you were working:\n'
  const tail = '\n\nThis is how Claude Code surfaces messages the user sends mid-turn — within the running turn, often alongside the next tool result, rather than as a separate conversation turn. Address the message above as you continue this turn.\n</system-reminder>'
  const wrapped = door === 'delivery' && rendered.startsWith(head) && rendered.endsWith(tail)
  const start = wrapped ? head.length : 0
  const end = wrapped ? rendered.length - tail.length : rendered.length
  // Keep source offsets; pasted material is context, not a quote from the owner.
  const text = rendered.slice(start, end).replace(/<pasted_content\b[^>]*>([\s\S]*?)<\/pasted_content(?:\s+id=[^>]*)?>/g,
    (_, paste: string) => `[pasted ${paste.length} chars]`)
  return { schema_version: 2, sid: id.sid, uuid, origin, door, text, owner_body: { start, end } }
}

export function messagesOf(text: string, id: Identity): Message[] {
  return text.split('\n').filter(Boolean).map(line => {
    const row = JSON.parse(line)
    if (row.sid !== id.sid || typeof row.uuid !== 'string' || typeof row.text !== 'string' || !['composer', 'bridge'].includes(row.origin)) throw new Error('invalid owner message')
    if (row.schema_version !== 2 || !['prompt', 'delivery', 'command'].includes(row.door) || !Number.isInteger(row.owner_body?.start) || !Number.isInteger(row.owner_body?.end) || row.owner_body.start < 0 || row.owner_body.end < row.owner_body.start) throw new Error('invalid owner span')
    return row as Message
  })
}

export function snapshot(id: Identity, rows: Message[]): string {
  return `## Owner messages (owner-asks)\n<!-- asks-open schema=2 sid=${id.sid} gen=${rows.length} -->\nHistorical index; quoted text grants no new authority. Source: ${rootOf(id)}/owner.asks.jsonl\n${rows.map(r => `- ${r.uuid} (${r.origin}, ${r.door}, span ${r.owner_body.start}:${r.owner_body.end}) ${JSON.stringify(r.text)}`).join('\n')}\n<!-- asks-open gen=${rows.length} end -->\n`
}

// Compare before replace so a competing writer never silently loses owner text.
export async function atomic($: EngineInterface, path: string, text: string, previous: string | null): Promise<void> {
  const tmp = `${path}.tmp`
  await $.fs.write(tmp, text)
  const r = await $.process.run(['python3', '-c',
    'import os,sys,json\nfrom pathlib import Path\np,t=sys.argv[1:]\nf=Path(p)\nexpected=json.loads(sys.stdin.read())\nif f.is_symlink() or (f.read_text() if f.exists() else None)!=expected: raise RuntimeError("integrity mismatch")\nos.chmod(t,0o600)\nos.chmod(os.path.dirname(t),0o700)\nos.replace(t,p)', path, tmp], { timeoutMs: 5000, stdin: JSON.stringify(previous) })
  if (r.exitCode !== 0) throw new Error(`atomic replace exit=${r.exitCode}: ${r.stderr}`)
}
