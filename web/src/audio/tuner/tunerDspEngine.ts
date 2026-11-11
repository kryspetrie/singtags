/**
 * Stateful tuner DSP — sliding windows + throttled analyze paths.
 * Runs inside the Worker (preferred) or sync on main as fallback.
 */

import { fftSpectrumView } from './fftPeaks'
import { liveMonoF0 } from './liveMonoF0'
import { multiF0 } from './multiF0'
import { normalizeFramePeak } from './normalizeFrame'
import { frameMagnitudeBins } from './spectrogramBins'
import {
  DEFAULT_TUNER_DSP_CONFIG,
  type TunerDspConfig,
  type TunerDspResult,
} from './tunerDspProtocol'

const CHORD_ANALYSIS_SAMPLES = 4096
/** Live mono YIN needs ≥~2 periods at Fmin≈55 Hz @ 48 kHz → prefer 4096. */
export const MONO_ANALYSIS_SAMPLES = 4096

export class TunerDspEngine {
  private config: TunerDspConfig = { ...DEFAULT_TUNER_DSP_CONFIG }
  private monoBuf: Float32Array | null = null
  private monoFilled = 0
  private fftBuf: Float32Array | null = null
  private fftFilled = 0
  private lastFftPublishMs = 0
  private chordBuf: Float32Array | null = null
  private chordFilled = 0
  private specBuf: Float32Array | null = null
  private specFilled = 0
  private specHop = 0
  private trackHop = 0

  setConfig(partial: Partial<TunerDspConfig>): void {
    const prev = this.config
    this.config = { ...prev, ...partial }
    if (partial.fftSize != null && partial.fftSize !== prev.fftSize) {
      this.fftBuf = null
      this.fftFilled = 0
      this.lastFftPublishMs = 0
    }
    if (
      partial.specAnalysisSamples != null &&
      partial.specAnalysisSamples !== prev.specAnalysisSamples
    ) {
      this.specBuf = null
      this.specFilled = 0
      this.specHop = 0
      this.trackHop = 0
    }
    if (partial.analyze != null && partial.analyze !== prev.analyze) {
      this.lastFftPublishMs = 0
      this.specHop = 0
      this.trackHop = 0
    }
  }

  reset(): void {
    this.monoBuf = null
    this.monoFilled = 0
    this.fftBuf = null
    this.fftFilled = 0
    this.lastFftPublishMs = 0
    this.chordBuf = null
    this.chordFilled = 0
    this.specBuf = null
    this.specFilled = 0
    this.specHop = 0
    this.trackHop = 0
  }

  processFrame(samples: Float32Array, sampleRate: number, seq: number, nowMs: number): TunerDspResult {
    const cfg = this.config
    let sumSq = 0
    for (let i = 0; i < samples.length; i++) sumSq += samples[i]! ** 2
    const level = Math.min(1, Math.sqrt(sumSq / Math.max(1, samples.length)) * 4)

    let mono: TunerDspResult['mono'] = null
    if (!cfg.suppressDetection && cfg.monoEnabled !== false) {
      mono = this.runMono(samples, sampleRate)
    }

    const result: TunerDspResult = { seq, sampleRate, level, mono }

    if (cfg.analyze === 'chord') {
      const chord = this.runChord(samples, sampleRate)
      if (chord) result.chord = chord
    } else if (cfg.analyze === 'fft') {
      const fft = this.runFft(samples, sampleRate, nowMs)
      if (fft) result.fft = fft
    } else if (cfg.analyze === 'spectrogram') {
      const spec = this.runSpec(samples, sampleRate)
      if (spec) result.spec = spec
    }

    return result
  }

  /** Recompute FFT from the last filled sliding window (unpause). */
  recomputeFft(seq: number, sampleRate: number): TunerDspResult | null {
    if (this.config.analyze !== 'fft') return null
    if (!this.fftBuf || this.fftFilled < this.fftBuf.length) return null
    this.lastFftPublishMs = 0
    const fft = this.buildFftView(this.fftBuf, sampleRate)
    return { seq, sampleRate, level: 0, mono: null, fft }
  }

  private runMono(hop: Float32Array, sampleRate: number): TunerDspResult['mono'] {
    const need = this.config.monoAnalysisSamples || MONO_ANALYSIS_SAMPLES
    const b = this.ensureBuf('mono', need)
    this.slide(b, 'mono', hop)
    if (this.monoFilled < need) return { hz: null, clarity: 0 }

    // Gate on raw (pre-normalize) RMS so noiseGateDb is meaningful.
    let sumSq = 0
    for (let i = 0; i < b.length; i++) sumSq += b[i]! * b[i]!
    const rms = Math.sqrt(sumSq / b.length)
    const gate = this.config.rmsGate ?? 0.004
    if (rms < gate) return { hz: null, clarity: 0 }

    const forF0 = normalizeFramePeak(b)
    const fMin = this.config.analysisFMinHz
    const fMax = Math.min(this.config.analysisFMaxHz, sampleRate * 0.49)
    return liveMonoF0(forF0, sampleRate, {
      // Already gated above — keep estimator gate very low.
      rmsGate: 1e-6,
      fMinHz: fMin,
      fMaxHz: Math.max(fMin + 10, fMax),
    })
  }

  private runChord(hop: Float32Array, sampleRate: number): TunerDspResult['chord'] | undefined {
    const b = this.ensureBuf('chord', CHORD_ANALYSIS_SAMPLES)
    this.slide(b, 'chord', hop)
    if (this.chordFilled < CHORD_ANALYSIS_SAMPLES) return undefined
    const fMin = this.config.analysisFMinHz
    const fMax = Math.min(this.config.analysisFMaxHz, sampleRate * 0.49)
    const { peaks, pitchClasses } = multiF0(b, sampleRate, {
      a4Hz: this.config.a4Hz,
      maxPeaks: 4,
      fMinHz: fMin,
      fMaxHz: Math.max(fMin + 10, fMax),
      salienceFloor: this.config.salienceFloor,
    })
    return { peaks, pitchClasses }
  }

  private runFft(
    hop: Float32Array,
    sampleRate: number,
    nowMs: number,
  ): TunerDspResult['fft'] | undefined {
    const need = this.config.fftSize
    const b = this.ensureBuf('fft', need)
    this.slide(b, 'fft', hop)
    if (this.fftFilled < need) return undefined
    if (nowMs - this.lastFftPublishMs < 33) return undefined
    this.lastFftPublishMs = nowMs
    return this.buildFftView(b, sampleRate)
  }

  private buildFftView(frame: Float32Array, sampleRate: number): NonNullable<TunerDspResult['fft']> {
    const fMin = this.config.analysisFMinHz
    const fMax = Math.min(this.config.analysisFMaxHz, sampleRate * 0.49)
    const raw = fftSpectrumView(frame, sampleRate, {
      a4Hz: this.config.a4Hz,
      keyPc: this.config.keyPc,
      temperament: this.config.temperament,
      customOffsetsCents: this.config.customOffsetsCents,
      maxPeaks: 4,
      displayBins: this.config.fftDisplayBins,
      salienceFloor: this.config.salienceFloor,
      fMinHz: fMin,
      fMaxHz: Math.max(fMin + 10, fMax),
    })
    return {
      bins: raw.bins,
      fMinHz: raw.fMinHz,
      fMaxHz: raw.fMaxHz,
      peaks: raw.peaks,
    }
  }

  private runSpec(hop: Float32Array, sampleRate: number): TunerDspResult['spec'] | undefined {
    const need = this.config.specAnalysisSamples
    const b = this.ensureBuf('spec', need)
    this.slide(b, 'spec', hop)
    if (this.specFilled < need) return undefined

    this.specHop++
    if (this.specHop % 2 !== 0) return undefined

    const bins = frameMagnitudeBins(b, sampleRate, {
      binCount: this.config.specBinCount,
      fMinHz: this.config.specFMinHz,
      fMaxHz: this.config.specFMaxHz,
      scale: this.config.specFreqScale,
    })

    if (this.config.specShowTracks) {
      this.trackHop++
      if (this.trackHop % 3 === 0) {
        const trackMin = Math.max(this.config.analysisFMinHz, this.config.specFMinHz)
        const trackMax = Math.min(
          this.config.analysisFMaxHz,
          this.config.specFMaxHz,
          sampleRate * 0.49,
        )
        const { peaks } = multiF0(b, sampleRate, {
          a4Hz: this.config.a4Hz,
          maxPeaks: 2,
          fMinHz: trackMin,
          fMaxHz: Math.max(trackMin + 10, trackMax),
          salienceFloor: Math.max(0.35, this.config.salienceFloor),
        })
        return { bins, trackPeaks: peaks }
      }
    }

    return { bins }
  }

  private ensureBuf(which: 'mono' | 'fft' | 'chord' | 'spec', size: number): Float32Array {
    if (which === 'mono') {
      if (!this.monoBuf || this.monoBuf.length !== size) {
        this.monoBuf = new Float32Array(size)
        this.monoFilled = 0
      }
      return this.monoBuf
    }
    if (which === 'fft') {
      if (!this.fftBuf || this.fftBuf.length !== size) {
        this.fftBuf = new Float32Array(size)
        this.fftFilled = 0
      }
      return this.fftBuf
    }
    if (which === 'chord') {
      if (!this.chordBuf || this.chordBuf.length !== size) {
        this.chordBuf = new Float32Array(size)
        this.chordFilled = 0
      }
      return this.chordBuf
    }
    if (!this.specBuf || this.specBuf.length !== size) {
      this.specBuf = new Float32Array(size)
      this.specFilled = 0
    }
    return this.specBuf
  }

  private slide(
    buf: Float32Array,
    which: 'mono' | 'fft' | 'chord' | 'spec',
    hop: Float32Array,
  ): void {
    const need = buf.length
    let filled =
      which === 'mono'
        ? this.monoFilled
        : which === 'fft'
          ? this.fftFilled
          : which === 'chord'
            ? this.chordFilled
            : this.specFilled
    if (hop.length >= need) {
      buf.set(hop.subarray(hop.length - need))
      filled = need
    } else if (filled + hop.length <= need) {
      buf.set(hop, filled)
      filled += hop.length
    } else {
      const keep = need - hop.length
      buf.copyWithin(0, filled - keep, filled)
      buf.set(hop, keep)
      filled = need
    }
    if (which === 'mono') this.monoFilled = filled
    else if (which === 'fft') this.fftFilled = filled
    else if (which === 'chord') this.chordFilled = filled
    else this.specFilled = filled
  }
}
