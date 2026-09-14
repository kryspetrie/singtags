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
  arranger: string
  key?: string
  /** Omit / undefined = unspecified (wildcards when voicing criterion is on). */
  voicing?: Voicing
  /** partId → confidence; omit part = don't know it */
  parts: Record<string, Confidence>
}

export interface RepertoireProfile {
  displayName: string
  songs: RepertoireSong[]
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

export function emptyProfile(): RepertoireProfile {
  return { displayName: '', songs: [], updatedAt: Date.now() }
}
