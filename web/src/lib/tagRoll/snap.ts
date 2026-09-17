/**
 * Snap / duration helpers for Tag Roll.
 */
import { TAG_ROLL_PPQ } from './types'

export const TAG_ROLL_DURATION_PRESETS = [
  { id: 'whole', label: 'Whole', ticks: TAG_ROLL_PPQ * 4 },
  { id: 'half', label: 'Half', ticks: TAG_ROLL_PPQ * 2 },
  { id: 'quarter', label: 'Quarter', ticks: TAG_ROLL_PPQ },
  { id: 'eighth', label: 'Eighth', ticks: TAG_ROLL_PPQ / 2 },
  { id: 'sixteenth', label: 'Sixteenth', ticks: TAG_ROLL_PPQ / 4 },
] as const

export type TagRollDurationId = (typeof TAG_ROLL_DURATION_PRESETS)[number]['id']

/** Min cellW (px per beat) before duration resize handles are hittable. */
export const TAG_ROLL_HANDLE_CELL_W = 24

export function snapTick(tick: number, snapTicks: number): number {
  const s = Math.max(1, Math.round(snapTicks))
  return Math.max(0, Math.round(tick / s) * s)
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
