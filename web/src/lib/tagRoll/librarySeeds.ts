/**
 * Charts the Tag Studio library can load on request: Lilly Marlene and the
 * published polecat mixed arrangements (the golden songs).
 */

export type LibrarySeedKind = 'tag' | 'golden'

export type LibrarySeedOffer = {
  id: string
  kind: LibrarySeedKind
  /** Name shown in the picker. */
  label: string
  /** Public JSON for a golden song. Absent for the bundled tag. */
  fileUrl?: string
}

export const LILLY_LIBRARY_SEED_ID = 'seed-lilly-marlene-v2'
export const LILLY_LIBRARY_SEED_TITLE = 'Lilly Marlene (v2)'

export const LILLY_LIBRARY_SEED: LibrarySeedOffer = {
  id: LILLY_LIBRARY_SEED_ID,
  kind: 'tag',
  label: 'Lilly Marlene',
}

const MIXED_TITLE_PREFIX = /^Polecat mixed\s·\s/

/** Song offers from `/tag-studio/polecat-mixed-seeds/index.json`. */
export function goldenOffersFromIndex(raw: unknown): LibrarySeedOffer[] {
  if (!raw || typeof raw !== 'object') return []
  const projects = (raw as { projects?: unknown }).projects
  if (!Array.isArray(projects)) return []
  const out: LibrarySeedOffer[] = []
  for (const row of projects) {
    if (!row || typeof row !== 'object') continue
    const id = (row as { id?: unknown }).id
    const title = (row as { title?: unknown }).title
    const file = (row as { file?: unknown }).file
    if (typeof id !== 'string' || !id.startsWith('seed-polecat-mixed-')) continue
    if (typeof file !== 'string' || !file.endsWith('.json')) continue
    const fromTitle = typeof title === 'string' ? title.replace(MIXED_TITLE_PREFIX, '').trim() : ''
    out.push({
      id,
      kind: 'golden',
      label: fromTitle || id,
      fileUrl: `/tag-studio/polecat-mixed-seeds/${file}`,
    })
  }
  return out
}

export function librarySeedInLibrary(
  summaries: readonly { id: string; title: string }[],
  offer: LibrarySeedOffer,
): boolean {
  if (offer.kind === 'tag') {
    return summaries.some(
      (s) => s.id === offer.id || s.title === LILLY_LIBRARY_SEED_TITLE,
    )
  }
  return summaries.some((s) => s.id === offer.id)
}
