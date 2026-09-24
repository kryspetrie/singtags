/**
 * Add / remove / insert measures in a Tag Studio project (pure transforms).
 */
import { measureStartTick } from './measureBeat'
import { measureTicks } from './tempoMap'
import type {
  TagRollExpression,
  TagRollKeyMarker,
  TagRollNote,
  TagRollProject,
  TagRollTempoMarker,
} from './types'
import { TAG_ROLL_PPQ } from './types'

export type MeasureInsertSide = 'before' | 'after'

function barLen(p: Pick<TagRollProject, 'timeSignature' | 'ppq'>): number {
  return measureTicks(p.timeSignature, p.ppq || TAG_ROLL_PPQ)
}

function shiftNotes(notes: readonly TagRollNote[], at: number, delta: number): TagRollNote[] {
  return notes.map((n) => {
    const end = n.startTick + n.durationTicks
    if (n.startTick >= at) {
      return { ...n, startTick: n.startTick + delta }
    }
    if (end > at) {
      return { ...n, durationTicks: n.durationTicks + delta }
    }
    return n
  })
}

function shiftMarkers<T extends { tick: number }>(
  markers: readonly T[],
  at: number,
  delta: number,
): T[] {
  return markers.map((m) => {
    if (m.tick === 0 && at === 0) return m
    if (m.tick >= at) return { ...m, tick: m.tick + delta }
    return m
  })
}

function shiftExpressions(
  expressions: readonly TagRollExpression[],
  at: number,
  delta: number,
): TagRollExpression[] {
  return expressions.map((e) => {
    if (e.kind === 'fermata') {
      if (e.tick >= at) return { ...e, tick: e.tick + delta }
      return e
    }
    if (e.startTick >= at) {
      return { ...e, startTick: e.startTick + delta, endTick: e.endTick + delta }
    }
    if (e.endTick > at) {
      return { ...e, endTick: e.endTick + delta }
    }
    return e
  })
}

/** Append empty measures at the end. */
export function extendProjectMeasures(p: TagRollProject, count = 1): TagRollProject {
  const m = barLen(p)
  const n = Math.max(1, Math.round(count))
  return { ...p, lengthTicks: p.lengthTicks + m * n, updatedAt: Date.now() }
}

/**
 * Remove measures from the end. Content past the new length is truncated/removed.
 * Always leaves at least one measure.
 */
export function shrinkProjectMeasures(p: TagRollProject, count = 1): TagRollProject {
  const m = barLen(p)
  const n = Math.max(1, Math.round(count))
  const newLen = Math.max(m, p.lengthTicks - m * n)
  if (newLen >= p.lengthTicks) return p

  const notes = p.notes
    .filter((note) => note.startTick < newLen)
    .map((note) => {
      const end = note.startTick + note.durationTicks
      if (end <= newLen) return note
      return { ...note, durationTicks: Math.max(1, newLen - note.startTick) }
    })

  const tempoMarkers = p.tempoMarkers.filter((tm) => tm.tick < newLen)
  if (!tempoMarkers.some((tm) => tm.tick === 0)) {
    tempoMarkers.unshift({
      id: p.tempoMarkers.find((tm) => tm.tick === 0)?.id ?? 'trt-start',
      tick: 0,
      bpm: p.bpm,
    })
  }

  const keyMarkers = (p.keyMarkers ?? []).filter((km) => km.tick < newLen)
  if (!keyMarkers.some((km) => km.tick === 0)) {
    keyMarkers.unshift({
      id: (p.keyMarkers ?? []).find((km) => km.tick === 0)?.id ?? 'trk-start',
      tick: 0,
      tonality: p.tonality,
      tonalityMode: p.tonalityMode ?? 'major',
      preferFlats: p.preferFlats,
    })
  }

  const expressions = p.expressions
    .map((e) => {
      if (e.kind === 'fermata') {
        return e.tick < newLen ? e : null
      }
      if (e.startTick >= newLen) return null
      if (e.endTick > newLen) {
        return { ...e, endTick: newLen }
      }
      return e
    })
    .filter((e): e is TagRollExpression => e != null)

  const playheadTick = Math.min(p.view.playheadTick, newLen)

  return {
    ...p,
    lengthTicks: newLen,
    notes,
    tempoMarkers,
    keyMarkers,
    expressions,
    view: { ...p.view, playheadTick },
    updatedAt: Date.now(),
  }
}

/** Tick boundary where an empty measure is inserted (content at/after shifts right). */
export function insertMeasureAtTick(
  p: TagRollProject,
  cursorTick: number,
  side: MeasureInsertSide,
): number {
  const m = barLen(p)
  const start = measureStartTick(cursorTick, p.timeSignature, p.ppq || TAG_ROLL_PPQ)
  return side === 'before' ? start : start + m
}

/** Start tick of the measure removed by delete before/after at the cursor. */
export function deleteMeasureAtTick(
  p: TagRollProject,
  cursorTick: number,
  side: MeasureInsertSide,
): number {
  return insertMeasureAtTick(p, cursorTick, side)
}

function pruneNotesInMeasure(notes: readonly TagRollNote[], from: number, span: number): TagRollNote[] {
  const to = from + span
  const out: TagRollNote[] = []
  for (const n of notes) {
    const end = n.startTick + n.durationTicks
    if (end <= from) {
      out.push(n)
      continue
    }
    if (n.startTick >= to) {
      out.push({ ...n, startTick: n.startTick - span })
      continue
    }
    // Fully inside deleted measure.
    if (n.startTick >= from && end <= to) continue
    // Starts before, ends inside or beyond.
    if (n.startTick < from) {
      if (end <= to) {
        out.push({ ...n, durationTicks: Math.max(1, from - n.startTick) })
      } else {
        out.push({ ...n, durationTicks: Math.max(1, n.durationTicks - span) })
      }
      continue
    }
    // Starts inside, ends after.
    out.push({ ...n, startTick: from, durationTicks: Math.max(1, end - to) })
  }
  return out
}

function pruneMarkersInMeasure(
  markers: readonly TagRollTempoMarker[],
  from: number,
  span: number,
  fallbackBpm: number,
): TagRollTempoMarker[] {
  const to = from + span
  const out: TagRollTempoMarker[] = []
  for (const m of markers) {
    if (m.tick > from && m.tick < to) continue
    if (m.tick >= to) out.push({ ...m, tick: m.tick - span })
    else out.push(m)
  }
  if (!out.some((tm) => tm.tick === 0)) {
    out.unshift({
      id: markers.find((tm) => tm.tick === 0)?.id ?? 'trt-start',
      tick: 0,
      bpm: markers.find((tm) => tm.tick === 0)?.bpm ?? fallbackBpm,
    })
  }
  return out
}

function pruneKeyMarkersInMeasure(
  markers: readonly TagRollKeyMarker[],
  from: number,
  span: number,
  fallback: Pick<TagRollKeyMarker, 'tonality' | 'tonalityMode' | 'preferFlats'>,
): TagRollKeyMarker[] {
  const to = from + span
  const out: TagRollKeyMarker[] = []
  for (const m of markers) {
    if (m.tick > from && m.tick < to) continue
    if (m.tick >= to) out.push({ ...m, tick: m.tick - span })
    else out.push(m)
  }
  if (!out.some((km) => km.tick === 0)) {
    const z = markers.find((km) => km.tick === 0)
    out.unshift({
      id: z?.id ?? 'trk-start',
      tick: 0,
      tonality: z?.tonality ?? fallback.tonality,
      tonalityMode: z?.tonalityMode ?? fallback.tonalityMode,
      preferFlats: z?.preferFlats ?? fallback.preferFlats,
    })
  }
  return out
}

function pruneExpressionsInMeasure(
  expressions: readonly TagRollExpression[],
  from: number,
  span: number,
): TagRollExpression[] {
  const to = from + span
  const out: TagRollExpression[] = []
  for (const e of expressions) {
    if (e.kind === 'fermata') {
      if (e.tick >= from && e.tick < to) continue
      out.push(e.tick >= to ? { ...e, tick: e.tick - span } : e)
      continue
    }
    if (e.endTick <= from) {
      out.push(e)
      continue
    }
    if (e.startTick >= to) {
      out.push({ ...e, startTick: e.startTick - span, endTick: e.endTick - span })
      continue
    }
    if (e.startTick >= from && e.endTick <= to) continue
    if (e.startTick < from && e.endTick > from) {
      if (e.endTick <= to) {
        out.push({ ...e, endTick: from })
      } else {
        out.push({ ...e, endTick: e.endTick - span })
      }
      continue
    }
    // Starts inside, ends after.
    out.push({ ...e, startTick: from, endTick: e.endTick - span })
  }
  return out
}

/** True when delete before/after would leave at least one measure. */
export function canDeleteProjectMeasure(
  p: TagRollProject,
  cursorTick: number,
  side: MeasureInsertSide,
): boolean {
  const m = barLen(p)
  if (p.lengthTicks <= m) return false
  const at = deleteMeasureAtTick(p, cursorTick, side)
  return at >= 0 && at + m <= p.lengthTicks
}

/**
 * Delete one measure before or after the cursor measure
 * (same boundary as insert before/after).
 */
export function deleteProjectMeasure(
  p: TagRollProject,
  cursorTick: number,
  side: MeasureInsertSide,
): TagRollProject {
  if (!canDeleteProjectMeasure(p, cursorTick, side)) return p
  const m = barLen(p)
  const at = deleteMeasureAtTick(p, cursorTick, side)
  let playheadTick = p.view.playheadTick
  if (playheadTick >= at + m) playheadTick -= m
  else if (playheadTick >= at) playheadTick = at

  return {
    ...p,
    lengthTicks: p.lengthTicks - m,
    notes: pruneNotesInMeasure(p.notes, at, m),
    tempoMarkers: pruneMarkersInMeasure(p.tempoMarkers, at, m, p.bpm),
    keyMarkers: pruneKeyMarkersInMeasure(p.keyMarkers ?? [], at, m, {
      tonality: p.tonality,
      tonalityMode: p.tonalityMode ?? 'major',
      preferFlats: p.preferFlats,
    }),
    expressions: pruneExpressionsInMeasure(p.expressions, at, m),
    view: { ...p.view, playheadTick: Math.min(playheadTick, p.lengthTicks - m) },
    updatedAt: Date.now(),
  }
}

/** Insert one empty measure before or after the measure containing `cursorTick`. */
export function insertProjectMeasure(
  p: TagRollProject,
  cursorTick: number,
  side: MeasureInsertSide,
): TagRollProject {
  const m = barLen(p)
  const at = insertMeasureAtTick(p, cursorTick, side)
  return {
    ...p,
    lengthTicks: p.lengthTicks + m,
    notes: shiftNotes(p.notes, at, m),
    tempoMarkers: shiftMarkers(p.tempoMarkers, at, m),
    keyMarkers: shiftMarkers(p.keyMarkers ?? [], at, m),
    expressions: shiftExpressions(p.expressions, at, m),
    view: {
      ...p.view,
      // Keep the cursor in the same musical content when inserting before it.
      playheadTick:
        side === 'before' && p.view.playheadTick >= at
          ? p.view.playheadTick + m
          : p.view.playheadTick,
    },
    updatedAt: Date.now(),
  }
}
