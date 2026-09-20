/**
 * Initial / reset state for Sing Together quick-add panel fields.
 */
import type { Confidence, Voicing } from './types'
import type { QuickCursor } from './quickAddChips'

export type QuickAddFieldState = {
  title: string
  titlePills: string[]
  titleDraft: string
  arranger: string
  key: string
  voicing: Voicing | ''
  parts: Record<string, Confidence>
  isTag: boolean
  linkQuery: string
  linkTagId: number | null
  linkEntryId: string | null
  linkLabel: string
  linkHighlight: number
  cursor: QuickCursor
}

export function emptyQuickAddState(): QuickAddFieldState {
  return {
    title: '',
    titlePills: [],
    titleDraft: '',
    arranger: '',
    key: '',
    voicing: '',
    parts: {},
    isTag: false,
    linkQuery: '',
    linkTagId: null,
    linkEntryId: null,
    linkLabel: '',
    linkHighlight: -1,
    cursor: { kind: 'title' },
  }
}

export function songPartConfidence(
  parts: Readonly<Record<string, Confidence>>,
  partId: string,
): Confidence | null {
  return Object.prototype.hasOwnProperty.call(parts, partId)
    ? (parts[partId] ?? 0)
    : null
}
