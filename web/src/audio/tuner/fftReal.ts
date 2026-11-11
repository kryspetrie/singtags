/**
 * Radix-2 real→magnitude FFT for tuner spectra (replaces naive O(n·k) DFT).
 */

/** Smallest power of two ≥ n (n≥1). */
export function nextPow2(n: number): number {
  let p = 1
  while (p < n) p <<= 1
  return p
}

export type FftScratch = {
  n: number
  re: Float64Array
  im: Float64Array
  mag: Float64Array
  window: Float64Array
}

export type FftWindowKind = 'hann' | 'rect'

/** Reusable scratch for a fixed FFT size (window + complex buffers). */
export function createFftScratch(n: number, kind: FftWindowKind = 'hann'): FftScratch {
  const size = nextPow2(Math.max(2, n))
  const window = new Float64Array(size)
  if (kind === 'rect') {
    window.fill(1)
  } else {
    for (let i = 0; i < size; i++) {
      window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1 || 1)))
    }
  }
  return {
    n: size,
    re: new Float64Array(size),
    im: new Float64Array(size),
    mag: new Float64Array(size / 2),
    window,
  }
}

/**
 * Hann-windowed real FFT → magnitudes for bins 0…n/2-1.
 * Copies/pads `frame` into scratch; returns scratch.mag (do not free).
 */
export function fftRealMagnitudes(frame: ArrayLike<number>, scratch: FftScratch): Float64Array {
  const { n, re, im, mag, window } = scratch
  const len = Math.min(frame.length, n)
  re.fill(0)
  im.fill(0)
  for (let i = 0; i < len; i++) {
    re[i] = frame[i]! * window[i]!
  }
  fftRadix2(re, im)
  const half = n >> 1
  for (let k = 0; k < half; k++) {
    mag[k] = Math.hypot(re[k]!, im[k]!)
  }
  return mag
}

/** In-place Cooley–Tukey radix-2 FFT (n must be power of two). */
function fftRadix2(re: Float64Array, im: Float64Array): void {
  const n = re.length
  // Bit reversal
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      const tr = re[i]!
      re[i] = re[j]!
      re[j] = tr
      const ti = im[i]!
      im[i] = im[j]!
      im[j] = ti
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len
    const wlenRe = Math.cos(ang)
    const wlenIm = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let wRe = 1
      let wIm = 0
      const half = len >> 1
      for (let j = 0; j < half; j++) {
        const uRe = re[i + j]!
        const uIm = im[i + j]!
        const vRe = re[i + j + half]! * wRe - im[i + j + half]! * wIm
        const vIm = re[i + j + half]! * wIm + im[i + j + half]! * wRe
        re[i + j] = uRe + vRe
        im[i + j] = uIm + vIm
        re[i + j + half] = uRe - vRe
        im[i + j + half] = uIm - vIm
        const nextWRe = wRe * wlenRe - wIm * wlenIm
        wIm = wRe * wlenIm + wIm * wlenRe
        wRe = nextWRe
      }
    }
  }
}
