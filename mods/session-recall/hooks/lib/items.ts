/**
 * An answer's lines as things to quote back: list items, table rows and prose lines, in order, exact as written but for
 * a list marker. In past sessions 204 follow-ups pasted one line of an answer back with a short comment, and 61 pasted
 * several, each with its own; a terminal cannot select across the reply, so the lines are offered one by one.
 * Left out: headings, code blocks (a fence and all inside it), a table's header and `|---|` line, a lone `---`.
 */
export function itemsOf(text: string, max = 60): string[] {
  const out: string[] = []
  let fence = ''
  let lastRow = -1
  const lines = text.split('\n')
  for (let n = 0; n < lines.length && out.length < max + 1; n++) {
    const line = lines[n]!.trimEnd()
    const f = /^\s*(`{3,}|~{3,})/.exec(line)
    if (f) {
      if (!fence) fence = f[1]![0]!
      else if (f[1]![0] === fence) fence = ''
      continue
    }
    if (fence || !line.trim() || /^\s*#{1,6}\s/.test(line) || /^\s*([-*_])\s*(\1\s*){2,}$/.test(line)) continue
    // `|---|---|`: the row before it was the header.
    if (/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(line)) {
      if (lastRow === n - 1 && out.length) out.pop()
      continue
    }
    const row = /^\s*\|(.*)\|\s*$/.exec(line)
    if (row) {
      // As written between the outer pipes: a cell's `\|` stays, cells are not rejoined.
      out.push(row[1]!.trim())
      lastRow = n
      continue
    }
    const item = /^\s*(?:[-*+]|\d{1,3}[.)])\s+(.*)$/.exec(line)
    out.push((item ? item[1]! : line).trim())
  }
  return out.slice(0, max)
}

/**
 * Quotes as the prompt takes them: each one a `>` block with an empty line after it for the comment on it. Every line of
 * a quote gets its `>`: a line break must not end the quote and leave text outside it. Control characters go.
 */
export const quoteOf = (items: readonly string[]) =>
  items.map(x => `${x.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ').split('\n').map(l => `> ${l}`).join('\n')}\n\n`).join('')

/**
 * Where one block of a reply (the transcript draws a reply as blocks) sits among the answers the TUI offers: the answer
 * holding most of its lines, and their places in it. None when under half of the block's lines are in any one answer:
 * a lone common line (`OK`) must not mark another reply. Newest answer first, as the list is.
 */
export function locate(answers: readonly { id: string; items: readonly string[] }[], text: string): { answer: string; lines: number[] } | undefined {
  const block = itemsOf(text)
  for (const a of answers) {
    const lines = block.map(x => a.items.indexOf(x)).filter(i => i >= 0)
    if (block.length && lines.length * 2 >= block.length) return { answer: a.id, lines: [...new Set(lines)] }
  }
  return undefined
}

/**
 * Text as the terminal shows it and as the reply was written, made comparable: markdown marks, bullets and all
 * whitespace go (a soft wrap puts a break, and an indent, between two CJK characters that had none).
 */
export const plain = (t: string) => t.replace(/^[\s⏺•]*(?:\d{1,3}[.)]\s+)?/gm, '').replace(/[*_`#>|•⏺\-\s]/g, '')

/** A copied excerpt this short matches too much to name a place. */
const MIN_EXCERPT = 4

/**
 * Where a copied excerpt of a reply comes from: the one answer whose lines hold it, and which of its lines it covers
 * (the first and last may be covered in part). Two answers holding it name no place: the newest is not proof.
 * `only`: the answer the excerpt must be in (the reply block whose `↩` was pressed).
 */
export function findExcerpt(answers: readonly { id: string; items: readonly string[]; flat?: string }[], excerpt: string, only?: string): { answer: string; lines: number[] } | undefined {
  const want = plain(excerpt)
  if (want.length < MIN_EXCERPT) return undefined
  // flat: the answer's plain text, when the caller made it once for many excerpts.
  const hits = answers.filter(a => (only === undefined || a.id === only) && (a.flat ?? plain(a.items.join(''))).includes(want))
  if (hits.length !== 1) return undefined
  const a = hits[0]!
  const from = (a.flat ?? plain(a.items.join(''))).indexOf(want)
  const to = from + want.length
  const lines: number[] = []
  let at = 0
  a.items.forEach((x, i) => {
    const end = at + plain(x).length
    if (end > from && at < to) lines.push(i)
    at = end
  })
  return { answer: a.id, lines }
}

/** `#q3` in a prompt: quote 3 the TUI put there. */
export function quoteRefsIn(text: string): number[] {
  const out: number[] = []
  for (const m of text.matchAll(/(?:^|[\s(（,，])#q(\d{1,3})\b/g)) if (!out.includes(Number(m[1]))) out.push(Number(m[1]))
  return out
}

/** An answer's identity across snapshots: its lines (FNV-1a), so a selection stays on the answer it was made in. */
export function answerId(items: readonly string[]): string {
  let h = 0x811c9dc5
  for (const ch of items.join('\n')) h = Math.imul(h ^ ch.codePointAt(0)!, 0x01000193) >>> 0
  return h.toString(36)
}
