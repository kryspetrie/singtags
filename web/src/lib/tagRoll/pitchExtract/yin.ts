/**
 * Frame-wise YIN fundamental frequency estimate (browser pitch extract).
 * Port of the numpy path in polecats/extract_pitch_stacks.py.
 */

export const PITCH_EXTRACT_SR = 22_050
export const PITCH_EXTRACT_HOP = 512
export const PITCH_EXTRACT_WIN = 2048
const FMIN = 65
const FMAX = 1000

/** Resample mono PCM to {@link PITCH_EXTRACT_SR} (linear). */
export function resampleLinear(input: Float32Array, fromSr: number, toSr: number): Float32Array {
  if (fromSr === toSr) return input
  const ratio = fromSr / toSr
  const n = Math.max(1, Math.floor(input.length / ratio))
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const x = i * ratio
    const i0 = Math.floor(x)
    const i1 = Math.min(input.length - 1, i0 + 1)
    const t = x - i0
    out[i] = input[i0]! * (1 - t) + input[i1]! * t
  }
  return out
}

/** YIN f0 series (Hz); NaN when unvoiced. */
export function yinF0(
  samples: Float32Array,
  sr = PITCH_EXTRACT_SR,
): Float32Array {
  const hop = PITCH_EXTRACT_HOP
  const win = PITCH_EXTRACT_WIN
  const tauMin = Math.max(2, Math.floor(sr / FMAX))
  const tauMax = Math.min(win - 2, Math.floor(sr / FMIN))
  const nFrames = Math.max(0, Math.floor((samples.length - win) / hop) + 1)
  const out = new Float32Array(nFrames)
  out.fill(Number.NaN)
  const thresh = 0.12
  const acBuf = new Float64Array(win)
  const dNorm = new Float64Array(win)

  for (let fi = 0; fi < nFrames; fi++) {
    const off = fi * hop
    let sum = 0
    let sumSq = 0
    for (let i = 0; i < win; i++) {
      const v = samples[off + i]!
      sum += v
      sumSq += v * v
    }
    const mean = sum / win
    const rms = Math.sqrt(sumSq / win + 1e-20)
    if (rms < 0.0025) continue

    // Power spectrum autocorr via DFT (real, size 2*win)
    const n = win * 2
    const re = new Float64Array(n)
    const im = new Float64Array(n)
    for (let i = 0; i < win; i++) re[i] = samples[off + i]! - mean
    fftRadix2(re, im)
    for (let i = 0; i < n; i++) {
      const a = re[i]!
      const b = im[i]!
      re[i] = a * a + b * b
      im[i] = 0
    }
    fftRadix2(re, im, true)
    for (let i = 0; i < win; i++) acBuf[i] = re[i]!

    const ac0 = acBuf[0]!
    dNorm[0] = 1
    let cum = 0
    for (let tau = 1; tau < win; tau++) {
      const d = ac0 - acBuf[tau]!
      cum += d
      dNorm[tau] = (d * tau) / (cum + 1e-12)
    }

    let tau = -1
    for (let t = tauMin; t < tauMax; t++) {
      if (dNorm[t]! < thresh) {
        tau = t
        while (tau + 1 < tauMax && dNorm[tau + 1]! < dNorm[tau]!) tau++
        break
      }
    }
    if (tau < 0) {
      let best = tauMin
      let bestV = dNorm[tauMin]!
      for (let t = tauMin + 1; t < tauMax; t++) {
        if (dNorm[t]! < bestV) {
          bestV = dNorm[t]!
          best = t
        }
      }
      if (bestV > 0.35) continue
      tau = best
    }

    let tauF = tau
    if (tau >= 1 && tau < win - 1) {
      const s0 = dNorm[tau - 1]!
      const s1 = dNorm[tau]!
      const s2 = dNorm[tau + 1]!
      const denom = 2 * (2 * s1 - s0 - s2)
      if (Math.abs(denom) > 1e-9) tauF = tau + (s0 - s2) / denom
    }
    out[fi] = sr / tauF
  }
  return out
}

/** In-place radix-2 FFT; inverse when `inverse`. */
function fftRadix2(re: Float64Array, im: Float64Array, inverse = false): void {
  const n = re.length
  let j = 0
  for (let i = 1; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      ;[re[i], re[j]] = [re[j]!, re[i]!]
      ;[im[i], im[j]] = [im[j]!, im[i]!]
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inverse ? 2 : -2) * Math.PI) / len
    const wlenRe = Math.cos(ang)
    const wlenIm = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let wRe = 1
      let wIm = 0
      for (let k = 0; k < len / 2; k++) {
        const uRe = re[i + k]!
        const uIm = im[i + k]!
        const vRe = re[i + k + len / 2]! * wRe - im[i + k + len / 2]! * wIm
        const vIm = re[i + k + len / 2]! * wIm + im[i + k + len / 2]! * wRe
        re[i + k] = uRe + vRe
        im[i + k] = uIm + vIm
        re[i + k + len / 2] = uRe - vRe
        im[i + k + len / 2] = uIm - vIm
        const nwRe = wRe * wlenRe - wIm * wlenIm
        wIm = wRe * wlenIm + wIm * wlenRe
        wRe = nwRe
      }
    }
  }
  if (inverse) {
    for (let i = 0; i < n; i++) {
      re[i]! /= n
      im[i]! /= n
    }
  }
}

export function hzToMidi(hz: number): number {
  return 69 + 12 * Math.log2(hz / 440)
}

export function medianFilterNan(m: Float64Array, k = 7): Float64Array {
  const r = Math.floor(k / 2)
  const out = new Float64Array(m.length)
  const buf: number[] = []
  for (let i = 0; i < m.length; i++) {
    buf.length = 0
    for (let j = Math.max(0, i - r); j <= Math.min(m.length - 1, i + r); j++) {
      const v = m[j]!
      if (Number.isFinite(v)) buf.push(v)
    }
    if (!buf.length) {
      out[i] = Number.NaN
      continue
    }
    buf.sort((a, b) => a - b)
    out[i] = buf[Math.floor(buf.length / 2)]!
  }
  return out
}

/** Quantized MIDI; -1 = unvoiced. */
export function trackMidiSeries(samples: Float32Array, sr = PITCH_EXTRACT_SR): Int16Array {
  const f0 = yinF0(samples, sr)
  const mid = new Float64Array(f0.length)
  for (let i = 0; i < f0.length; i++) {
    const f = f0[i]!
    mid[i] = Number.isFinite(f) && f > 0 ? hzToMidi(f) : Number.NaN
  }
  const filtered = medianFilterNan(mid, 7)
  const out = new Int16Array(filtered.length)
  for (let i = 0; i < filtered.length; i++) {
    const v = filtered[i]!
    out[i] = Number.isFinite(v) ? (Math.round(v) as number) : -1
  }
  return out
}
