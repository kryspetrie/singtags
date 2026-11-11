/**
 * Classical spectral multi-F0 — prefers fundamentals over strong harmonics.
 * Pure frame API for CI. Uses harmonic-supported salience + harmonic suppression.
 */

import { createFftScratch, fftRealMagnitudes, nextPow2, type FftScratch } from './fftReal'

export type MultiF0Peak = {
  hz: number
  salience: number
}

export type MultiF0Result = {
  peaks: MultiF0Peak[]
  /** Distinct pitch classes 0…11 within ±50¢ of a 12-TET bin at a4Hz. */
  pitchClasses: number[]
  /** Raw DFT magnitudes for bins kMin…kMax (same indexing as computeMagnitudeSpectrum). */
  spectrum?: MagnitudeSpectrum
}

export type MagnitudeSpectrum = {
  mag: Float64Array
  kMin: number
  kMax: number
  n: number
  sampleRate: number
}

export type MultiF0Opts = {
  a4Hz?: number
  fMinHz?: number
  fMaxHz?: number
  maxPeaks?: number
  /** Minimum relative magnitude vs strongest peak (0…1). */
  salienceFloor?: number
  /** Include spectrum on the result (FFT graph). Default false. */
  includeSpectrum?: boolean
}

const fftScratchByN = new Map<number, FftScratch>()

function scratchFor(frameLen: number): FftScratch {
  const n = nextPow2(frameLen)
  let s = fftScratchByN.get(n)
  if (!s) {
    // Rectangular window — sharper peaks for multi-F0 / sine stacks than Hann.
    s = createFftScratch(n, 'rect')
    fftScratchByN.set(n, s)
  }
  return s
}

/** Radix-2 FFT magnitude spectrum over [fMin, fMax] (Hann windowed). */
export function computeMagnitudeSpectrum(
  frame: Float32Array,
  sampleRate: number,
  fMinHz: number,
  fMaxHz: number,
): MagnitudeSpectrum | null {
  if (!(sampleRate > 0) || frame.length < 64) return null
  const scratch = scratchFor(frame.length)
  const n = scratch.n
  const full = fftRealMagnitudes(frame, scratch)
  const kMin = Math.max(1, Math.floor((fMinHz * n) / sampleRate))
  const kMax = Math.min(Math.floor(n / 2) - 1, Math.ceil((fMaxHz * n) / sampleRate))
  if (kMax <= kMin) return null
  // Copy the used band so callers can mutate (harmonic suppression) safely.
  const mag = new Float64Array(kMax + 1)
  for (let k = kMin; k <= kMax; k++) mag[k] = full[k] ?? 0
  return { mag, kMin, kMax, n, sampleRate }
}

/**
 * Find up to `maxPeaks` spectral fundamentals via DFT + harmonic-aware scoring.
 */
export function multiF0(
  frame: Float32Array,
  sampleRate: number,
  opts: MultiF0Opts = {},
): MultiF0Result {
  const a4 = opts.a4Hz ?? 440
  const fMin = opts.fMinHz ?? 70
  const fMax = opts.fMaxHz ?? 900
  const maxPeaks = opts.maxPeaks ?? 4
  const floor = opts.salienceFloor ?? 0.2

  const spec = computeMagnitudeSpectrum(frame, sampleRate, fMin, fMax)
  if (!spec) return { peaks: [], pitchClasses: [] }
  const { mag, kMin, kMax, n } = spec

  type Cand = { k: number; raw: number; score: number }
  const cands: Cand[] = []
  for (let k = kMin + 1; k < kMax; k++) {
    const v = mag[k]!
    if (!(v > mag[k - 1]!) || !(v >= mag[k + 1]!) || !(v > 1e-6)) continue
    // Skip obvious harmonics when a strong subharmonic peak exists.
    if (isLikelyHarmonicOfStrongerFundamental(mag, k, kMin, kMax)) continue
    const score = fundamentalScore(mag, k, kMin, kMax)
    cands.push({ k, raw: v, score })
  }
  cands.sort((a, b) => b.score - a.score || b.raw - a.raw)
  if (!cands.length) {
    return emptyResult(opts.includeSpectrum ? spec : undefined)
  }

  const topScore = cands[0]!.score
  const peaks: MultiF0Peak[] = []
  const acceptedHz: number[] = []
  const work = mag.slice()

  for (const c of cands) {
    if (c.score < topScore * floor && peaks.length > 0) break
    // Re-score against residual spectrum after harmonic suppression.
    const residual = work[c.k] ?? 0
    if (residual < 1e-6) continue
    if (usedNearBin(c.k, peaks, n, sampleRate)) continue
    if (isHarmonicOfAccepted(c.k, acceptedHz, n, sampleRate)) continue

    let k = c.k
    const s0 = work[k - 1] ?? mag[k - 1]!
    const s1 = work[k] ?? mag[k]!
    const s2 = work[k + 1] ?? mag[k + 1]!
    const denom = 2 * (s0 - 2 * s1 + s2)
    if (Math.abs(denom) > 1e-12) k = k + (s0 - s2) / denom
    const hz = (k * sampleRate) / n
    if (hz < fMin || hz > fMax) continue

    peaks.push({ hz, salience: c.score / topScore })
    acceptedHz.push(hz)
    suppressHarmonics(work, hz, n, sampleRate, kMin, kMax)
    if (peaks.length >= maxPeaks) break
  }

  peaks.sort((a, b) => a.hz - b.hz)

  const pitchClasses = [
    ...new Set(
      peaks.map((p) => {
        const midi = 69 + 12 * Math.log2(p.hz / a4)
        return ((Math.round(midi) % 12) + 12) % 12
      }),
    ),
  ].sort((a, b) => a - b)

  return {
    peaks,
    pitchClasses,
    ...(opts.includeSpectrum ? { spectrum: spec } : {}),
  }
}

export { synthStackFrame } from './synthAudioFrame'

function emptyResult(spectrum?: MagnitudeSpectrum): MultiF0Result {
  return spectrum ? { peaks: [], pitchClasses: [], spectrum } : { peaks: [], pitchClasses: [] }
}

/** Boost peaks that own supporting harmonics (true F0s); raw mag alone favors H2. */
function fundamentalScore(
  mag: Float64Array,
  k: number,
  kMin: number,
  kMax: number,
): number {
  const m1 = mag[k]!
  const m2 = binNear(mag, k * 2, kMin, kMax)
  const m3 = binNear(mag, k * 3, kMin, kMax)
  const m4 = binNear(mag, k * 4, kMin, kMax)
  // Harmonic product-ish: fundamental + discounted harmonic support.
  return m1 + 0.45 * m2 + 0.3 * m3 + 0.2 * m4
}

/**
 * If k looks like 2×/3×/4× of a strong lower peak, treat it as a harmonic
 * unless the putative fundamental is weak.
 */
function isLikelyHarmonicOfStrongerFundamental(
  mag: Float64Array,
  k: number,
  kMin: number,
  kMax: number,
): boolean {
  const self = mag[k]!
  for (const div of [2, 3, 4]) {
    const kFund = Math.round(k / div)
    if (kFund < kMin || kFund >= k) continue
    const fund = binNear(mag, kFund, kMin, kMax)
    // Strong lower partial → this peak is likely its harmonic.
    if (fund > self * 0.35) return true
  }
  return false
}

function binNear(mag: Float64Array, kFloat: number, kMin: number, kMax: number): number {
  const k = Math.round(kFloat)
  if (k < kMin || k > kMax) return 0
  let best = mag[k] ?? 0
  if (k - 1 >= kMin) best = Math.max(best, mag[k - 1]!)
  if (k + 1 <= kMax) best = Math.max(best, mag[k + 1]!)
  return best
}

function usedNearBin(
  k: number,
  peaks: MultiF0Peak[],
  n: number,
  sampleRate: number,
): boolean {
  const hz = (k * sampleRate) / n
  return peaks.some((p) => Math.abs(1200 * Math.log2(hz / p.hz)) < 40)
}

function isHarmonicOfAccepted(
  k: number,
  acceptedHz: readonly number[],
  n: number,
  sampleRate: number,
): boolean {
  const hz = (k * sampleRate) / n
  for (const f0 of acceptedHz) {
    for (const h of [2, 3, 4, 5]) {
      const target = f0 * h
      if (Math.abs(1200 * Math.log2(hz / target)) < 45) return true
    }
    // Also reject if this is ~octave below an accepted peak that was a harmonic mis-pick
    // (keep lower). Already handled by sort + suppression.
  }
  return false
}

/** Attenuate harmonic bins of an accepted F0 so the next pick prefers another voice. */
function suppressHarmonics(
  work: Float64Array,
  f0: number,
  n: number,
  sampleRate: number,
  kMin: number,
  kMax: number,
): void {
  for (const h of [1, 2, 3, 4, 5, 6]) {
    const k = Math.round((f0 * h * n) / sampleRate)
    for (let d = -2; d <= 2; d++) {
      const kk = k + d
      if (kk < kMin || kk > kMax) continue
      work[kk] = (work[kk] ?? 0) * (h === 1 ? 0.15 : 0.08)
    }
  }
}
