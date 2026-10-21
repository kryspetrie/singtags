/**
 * How far the sheet should engrave — drop trailing empty measures past content.
 */
import { lastNoteEndTick, lastSketchEndTick } from '../notesAtTick'
import type { TagRollExpression, TagRollProject } from '../types'

/** Inclusive annotation ticks → exclusive end (so a mark on a barline keeps that measure). */
function annotationExclusiveEnd(
  expressions: readonly TagRollExpression[] | undefined,
  tempoMarkers: readonly { tick: number }[] | undefined,
  keyMarkers: readonly { tick: number }[] | undefined,
): number {
  let end = 0
  for (const e of expressions ?? []) {
    if (e.kind === 'fermata') end = Math.max(end, e.tick + 1)
    else end = Math.max(end, e.endTick)
  }
  for (const t of tempoMarkers ?? []) end = Math.max(end, t.tick + 1)
  for (const k of keyMarkers ?? []) end = Math.max(end, k.tick + 1)
  return end
}

/**
 * Engraved score length in ticks: project length trimmed to the last measure
 * that still has notes / sketch / annotations. Always at least one measure.
 */
export function sheetEngraveLengthTicks(project: TagRollProject, measureTicks: number): number {
  const mLen = Math.max(1, Math.round(measureTicks))
  const projectLen = Math.max(mLen, Math.round(project.lengthTicks) || mLen)
  const content = Math.max(
    lastNoteEndTick(project.notes),
    lastSketchEndTick(project.harmonySketch),
    annotationExclusiveEnd(
      project.expressions,
      project.tempoMarkers,
      project.keyMarkers,
    ),
  )
  if (content <= 0) return mLen
  const needed = Math.ceil(content / mLen) * mLen
  return Math.min(projectLen, Math.max(mLen, needed))
}
