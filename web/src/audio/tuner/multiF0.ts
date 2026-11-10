/**
 * Classical spectral multi-F0 (Phase 4 kill-gate spike).
 * Pure frame API for CI — DFT peak picking for held stacks.
 */

export type MultiF0Peak = {
  hz: number
  salience: number
}

export type MultiF0Result = {
  peaks: MultiF0Peak[]
  /** Distinct pitch classes 0…11 within ±50¢ of a 12-TET bin at a4Hz. */
  pitchClasses: number[]
}

export type MultiF0Opts = {
  a4Hz?: number
  fMinHz?: number
  fMaxHz?: number
  maxPeaks?: number
  /** Minimum relative magnitude vs strongest peak (0…1). */
  salienceFloor?: number
}

/**
 * Find up to `maxPeaks` spectral peaks via real DFT magnitude.
 * Tuned for held synthetic stacks in kill-gate fixtures.
 */
export function multiF0(
  frame: Float32Array,
  sampleRate: number,
  opts: MultiF0Opts = {},
): MultiF0Result {
  if (!(sampleRate > 0) || frame.length < 64) return { peaks: [], pitchClasses: [] }
  const a4 = opts.a4Hz ?? 440
  const fMin = opts.fMinHz ?? 70
  const fMax = opts.fMaxHz ?? 900
  const maxPeaks = opts.maxPeaks ?? 4
  const floor = opts.salienceFloor ?? 0.2

  const n = frame.length
  const kMin = Math.max(1, Math.floor((fMin * n) / sampleRate))
  const kMax = Math.min(Math.floor(n / 2) - 1, Math.ceil((fMax * n) / sampleRate))
  if (kMax <= kMin) return { peaks: [], pitchClasses: [] }

  const mag = new Float64Array(kMax + 1)
  for (let k = kMin; k <= kMax; k++) {
    let re = 0
    let im = 0
    const w = (2 * Math.PI * k) / n
    for (let i = 0; i < n; i++) {
      const x = frame[i]!
      re += x * Math.cos(w * i)
      im -= x * Math.sin(w * i)
    }
    mag[k] = Math.hypot(re, im)
  }

  type Cand = { k: number; sal: number }
  const cands: Cand[] = []
  for (let k = kMin + 1; k < kMax; k++) {
    const v = mag[k]!
    if (v > mag[k - 1]! && v >= mag[k + 1]! && v > 1e-6) {
      cands.push({ k, sal: v })
    }
  }
  cands.sort((a, b) => b.sal - a.sal)
  if (!cands.length) return { peaks: [], pitchClasses: [] }

  const top = cands[0]!.sal
  const peaks: MultiF0Peak[] = []
  const usedK: number[] = []
  for (const c of cands) {
    if (c.sal < top * floor) break
    if (usedK.some((k) => Math.abs(k - c.k) < 2)) continue
    // Parabolic refine in bin space
    let k = c.k
    const s0 = mag[k - 1]!
    const s1 = mag[k]!
    const s2 = mag[k + 1]!
    const denom = 2 * (s0 - 2 * s1 + s2)
    if (Math.abs(denom) > 1e-12) k = k + (s0 - s2) / denom
    const hz = (k * sampleRate) / n
    if (hz < fMin || hz > fMax) continue
    peaks.push({ hz, salience: c.sal / top })
    usedK.push(c.k)
    if (peaks.length >= maxPeaks) break
  }

  const pitchClasses = [
    ...new Set(
      peaks.map((p) => {
        const midi = 69 + 12 * Math.log2(p.hz / a4)
        return ((Math.round(midi) % 12) + 12) % 12
      }),
    ),
  ].sort((a, b) => a - b)

  return { peaks, pitchClasses }
}

/** Mix unit sines for synthetic stack fixtures. */
export function synthStackFrame(
  partialsHz: readonly number[],
  sampleRate: number,
  length: number,
  amp = 0.25,
): Float32Array {
  const out = new Float32Array(length)
  for (const hz of partialsHz) {
    const w = (2 * Math.PI * hz) / sampleRate
    for (let i = 0; i < length; i++) out[i]! += Math.sin(w * i) * amp
  }
  // Light Hann to reduce spectral leakage for DFT peaks
  for (let i = 0; i < length; i++) {
    const hann = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (length - 1))
    out[i]! *= hann
  }
  return out
}
