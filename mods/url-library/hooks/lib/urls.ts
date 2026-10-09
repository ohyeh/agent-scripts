export type Entry = {
  url: string
  host: string
  isLocal: boolean
  /** What produced it: a Bash call's description, else its command head, else the tool name. */
  label: string
  /** Basename of the session's cwd. */
  project: string
  /** Last time seen, epoch ms. */
  at: number
}

export const MAX_ENTRIES = 300
// shortcut: keeps at most 5 URLs per tool result so a dumped HTML page cannot flood the list; raise if real links get dropped.
const PER_CALL = 5
const URL_RE = /\bhttps?:\/\/[^\s<>"'`|\\^{}]+/g

/** URLs in text, trailing punctuation and unbalanced closers trimmed, deduped, first PER_CALL. */
export function extractUrls(text: string): string[] {
  const out: string[] = []
  for (const raw of text.match(URL_RE) ?? []) {
    let url = raw.replace(/[.,;:!?'"]+$/, '')
    while (/[)\]]$/.test(url) && count(url, url.endsWith(')') ? '(' : '[') < count(url, url.slice(-1))) url = url.slice(0, -1)
    if (!hostOf(url) || out.includes(url)) continue
    out.push(url)
    if (out.length === PER_CALL) break
  }
  return out
}

const count = (s: string, ch: string) => s.split(ch).length - 1

export function hostOf(url: string): string {
  const m = /^https?:\/\/(?:[^@/]*@)?(\[[^\]]+\]|[^/:?#]+)(:\d+)?/i.exec(url)
  return m ? (m[1] + (m[2] ?? '')).toLowerCase() : ''
}

/** Loopback, private ranges, CGNAT (Tailscale), *.local and *.ts.net count as local. */
export function isLocalHost(host: string): boolean {
  const h = host.replace(/:\d+$/, '').replace(/^\[|\]$/g, '')
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.ts.net') || h === '::1' || h === '0.0.0.0') return true
  const ip = /^(\d+)\.(\d+)\.\d+\.\d+$/.exec(h)
  if (!ip) return false
  const [a, b] = [Number(ip[1]), Number(ip[2])]
  return a === 127 || a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 100 && b >= 64 && b <= 127)
}

/** Newest first; a URL seen again moves to the top with its newest label. */
export function merge(list: readonly Entry[], fresh: readonly Entry[]): Entry[] {
  const urls = new Set(fresh.map(e => e.url))
  return [...fresh, ...list.filter(e => !urls.has(e.url))].slice(0, MAX_ENTRIES)
}

export type Group = 'Today' | 'This week' | 'Older'

export function groupOf(at: number, now: number): Group {
  if (new Date(at).toDateString() === new Date(now).toDateString()) return 'Today'
  return now - at < 7 * 86_400_000 ? 'This week' : 'Older'
}
