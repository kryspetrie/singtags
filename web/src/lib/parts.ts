/** Primary learning-track ids in preferred UI order (mix first). */
export const PRIMARY_PARTS = ['mix', 'lead', 'tenor', 'bari', 'bass'] as const

export type PrimaryPartId = (typeof PRIMARY_PARTS)[number]

/** Any learning-track id from the catalog (primary or extra: other1, duet, …). */
export type PartId = string

const PRIMARY_LABELS: Record<string, string> = {
  mix: 'Mix',
  lead: 'Lead',
  tenor: 'Tenor',
  bari: 'Bari',
  bass: 'Bass',
}

const PRIMARY_TRACK_LABELS: Record<string, string> = {
  mix: 'Mix Track',
  lead: 'Lead Track',
  tenor: 'Tenor Track',
  bari: 'Bari Track',
  bass: 'Bass Track',
}

/** Short label for part switcher buttons. */
export function partLabel(part: string): string {
  if (PRIMARY_LABELS[part]) return PRIMARY_LABELS[part]!
  return humanizePartId(part)
}

/** Longer label for download toggles. */
export function partTrackLabel(part: string): string {
  if (PRIMARY_TRACK_LABELS[part]) return PRIMARY_TRACK_LABELS[part]!
  return `${humanizePartId(part)} Track`
}

function humanizePartId(part: string): string {
  const s = part.replace(/[_-]+/g, ' ').trim()
  if (!s) return part
  // other1 → Other 1
  return s
    .replace(/([a-z])(\d)/gi, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Sort learning-track ids: primary parts first, then extras A–Z. */
export function sortPartIds(parts: Iterable<string>): string[] {
  const list = [...new Set(parts)].filter(Boolean)
  return list.sort((a, b) => {
    const ia = PRIMARY_PARTS.indexOf(a as PrimaryPartId)
    const ib = PRIMARY_PARTS.indexOf(b as PrimaryPartId)
    if (ia >= 0 && ib >= 0) return ia - ib
    if (ia >= 0) return -1
    if (ib >= 0) return 1
    return a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true })
  })
}

/** Default part to select when opening a tag (mix, then lead, then first available). */
export function preferredDefaultPart(parts: string[]): string | null {
  if (!parts.length) return null
  if (parts.includes('mix')) return 'mix'
  if (parts.includes('lead')) return 'lead'
  return parts[0]!
}
