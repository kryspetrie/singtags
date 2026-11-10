/**
 * Region audition helpers (Phase 9) — select peaks → short resynth loop.
 */

export type AuditionRegion = {
  /** Selected peak frequencies (Hz). */
  hz: number[]
  label: 'resynth'
  durationSec: number
}

/** Build a region from selected FFT peak Hz values. */
export function auditionRegionFromPeaks(
  peaksHz: readonly number[],
  durationSec = 1.2,
): AuditionRegion | null {
  const hz = [...new Set(peaksHz.filter((h) => Number.isFinite(h) && h > 0))].sort(
    (a, b) => a - b,
  )
  if (!hz.length) return null
  return {
    hz: hz.slice(0, 8),
    label: 'resynth',
    durationSec: Math.max(0.2, Math.min(3, durationSec)),
  }
}

/** Interval ratios (¢) between consecutive selected peaks for teaching readout. */
export function consecutiveIntervalCents(hz: readonly number[]): number[] {
  const out: number[] = []
  for (let i = 1; i < hz.length; i++) {
    const a = hz[i - 1]!
    const b = hz[i]!
    if (!(a > 0) || !(b > 0)) continue
    out.push(1200 * Math.log2(b / a))
  }
  return out
}
