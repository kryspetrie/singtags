/**
 * Scrolling spectrogram ring (Phase 7) — capped history, clear on leave.
 * Stores magnitude columns; paint is UI-side.
 */

export type SpectrogramRing = {
  /** Column-major: each entry is a Float32Array of bin magnitudes (0…1). */
  columns: Float32Array[]
  binCount: number
  maxColumns: number
}

export function createSpectrogramRing(binCount: number, maxColumns: number): SpectrogramRing {
  return {
    columns: [],
    binCount: Math.max(8, binCount),
    maxColumns: Math.max(1, Math.min(600, maxColumns)),
  }
}

/** Push one magnitude column (copied / normalized). Drops oldest when over cap. */
export function pushSpectrogramColumn(ring: SpectrogramRing, mags: ArrayLike<number>): void {
  const col = new Float32Array(ring.binCount)
  const n = Math.min(ring.binCount, mags.length)
  let peak = 1e-12
  for (let i = 0; i < n; i++) peak = Math.max(peak, mags[i]!)
  for (let i = 0; i < n; i++) col[i] = Math.min(1, mags[i]! / peak)
  ring.columns.push(col)
  while (ring.columns.length > ring.maxColumns) ring.columns.shift()
}

export function clearSpectrogramRing(ring: SpectrogramRing): void {
  ring.columns.length = 0
}

/** Real-DFT magnitudes for spectrogram (linear bins up to nyquist fraction). */
export function frameMagnitudeBins(
  frame: Float32Array,
  sampleRate: number,
  binCount: number,
  fMaxHz = 2000,
): Float32Array {
  const n = frame.length
  const out = new Float32Array(binCount)
  const kMax = Math.min(Math.floor(n / 2) - 1, Math.ceil((fMaxHz * n) / sampleRate))
  for (let b = 0; b < binCount; b++) {
    const k = Math.max(1, Math.round(((b + 1) / binCount) * kMax))
    let re = 0
    let im = 0
    const w = (2 * Math.PI * k) / n
    for (let i = 0; i < n; i++) {
      const x = frame[i]!
      re += x * Math.cos(w * i)
      im -= x * Math.sin(w * i)
    }
    out[b] = Math.hypot(re, im)
  }
  return out
}
