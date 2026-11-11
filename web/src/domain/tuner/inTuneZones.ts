/**
 * Session intonation zones — accumulate time in / near / far of target.
 * Practice feedback metric (not persisted). Silence auto-resets the phrase.
 */

export type InTuneZone = 'in' | 'near' | 'far' | 'none'

export type InTuneZoneSample = {
  /** Performance.now() or audio clock ms. */
  tMs: number
  /** Signed cents vs target; null = no pitch. */
  cents: number | null
  clarity: number
}

export type InTuneZoneAccumulator = {
  /** Milliseconds spent in each zone (excludes silence / low clarity). */
  inMs: number
  nearMs: number
  farMs: number
  /** Continuous in-window hold time (ms); resets when leaving 'in'. */
  holdInMs: number
  lastTMs: number | null
  lastZone: InTuneZone
  /** Last time we saw a usable pitch sample. */
  lastVoiceMs: number | null
}

export type InTuneZonePercents = {
  inPct: number
  nearPct: number
  farPct: number
  /** inMs / total voiced ms, 0…1. */
  inRatio: number
  totalVoicedMs: number
}

export type InTuneZoneOpts = {
  /** Half-width for "in" (¢). */
  windowCents: number
  /** Near = |¢| ≤ nearMult × window. Default 2. */
  nearMult?: number
  /** Minimum clarity to count a sample. Default 0.35. */
  clarityMin?: number
  /** Silence longer than this resets the accumulator. Default 2000 ms. */
  silenceResetMs?: number
}

export function createInTuneZoneAccumulator(): InTuneZoneAccumulator {
  return {
    inMs: 0,
    nearMs: 0,
    farMs: 0,
    holdInMs: 0,
    lastTMs: null,
    lastZone: 'none',
    lastVoiceMs: null,
  }
}

export function classifyInTuneZone(
  cents: number | null,
  clarity: number,
  opts: InTuneZoneOpts,
): InTuneZone {
  const clarityMin = opts.clarityMin ?? 0.35
  if (cents == null || !Number.isFinite(cents) || !(clarity >= clarityMin)) return 'none'
  const win = Math.max(0.5, opts.windowCents)
  const near = win * (opts.nearMult ?? 2)
  const a = Math.abs(cents)
  if (a <= win) return 'in'
  if (a <= near) return 'near'
  return 'far'
}

/**
 * Advance accumulator with one sample. Mutates `acc`.
 * @returns true if a silence reset occurred.
 */
export function pushInTuneZoneSample(
  acc: InTuneZoneAccumulator,
  sample: InTuneZoneSample,
  opts: InTuneZoneOpts,
): boolean {
  const silenceResetMs = opts.silenceResetMs ?? 2000
  const zone = classifyInTuneZone(sample.cents, sample.clarity, opts)
  let reset = false

  if (acc.lastVoiceMs != null && zone === 'none') {
    if (sample.tMs - acc.lastVoiceMs >= silenceResetMs) {
      resetInTuneZoneAccumulator(acc)
      reset = true
    }
  }

  if (zone !== 'none') {
    if (acc.lastTMs != null && sample.tMs > acc.lastTMs) {
      // Cap hop gaps (tab background) but allow ~0.5s for hold/metric goldens.
      const dt = Math.min(500, sample.tMs - acc.lastTMs)
      // Credit the zone of this sample for the preceding interval.
      if (zone === 'in') acc.inMs += dt
      else if (zone === 'near') acc.nearMs += dt
      else acc.farMs += dt

      if (zone === 'in' && acc.lastZone === 'in') acc.holdInMs += dt
      else if (zone === 'in') acc.holdInMs = 0
      else acc.holdInMs = 0
    } else if (zone === 'in') {
      // First voiced sample in window — hold starts at 0 until next tick.
      acc.holdInMs = 0
    }
    acc.lastVoiceMs = sample.tMs
  }

  acc.lastTMs = sample.tMs
  acc.lastZone = zone
  return reset
}

export function resetInTuneZoneAccumulator(acc: InTuneZoneAccumulator): void {
  acc.inMs = 0
  acc.nearMs = 0
  acc.farMs = 0
  acc.holdInMs = 0
  acc.lastTMs = null
  acc.lastZone = 'none'
  acc.lastVoiceMs = null
}

export function inTuneZonePercents(acc: InTuneZoneAccumulator): InTuneZonePercents {
  const total = acc.inMs + acc.nearMs + acc.farMs
  if (!(total > 0)) {
    return { inPct: 0, nearPct: 0, farPct: 0, inRatio: 0, totalVoicedMs: 0 }
  }
  const inRatio = acc.inMs / total
  return {
    inPct: Math.round((acc.inMs / total) * 100),
    nearPct: Math.round((acc.nearMs / total) * 100),
    farPct: Math.round((acc.farMs / total) * 100),
    inRatio,
    totalVoicedMs: total,
  }
}

/** 0…1 progress for “held in tune” UI (caps at `capMs`). */
export function holdInTuneProgress(acc: InTuneZoneAccumulator, capMs = 2500): number {
  if (!(capMs > 0)) return 0
  return Math.max(0, Math.min(1, acc.holdInMs / capMs))
}
