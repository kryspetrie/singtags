/**
 * Content-aware sheet measure body widths (dynamic sizing).
 * Sparse bars shrink vs Equal; dense onset columns grow past Equal.
 */
import { clampSheetMeasureScale, clampSheetNoteSpacing } from '../sheetFormat'
import { SHEET_MEASURE_WIDTH_MIN } from '../zoomFill'

export type ContentMeasureWidthOpts = {
  /** Distinct sounding onset ticks in the measure (simultaneous notes = 1). */
  onsetCount: number
  /** Musical length of the measure in quarter-note beats. */
  beatsInMeasure: number
  /** Sheet zoom: pixels per quarter-note beat. */
  pxPerBeat: number
  /** Equal-layout body width at this zoom — Dynamic scales relative to this. */
  equalReferencePx: number
  /** Global width multiplier (default 1). */
  measureScale?: number
  /** Per-onset column spacing multiplier (default 1). */
  noteSpacing?: number
  /** Minimum measure body width (px) — Dynamic uses a softer floor. */
  minMeasureWidth?: number
}

/**
 * Minimum horizontal room for one rhythmic column (notehead + clearance).
 */
export function onsetColumnPx(pxPerBeat: number, noteSpacing = 1): number {
  const spacing = clampSheetNoteSpacing(noteSpacing, 1)
  return Math.max(18, Math.round(pxPerBeat * 0.65 * spacing))
}

/**
 * Dynamic body width from onset density, relative to Equal width.
 * - 1 onset in 4/4 ≈ ~42% of Equal (visibly tighter)
 * - 1 onset per beat ≈ ~Equal
 * - eighth/sixteenth runs grow past Equal so columns stay readable
 */
export function contentSizedMeasureBodyPx(opts: ContentMeasureWidthOpts): number {
  const scale = clampSheetMeasureScale(opts.measureScale ?? 1, 1)
  const spacing = clampSheetNoteSpacing(opts.noteSpacing ?? 1, 1)
  const beats = Math.max(0.25, opts.beatsInMeasure)
  const onsets = Math.max(0, Math.floor(opts.onsetCount))
  const pxPerBeat = Math.max(8, opts.pxPerBeat)
  const equalRef = Math.max(40, opts.equalReferencePx)

  // Soft floor — well below Equal so sparse Dynamic bars don't all pin to 120px.
  const hardFloor = Math.max(36, Math.round((opts.minMeasureWidth ?? SHEET_MEASURE_WIDTH_MIN) * 0.45))

  if (onsets <= 0) {
    // Empty / rest-only: tightest bar.
    return Math.max(hardFloor, Math.round(equalRef * 0.38 * scale))
  }

  const density = onsets / beats // 1 = quarters, 2 = eighths, …
  // Map density → fraction of Equal. Sparse whole notes ≈ 0.4; quarters ≈ 1.0; denser grows.
  const densityFactor = Math.min(2.4, 0.38 + density * 0.55)
  const byDensity = Math.round(equalRef * densityFactor)

  const column = onsetColumnPx(pxPerBeat, spacing)
  const gutter = Math.max(22, Math.round(pxPerBeat * 0.35 * spacing))
  const byNotes = gutter + onsets * column

  const raw = Math.max(hardFloor, byDensity, byNotes)
  return Math.max(hardFloor, Math.round(raw * scale))
}

/**
 * Equal-layout body width with optional global scale.
 */
export function scaledEqualMeasureBodyPx(
  equalBody: number,
  measureScale = 1,
  minMeasureWidth = SHEET_MEASURE_WIDTH_MIN,
): number {
  const scale = clampSheetMeasureScale(measureScale, 1)
  const floor = Math.max(40, minMeasureWidth)
  return Math.max(floor, Math.round(equalBody * scale))
}
