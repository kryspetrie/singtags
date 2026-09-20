/**
 * Map tick durations to standard note/rest values (with optional dots).
 */
import { TAG_ROLL_PPQ } from '../types'

export type NoteDurationType =
  | 'whole'
  | 'half'
  | 'quarter'
  | 'eighth'
  | 'sixteenth'
  | 'thirty-second'

export type MappedDuration = {
  type: NoteDurationType
  dots: number
  /** Hook/beam count for this type (ignores dots). */
  flags: number
  /** Catalog ticks chosen (may differ slightly from input). */
  ticks: number
}

const FLAGS: Record<NoteDurationType, number> = {
  whole: 0,
  half: 0,
  quarter: 0,
  eighth: 1,
  sixteenth: 2,
  'thirty-second': 3,
}

function catalog(ppq: number): MappedDuration[] {
  const entries: Array<{ type: NoteDurationType; dots: number; ticks: number }> = [
    { type: 'whole', dots: 0, ticks: ppq * 4 },
    { type: 'whole', dots: 1, ticks: ppq * 6 },
    { type: 'half', dots: 0, ticks: ppq * 2 },
    { type: 'half', dots: 1, ticks: ppq * 3 },
    { type: 'quarter', dots: 0, ticks: ppq },
    { type: 'quarter', dots: 1, ticks: Math.round(ppq * 1.5) },
    { type: 'eighth', dots: 0, ticks: ppq / 2 },
    { type: 'eighth', dots: 1, ticks: Math.round(ppq * 0.75) },
    { type: 'sixteenth', dots: 0, ticks: ppq / 4 },
    { type: 'sixteenth', dots: 1, ticks: Math.round(ppq * 0.375) },
    { type: 'thirty-second', dots: 0, ticks: ppq / 8 },
    { type: 'thirty-second', dots: 1, ticks: Math.round((ppq / 8) * 1.5) },
  ]
  return entries.map((e) => ({
    type: e.type,
    dots: e.dots,
    flags: FLAGS[e.type],
    ticks: e.ticks,
  }))
}

/** Nearest standard duration for a tick length. */
export function mapTicksToDuration(
  durationTicks: number,
  ppq = TAG_ROLL_PPQ,
): MappedDuration {
  const dur = Math.max(1, Math.round(durationTicks))
  const list = catalog(ppq)
  let best = list[4]! // quarter fallback
  let bestErr = Infinity
  for (const c of list) {
    const err = Math.abs(c.ticks - dur)
    if (err < bestErr || (err === bestErr && c.ticks <= best.ticks)) {
      best = c
      bestErr = err
    }
  }
  return best
}

export function durationHasStem(type: NoteDurationType): boolean {
  return type !== 'whole'
}

export function durationHeadFilled(type: NoteDurationType): boolean {
  return type !== 'whole' && type !== 'half'
}
