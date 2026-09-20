/**
 * Format Tag Studio ticks as measure:beat for status / HUD.
 */
import { TAG_ROLL_PPQ, type TagRollTimeSignature } from './types'
import { beatTicks, measureTicks } from './tempoMap'

export type MeasureBeat = {
  /** 1-based measure number. */
  measure: number
  /** 1-based beat within the measure (fractional allowed). */
  beat: number
}

/** Convert absolute tick → 1-based measure + beat within measure. */
export function tickToMeasureBeat(
  tick: number,
  ts: TagRollTimeSignature,
  ppq = TAG_ROLL_PPQ,
): MeasureBeat {
  const mt = measureTicks(ts, ppq)
  const bt = beatTicks(ts, ppq)
  const t = Math.max(0, Math.round(tick))
  const measure = Math.floor(t / mt) + 1
  const beat = t % mt / bt + 1
  return { measure, beat }
}

/** Compact display like `3:2.0` or `1:1`. */
export function formatMeasureBeat(
  tick: number,
  ts: TagRollTimeSignature,
  ppq = TAG_ROLL_PPQ,
): string {
  const { measure, beat } = tickToMeasureBeat(tick, ts, ppq)
  const beatStr =
    Math.abs(beat - Math.round(beat)) < 0.001
      ? String(Math.round(beat))
      : beat.toFixed(1)
  return `${measure}:${beatStr}`
}

/** Duration in beats (quarter-relative via time signature beat size). */
export function formatDurationBeats(
  durationTicks: number,
  ts: TagRollTimeSignature,
  ppq = TAG_ROLL_PPQ,
): string {
  const bt = beatTicks(ts, ppq)
  const beats = Math.max(0, durationTicks) / bt
  if (Math.abs(beats - Math.round(beats)) < 0.001) return String(Math.round(beats))
  return beats.toFixed(2).replace(/\.?0+$/, '')
}

/** Tick of the measure boundary at or before `tick`. */
export function measureStartTick(
  tick: number,
  ts: TagRollTimeSignature,
  ppq = TAG_ROLL_PPQ,
): number {
  const mt = measureTicks(ts, ppq)
  const t = Math.max(0, Math.round(tick))
  return Math.floor(t / mt) * mt
}

/** Previous measure start. If already on a boundary, jump one measure earlier. */
export function prevMeasureTick(
  tick: number,
  ts: TagRollTimeSignature,
  ppq = TAG_ROLL_PPQ,
): number {
  const mt = measureTicks(ts, ppq)
  const start = measureStartTick(tick, ts, ppq)
  if (tick <= start) return Math.max(0, start - mt)
  return start
}

/** Next measure start, clamped to `lengthTicks`. */
export function nextMeasureTick(
  tick: number,
  ts: TagRollTimeSignature,
  lengthTicks: number,
  ppq = TAG_ROLL_PPQ,
): number {
  const mt = measureTicks(ts, ppq)
  const start = measureStartTick(tick, ts, ppq)
  return Math.min(Math.max(0, lengthTicks), start + mt)
}
