/** Shared channel / balance helpers (kept separate to avoid circular imports). */

export const BALANCE_MAX_BOOST = 2
export const CHANNEL_NORM_MAX = 4
export const OUTPUT_HEADROOM = 0.99

export function stereoBalanceGains(
  balance: number,
  opts?: {
    maxBoost?: number
    normL?: number
    normR?: number
    peakL?: number
    peakR?: number
    headroom?: number
  },
): { l: number; r: number } {
  const b = Math.max(-1, Math.min(1, balance))
  const maxBoost = opts?.maxBoost ?? BALANCE_MAX_BOOST
  const normL = opts?.normL ?? 1
  const normR = opts?.normR ?? 1
  const headroom = opts?.headroom ?? OUTPUT_HEADROOM
  const peakL = opts?.peakL ?? 0
  const peakR = opts?.peakR ?? 0

  let l = 1
  let r = 1
  if (b < 0) {
    l = 1 + -b * (maxBoost - 1)
    r = 1 + b
  } else if (b > 0) {
    r = 1 + b * (maxBoost - 1)
    l = 1 - b
  }
  l *= normL
  r *= normR

  const effPeakL = peakL > 1e-4 ? peakL : 1
  const effPeakR = peakR > 1e-4 ? peakR : 1
  l = Math.min(l, headroom / effPeakL)
  r = Math.min(r, headroom / effPeakR)
  return { l, r }
}

export function channelsEffectivelyMono(
  left: Float32Array,
  right: Float32Array | null | undefined,
  opts?: { relativeDiff?: number },
): boolean {
  if (!right || right.length === 0) return true
  const len = Math.min(left.length, right.length)
  if (len === 0) return true
  const step = len > 500_000 ? 8 : len > 100_000 ? 4 : 2
  let sumAbsDiff = 0
  let sumAbs = 0
  let n = 0
  for (let i = 0; i < len; i += step) {
    const l = left[i]!
    const r = right[i]!
    sumAbsDiff += Math.abs(l - r)
    sumAbs += Math.abs(l) + Math.abs(r)
    n++
  }
  if (n === 0) return true
  const meanAmp = sumAbs / (2 * n)
  if (meanAmp < 1e-6) return true
  const relative = sumAbsDiff / n / meanAmp
  return relative < (opts?.relativeDiff ?? 0.02)
}
