/**
 * Spectrogram ring + pitch-track session for Digital Tuner Analyze.
 * FFT / multi-F0 columns come from the DSP worker; ring + track state stay on main.
 */
import { shallowRef, watch, type Ref } from 'vue'
import {
  clearSpectrogramRing,
  createSpectrogramRing,
  pushSpectrogramColumn,
  type SpectrogramRing,
} from '../audio/tuner/spectrogramRing'
import {
  advanceSpectrogramTracks,
  clearSpectrogramTracks,
  createSpectrogramTrackState,
  shiftSpectrogramTracks,
  type SpectrogramTrack,
} from '../audio/tuner/spectrogramTracks'
import type { TunerDspSpec } from '../audio/tuner/tunerDspProtocol'
import {
  SPEC_RESOLUTION_BINS,
  type DigitalTunerPrefs,
} from '../lib/preferences/digitalTuner'

export function useTunerSpectrogram(opts: {
  prefs: Ref<DigitalTunerPrefs>
  a4Hz: Ref<number>
}) {
  const tracks = shallowRef<SpectrogramTrack[]>([])
  /** Bumps when a new column is ready — view paints on this, not a busy rAF loop. */
  const paintGen = shallowRef(0)
  let trackState = createSpectrogramTrackState()

  function buildRing(): SpectrogramRing {
    const p = opts.prefs.value
    return createSpectrogramRing(SPEC_RESOLUTION_BINS[p.specResolution], 240, {
      fMinHz: p.specFMinHz,
      fMaxHz: p.specFMaxHz,
      scale: p.specFreqScale,
    })
  }

  const ring = shallowRef<SpectrogramRing>(buildRing())

  function reset(): void {
    ring.value = buildRing()
    clearSpectrogramTracks(trackState)
    tracks.value = []
    paintGen.value++
  }

  function clear(): void {
    clearSpectrogramRing(ring.value)
    clearSpectrogramTracks(trackState)
    tracks.value = []
    paintGen.value++
  }

  function applyDsp(spec: TunerDspSpec): void {
    const dropped = pushSpectrogramColumn(ring.value, spec.bins)
    if (dropped) shiftSpectrogramTracks(trackState, dropped)

    if (opts.prefs.value.specShowTracks && spec.trackPeaks) {
      advanceSpectrogramTracks(
        trackState,
        ring.value.columns.length - 1,
        spec.trackPeaks.map((pk) => ({ hz: pk.hz, salience: pk.salience })),
        {
          a4Hz: opts.a4Hz.value,
          maxTracks: 2,
          matchCents: 40,
          holdFrames: 8,
          holdCents: 30,
        },
      )
      tracks.value = [...trackState.tracks]
    }

    paintGen.value++
  }

  watch(
    () =>
      [
        opts.prefs.value.specResolution,
        opts.prefs.value.specFMinHz,
        opts.prefs.value.specFMaxHz,
        opts.prefs.value.specFreqScale,
      ] as const,
    () => reset(),
  )

  return { ring, tracks, paintGen, applyDsp, clear, reset }
}
