/**
 * Format curriculum glossary entries for title= tooltips and teach strips.
 */
import { glossaryById } from '../../domain/arranging/education'
import type { GlossaryEntry } from '../../domain/arranging/education'

/** Single-line / multi-paragraph tooltip: "Term — short". */
export function glossaryTitle(id: string): string {
  const g = glossaryById(id)
  if (!g) return ''
  return `${g.term} — ${g.short}`
}

/** Join several glossary tips (blank line between). */
export function glossaryTitles(...ids: readonly string[]): string {
  return ids.map(glossaryTitle).filter(Boolean).join('\n\n')
}

export function glossaryEntries(ids: readonly string[]): GlossaryEntry[] {
  const out: GlossaryEntry[] = []
  const seen = new Set<string>()
  for (const id of ids) {
    if (seen.has(id)) continue
    seen.add(id)
    const g = glossaryById(id)
    if (g) out.push(g)
  }
  return out
}
