/** Tone analysis helpers for pitch/speed synthetic tests. */

/** Peak absolute sample magnitude in a channel (used by bake + analysis). */
export function channelPeak(data: Float32Array): number {
  let peak = 0
  for (let i = 0; i < data.length; i++) {
    const a = Math.abs(data[i]!)
    if (a > peak) peak = a
  }
  return peak
}

/** Root-mean-square level of a channel (energy proxy for tests). */
export function measureRms(data: Float32Array): number {
  if (data.length === 0) return 0
  let sum = 0
  for (let i = 0; i < data.length; i++) {
    const v = data[i]!
    sum += v * v
  }
  return Math.sqrt(sum / data.length)
}

export function allFinite(data: Float32Array): boolean {
  for (let i = 0; i < data.length; i++) {
    if (!Number.isFinite(data[i]!)) return false
  }
  return true
}

/**
 * Dominant frequency via autocorrelation peak.
 * Oracle restricted to mono sine / dual-tone fixtures — not polyphonic chords.
 */
export function estimateDominantHz(
  channel: Float32Array,
  sampleRate: number,
  opts?: { minHz?: number; maxHz?: number },
): number {
  const minHz = opts?.minHz ?? 60
  const maxHz = opts?.maxHz ?? Math.min(2000, sampleRate / 2 - 1)
  const n = channel.length
  if (n < 32 || sampleRate <= 0) return 0

  // Remove DC
  let mean = 0
  for (let i = 0; i < n; i++) mean += channel[i]!
  mean /= n

  const minLag = Math.max(1, Math.floor(sampleRate / maxHz))
  const maxLag = Math.min(n - 1, Math.ceil(sampleRate / minHz))
  let bestLag = minLag
  let bestCorr = -Infinity

  for (let lag = minLag; lag <= maxLag; lag++) {
    let corr = 0
    const lim = n - lag
    for (let i = 0; i < lim; i++) {
      corr += (channel[i]! - mean) * (channel[i + lag]! - mean)
    }
    if (corr > bestCorr) {
      bestCorr = corr
      bestLag = lag
    }
  }
  return sampleRate / bestLag
}

/** Find onset sample indices where |x| exceeds threshold after being below it. */
export function findOnsets(
  channel: Float32Array,
  opts?: { threshold?: number; refractorySamples?: number },
): number[] {
  const thr = opts?.threshold ?? 0.5
  const ref = opts?.refractorySamples ?? 8
  const out: number[] = []
  let last = -ref
  for (let i = 0; i < channel.length; i++) {
    if (Math.abs(channel[i]!) >= thr && i - last >= ref) {
      out.push(i)
      last = i
    }
  }
  return out
}

/** Estimate inter-channel delay via cross-correlation peak (samples; + = R lags L). */
export function estimateInterChannelDelay(
  left: Float32Array,
  right: Float32Array,
  maxDelay = 512,
): number {
  const n = Math.min(left.length, right.length)
  let bestLag = 0
  let best = -Infinity
  for (let lag = -maxDelay; lag <= maxDelay; lag++) {
    let corr = 0
    let count = 0
    for (let i = 0; i < n; i++) {
      const j = i + lag
      if (j < 0 || j >= n) continue
      corr += left[i]! * right[j]!
      count++
    }
    if (count > 0 && corr > best) {
      best = corr
      bestLag = lag
    }
  }
  return bestLag
}

export function channelCorrelation(left: Float32Array, right: Float32Array): number {
  const n = Math.min(left.length, right.length)
  if (n === 0) return 0
  let sumLR = 0
  let sumL2 = 0
  let sumR2 = 0
  for (let i = 0; i < n; i++) {
    const l = left[i]!
    const r = right[i]!
    sumLR += l * r
    sumL2 += l * l
    sumR2 += r * r
  }
  const den = Math.sqrt(sumL2 * sumR2)
  return den > 1e-12 ? sumLR / den : 0
}

/** Mid/side energy for stereo geometry checks. */
export function midSideEnergy(left: Float32Array, right: Float32Array): { mid: number; side: number } {
  const n = Math.min(left.length, right.length)
  let mid = 0
  let side = 0
  for (let i = 0; i < n; i++) {
    const m = 0.5 * (left[i]! + right[i]!)
    const s = 0.5 * (left[i]! - right[i]!)
    mid += m * m
    side += s * s
  }
  return { mid, side }
}
