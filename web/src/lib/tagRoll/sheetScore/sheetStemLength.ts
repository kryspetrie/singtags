/**
 * Apply Format → stem length to VexFlow notes (preserves flag/beam extension).
 */
import type { StaveNote } from 'vexflow'
import { Stem } from 'vexflow'
import {
  SHEET_STEM_LENGTH_MAX,
  SHEET_STEM_LENGTH_MIN,
  clampSheetFormat,
} from '../sheetFormat'

export function clampSheetStemLength(v: unknown, fallback = 0.8): number {
  return clampSheetFormat(v, SHEET_STEM_LENGTH_MIN, SHEET_STEM_LENGTH_MAX, fallback)
}

/** Scale stem body; keeps any flag-driven extension from VexFlow. */
export function applySheetStemLength(note: StaveNote, scale: number): void {
  if (note.isRest()) return
  const s = clampSheetStemLength(scale, 1)
  if (Math.abs(s - 1) < 0.01) return
  let flagExt = 0
  try {
    flagExt = note.getStemExtension()
  } catch {
    flagExt = 0
  }
  note.setStemLength(Stem.HEIGHT * s + flagExt)
}
