/**
 * Prefer sung fundamentals over harmonic partials when scoring a chord from FFT/Spec peaks.
 */

export type PeakHz = { hz: number; salience: number }

/**
 * Drop peaks that look like integer harmonics of a stronger lower peak.
 * Keeps up to `maxFundamentals` strongest remaining (by salience).
 */
export function fundamentalsFromPeaks(
  peaks: readonly PeakHz[],
  opts?: { maxFundamentals?: number; harmCents?: number },
): PeakHz[] {
  const maxN = opts?.maxFundamentals ?? 4
  const harmCents = opts?.harmCents ?? 35
  const sorted = [...peaks]
    .filter((p) => p.hz > 0 && Number.isFinite(p.hz))
    .sort((a, b) => a.hz - b.hz)

  const kept: PeakHz[] = []
  for (const p of sorted) {
    let harmonic = false
    for (const f of kept) {
      const ratio = p.hz / f.hz
      const nearest = Math.round(ratio)
      if (nearest < 2 || nearest > 8) continue
      const cents = Math.abs(1200 * Math.log2(ratio / nearest))
      // Stronger (or equal) lower peak claims this as its partial.
      if (cents <= harmCents && f.salience >= p.salience * 0.55) {
        harmonic = true
        break
      }
    }
    if (!harmonic) kept.push(p)
  }

  return kept.sort((a, b) => b.salience - a.salience).slice(0, maxN).sort((a, b) => a.hz - b.hz)
}
