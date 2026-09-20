/**
 * Add / remove / insert measures in a Tag Studio project (pure transforms).
 */
import { measureStartTick } from './measureBeat'
import { measureTicks } from './tempoMap'
import type {
  TagRollExpression,
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

function shiftMarkers(
  markers: readonly TagRollTempoMarker[],
  at: number,
  delta: number,
): TagRollTempoMarker[] {
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
