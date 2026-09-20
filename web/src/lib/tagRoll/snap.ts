/**
 * Snap / duration helpers for Tag Roll.
 */
import { TAG_ROLL_PPQ } from './types'

export const TAG_ROLL_DURATION_PRESETS = [
  { id: 'whole', label: 'Whole', short: '1', ticks: TAG_ROLL_PPQ * 4 },
  { id: 'half', label: 'Half', short: '1/2', ticks: TAG_ROLL_PPQ * 2 },
  { id: 'quarter', label: 'Quarter', short: '1/4', ticks: TAG_ROLL_PPQ },
  { id: 'eighth', label: 'Eighth', short: '1/8', ticks: TAG_ROLL_PPQ / 2 },
  { id: 'sixteenth', label: 'Sixteenth', short: '1/16', ticks: TAG_ROLL_PPQ / 4 },
  { id: 'thirty-second', label: '32nd', short: '1/32', ticks: TAG_ROLL_PPQ / 8 },
] as const

export type TagRollDurationId = (typeof TAG_ROLL_DURATION_PRESETS)[number]['id']

/** Min cellW (px per beat) before duration resize handles are hittable. */
export const TAG_ROLL_HANDLE_CELL_W = 24

/** Snap tick down to the containing grid cell (not nearest). */
export function snapTick(tick: number, snapTicks: number): number {
  const s = Math.max(1, Math.round(snapTicks))
  if (!(tick > 0)) return 0
  return Math.floor(tick / s + 1e-9) * s
}

export function durationTicksForId(id: string, ppq = TAG_ROLL_PPQ): number {
  const preset = TAG_ROLL_DURATION_PRESETS.find((p) => p.id === id)
  if (preset) return preset.ticks
  return ppq
}

export function nearestDurationId(ticks: number): TagRollDurationId {
  let best: TagRollDurationId = 'quarter'
  let bestDist = Infinity
  for (const p of TAG_ROLL_DURATION_PRESETS) {
    const d = Math.abs(p.ticks - ticks)
    if (d < bestDist) {
      bestDist = d
      best = p.id
    }
  }
  return best
}

export function nearestDurationIndex(ticks: number): number {
  const id = nearestDurationId(ticks)
  return Math.max(
    0,
    TAG_ROLL_DURATION_PRESETS.findIndex((p) => p.id === id),
  )
}

/** Step to the next longer (+1) or shorter (−1) preset length. */
export function stepDurationTicks(ticks: number, dir: -1 | 1): number {
  // Presets: index 0 = whole (longest) … last = 32nd (shortest).
  const i = nearestDurationIndex(ticks)
  const next = Math.max(0, Math.min(TAG_ROLL_DURATION_PRESETS.length - 1, i - dir))
  return TAG_ROLL_DURATION_PRESETS[next]!.ticks
}

/**
 * Dot a duration: add half of its value (half → dotted half = 3 beats).
 */
export function dottedDurationTicks(ticks: number): number {
  const t = Math.max(1, Math.round(ticks))
  return t + Math.max(1, Math.round(t / 2))
}

/** Extend lengthTicks so content fits with one empty measure of padding. */
export function ensureLengthForNote(
  lengthTicks: number,
  startTick: number,
  durationTicks: number,
  measureTicks = TAG_ROLL_PPQ * 4,
): number {
  const end = startTick + durationTicks
  const need = end + measureTicks
  if (need <= lengthTicks) return lengthTicks
  const measures = Math.ceil(need / measureTicks)
  return measures * measureTicks
}
