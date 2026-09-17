/**
 * Freeform song repertoire for Sing Together (not SingTags catalog tags).
 */

export const VOICINGS = ['TTBB', 'SSAA', 'SATB'] as const
export type Voicing = (typeof VOICINGS)[number]

/** 0 = not rated; 1–5 = confidence. */
export type Confidence = 0 | 1 | 2 | 3 | 4 | 5

export const TTBB_PARTS = ['tenor', 'lead', 'bari', 'bass'] as const
export const SATB_PARTS = ['soprano', 'alto', 'tenor', 'bass'] as const
export const SSAA_PARTS = ['s1', 's2', 'a1', 'a2'] as const

export type PartId =
  | (typeof TTBB_PARTS)[number]
  | (typeof SATB_PARTS)[number]
  | (typeof SSAA_PARTS)[number]
  | string

export interface RepertoireSong {
  id: string
  title: string
  /** Optional short names / common nicknames used when matching. */
  altTitles?: string[]
  arranger: string
  key?: string
  /** Omit / undefined = unspecified (wildcards when voicing criterion is on). */
  voicing?: Voicing
  /** partId → confidence; omit part = don't know it */
  parts: Record<string, Confidence>
  /**
   * When true, this row is a SingTags catalog tag (open/match tag pages).
   * When false/omitted, treat as a My Library song.
   */
  isTag?: boolean
  /**
   * Device-local deep link to a SingTags catalog tag (not packed into QR).
   * Mutually exclusive with `localEntryId` when set via the UI.
   */
  tagId?: number
  /**
   * Device-local deep link to a My Library entry (not packed into QR).
   * Mutually exclusive with `tagId` when set via the UI.
   * While the entry exists, title/arranger/key sync from My Library and are not editable here.
   * If the entry is deleted, this is cleared (unlink) and fields become editable again.
   */
  localEntryId?: string
}

/** Normalize alternate titles: trim, drop empties/dupes (case-insensitive), cap count/length. */
export function normalizeAltTitles(
  raw: unknown,
  opts?: { maxCount?: number; maxLen?: number },
): string[] | undefined {
  const maxCount = opts?.maxCount ?? 4
  const maxLen = opts?.maxLen ?? 80
  const list: string[] = []
  if (typeof raw === 'string') {
    list.push(...raw.split(/[;|]/).map((s) => s.trim()))
  } else if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === 'string') list.push(...item.split(/[;|]/).map((s) => s.trim()))
    }
  }
  const seen = new Set<string>()
  const out: string[] = []
  for (const t of list) {
    if (!t) continue
    const clipped = t.slice(0, maxLen)
    const key = clipped.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(clipped)
    if (out.length >= maxCount) break
  }
  return out.length ? out : undefined
}

/** Primary title plus alternate titles (trimmed, non-empty). */
export function songTitleVariants(song: Pick<RepertoireSong, 'title' | 'altTitles'>): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const t of [song.title, ...(song.altTitles ?? [])]) {
    const v = typeof t === 'string' ? t.trim() : ''
    if (!v) continue
    const key = v.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(v)
  }
  return out
}

export interface RepertoireCollection {
  id: string
  name: string
  /** Song ids in display order within this collection. */
  songIds: string[]
  createdAt: string
  updatedAt: string
}

export interface RepertoireProfile {
  displayName: string
  /** All songs; array order is the custom “All” order. */
  songs: RepertoireSong[]
  /** Device-local collections (not packed into QR). */
  collections: RepertoireCollection[]
  updatedAt: number
}

export function partsForVoicing(voicing?: Voicing | null): readonly string[] {
  switch (voicing) {
    case 'SSAA':
      return SSAA_PARTS
    case 'SATB':
      return SATB_PARTS
    case 'TTBB':
      return TTBB_PARTS
    default:
      return TTBB_PARTS
  }
}

export function partLabel(partId: string): string {
  const labels: Record<string, string> = {
    tenor: 'Tenor',
    lead: 'Lead',
    bari: 'Bari',
    bass: 'Bass',
    soprano: 'Soprano',
    alto: 'Alto',
    s1: 'Soprano 1',
    s2: 'Soprano 2',
    a1: 'Alto 1',
    a2: 'Alto 2',
  }
  return labels[partId] ?? partId
}

export function isVoicing(raw: unknown): raw is Voicing {
  return typeof raw === 'string' && (VOICINGS as readonly string[]).includes(raw)
}

export function clampConfidence(n: number): Confidence {
  if (!Number.isFinite(n)) return 0
  const v = Math.round(n)
  if (v <= 0) return 0
  if (v >= 5) return 5
  return v as Confidence
}

export function newSongId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function newCollectionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function emptyProfile(): RepertoireProfile {
  return { displayName: '', songs: [], collections: [], updatedAt: Date.now() }
}
