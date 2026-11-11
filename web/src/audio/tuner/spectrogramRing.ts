/**
 * Scrolling spectrogram ring — capped history, linear/log freq mapping.
 * FFT column math lives in spectrogramBins.ts (worker-side).
 */

export type SpectrogramFreqScale = 'linear' | 'log'

export type SpectrogramRing = {
  /** Column-major: each entry is a Float32Array of bin magnitudes (0…1). */
  columns: Float32Array[]
  binCount: number
  maxColumns: number
  fMinHz: number
  fMaxHz: number
  scale: SpectrogramFreqScale
}

export type FrameMagnitudeOpts = {
  binCount: number
  fMinHz?: number
  fMaxHz?: number
  scale?: SpectrogramFreqScale
}

export function createSpectrogramRing(
  binCount: number,
  maxColumns: number,
  opts?: { fMinHz?: number; fMaxHz?: number; scale?: SpectrogramFreqScale },
): SpectrogramRing {
  const fMin = opts?.fMinHz ?? 80
  const fMax = opts?.fMaxHz ?? 1000
  return {
    columns: [],
    binCount: Math.max(8, binCount),
    maxColumns: Math.max(1, Math.min(600, maxColumns)),
    fMinHz: Math.max(20, Math.min(fMin, fMax - 10)),
    fMaxHz: Math.max(fMin + 10, Math.min(8000, fMax)),
    scale: opts?.scale === 'log' ? 'log' : 'linear',
  }
}

/**
 * Push one magnitude column (copied / normalized).
 * @returns number of columns dropped from the left (for track sync).
 */
export function pushSpectrogramColumn(ring: SpectrogramRing, mags: ArrayLike<number>): number {
  const col = new Float32Array(ring.binCount)
  const n = Math.min(ring.binCount, mags.length)
  let peak = 1e-12
  for (let i = 0; i < n; i++) peak = Math.max(peak, mags[i]!)
  for (let i = 0; i < n; i++) col[i] = Math.min(1, mags[i]! / peak)
  ring.columns.push(col)
  let dropped = 0
  while (ring.columns.length > ring.maxColumns) {
    ring.columns.shift()
    dropped++
  }
  return dropped
}

export function clearSpectrogramRing(ring: SpectrogramRing): void {
  ring.columns.length = 0
}

/** Center frequency of display bin `b` (0…binCount-1). */
export function binCenterHz(
  ring: Pick<SpectrogramRing, 'binCount' | 'fMinHz' | 'fMaxHz' | 'scale'>,
  b: number,
): number {
  const t = (b + 0.5) / ring.binCount
  return hzAtFraction(ring, t)
}

/** Map 0…1 vertical fraction (0 = fMin) to Hz. */
export function hzAtFraction(
  ring: Pick<SpectrogramRing, 'fMinHz' | 'fMaxHz' | 'scale'>,
  t: number,
): number {
  const u = Math.max(0, Math.min(1, t))
  if (ring.scale === 'log') {
    return Math.exp(Math.log(ring.fMinHz) + u * (Math.log(ring.fMaxHz) - Math.log(ring.fMinHz)))
  }
  return ring.fMinHz + u * (ring.fMaxHz - ring.fMinHz)
}

/** Map Hz → 0…1 vertical fraction. */
export function fractionAtHz(
  ring: Pick<SpectrogramRing, 'fMinHz' | 'fMaxHz' | 'scale'>,
  hz: number,
): number {
  if (!(hz > 0)) return 0
  if (ring.scale === 'log') {
    return (Math.log(hz) - Math.log(ring.fMinHz)) / (Math.log(ring.fMaxHz) - Math.log(ring.fMinHz))
  }
  return (hz - ring.fMinHz) / (ring.fMaxHz - ring.fMinHz)
}
