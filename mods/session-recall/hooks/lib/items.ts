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

/** An answer's identity across snapshots: its lines (FNV-1a), so a selection stays on the answer it was made in. */
export function answerId(items: readonly string[]): string {
  let h = 0x811c9dc5
  for (const ch of items.join('\n')) h = Math.imul(h ^ ch.codePointAt(0)!, 0x01000193) >>> 0
  return h.toString(36)
}
