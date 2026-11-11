/**
 * Spectrogram column FFT — used by the DSP worker / sync fallback only.
 */
import { createFftScratch, fftRealMagnitudes, nextPow2, type FftScratch } from './fftReal'
import {
  hzAtFraction,
  type FrameMagnitudeOpts,
  type SpectrogramFreqScale,
} from './spectrogramRing'

const specFftScratch = new Map<number, FftScratch>()

function specScratch(frameLen: number): FftScratch {
  const n = nextPow2(frameLen)
  let s = specFftScratch.get(n)
  if (!s) {
    s = createFftScratch(n)
    specFftScratch.set(n, s)
  }
  return s
}

/**
 * FFT magnitudes folded onto display bins (linear or log frequency axis).
 */
export function frameMagnitudeBins(
  frame: Float32Array,
  sampleRate: number,
  binCountOrOpts: number | FrameMagnitudeOpts,
  legacyFMaxHz = 2000,
): Float32Array {
  const opts: FrameMagnitudeOpts =
    typeof binCountOrOpts === 'number'
      ? { binCount: binCountOrOpts, fMinHz: 50, fMaxHz: legacyFMaxHz, scale: 'linear' }
      : binCountOrOpts
  const binCount = Math.max(8, opts.binCount)
  const fMin = opts.fMinHz ?? 80
  const fMax = opts.fMaxHz ?? 1000
  const scale: SpectrogramFreqScale = opts.scale === 'log' ? 'log' : 'linear'
  const out = new Float32Array(binCount)
  if (!(sampleRate > 0) || frame.length < 32) return out

  const scratch = specScratch(frame.length)
  const n = scratch.n
  const mag = fftRealMagnitudes(frame, scratch)
  const kMin = Math.max(1, Math.floor((fMin * n) / sampleRate))
  const kMax = Math.min(Math.floor(n / 2) - 1, Math.ceil((fMax * n) / sampleRate))
  if (kMax < kMin) return out

  const axis = { fMinHz: fMin, fMaxHz: fMax, scale, binCount }
  for (let b = 0; b < binCount; b++) {
    const hz0 = hzAtFraction(axis, b / binCount)
    const hz1 = hzAtFraction(axis, (b + 1) / binCount)
    const k0 = Math.max(kMin, Math.floor((hz0 * n) / sampleRate))
    const k1 = Math.min(kMax, Math.ceil((hz1 * n) / sampleRate))
    let m = 0
    for (let k = k0; k <= Math.max(k0, k1); k++) m = Math.max(m, mag[k] ?? 0)
    out[b] = m
  }
  return out
}
