/**
 * Inspect-range (chord cursor) transport + edit helpers.
 */
import type { TagRollNoteClipboard } from './selection'

export type InspectRange = { startTick: number; endTick: number }

/** When an inspect range is active, play only that slice and rewind to its start. */
export function resolveInspectPlayback(
  cursor: InspectRange | null | undefined,
  playheadTick: number,
): { fromTick: number; untilTick: number; rewindTick: number } | null {
  if (!cursor || cursor.endTick <= cursor.startTick) return null
  const start = Math.max(0, Math.round(cursor.startTick))
  const end = Math.max(start + 1, Math.round(cursor.endTick))
  const from = playheadTick >= start && playheadTick < end ? playheadTick : start
  return { fromTick: from, untilTick: end, rewindTick: start }
}

/** Confirm wiping every note inside the L/R inspect bounds. */
export function confirmDeleteInspectRangeNotes(
  count: number,
  ask: (message: string) => boolean = (message) => globalThis.confirm(message),
): boolean {
  if (count <= 0) return false
  const noun = count === 1 ? 'note' : 'notes'
  return ask(
    `Delete ${count} ${noun} in this selection?\n\nThis removes all notes between the left and right bounds.`,
  )
}

type InspectCopyFn = () => TagRollNoteClipboard | null
type InspectPasteHighlightFn = (startTick: number, endTick: number) => void

let boundInspectDelete: (() => boolean) | null = null
let boundInspectCopy: InspectCopyFn | null = null
let boundInspectCut: InspectCopyFn | null = null
let boundInspectPasteHighlight: InspectPasteHighlightFn | null = null

export function bindInspectDeleteHandler(fn: (() => boolean) | null): void {
  boundInspectDelete = fn
}

export function tryBoundInspectDelete(): boolean {
  return boundInspectDelete?.() ?? false
}

export function bindInspectCopyHandler(fn: InspectCopyFn | null): void {
  boundInspectCopy = fn
}

export function tryBoundInspectCopy(): TagRollNoteClipboard | null {
  return boundInspectCopy?.() ?? null
}

export function bindInspectCutHandler(fn: InspectCopyFn | null): void {
  boundInspectCut = fn
}

export function tryBoundInspectCut(): TagRollNoteClipboard | null {
  return boundInspectCut?.() ?? null
}

export function bindInspectPasteHighlightHandler(fn: InspectPasteHighlightFn | null): void {
  boundInspectPasteHighlight = fn
}

export function tryBoundInspectPasteHighlight(startTick: number, endTick: number): void {
  boundInspectPasteHighlight?.(startTick, endTick)
}

/** Wire Delete / Copy / Cut / paste-highlight for the open Tag Studio editor. */
export function installInspectEditorHooks(api: {
  tryDeleteInspectRangeNotes: () => boolean
  tryCopyInspectRangeNotes: () => TagRollNoteClipboard | null
  tryCutInspectRangeNotes: () => TagRollNoteClipboard | null
  setChordCursor: (range: InspectRange) => void
}): () => void {
  bindInspectDeleteHandler(() => api.tryDeleteInspectRangeNotes())
  bindInspectCopyHandler(() => api.tryCopyInspectRangeNotes())
  bindInspectCutHandler(() => api.tryCutInspectRangeNotes())
  bindInspectPasteHighlightHandler((startTick, endTick) =>
    api.setChordCursor({ startTick, endTick }),
  )
  return () => {
    bindInspectDeleteHandler(null)
    bindInspectCopyHandler(null)
    bindInspectCutHandler(null)
    bindInspectPasteHighlightHandler(null)
  }
}
