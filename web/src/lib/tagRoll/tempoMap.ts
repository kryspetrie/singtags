/**
 * Time signature, tempo map, and expression helpers for Tag Studio.
 */
import { newLocalId } from '../../offline/localLibraryDb'
import {
  TAG_ROLL_DEFAULT_BPM,
  TAG_ROLL_DEFAULT_TIME_SIGNATURE,
  TAG_ROLL_PPQ,
  type TagRollExpression,
  type TagRollFermata,
  type TagRollProject,
  type TagRollTempoMarker,
  type TagRollTempoRamp,
  type TagRollTimeSignature,
} from './types'

export function measureTicks(ts: TagRollTimeSignature, ppq = TAG_ROLL_PPQ): number {
  const beatTicks = (ppq * 4) / Math.max(1, ts.denominator)
  return Math.max(1, Math.round(ts.numerator * beatTicks))
}

export function beatTicks(ts: TagRollTimeSignature, ppq = TAG_ROLL_PPQ): number {
  return Math.max(1, Math.round((ppq * 4) / Math.max(1, ts.denominator)))
}

export function createDefaultTempoMarkers(bpm = TAG_ROLL_DEFAULT_BPM): TagRollTempoMarker[] {
  return [{ id: newLocalId('trt'), tick: 0, bpm }]
}

export function normalizeTimeSignature(raw: unknown): TagRollTimeSignature {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const numerator = Math.max(
    1,
    Math.min(16, Math.round(Number(o.numerator) || TAG_ROLL_DEFAULT_TIME_SIGNATURE.numerator)),
  )
  const denominator = [1, 2, 4, 8, 16].includes(Number(o.denominator))
    ? Number(o.denominator)
    : TAG_ROLL_DEFAULT_TIME_SIGNATURE.denominator
  return { numerator, denominator }
}

export function normalizeTempoMarker(raw: unknown): TagRollTempoMarker | null {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null
  if (!o) return null
  const id = typeof o.id === 'string' && o.id.trim() ? o.id.trim() : newLocalId('trt')
  const tick = Math.max(0, Math.round(Number(o.tick) || 0))
  const bpm = Math.max(20, Math.min(320, Math.round(Number(o.bpm) || TAG_ROLL_DEFAULT_BPM)))
  return { id, tick, bpm }
}

export function normalizeExpression(raw: unknown): TagRollExpression | null {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null
  if (!o) return null
  const kind = o.kind
  const id = typeof o.id === 'string' && o.id.trim() ? o.id.trim() : newLocalId('tre')
  if (kind === 'fermata') {
    return {
      id,
      kind: 'fermata',
      tick: Math.max(0, Math.round(Number(o.tick) || 0)),
      holdTicks: Math.max(1, Math.round(Number(o.holdTicks) || TAG_ROLL_PPQ)),
      gapTicks: Math.max(0, Math.round(Number(o.gapTicks) || TAG_ROLL_PPQ / 2)),
    }
  }
  if (kind === 'rit' || kind === 'accel') {
    let startTick = Math.max(0, Math.round(Number(o.startTick) || 0))
    let endTick = Math.max(0, Math.round(Number(o.endTick) || startTick + TAG_ROLL_PPQ * 2))
    if (endTick < startTick) [startTick, endTick] = [endTick, startTick]
    if (endTick === startTick) endTick = startTick + TAG_ROLL_PPQ
    const startBpm = Math.max(20, Math.min(320, Math.round(Number(o.startBpm) || TAG_ROLL_DEFAULT_BPM)))
    const endBpm = Math.max(20, Math.min(320, Math.round(Number(o.endBpm) || startBpm)))
    return { id, kind, startTick, endTick, startBpm, endBpm }
  }
  return null
}

/**
 * Ensure every rit/accel leaves a durable tempo marker at endTick = endBpm
 * so tempo does not snap back after the ramp.
 * Only replaces this ramp's sticky id (or another marker already at endTick).
 */
export function upsertRampEndMarker(
  markers: readonly TagRollTempoMarker[],
  ramp: Pick<TagRollTempoRamp, 'id' | 'endTick' | 'endBpm'>,
): TagRollTempoMarker[] {
  const endTick = Math.max(0, Math.round(ramp.endTick))
  const endBpm = Math.max(20, Math.min(320, Math.round(ramp.endBpm)))
  const stickyId = `trt-ramp-${ramp.id}`
  const next = markers
    .filter((m) => m.id !== stickyId)
    .map((m) => ({ ...m }))
  const atEnd = next.findIndex((m) => m.tick === endTick)
  if (atEnd >= 0) {
    // Co-locate: keep the slot at endTick as this ramp's sticky so endBpm wins.
    next[atEnd] = { id: stickyId, tick: endTick, bpm: endBpm }
  } else {
    next.push({ id: stickyId, tick: endTick, bpm: endBpm })
  }
  next.sort((a, b) => a.tick - b.tick || a.bpm - b.bpm)
  return next
}

/** True when a tempo marker is a synthetic rit/accel sticky end. */
export function isRampStickyMarker(id: string): boolean {
  return id.startsWith('trt-ramp-')
}

/**
 * Discrete tempo map for MIDI / UI: user markers + sampled rit/accel points.
 * Samples along each ramp so exports hear the gradual change (not a jump at end).
 */
export function sampleTempoEvents(
  markers: readonly TagRollTempoMarker[],
  expressions: readonly TagRollExpression[],
  fallbackBpm = TAG_ROLL_DEFAULT_BPM,
  stepTicks = Math.max(1, Math.round(TAG_ROLL_PPQ / 4)),
): { tick: number; bpm: number }[] {
  const byTick = new Map<number, number>()

  const set = (tick: number, bpm: number) => {
    byTick.set(
      Math.max(0, Math.round(tick)),
      Math.max(20, Math.min(320, Math.round(bpm))),
    )
  }

  const userMarkers = markers
    .filter((m) => !isRampStickyMarker(m.id))
    .sort((a, b) => a.tick - b.tick)
  if (!userMarkers.length) set(0, fallbackBpm)
  else for (const m of userMarkers) set(m.tick, m.bpm)

  for (const e of expressions) {
    if (e.kind !== 'rit' && e.kind !== 'accel') continue
    const span = Math.max(1, e.endTick - e.startTick)
    for (let t = e.startTick; t < e.endTick; t += stepTicks) {
      const u = (t - e.startTick) / span
      set(t, e.startBpm + (e.endBpm - e.startBpm) * u)
    }
    set(e.startTick, e.startBpm)
    set(e.endTick, e.endBpm)
  }

  const sorted = [...byTick.entries()]
    .map(([tick, bpm]) => ({ tick, bpm }))
    .sort((a, b) => a.tick - b.tick)

  const out: { tick: number; bpm: number }[] = []
  for (const ev of sorted) {
    const prev = out[out.length - 1]
    if (prev && prev.bpm === ev.bpm) continue
    out.push(ev)
  }
  return out
}

/** Merge sticky end markers for all ramps (playback / queries). */
export function effectiveTempoMarkers(
  markers: readonly TagRollTempoMarker[],
  expressions: readonly TagRollExpression[],
): TagRollTempoMarker[] {
  let next = markers.map((m) => ({ ...m }))
  for (const e of expressions) {
    if (e.kind === 'rit' || e.kind === 'accel') {
      next = upsertRampEndMarker(next, e)
    }
  }
  return next
}

/**
 * Skip fermatas strictly before the play start tick.
 * A fermata AT fromTick still fires (including tick 0 when starting from 0).
 */
export function shouldSkipFermataOnPlay(fermataTick: number, fromTick: number): boolean {
  return fermataTick < fromTick
}

/** Instantaneous BPM at tick from markers + active rit/accel ramp. */
export function bpmAtTick(
  tick: number,
  markers: readonly TagRollTempoMarker[],
  expressions: readonly TagRollExpression[] = [],
  fallbackBpm = TAG_ROLL_DEFAULT_BPM,
): number {
  const sorted = effectiveTempoMarkers(markers, expressions).sort(
    (a, b) => a.tick - b.tick || a.bpm - b.bpm,
  )
  let base = fallbackBpm
  for (const m of sorted) {
    if (m.tick <= tick) base = m.bpm
    else break
  }

  // Active ramp interpolation wins while inside the bracket (inclusive).
  // Precedence: later-starting ramp wins if two overlap.
  let active: TagRollTempoRamp | null = null
  for (const e of expressions) {
    if (e.kind !== 'rit' && e.kind !== 'accel') continue
    if (tick < e.startTick || tick > e.endTick) continue
    if (!active || e.startTick >= active.startTick) active = e
  }
  if (active) {
    const span = Math.max(1, active.endTick - active.startTick)
    const t = (tick - active.startTick) / span
    return active.startBpm + (active.endBpm - active.startBpm) * t
  }
  return base
}

export function ticksToSecondsAtBpm(ticks: number, bpm: number): number {
  return (ticks / TAG_ROLL_PPQ) * (60 / Math.max(1, bpm))
}

export function findFermataAt(
  expressions: readonly TagRollExpression[],
  tick: number,
  slop = 2,
): TagRollFermata | null {
  for (const e of expressions) {
    if (e.kind === 'fermata' && Math.abs(e.tick - tick) <= slop) return e
  }
  return null
}

export function startingBpm(project: Pick<TagRollProject, 'bpm' | 'tempoMarkers'>): number {
  const atZero = project.tempoMarkers
    .filter((m) => m.tick === 0)
    .sort((a, b) => a.bpm - b.bpm)[0]
  return atZero?.bpm ?? project.bpm ?? TAG_ROLL_DEFAULT_BPM
}

export function isFermata(e: TagRollExpression): e is TagRollFermata {
  return e.kind === 'fermata'
}

export function isTempoRamp(e: TagRollExpression): e is TagRollTempoRamp {
  return e.kind === 'rit' || e.kind === 'accel'
}

/** Notes that still span `tick` after a fermata gap should resume once. */
export function notesSpanningTick<T extends { startTick: number; durationTicks: number }>(
  notes: readonly T[],
  tick: number,
): T[] {
  return notes.filter((n) => n.startTick <= tick && n.startTick + n.durationTicks > tick)
}

/**
 * Score tick where a fermata’s hold+gap actually run.
 * Visual marks sit on the note onset (or mid-note); playback waits until those
 * notes finish sounding, then holds, then gaps.
 */
export function fermataExecutionTick(
  fermataTick: number,
  notes: readonly { startTick: number; durationTicks: number }[] = [],
): number {
  let end = fermataTick
  let found = false
  for (const n of notes) {
    const nEnd = n.startTick + Math.max(0, n.durationTicks)
    const startsHere = n.startTick === fermataTick
    const spans = n.startTick < fermataTick && nEnd > fermataTick
    if (!startsHere && !spans) continue
    found = true
    if (nEnd > end) end = nEnd
  }
  return found ? end : fermataTick
}

/**
 * Wall-clock seconds from tick 0 to `tick` from tempo only (markers + ramps).
 * Does not include fermata hold/gap — use `fermataDelayBefore` for that.
 */
export function tempoSecondsAtTick(
  tick: number,
  markers: readonly TagRollTempoMarker[],
  expressions: readonly TagRollExpression[] = [],
  fallbackBpm = TAG_ROLL_DEFAULT_BPM,
  stepTicks = Math.max(1, Math.round(TAG_ROLL_PPQ / 16)),
): number {
  const target = Math.max(0, tick)
  let sec = 0
  let t = 0
  while (t < target) {
    const dticks = Math.min(stepTicks, target - t)
    const mid = t + dticks / 2
    const bpm = Math.max(1, bpmAtTick(mid, markers, expressions, fallbackBpm))
    sec += ticksToSecondsAtBpm(dticks, bpm)
    t += dticks
  }
  return sec
}

/** Hold+gap wall time for every fermata whose execution is strictly before `tick`. */
export function fermataDelayBefore(
  tick: number,
  markers: readonly TagRollTempoMarker[],
  expressions: readonly TagRollExpression[],
  fallbackBpm = TAG_ROLL_DEFAULT_BPM,
  notes: readonly { startTick: number; durationTicks: number }[] = [],
): number {
  let sec = 0
  for (const e of expressions) {
    if (e.kind !== 'fermata') continue
    const at = fermataExecutionTick(e.tick, notes)
    if (at >= tick) continue
    const bpm = Math.max(1, bpmAtTick(e.tick, markers, expressions, fallbackBpm))
    sec += ticksToSecondsAtBpm(e.holdTicks + e.gapTicks, bpm)
  }
  return sec
}

/** Hold-only wall time for fermatas whose execution is strictly inside (startTick, endTick). */
export function fermataHoldInside(
  startTick: number,
  endTick: number,
  markers: readonly TagRollTempoMarker[],
  expressions: readonly TagRollExpression[],
  fallbackBpm = TAG_ROLL_DEFAULT_BPM,
  notes: readonly { startTick: number; durationTicks: number }[] = [],
): number {
  let sec = 0
  for (const e of expressions) {
    if (e.kind !== 'fermata') continue
    const at = fermataExecutionTick(e.tick, notes)
    if (at <= startTick || at >= endTick) continue
    const bpm = Math.max(1, bpmAtTick(e.tick, markers, expressions, fallbackBpm))
    sec += ticksToSecondsAtBpm(e.holdTicks, bpm)
  }
  return sec
}

/**
 * Wall-clock seconds from tick 0 to `tick`, honoring tempo markers, rit/accel,
 * and completed fermatas (hold + gap) whose execution is strictly before `tick`.
 */
export function secondsAtTick(
  tick: number,
  markers: readonly TagRollTempoMarker[],
  expressions: readonly TagRollExpression[] = [],
  fallbackBpm = TAG_ROLL_DEFAULT_BPM,
  stepTicks = Math.max(1, Math.round(TAG_ROLL_PPQ / 16)),
  notes: readonly { startTick: number; durationTicks: number }[] = [],
): number {
  return (
    tempoSecondsAtTick(tick, markers, expressions, fallbackBpm, stepTicks) +
    fermataDelayBefore(tick, markers, expressions, fallbackBpm, notes)
  )
}

export function projectDurationSeconds(
  project: Pick<
    TagRollProject,
    'lengthTicks' | 'tempoMarkers' | 'expressions' | 'bpm' | 'notes'
  >,
): number {
  return secondsAtTick(
    project.lengthTicks,
    project.tempoMarkers,
    project.expressions,
    project.bpm,
    Math.max(1, Math.round(TAG_ROLL_PPQ / 16)),
    project.notes ?? [],
  )
}

/**
 * Expand score ticks into a performance timeline where each fermata inserts
 * hold+gap ticks after its execution point (note end, or mark if no notes).
 */
export function performanceTick(
  tick: number,
  expressions: readonly TagRollExpression[],
  notes: readonly { startTick: number; durationTicks: number }[] = [],
): number {
  let extra = 0
  for (const e of expressions) {
    if (e.kind !== 'fermata') continue
    const at = fermataExecutionTick(e.tick, notes)
    if (at < tick) extra += e.holdTicks + e.gapTicks
  }
  return tick + extra
}
