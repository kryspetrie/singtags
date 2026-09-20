/**
 * Pure quick-add chip / cursor helpers for Sing Together.
 */
import { localLibraryKeyLabel } from '../../types/localLibrary'
import { parseTitleField } from './songMeta'
import {
  partLabel,
  partsForVoicing,
  type Confidence,
  type Voicing,
} from './types'

export type ChipKind = 'title' | 'arranger' | 'tag' | 'parts' | 'key' | 'voicing' | 'link'

export type QuickCursor =
  | { kind: 'title' }
  | { kind: 'arranger' }
  | { kind: 'tag' }
  | { kind: 'part-know'; partId: string }
  | { kind: 'part-rate'; partId: string }
  | { kind: 'key' }
  | { kind: 'voicing' }
  | { kind: 'link' }

export const CHIP_KINDS: readonly ChipKind[] = [
  'title',
  'arranger',
  'tag',
  'parts',
  'key',
  'voicing',
  'link',
]

export const CHIP_LABEL: Record<ChipKind, string> = {
  title: 'Title',
  arranger: 'Arranger',
  tag: 'Tag',
  parts: 'Parts',
  key: 'Key',
  voicing: 'Voicing',
  link: 'Link',
}

export function cursorKey(c: QuickCursor): string {
  if (c.kind === 'part-know' || c.kind === 'part-rate') return `${c.kind}:${c.partId}`
  return c.kind
}

export function sameCursor(a: QuickCursor, b: QuickCursor): boolean {
  return cursorKey(a) === cursorKey(b)
}

export function currentChipKind(cursor: QuickCursor): ChipKind {
  const k = cursor.kind
  if (k === 'part-know' || k === 'part-rate') return 'parts'
  return k
}

/** Flat Tab order; rate steps only appear for parts marked known. */
export function buildQuickSequence(
  partIds: readonly string[],
  knownParts: Readonly<Record<string, Confidence>>,
): QuickCursor[] {
  const seq: QuickCursor[] = [{ kind: 'title' }, { kind: 'arranger' }, { kind: 'tag' }]
  for (const partId of partIds) {
    seq.push({ kind: 'part-know', partId })
    if (Object.prototype.hasOwnProperty.call(knownParts, partId)) {
      seq.push({ kind: 'part-rate', partId })
    }
  }
  seq.push({ kind: 'key' }, { kind: 'voicing' }, { kind: 'link' })
  return seq
}

export type QuickChipState = {
  title: string
  arranger: string
  isTag: boolean
  linkLabel: string
  parts: Readonly<Record<string, Confidence>>
  key: string
  voicing: Voicing | ''
}

export function chipLabel(kind: ChipKind, state: QuickChipState): string {
  if (kind === 'title') {
    const { title, altTitles } = parseTitleField(state.title)
    if (!title) return '—'
    if (altTitles?.length) return `${title} (+${altTitles.length})`
    return title
  }
  if (kind === 'arranger') return state.arranger.trim() || '—'
  if (kind === 'tag') return state.isTag ? 'Yes' : '—'
  if (kind === 'link') return state.linkLabel || '—'
  if (kind === 'parts') {
    const ids = Object.keys(state.parts)
    if (!ids.length) return '—'
    return ids.map((id) => partLabel(id)).join(', ')
  }
  if (kind === 'key') {
    const k = state.key.trim()
    return k ? localLibraryKeyLabel(k) : '—'
  }
  return state.voicing || '—'
}

export function chipFilled(kind: ChipKind, state: QuickChipState): boolean {
  if (kind === 'title') return !!parseTitleField(state.title).title
  if (kind === 'arranger') return !!state.arranger.trim()
  if (kind === 'tag') return state.isTag
  if (kind === 'link') return !!state.linkLabel
  if (kind === 'parts') return Object.keys(state.parts).length > 0
  if (kind === 'key') return !!state.key.trim()
  return !!state.voicing
}

/** Ghost slots unlock once we reach that section (or if already filled). */
export function chipUnlocked(
  kind: ChipKind,
  state: QuickChipState,
  cursor: QuickCursor,
): boolean {
  return (
    chipFilled(kind, state) ||
    CHIP_KINDS.indexOf(kind) <= CHIP_KINDS.indexOf(currentChipKind(cursor))
  )
}

/** Keep only parts allowed for the current voicing. */
export function filterPartsForVoicing(
  parts: Readonly<Record<string, Confidence>>,
  voicing: Voicing | '' | undefined,
): Record<string, Confidence> {
  const allowed = new Set(partsForVoicing(voicing || undefined))
  const next: Record<string, Confidence> = {}
  for (const [id, conf] of Object.entries(parts)) {
    if (allowed.has(id)) next[id] = conf
  }
  return next
}

export function knowsPart(
  parts: Readonly<Record<string, Confidence>>,
  partId: string,
): boolean {
  return Object.prototype.hasOwnProperty.call(parts, partId)
}

export function toggleKnowPart(
  parts: Readonly<Record<string, Confidence>>,
  partId: string,
): Record<string, Confidence> {
  const next = { ...parts }
  if (Object.prototype.hasOwnProperty.call(next, partId)) {
    delete next[partId]
  } else {
    next[partId] = 0
  }
  return next
}

export function clampPartConfidence(conf: number): Confidence {
  return Math.max(0, Math.min(5, conf)) as Confidence
}

export function setPartConfidenceValue(
  parts: Readonly<Record<string, Confidence>>,
  partId: string,
  conf: number,
): Record<string, Confidence> | null {
  if (!knowsPart(parts, partId)) return null
  return { ...parts, [partId]: clampPartConfidence(conf) }
}

export function nextHighlightIndex(
  current: number,
  hitCount: number,
  direction: 1 | -1,
): number {
  if (hitCount <= 0) return -1
  if (direction > 0) {
    if (current < 0) return 0
    return Math.min(hitCount - 1, current + 1)
  }
  if (current <= 0) return hitCount - 1
  return current - 1
}

export type QuickAddDraft = {
  title: string
  altTitles?: string[]
  arranger: string
  key?: string
  voicing?: Voicing
  parts: Record<string, Confidence>
  isTag?: boolean
  tagId?: number
  localEntryId?: string
}

/** Build the song fields for store.upsertSong from quick-add state. */
export function buildQuickAddDraft(opts: {
  titleField: string
  arranger: string
  key: string
  voicing: Voicing | ''
  parts: Readonly<Record<string, Confidence>>
  isTag: boolean
  linkTagId: number | null
  linkEntryId: string | null
}): QuickAddDraft | null {
  const parsed = parseTitleField(opts.titleField)
  if (!parsed.title) return null
  const voicing = opts.voicing || undefined
  return {
    title: parsed.title,
    altTitles: parsed.altTitles,
    arranger: opts.arranger.trim(),
    key: opts.key.trim() || undefined,
    voicing,
    parts: filterPartsForVoicing(opts.parts, voicing),
    isTag: opts.isTag || undefined,
    tagId: opts.linkTagId ?? undefined,
    localEntryId: opts.linkEntryId ?? undefined,
  }
}

export function applyAllPartsPreset(
  voicing: Voicing | undefined,
  mode: 'off-book' | 'on-book' | 'clear',
): Record<string, Confidence> {
  if (mode === 'clear') return {}
  const conf: Confidence = mode === 'off-book' ? 5 : 3
  const parts: Record<string, Confidence> = {}
  for (const pid of partsForVoicing(voicing)) {
    parts[pid] = conf
  }
  return parts
}
