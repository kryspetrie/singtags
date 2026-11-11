/**
 * Harmonic energy series — relative magnitudes at n×f0 from a log display spectrum.
 */

export type HarmonicPartial = {
  n: number
  hz: number
  /** 0…1 relative to strongest partial in the series. */
  energy: number
}

export type HarmonicSeriesOpts = {
  f0Hz: number
  fMinHz: number
  fMaxHz: number
  maxPartials?: number
}

/**
 * Sample `bins` (log-spaced fMin→fMax, values 0…1) at harmonic frequencies.
 */
export function harmonicSeriesFromLogBins(
  bins: Float32Array | number[],
  opts: HarmonicSeriesOpts,
): HarmonicPartial[] {
  const f0 = opts.f0Hz
  if (!(f0 > 0) || bins.length < 2) return []
  const fMin = opts.fMinHz
  const fMax = opts.fMaxHz
  if (!(fMax > fMin)) return []
  const maxN = opts.maxPartials ?? 8
  const logMin = Math.log(fMin)
  const logSpan = Math.log(fMax) - logMin
  const out: HarmonicPartial[] = []
  let peak = 1e-9
  for (let n = 1; n <= maxN; n++) {
    const hz = f0 * n
    if (hz < fMin || hz > fMax) continue
    const t = (Math.log(hz) - logMin) / logSpan
    const idx = t * (bins.length - 1)
    const i0 = Math.max(0, Math.min(bins.length - 2, Math.floor(idx)))
    const frac = idx - i0
    const v = (bins[i0] ?? 0) * (1 - frac) + (bins[i0 + 1] ?? 0) * frac
    peak = Math.max(peak, v)
    out.push({ n, hz, energy: v })
  }
  for (const p of out) p.energy = Math.min(1, p.energy / peak)
  return out
}
