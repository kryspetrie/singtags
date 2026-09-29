/**
 * Parse Coach Learn / glossary prose into paragraphs and lists.
 * Supports blank-line paragraphs, •/- bullets, and 1. / 1) numbered steps.
 */
export type TeachProseBlock =
  | { type: 'p'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }

function isBullet(line: string): boolean {
  return /^[•\-*]\s+/.test(line)
}

function isNumbered(line: string): boolean {
  return /^\d+[.)]\s+/.test(line)
}

function stripBullet(line: string): string {
  return line.replace(/^[•\-*]\s+/, '').trim()
}

function stripNumbered(line: string): string {
  return line.replace(/^\d+[.)]\s+/, '').trim()
}

function blocksFromLines(lines: readonly string[]): TeachProseBlock[] {
  const out: TeachProseBlock[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]!
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
      !isNumbered(lines[i]!)
    ) {
      buf.push(lines[i]!)
      i++
    }
    const text = buf.join(' ').replace(/\s+/g, ' ').trim()
    if (text) out.push({ type: 'p', text })
  }
  return out
}

/** Turn teaching copy into renderable blocks (paragraphs / ul / ol). */
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
