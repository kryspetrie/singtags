/**
 * Parse Coach Learn / glossary prose into paragraphs, lists, callouts, and epigraphs.
 * Supports blank-line paragraphs, •/- bullets, 1. / 1) steps,
 * `> callout` lines, and `>> epigraph | Cite` lines.
 */
export type TeachProseBlock =
  | { type: 'p'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'callout'; text: string }
  | { type: 'epigraph'; text: string; cite?: string }

function isBullet(line: string): boolean {
  return /^[•\-*]\s+/.test(line)
}

function isNumbered(line: string): boolean {
  return /^\d+[.)]\s+/.test(line)
}

function isCallout(line: string): boolean {
  return /^>\s+(?!>)/.test(line)
}

function isEpigraph(line: string): boolean {
  return /^>>\s+/.test(line)
}

function stripBullet(line: string): string {
  return line.replace(/^[•\-*]\s+/, '').trim()
}

function stripNumbered(line: string): string {
  return line.replace(/^\d+[.)]\s+/, '').trim()
}

function stripCallout(line: string): string {
  return line.replace(/^>\s+/, '').trim()
}

function parseEpigraph(line: string): { text: string; cite?: string } {
  const raw = line.replace(/^>>\s+/, '').trim()
  const pipe = raw.lastIndexOf('|')
  if (pipe > 0) {
    const text = raw.slice(0, pipe).trim()
    const cite = raw.slice(pipe + 1).trim()
    if (text && cite) return { text, cite }
  }
  return { text: raw }
}

function blocksFromLines(lines: readonly string[]): TeachProseBlock[] {
  const out: TeachProseBlock[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]!
    if (isEpigraph(line)) {
      const { text, cite } = parseEpigraph(line)
      if (text) out.push({ type: 'epigraph', text, ...(cite ? { cite } : {}) })
      i++
      continue
    }
    if (isCallout(line)) {
      out.push({ type: 'callout', text: stripCallout(line) })
      i++
      continue
    }
    if (isBullet(line)) {
      const items: string[] = []
      while (i < lines.length && isBullet(lines[i]!)) {
        items.push(stripBullet(lines[i]!))
        i++
      }
      if (items.length) out.push({ type: 'ul', items })
      continue
    }
    if (isNumbered(line)) {
      const items: string[] = []
      while (i < lines.length && isNumbered(lines[i]!)) {
        items.push(stripNumbered(lines[i]!))
        i++
      }
      if (items.length) out.push({ type: 'ol', items })
      continue
    }
    const buf: string[] = []
    while (
      i < lines.length &&
      !isBullet(lines[i]!) &&
      !isNumbered(lines[i]!) &&
      !isCallout(lines[i]!) &&
      !isEpigraph(lines[i]!)
    ) {
      buf.push(lines[i]!)
      i++
    }
    const text = buf.join(' ').replace(/\s+/g, ' ').trim()
    if (text) out.push({ type: 'p', text })
  }
  return out
}

/** Turn teaching copy into renderable blocks (paragraphs / lists / callouts / epigraphs). */
export function parseTeachProse(raw: string): TeachProseBlock[] {
  const text = raw.replace(/\r\n/g, '\n').trim()
  if (!text) return []
  const out: TeachProseBlock[] = []
  for (const chunk of text.split(/\n{2,}/)) {
    const lines = chunk
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
    if (!lines.length) continue
    out.push(...blocksFromLines(lines))
  }
  return out
}
