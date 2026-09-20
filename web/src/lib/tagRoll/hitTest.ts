/**
 * Prefer active-part notes, then shortest duration, then topmost (later index).
 */
import type { TagRollNote } from './types'

export function pickPreferredHit(
  hits: readonly TagRollNote[],
  notes: readonly TagRollNote[],
  activePartId: string | null | undefined,
): TagRollNote | null {
  if (!hits.length) return null
  const ranked = [...hits].sort((a, b) => {
    const aActive = a.partId === activePartId ? 0 : 1
    const bActive = b.partId === activePartId ? 0 : 1
    if (aActive !== bActive) return aActive - bActive
    if (a.durationTicks !== b.durationTicks) return a.durationTicks - b.durationTicks
    return notes.indexOf(b) - notes.indexOf(a)
  })
  return ranked[0] ?? null
}
