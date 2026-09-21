/**
 * Beat-boundary helpers for Tag Studio metronome (follows time signature).
 */
import { beatTicks, measureTicks } from './tempoMap'
import type { TagRollTimeSignature } from './types'
import { TAG_ROLL_PPQ } from './types'

export type MetronomeBeatHit = {
  /** Absolute tick of the beat. */
  tick: number
  /** 0-based beat index within the measure (0 = downbeat). */
  beatIndex: number
  /** True when this is beat 1 of the measure. */
  downbeat: boolean
}

/** Beat index (0 … numerator-1) containing `tick`. */
export function beatIndexAtTick(
  tick: number,
  ts: TagRollTimeSignature,
  ppq = TAG_ROLL_PPQ,
): number {
  const mt = measureTicks(ts, ppq)
  const bt = beatTicks(ts, ppq)
  const t = Math.max(0, tick)
  const inMeasure = ((t % mt) + mt) % mt
  return Math.min(ts.numerator - 1, Math.floor(inMeasure / bt))
}

/**
 * Beat boundaries in (`fromTick`, `toTick`] (exclusive start, inclusive end).
 * Negative ticks (blow-pitch pre-roll) are supported when `allowNegative` is set
 * by shifting into a virtual positive domain — callers should pass absolute musical
 * ticks including negative pre-roll via {@link beatsCrossedSigned}.
 */
export function beatsCrossed(
  fromTick: number,
  toTick: number,
  ts: TagRollTimeSignature,
  ppq = TAG_ROLL_PPQ,
): MetronomeBeatHit[] {
  if (!(toTick > fromTick)) return []
  const bt = beatTicks(ts, ppq)
  const mt = measureTicks(ts, ppq)
  const out: MetronomeBeatHit[] = []
  // First beat boundary strictly after fromTick.
  let beatTick = Math.floor(fromTick / bt) * bt
  if (beatTick <= fromTick) beatTick += bt
  for (; beatTick <= toTick + 1e-6; beatTick += bt) {
    const t = Math.round(beatTick)
    const inMeasure = ((t % mt) + mt) % mt
    const beatIndex = Math.min(ts.numerator - 1, Math.floor(inMeasure / bt))
    out.push({
      tick: t,
      beatIndex,
      downbeat: beatIndex === 0,
    })
  }
  return out
}

/**
 * Like {@link beatsCrossed} but allows a negative `fromTick` / `toTick` range
 * (pre-roll before tick 0). Beat grid is still aligned to measure/beat size.
 */
export function beatsCrossedSigned(
  fromTick: number,
  toTick: number,
  ts: TagRollTimeSignature,
  ppq = TAG_ROLL_PPQ,
): MetronomeBeatHit[] {
  if (!(toTick > fromTick)) return []
  const bt = beatTicks(ts, ppq)
  const mt = measureTicks(ts, ppq)
  const out: MetronomeBeatHit[] = []
  let beatTick = Math.floor(fromTick / bt) * bt
  if (beatTick <= fromTick) beatTick += bt
  for (; beatTick <= toTick + 1e-6; beatTick += bt) {
    const t = Math.round(beatTick)
    // For negative ticks, downbeat when aligned to measure grid extending left of 0.
    const inMeasure = ((t % mt) + mt) % mt
    const beatIndex = Math.min(ts.numerator - 1, Math.floor(inMeasure / bt))
    out.push({
      tick: t,
      beatIndex,
      downbeat: beatIndex === 0,
    })
  }
  return out
}

/**
 * Subdivision boundaries in (`fromTick`, `toTick`] at `unitTicks` spacing.
 * `downbeat` is true when the hit lands on a measure downbeat (beat 0).
 */
export function subdivisionsCrossed(
  fromTick: number,
  toTick: number,
  unitTicks: number,
  ts: TagRollTimeSignature,
  ppq = TAG_ROLL_PPQ,
): MetronomeBeatHit[] {
  if (!(toTick > fromTick) || !(unitTicks > 0)) return []
  const unit = Math.max(1, Math.round(unitTicks))
  const mt = measureTicks(ts, ppq)
  const bt = beatTicks(ts, ppq)
  const out: MetronomeBeatHit[] = []
  let tick = Math.floor(fromTick / unit) * unit
  if (tick <= fromTick) tick += unit
  for (; tick <= toTick + 1e-6; tick += unit) {
    const t = Math.round(tick)
    const inMeasure = ((t % mt) + mt) % mt
    const beatIndex = Math.min(ts.numerator - 1, Math.floor(inMeasure / bt))
    out.push({
      tick: t,
      beatIndex,
      downbeat: Math.abs(inMeasure) <= 0.5,
    })
  }
  return out
}

/** True when `tick` lands on a beat boundary (within 0.5 tick). */
export function isOnBeat(
  tick: number,
  ts: TagRollTimeSignature,
  ppq = TAG_ROLL_PPQ,
): boolean {
  const bt = beatTicks(ts, ppq)
  const t = Math.round(tick)
  return Math.abs(t - Math.round(t / bt) * bt) <= 0.5
}
