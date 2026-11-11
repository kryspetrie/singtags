/**
 * Analysis pitch-range presets — Tune / Chord / FFT / Spec reaction band.
 * Users may choose full hearing (20 Hz–20 kHz); nothing is locked to voice-only.
 */

export type PitchRangeId =
  | 'bass'
  | 'quartet'
  | 'voice'
  | 'treble'
  | 'piano'
  | 'wide'
  | 'hearing'
  | 'custom'

export type PitchRangePreset = {
  id: Exclude<PitchRangeId, 'custom'>
  label: string
  minHz: number
  maxHz: number
  /** Short Settings / Spec hint. */
  hint: string
}

/** Named defaults — order is Settings / Spec UI order. */
export const PITCH_RANGE_PRESETS: readonly PitchRangePreset[] = [
  {
    id: 'bass',
    label: 'Bass',
    minHz: 55,
    maxHz: 450,
    hint: 'Low voices / bass instruments',
  },
  {
    id: 'quartet',
    label: 'Quartet F0',
    minHz: 70,
    maxHz: 700,
    hint: 'Barbershop singing fundamentals',
  },
  {
    id: 'voice',
    label: 'Voice',
    minHz: 55,
    maxHz: 1200,
    hint: 'Singer-centric (default)',
  },
  {
    id: 'treble',
    label: 'Treble',
    minHz: 180,
    maxHz: 1600,
    hint: 'Higher voices / lead–tenor focus',
  },
  {
    id: 'piano',
    label: 'Piano',
    minHz: 27.5,
    maxHz: 4186,
    hint: 'Approx. 88-key piano',
  },
  {
    id: 'wide',
    label: 'Wide',
    minHz: 40,
    maxHz: 5000,
    hint: 'Broad analysis without ultrasonic',
  },
  {
    id: 'hearing',
    label: 'Full hearing',
    minHz: 20,
    maxHz: 20_000,
    hint: 'Human hearing ~20 Hz–20 kHz',
  },
] as const

export const PITCH_HZ_ABS_MIN = 20
export const PITCH_HZ_ABS_MAX = 20_000

export function clampPitchHz(n: unknown, fallback: number): number {
  const v = typeof n === 'number' ? n : Number(n)
  if (!Number.isFinite(v)) return fallback
  return Math.max(PITCH_HZ_ABS_MIN, Math.min(PITCH_HZ_ABS_MAX, Math.round(v * 10) / 10))
}

export function normalizePitchBand(
  minHz: number,
  maxHz: number,
): { minHz: number; maxHz: number } {
  let min = clampPitchHz(minHz, 55)
  let max = clampPitchHz(maxHz, 1200)
  if (max <= min + 5) {
    min = 55
    max = 1200
  }
  return { minHz: min, maxHz: max }
}

export function pitchRangePreset(id: string): PitchRangePreset | null {
  return PITCH_RANGE_PRESETS.find((p) => p.id === id) ?? null
}

/** Match stored Hz to a named preset (else custom). */
export function matchPitchRangeId(minHz: number, maxHz: number): PitchRangeId {
  const hit = PITCH_RANGE_PRESETS.find(
    (p) => Math.abs(p.minHz - minHz) < 0.6 && Math.abs(p.maxHz - maxHz) < 0.6,
  )
  return hit?.id ?? 'custom'
}

export function isPitchRangeId(raw: unknown): raw is PitchRangeId {
  if (raw === 'custom') return true
  return typeof raw === 'string' && PITCH_RANGE_PRESETS.some((p) => p.id === raw)
}

/** Resolve id + optional Hz into a concrete band. */
export function resolvePitchRange(
  id: PitchRangeId,
  minHz?: number,
  maxHz?: number,
): { id: PitchRangeId; minHz: number; maxHz: number } {
  if (id !== 'custom') {
    const p = pitchRangePreset(id)
    if (p) return { id: p.id, minHz: p.minHz, maxHz: p.maxHz }
  }
  const band = normalizePitchBand(minHz ?? 55, maxHz ?? 1200)
  return { id: matchPitchRangeId(band.minHz, band.maxHz), minHz: band.minHz, maxHz: band.maxHz }
}

/** Nyquist-safe max for a sample rate (leave a little headroom). */
export function pitchMaxForSampleRate(maxHz: number, sampleRate: number): number {
  if (!(sampleRate > 0)) return maxHz
  const nyquist = sampleRate * 0.49
  return Math.min(maxHz, nyquist)
}
