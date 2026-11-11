/**
 * FFT Analyze session — apply worker spectrum + smooth/peak-hold on main.
 */
import { shallowRef, watch, type Ref } from 'vue'
import {
  applyFftDisplaySmooth,
  createFftDisplaySmoothState,
  resetFftDisplaySmooth,
} from '../audio/tuner/fftDisplaySmooth'
import {
  createFftPeakSmoothState,
  resetFftPeakSmooth,
  smoothFftPeaks,
} from '../audio/tuner/fftPeakSmooth'
import type { FftSpectrumView } from '../audio/tuner/fftPeaks'
import type { TunerDspFft } from '../audio/tuner/tunerDspProtocol'
import type { DigitalTunerPrefs } from '../lib/preferences/digitalTuner'

export function useTunerFftSession(opts: {
  prefs: Ref<DigitalTunerPrefs>
  enabled: Ref<boolean>
  paused: Ref<boolean>
}) {
  const spectrum = shallowRef<FftSpectrumView | null>(null)
  const smooth = createFftDisplaySmoothState()
  const peakSmooth = createFftPeakSmoothState()

  function reset(): void {
    resetFftDisplaySmooth(smooth)
    resetFftPeakSmooth(peakSmooth)
    spectrum.value = null
  }

  function applyDsp(raw: TunerDspFft, optsExtra?: { forceSmooth?: boolean }): void {
    if (!opts.enabled.value || opts.paused.value) return
    const force = optsExtra?.forceSmooth === true
    const { bins, peaks: hold } = applyFftDisplaySmooth(smooth, raw.bins, {
      smoothing: opts.prefs.value.fftSmoothing,
      peakHold: opts.prefs.value.fftPeakHold,
      alpha: force ? 1 : opts.prefs.value.fftSmoothing ? 0.35 : 1,
    })
    const peaks = smoothFftPeaks(peakSmooth, raw.peaks, {
      // Prefer stable labeled peaks for held-chord study (not one-frame spikes).
      appearHits: force ? 1 : 3,
      holdMisses: force ? 5 : 10,
      maxPeaks: force ? 6 : 4,
      alpha: force ? 1 : 0.35,
    }).filter((p) => {
      const lo = opts.prefs.value.pitchFMinHz
      const hi = opts.prefs.value.pitchFMaxHz
      return (
        p.salience >= opts.prefs.value.multiF0SalienceFloor * 0.85 &&
        p.hz >= lo &&
        p.hz <= hi
      )
    })
    spectrum.value = {
      bins,
      fMinHz: raw.fMinHz,
      fMaxHz: raw.fMaxHz,
      peakHold: hold ?? undefined,
      peaks,
    }
  }

  watch(
    () => opts.enabled.value,
    (on) => {
      if (!on) reset()
    },
  )

  watch(
    () => opts.prefs.value.fftSize,
    () => reset(),
  )

  return { spectrum, applyDsp, reset }
}
