// Copied from agent-should-know hooks/lib/band.ts: a plugin's cache holds only its own dir.

/** Terminal cells: CJK and other fullwidth text takes 2. */
export const cells = (t: string) => [...t].reduce((n, ch) => n + (/[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/.test(ch) ? 2 : 1), 0)

/** The longest prefix of t that fits in max cells, with … when cut. */
export function fit(t: string, max: number): string {
  if (cells(t) <= max) return t
  let out = ''
  for (const ch of t) {
    if (cells(out + ch) + 1 > max) break
    out += ch
  }
  return max > 0 ? `${out}…` : ''
}

/**
 * Rows a drawn tree takes: a column stacks its children, a row is as tall as its tallest, a leaf is a line.
 * Assumes every Text fits its line; an engine element counts 0.
 */
export function rowsOf(n: unknown): number {
  if (Array.isArray(n)) return n.reduce((a: number, c) => a + rowsOf(c), 0)
  if (!n || typeof n !== 'object') return 0
  const el = n as { type?: string; children?: unknown; props?: { flexDirection?: string; children?: unknown } }
  if (el.type === 'engine') return 0
  if (el.type !== 'Box') return 1
  const kids = [el.children ?? el.props?.children].flat(9)
  return el.props?.flexDirection === 'column' ? kids.reduce((a: number, c) => a + rowsOf(c), 0) : Math.max(1, ...kids.map(rowsOf))
}
