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

export type DecomposePositionOpts = {
  /** Absolute onset of this span (after barline splits). */
  startTick: number
  /** Measure length in ticks (forces mid-bar splits in binary meters). */
  measureTicks: number
  /** Beat length — off-beat syncopations may not cross the next beat. */
  beatTicks: number
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

/**
 * Strictly greedy largest-first split. Tick sum always equals the input —
 * never round a leftover up past the remaining span.
 */
function greedyDecompose(durationTicks: number, ppq: number): MappedDuration[] {
  const target = Math.max(1, Math.round(durationTicks))
  let remaining = target
  const list = catalog(ppq)
    .slice()
    .sort((a, b) => b.ticks - a.ticks || a.dots - b.dots)
  const smallest = list[list.length - 1]!.ticks
  const out: MappedDuration[] = []
  while (remaining > 0 && out.length < 16) {
    const exact = list.find((c) => c.ticks === remaining)
    if (exact) {
      out.push(exact)
      remaining = 0
      break
    }
    const fit = list.find((c) => c.ticks <= remaining)
    if (!fit || remaining < smallest) {
      // Sub-catalog leftover: keep nearest glyph type but exact tick count.
      const approx = mapTicksToDuration(remaining, ppq)
      out.push({ ...approx, ticks: remaining })
      remaining = 0
      break
    }
    out.push(fit)
    remaining -= fit.ticks
  }
  if (!out.length) {
    const approx = mapTicksToDuration(target, ppq)
    return [{ ...approx, ticks: target }]
  }
  return out
}

/**
 * Mid-bar + off-beat syncopation splits.
 * - Half on beat 2 → two tied quarters at mid-bar.
 * - Quarter starting on an off-beat that crosses the next beat → split + tie.
 * Whole / dotted-half from the downbeat may cross the midpoint.
 */
export function groupingSplitTicks(
  startTick: number,
  durationTicks: number,
  measureTicks: number,
  beatTicks: number,
): number[] {
  const mLen = Math.max(1, Math.round(measureTicks))
  const bLen = Math.max(1, Math.round(beatTicks))
  const end = startTick + Math.max(1, Math.round(durationTicks))
  const parts: number[] = []
  let t = startTick
  while (t < end) {
    const measureStart = Math.floor(t / mLen) * mLen
    const measureEnd = measureStart + mLen
    const segEnd = Math.min(end, measureEnd)
    let stop = segEnd

    if (mLen % 2 === 0) {
      const mid = measureStart + mLen / 2
      const crossesMid = t < mid && segEnd > mid
      const fromDownbeat = t === measureStart
      const lenInMeasure = segEnd - t
      const allowMidCross =
        fromDownbeat &&
        (lenInMeasure >= mLen || lenInMeasure === Math.round(mLen * 0.75))
      if (crossesMid && !allowMidCross) {
        stop = Math.min(stop, mid)
      }
    }

    // Off-beat onset: must not cross the next beat boundary.
    const onBeat = t % bLen === 0
    if (!onBeat) {
      const nextBeat = Math.floor(t / bLen) * bLen + bLen
      if (nextBeat > t && nextBeat < segEnd) {
        stop = Math.min(stop, nextBeat)
      }
    }

    parts.push(stop - t)
    t = stop
  }
  return parts.length ? parts : [Math.max(1, Math.round(durationTicks))]
}

/** @deprecated Prefer {@link groupingSplitTicks} (includes beat syncopation). */
export function midBarSplitTicks(
  startTick: number,
  durationTicks: number,
  measureTicks: number,
): number[] {
  return groupingSplitTicks(
    startTick,
    durationTicks,
    measureTicks,
    Math.max(1, Math.round(measureTicks / 4)),
  )
}

/**
 * Split a tick span into standard note values (largest first) so engraving can
 * show dots / ties instead of silently rounding to a single nearest duration.
 * With `position`, also split at mid-bar and off-beat syncopation boundaries.
 */
export function decomposeTicksToDurations(
  durationTicks: number,
  ppq = TAG_ROLL_PPQ,
  position?: DecomposePositionOpts,
): MappedDuration[] {
  if (!position) {
    return greedyDecompose(durationTicks, ppq)
  }
  const chunks = groupingSplitTicks(
    position.startTick,
    durationTicks,
    position.measureTicks,
    position.beatTicks,
  )
  const out: MappedDuration[] = []
  for (const chunk of chunks) {
    out.push(...greedyDecompose(chunk, ppq))
  }
  return out.length ? out : [mapTicksToDuration(durationTicks, ppq)]
}

export function durationHasStem(type: NoteDurationType): boolean {
  return type !== 'whole'
}

export function durationHeadFilled(type: NoteDurationType): boolean {
  return type !== 'whole' && type !== 'half'
}
