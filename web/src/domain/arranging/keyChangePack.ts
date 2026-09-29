/**
 * Pack a modulation path onto a tick span (measure budget → Sketch slots).
 */
import type { ModulationPath } from './keyChangeShared'

export type PackedModulationStep = {
  startTick: number
  endTick: number
  rootPc: number
  natureId: string
  romanTo?: string
  role: string
  stepIndex: number
}

export type PackModulationOpts = {
  startTick: number
  endTick: number
  ppq: number
  /** Time signature numerator (default 4). */
  numerator?: number
  /** Time signature denominator (default 4). */
  denominator?: number
}

export type PackModulationOk = {
  ok: true
  steps: PackedModulationStep[]
  /** Beats used as minimum budget (1 beat per chord). */
  minBeats: number
}

export type PackModulationFail = {
  ok: false
  reason: string
  neededMeasures?: number
  minBeats?: number
}

export type PackModulationResult = PackModulationOk | PackModulationFail

function measureTicks(ppq: number, numerator: number, denominator: number): number {
  return Math.max(1, Math.round((numerator * ppq * 4) / denominator))
}

function beatTicks(ppq: number, denominator: number): number {
  return Math.max(1, Math.round((ppq * 4) / denominator))
}

/**
 * Divide `[startTick, endTick)` into `path.steps.length` contiguous slots.
 * Requires at least one beat per chord; pads leftover ticks onto the final arrival.
 */
export function packModulationIntoSpan(
  path: ModulationPath,
  opts: PackModulationOpts,
): PackModulationResult {
  const start = Math.round(opts.startTick)
  const end = Math.round(opts.endTick)
  if (!(end > start)) {
    return { ok: false, reason: 'Span endTick must be greater than startTick.' }
  }
  const n = path.steps.length
  if (n < 1) {
    return { ok: false, reason: 'Modulation path has no steps.' }
  }

  const numerator = opts.numerator ?? 4
  const denominator = opts.denominator ?? 4
  const beat = beatTicks(opts.ppq, denominator)
  const measure = measureTicks(opts.ppq, numerator, denominator)
  const span = end - start
  const minBeats = n
  const minTicks = minBeats * beat

  if (span < minTicks) {
    const neededMeasures = Math.ceil(minTicks / measure)
    return {
      ok: false,
      reason: `Span too short for ${n} chords (need ≥ ${minBeats} beats).`,
      neededMeasures,
      minBeats,
    }
  }

  // Equal slots; give remainder to the last (hold arrival).
  const base = Math.floor(span / n)
  const rem = span - base * n
  const steps: PackedModulationStep[] = []
  let cursor = start
  for (let i = 0; i < n; i++) {
    const ch = path.steps[i]!
    const width = base + (i === n - 1 ? rem : 0)
    const slotEnd = i === n - 1 ? end : cursor + width
    steps.push({
      startTick: cursor,
      endTick: Math.max(cursor + 1, slotEnd),
      rootPc: ch.rootPc,
      natureId: ch.natureId,
      romanTo: ch.romanTo,
      role: ch.role,
      stepIndex: i,
    })
    cursor = slotEnd
  }
  // Ensure contiguous cover.
  steps[steps.length - 1]!.endTick = end
  return { ok: true, steps, minBeats }
}
