/**
 * Swing / shuffle feel: warp even subdivisions within beat pairs.
 * Edit grid stays straight; playback + bounce use wall-clock warp;
 * MIDI can bake warped ticks into the exported score.
 */
import { beatTicks as beatTicksForTs } from './tempoMap'
import type { TagRollNote, TagRollSwing, TagRollTimeSignature } from './types'
import { TAG_ROLL_DEFAULT_TIME_SIGNATURE, TAG_ROLL_PPQ } from './types'

export const TAG_ROLL_DEFAULT_SWING: TagRollSwing = {
  enabled: false,
  unit: 'eighth',
  style: 'triplet',
  amount: 0,
}

/** Classic shuffle notch (~2:1) on the amount slider. */
export const TAG_ROLL_SWING_SHUFFLE_AMOUNT = 2 / 3

const STRAIGHT_SPLIT = 0.5
const TRIPLET_SPLIT = 2 / 3
const HEAVY_SPLIT = 0.75

export function normalizeSwing(raw: unknown): TagRollSwing {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null
  if (!o) return { ...TAG_ROLL_DEFAULT_SWING }
  const unit = o.unit === 'sixteenth' ? 'sixteenth' : 'eighth'
  const style = o.style === 'ratio' ? 'ratio' : 'triplet'
  const amount = clamp01(Number(o.amount))
  return {
    enabled: Boolean(o.enabled) && amount > 0,
    unit,
    style,
    amount: Boolean(o.enabled) ? amount : 0,
  }
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.min(1, Math.max(0, n))
}

/** Subdivision length in ticks for the swing unit. */
export function swingUnitTicks(
  unit: TagRollSwing['unit'],
  timeSignature: TagRollTimeSignature = TAG_ROLL_DEFAULT_TIME_SIGNATURE,
  ppq = TAG_ROLL_PPQ,
): number {
  const beat = beatTicksForTs(timeSignature, ppq)
  // Beat = one denominator note (e.g. quarter in 4/4). Eighth = half beat; sixteenth = quarter beat.
  return unit === 'sixteenth' ? Math.max(1, Math.round(beat / 4)) : Math.max(1, Math.round(beat / 2))
}

export function swingPairTicks(
  unit: TagRollSwing['unit'],
  timeSignature?: TagRollTimeSignature,
  ppq?: number,
): number {
  return swingUnitTicks(unit, timeSignature, ppq) * 2
}

/** Split ratio inside a pair: first-note share of the pair (0.5 = straight). */
export function swingSplitRatio(swing: Pick<TagRollSwing, 'style' | 'amount'>): number {
  const amount = clamp01(swing.amount)
  const target = swing.style === 'ratio' ? HEAVY_SPLIT : TRIPLET_SPLIT
  return STRAIGHT_SPLIT + amount * (target - STRAIGHT_SPLIT)
}

/**
 * Map a score tick into swung tick-space within its pair (same PPQ timeline).
 * Identity when swing is off or amount is 0.
 */
export function swingPerformanceTick(
  scoreTick: number,
  swing: TagRollSwing,
  timeSignature: TagRollTimeSignature = TAG_ROLL_DEFAULT_TIME_SIGNATURE,
  ppq = TAG_ROLL_PPQ,
): number {
  if (!swing.enabled || !(swing.amount > 0)) return scoreTick
  const t = Math.max(0, scoreTick)
  const unit = swingUnitTicks(swing.unit, timeSignature, ppq)
  const pair = unit * 2
  if (pair <= 0) return t
  const pairStart = Math.floor(t / pair) * pair
  const local = t - pairStart
  const half = unit
  const split = pair * swingSplitRatio(swing)
  let swungLocal: number
  if (local <= half) {
    swungLocal = half <= 0 ? 0 : (local / half) * split
  } else {
    swungLocal =
      half <= 0 ? split : split + ((local - half) / half) * (pair - split)
  }
  return pairStart + swungLocal
}

/**
 * Wall-clock seconds at a score tick with swing, using pair-endpoint tempo/fermata honesty.
 */
export function wallSecondsAtScoreTick(
  scoreTick: number,
  swing: TagRollSwing,
  secondsAtTick: (tick: number) => number,
  timeSignature: TagRollTimeSignature = TAG_ROLL_DEFAULT_TIME_SIGNATURE,
  ppq = TAG_ROLL_PPQ,
): number {
  if (!swing.enabled || !(swing.amount > 0)) return secondsAtTick(scoreTick)
  const t = Math.max(0, scoreTick)
  const pair = swingPairTicks(swing.unit, timeSignature, ppq)
  const pairStart = Math.floor(t / pair) * pair
  const local = t - pairStart
  const swungLocal = swingPerformanceTick(t, swing, timeSignature, ppq) - pairStart
  const startSec = secondsAtTick(pairStart)
  const endSec = secondsAtTick(pairStart + pair)
  const pairDur = endSec - startSec
  if (!(pairDur > 0) || pair <= 0) return secondsAtTick(t)
  // Preserve exact endpoint mapping for pair boundaries.
  if (local === 0) return startSec
  return startSec + (swungLocal / pair) * pairDur
}

/**
 * Multiplier on straight score-tick advance rate so wall-clock matches swing.
 * First half of a pair advances slower when the long note is first (amount > 0).
 */
export function swingScoreTickRate(
  scoreTick: number,
  swing: TagRollSwing,
  timeSignature: TagRollTimeSignature = TAG_ROLL_DEFAULT_TIME_SIGNATURE,
  ppq = TAG_ROLL_PPQ,
): number {
  if (!swing.enabled || !(swing.amount > 0)) return 1
  const unit = swingUnitTicks(swing.unit, timeSignature, ppq)
  const pair = unit * 2
  if (pair <= 0) return 1
  const t = Math.max(0, scoreTick)
  const local = t - Math.floor(t / pair) * pair
  const half = unit
  const split = pair * swingSplitRatio(swing)
  if (!(split > 0) || !(pair - split > 0)) return 1
  if (local < half) return half / split
  return half / (pair - split)
}

/**
 * Rewrite notes into swung score ticks (for MIDI “bake into score”).
 * Starts/ends are warped independently; duration is the positive difference.
 */
export function bakeSwingIntoNotes(
  notes: readonly TagRollNote[],
  swing: TagRollSwing,
  timeSignature: TagRollTimeSignature = TAG_ROLL_DEFAULT_TIME_SIGNATURE,
  ppq = TAG_ROLL_PPQ,
): TagRollNote[] {
  if (!swing.enabled || !(swing.amount > 0)) {
    return notes.map((n) => ({ ...n }))
  }
  return notes.map((n) => {
    const start = swingPerformanceTick(n.startTick, swing, timeSignature, ppq)
    const end = swingPerformanceTick(n.startTick + n.durationTicks, swing, timeSignature, ppq)
    return {
      ...n,
      startTick: Math.max(0, Math.round(start)),
      durationTicks: Math.max(1, Math.round(end - start)),
    }
  })
}
