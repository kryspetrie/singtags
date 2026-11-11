/**
 * Live mono F0 estimate (YIN-inspired, single frame).
 * Pure / CI-testable — not the offline multi-frame `yin.ts` path.
 */

export type LiveMonoF0Result = {
  hz: number | null
  /** 0…1 — higher means a clearer periodic estimate. */
  clarity: number
}

export type LiveMonoF0Opts = {
  fMinHz?: number
  fMaxHz?: number
  /** Absolute RMS gate; below this → unvoiced. */
  rmsGate?: number
  /** CMNDF threshold (lower = stricter). */
  yinThresh?: number
}

/**
 * Estimate fundamental frequency of one mono frame.
 * Returns `hz: null` when unvoiced / below clarity.
 */
export function liveMonoF0(
  frame: Float32Array,
  sampleRate: number,
  opts: LiveMonoF0Opts = {},
): LiveMonoF0Result {
  if (!(sampleRate > 0) || frame.length < 32) return { hz: null, clarity: 0 }
  const fMin = opts.fMinHz ?? 55
  const fMax = opts.fMaxHz ?? 1200
  const rmsGate = opts.rmsGate ?? 0.004
  const yinThresh = opts.yinThresh ?? 0.15

  let sumSq = 0
  for (let i = 0; i < frame.length; i++) sumSq += frame[i]! * frame[i]!
  const rms = Math.sqrt(sumSq / frame.length)
  if (rms < rmsGate) return { hz: null, clarity: 0 }

  const tauMin = Math.max(2, Math.floor(sampleRate / fMax))
  const tauMax = Math.min(frame.length - 2, Math.floor(sampleRate / fMin))
  if (tauMax <= tauMin) return { hz: null, clarity: 0 }

  // Difference function — fill from 1 so CMNDF cumulative mean is unbiased.
  const d = new Float64Array(tauMax + 1)
  for (let tau = 1; tau <= tauMax; tau++) {
    let sum = 0
    const n = frame.length - tau
    for (let i = 0; i < n; i++) {
      const diff = frame[i]! - frame[i + tau]!
      sum += diff * diff
    }
    d[tau] = sum
  }

  // Cumulative mean normalized difference
  const dNorm = new Float64Array(tauMax + 1)
  dNorm[0] = 1
  let cum = 0
  for (let tau = 1; tau <= tauMax; tau++) {
    cum += d[tau]!
    dNorm[tau] = (d[tau]! * tau) / (cum + 1e-12)
  }

  let bestTau = -1
  let bestVal = 1
  for (let tau = tauMin; tau <= tauMax; tau++) {
    const v = dNorm[tau]!
    if (v < yinThresh) {
      // Local parabolic refinement neighborhood
      while (tau + 1 <= tauMax && dNorm[tau + 1]! < dNorm[tau]!) tau++
      bestTau = tau
      bestVal = dNorm[tau]!
      break
    }
    if (v < bestVal) {
      bestVal = v
      bestTau = tau
    }
  }
  if (bestTau < tauMin || bestVal > 0.4) return { hz: null, clarity: 0 }

  // Parabolic interpolation on the raw difference function (classic YIN).
  let tau = bestTau
  if (tau > 1 && tau < tauMax) {
    const s0 = d[tau - 1]!
    const s1 = d[tau]!
    const s2 = d[tau + 1]!
    const denom = 2 * (s0 - 2 * s1 + s2)
    if (Math.abs(denom) > 1e-12) tau = tau + (s0 - s2) / denom
  }

  const hz = sampleRate / tau
  if (!(hz >= fMin && hz <= fMax)) return { hz: null, clarity: 0 }
  const clarity = Math.max(0, Math.min(1, 1 - bestVal))
  return { hz, clarity }
}

export { synthSineFrame } from './synthAudioFrame'
