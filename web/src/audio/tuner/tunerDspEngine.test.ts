import { describe, expect, it } from 'vitest'
import { synthSineFrame } from './liveMonoF0'
import { MONO_ANALYSIS_SAMPLES, TunerDspEngine } from './tunerDspEngine'

describe('TunerDspEngine', () => {
  it('estimates mono F0 from 1024 hops via sliding 4096 window (incl. C2)', () => {
    const eng = new TunerDspEngine()
    eng.setConfig({ analyze: 'none', a4Hz: 440, monoAnalysisSamples: MONO_ANALYSIS_SAMPLES })
    const sr = 48000
    const hop = 1024
    const target = 65.41 // C2 — needs multi-hop window
    const hopsNeeded = Math.ceil(MONO_ANALYSIS_SAMPLES / hop) + 2
    const stream = continuousSine(target, sr, hop * hopsNeeded)
    let last = eng.processFrame(stream.subarray(0, hop), sr, 1, 0)
    for (let i = 1; i < hopsNeeded; i++) {
      last = eng.processFrame(stream.subarray(i * hop, (i + 1) * hop), sr, i + 1, i * 20)
    }
    expect(last.mono?.hz).not.toBeNull()
    expect(last.mono!.hz!).toBeGreaterThan(63)
    expect(last.mono!.hz!).toBeLessThan(68)
    expect(last.mono!.clarity).toBeGreaterThan(0.5)
  })

  it('gates on pre-normalize RMS (quiet noise stays unvoiced)', () => {
    const eng = new TunerDspEngine()
    eng.setConfig({ analyze: 'none', rmsGate: 0.05 })
    const sr = 48000
    const hop = 1024
    // Quiet sine would pass after ×12 peak-normalize, but fail raw RMS gate.
    const stream = continuousSine(440, sr, hop * 8, 0.002)
    let last = eng.processFrame(stream.subarray(0, hop), sr, 1, 0)
    for (let i = 1; i < 8; i++) {
      last = eng.processFrame(stream.subarray(i * hop, (i + 1) * hop), sr, i + 1, i * 20)
    }
    expect(last.mono?.hz ?? null).toBeNull()
  })

  it('emits FFT bins when analyze=fft and window is full', () => {
    const eng = new TunerDspEngine()
    eng.setConfig({
      analyze: 'fft',
      fftSize: 2048,
      fftDisplayBins: 160,
      a4Hz: 440,
      salienceFloor: 0.2,
    })
    const sr = 48000
    const stream = continuousSine(440, sr, 2048)
    let result = eng.processFrame(stream.subarray(0, 1024), sr, 1, 0)
    expect(result.fft).toBeUndefined()
    result = eng.processFrame(stream.subarray(1024, 2048), sr, 2, 40)
    expect(result.fft).toBeDefined()
    expect(result.fft!.bins.length).toBe(160)
    expect(result.fft!.peaks.length).toBeGreaterThan(0)
  })

  it('skips mono when detection is suppressed', () => {
    const eng = new TunerDspEngine()
    eng.setConfig({ suppressDetection: true })
    const result = eng.processFrame(synthSineFrame(440, 48000, 1024), 48000, 1, 0)
    expect(result.mono).toBeNull()
    expect(result.level).toBeGreaterThan(0)
  })
})

/** Phase-continuous sine so sliding windows stay periodic. */
function continuousSine(hz: number, sampleRate: number, length: number, amp = 0.5): Float32Array {
  const out = new Float32Array(length)
  const w = (2 * Math.PI * hz) / sampleRate
  for (let i = 0; i < length; i++) out[i] = Math.sin(w * i) * amp
  return out
}
