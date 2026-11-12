/**
 * Digital Tuner settings blob (`singtags.digitalTuner.v1`).
 * Settings only — never persist f0 history.
 */

import { DIGITAL_TUNER_PREFS_KEY } from './keys'
import type { KeyGridTemperament } from '../../domain/tuner/keyGridTemperament'
import {
  clampPitchHz,
  isPitchRangeId,
  matchPitchRangeId,
  normalizePitchBand,
  resolvePitchRange,
  type PitchRangeId,
} from '../../domain/tuner/pitchRange'
import type { SpectrogramColormap } from '../../audio/tuner/spectrogramColormap'
import type { SpectrogramFreqScale } from '../../audio/tuner/spectrogramRing'

export type { PitchRangeId } from '../../domain/tuner/pitchRange'

export type DigitalTunerA4 = number | 'followPitchPipe'
export type DigitalTunerTuneDisplay = 'needle' | 'strobe' | 'scope'
/** Strobe paint family when tuneDisplay is strobe. */
export type DigitalTunerStrobeStyle = 'horizontal' | 'radial'
/** Live Analyze surfaces — Tune is `hidden`. Legacy chord/harmonics/staff remap in normalize. */
export type DigitalTunerAnalyzeSurface = 'hidden' | 'fft' | 'spectrogram'
export type DigitalTunerScaleMode = 'major' | 'minor' | 'chromatic'
export type SpectrogramResolution = 'coarse' | 'medium' | 'fine' | 'ultra'

export type DigitalTunerPrefs = {
  schema: 'singtags.digitalTuner.v1'
  analyzeSurface: DigitalTunerAnalyzeSurface
  /** Sticky 10-foot / Rehearsal fullscreen preference. */
  glanceFullscreen: boolean
  tuneDisplay: DigitalTunerTuneDisplay
  strobeStyle: DigitalTunerStrobeStyle
  /** Show phrase pitch history under Tune Detail. */
  sessionStripEnabled: boolean
  keyPc: number
  /** Scale guide lines on FFT / Spec (picker deferred — default chromatic). */
  scaleMode: DigitalTunerScaleMode
  keyGridTemperament: KeyGridTemperament
  customOffsetsCents: number[]
  chordLockEnabled: boolean
  chordNatureId: string | null
  pinnedRootPc: number | null
  a4Hz: DigitalTunerA4
  inTuneWindowCents: number
  chordLockWindowCents: number
  inputDeviceId: string | null
  noiseGateDb: number | null
  /**
   * Minimum live mono F0 clarity to accept a pitch (0…1).
   * Independent of multi-F0 / FFT salience.
   */
  detectionThreshold: number
  /**
   * Multi-F0 / FFT / Spec track salience floor (0…1).
   * Higher = fewer false extra notes on Analyze surfaces.
   */
  multiF0SalienceFloor: number
  /**
   * Named analysis pitch band (Tune / FFT / Spec reaction).
   * `custom` when Hz were edited outside a preset.
   */
  pitchRangeId: PitchRangeId
  /** Inclusive analysis band low (Hz). */
  pitchFMinHz: number
  /** Inclusive analysis band high (Hz). */
  pitchFMaxHz: number
  fftSize: number
  /** Temporal EMA on FFT display bars. */
  fftSmoothing: boolean
  /** Peak-hold trail on FFT display bars. */
  fftPeakHold: boolean
  /** Spectrogram Analyze controls */
  specGridlines: boolean
  specFreqScale: SpectrogramFreqScale
  /** Spec display band — kept in sync with pitchF* when choosing a preset. */
  specFMinHz: number
  specFMaxHz: number
  specResolution: SpectrogramResolution
  specColormap: SpectrogramColormap
  specShowTracks: boolean
}

/** Sliding FFT window length (samples, power-of-two) per resolution. */
export const SPEC_ANALYSIS_SAMPLES: Record<SpectrogramResolution, number> = {
  coarse: 2048,
  medium: 4096,
  fine: 4096,
  ultra: 8192,
}

/** Display rows for the spectrogram canvas (capped for paint cost). */
export const SPEC_RESOLUTION_BINS: Record<SpectrogramResolution, number> = {
  coarse: 96,
  medium: 160,
  fine: 224,
  ultra: 320,
}

const FFT_SIZES = new Set([2048, 4096, 8192, 16384])
const SPEC_RES = new Set<SpectrogramResolution>(['coarse', 'medium', 'fine', 'ultra'])
const SPEC_MAPS = new Set<SpectrogramColormap>(['viridis', 'inferno', 'magma', 'gray', 'classic'])

export function defaultDigitalTunerPrefs(): DigitalTunerPrefs {
  return {
    schema: 'singtags.digitalTuner.v1',
    analyzeSurface: 'hidden',
    glanceFullscreen: false,
    tuneDisplay: 'needle',
    strobeStyle: 'horizontal',
    sessionStripEnabled: true,
    keyPc: 0,
    scaleMode: 'chromatic',
    keyGridTemperament: 'equal',
    customOffsetsCents: Array.from({ length: 12 }, () => 0),
    chordLockEnabled: false,
    chordNatureId: null,
    pinnedRootPc: null,
    a4Hz: 'followPitchPipe',
    inTuneWindowCents: 15,
    chordLockWindowCents: 5,
    inputDeviceId: null,
    // −40 dBFS-ish — quiet laptop fan stays below; singing still opens.
    noiseGateDb: -40,
    detectionThreshold: 0.65,
    multiF0SalienceFloor: 0.4,
    // Quartet F0 band — rejects chassis rumble below ~70 Hz.
    pitchRangeId: 'quartet',
    pitchFMinHz: 70,
    pitchFMaxHz: 700,
    fftSize: 4096,
    fftSmoothing: true,
    fftPeakHold: true,
    specGridlines: true,
    specFreqScale: 'log',
    // Mirrors pitch band (singer-centric default).
    specFMinHz: 70,
    specFMaxHz: 700,
    specResolution: 'fine',
    specColormap: 'viridis',
    specShowTracks: true,
  }
}

/** Apply a named pitch preset (or keep custom Hz) and sync Spec display band. */
export function prefsForPitchRange(
  id: PitchRangeId,
  minHz?: number,
  maxHz?: number,
): Pick<DigitalTunerPrefs, 'pitchRangeId' | 'pitchFMinHz' | 'pitchFMaxHz' | 'specFMinHz' | 'specFMaxHz'> {
  const r = resolvePitchRange(id, minHz, maxHz)
  return {
    pitchRangeId: r.id,
    pitchFMinHz: r.minHz,
    pitchFMaxHz: r.maxHz,
    specFMinHz: r.minHz,
    specFMaxHz: r.maxHz,
  }
}

function clampPc(n: unknown, fallback: number): number {
  const v = typeof n === 'number' ? n : Number(n)
  if (!Number.isFinite(v)) return fallback
  return ((Math.round(v) % 12) + 12) % 12
}

function clampWindow(n: unknown, fallback: number): number {
  const v = typeof n === 'number' ? n : Number(n)
  if (!Number.isFinite(v)) return fallback
  return Math.max(1, Math.min(50, Math.round(v)))
}

/** Clamp detection threshold to a usable 0.15…0.9 band. */
export function clampDetectionThreshold(n: unknown, fallback = 0.55): number {
  const v = typeof n === 'number' ? n : Number(n)
  if (!Number.isFinite(v)) return fallback
  return Math.max(0.15, Math.min(0.9, Math.round(v * 100) / 100))
}

function normalizeCustomOffsets(raw: unknown): number[] {
  const out = Array.from({ length: 12 }, () => 0)
  if (!Array.isArray(raw)) return out
  for (let i = 0; i < 12; i++) {
    const v = raw[i]
    if (typeof v === 'number' && Number.isFinite(v)) out[i] = Math.max(-100, Math.min(100, v))
  }
  return out
}

/** Normalize corrupt / partial prefs into a safe blob. */
export function normalizeDigitalTunerPrefs(raw: unknown): DigitalTunerPrefs {
  const d = defaultDigitalTunerPrefs()
  if (!raw || typeof raw !== 'object') return d
  const o = raw as Record<string, unknown>

  // Legacy Analyze tabs / surfaces — see docs/plans/digital-tuner-dropped.md
  const analyzeSurface: DigitalTunerAnalyzeSurface =
    o.analyzeSurface === 'chord' || o.analyzeSurface === 'harmonics'
      ? 'fft'
      : o.analyzeSurface === 'staff'
        ? 'hidden'
        : o.analyzeSurface === 'fft' ||
            o.analyzeSurface === 'spectrogram' ||
            o.analyzeSurface === 'hidden'
          ? o.analyzeSurface
          : d.analyzeSurface
  const tuneDisplay =
    o.tuneDisplay === 'strobe' || o.tuneDisplay === 'scope' ? o.tuneDisplay : 'needle'
  const strobeStyle = o.strobeStyle === 'radial' ? 'radial' : 'horizontal'
  const keyGridTemperament =
    o.keyGridTemperament === 'justTriad' || o.keyGridTemperament === 'custom'
      ? o.keyGridTemperament
      : 'equal'
  const scaleMode =
    o.scaleMode === 'major' || o.scaleMode === 'minor' || o.scaleMode === 'chromatic'
      ? o.scaleMode
      : d.scaleMode

  let a4Hz: DigitalTunerA4 = d.a4Hz
  if (o.a4Hz === 'followPitchPipe') a4Hz = 'followPitchPipe'
  else if (typeof o.a4Hz === 'number' && o.a4Hz > 400 && o.a4Hz < 480) a4Hz = o.a4Hz

  const fftSize = typeof o.fftSize === 'number' && FFT_SIZES.has(o.fftSize) ? o.fftSize : d.fftSize

  let specResolution =
    typeof o.specResolution === 'string' && SPEC_RES.has(o.specResolution as SpectrogramResolution)
      ? (o.specResolution as SpectrogramResolution)
      : d.specResolution
  const specColormap =
    typeof o.specColormap === 'string' && SPEC_MAPS.has(o.specColormap as SpectrogramColormap)
      ? (o.specColormap as SpectrogramColormap)
      : d.specColormap
  // Pitch / Spec band — prefer explicit pitchF*; else legacy specF*; else default voice.
  let pitchFMinHz = clampPitchHz(o.pitchFMinHz, Number.NaN)
  let pitchFMaxHz = clampPitchHz(o.pitchFMaxHz, Number.NaN)
  if (!Number.isFinite(pitchFMinHz) || !Number.isFinite(pitchFMaxHz)) {
    pitchFMinHz = clampPitchHz(o.specFMinHz, d.pitchFMinHz)
    pitchFMaxHz = clampPitchHz(o.specFMaxHz, d.pitchFMaxHz)
  }
  let band = normalizePitchBand(pitchFMinHz, pitchFMaxHz)
  // Migrate prior cramped Spec default (80–1000) → current default band.
  if (
    (band.minHz === 80 && band.maxHz === 1000) ||
    (band.minHz === 65 && band.maxHz === 1200)
  ) {
    band = { minHz: d.pitchFMinHz, maxHz: d.pitchFMaxHz }
    if (specResolution === 'medium' || specResolution === 'coarse') {
      specResolution = 'fine'
    }
  }
  // Prior default Voice (55–1200) → Quartet F0 (rejects laptop-fan rumble).
  if (band.minHz === 55 && band.maxHz === 1200 && (o.pitchRangeId == null || o.pitchRangeId === 'voice')) {
    band = { minHz: d.pitchFMinHz, maxHz: d.pitchFMaxHz }
  }
  let pitchRangeId: PitchRangeId = isPitchRangeId(o.pitchRangeId)
    ? o.pitchRangeId
    : matchPitchRangeId(band.minHz, band.maxHz)
  if (pitchRangeId !== 'custom') {
    const resolved = resolvePitchRange(pitchRangeId)
    // If stored id disagrees with Hz, trust Hz as custom unless Hz match the preset.
    if (
      Math.abs(resolved.minHz - band.minHz) > 0.6 ||
      Math.abs(resolved.maxHz - band.maxHz) > 0.6
    ) {
      pitchRangeId = matchPitchRangeId(band.minHz, band.maxHz)
    } else {
      band = { minHz: resolved.minHz, maxHz: resolved.maxHz }
    }
  }

  return {
    schema: 'singtags.digitalTuner.v1',
    analyzeSurface,
    glanceFullscreen: o.glanceFullscreen === true,
    tuneDisplay,
    strobeStyle,
    sessionStripEnabled: o.sessionStripEnabled !== false,
    keyPc: clampPc(o.keyPc, d.keyPc),
    scaleMode,
    keyGridTemperament,
    customOffsetsCents: normalizeCustomOffsets(o.customOffsetsCents),
    chordLockEnabled: o.chordLockEnabled === true,
    chordNatureId: typeof o.chordNatureId === 'string' ? o.chordNatureId : null,
    pinnedRootPc: o.pinnedRootPc == null ? null : clampPc(o.pinnedRootPc, 0),
    a4Hz,
    inTuneWindowCents: clampWindow(o.inTuneWindowCents, d.inTuneWindowCents),
    chordLockWindowCents: clampWindow(o.chordLockWindowCents, d.chordLockWindowCents),
    inputDeviceId: typeof o.inputDeviceId === 'string' ? o.inputDeviceId : null,
    noiseGateDb:
      typeof o.noiseGateDb === 'number' && Number.isFinite(o.noiseGateDb)
        ? Math.max(-80, Math.min(-10, o.noiseGateDb))
        : d.noiseGateDb,
    detectionThreshold: clampDetectionThreshold(o.detectionThreshold, d.detectionThreshold),
    multiF0SalienceFloor: clampDetectionThreshold(
      o.multiF0SalienceFloor,
      d.multiF0SalienceFloor,
    ),
    pitchRangeId,
    pitchFMinHz: band.minHz,
    pitchFMaxHz: band.maxHz,
    fftSize,
    fftSmoothing: o.fftSmoothing !== false,
    fftPeakHold: o.fftPeakHold !== false,
    specGridlines: o.specGridlines !== false,
    specFreqScale: o.specFreqScale === 'linear' ? 'linear' : 'log',
    specFMinHz: band.minHz,
    specFMaxHz: band.maxHz,
    specResolution,
    specColormap,
    specShowTracks: o.specShowTracks !== false,
  }
}

export function parseDigitalTunerPrefs(raw: unknown): DigitalTunerPrefs | null {
  if (!raw || typeof raw !== 'object') return null
  return normalizeDigitalTunerPrefs(raw)
}

export function loadDigitalTunerPrefs(): DigitalTunerPrefs {
  if (typeof localStorage === 'undefined') return defaultDigitalTunerPrefs()
  try {
    const raw = localStorage.getItem(DIGITAL_TUNER_PREFS_KEY)
    if (!raw) return defaultDigitalTunerPrefs()
    return normalizeDigitalTunerPrefs(JSON.parse(raw) as unknown)
  } catch {
    return defaultDigitalTunerPrefs()
  }
}

export function saveDigitalTunerPrefs(prefs: DigitalTunerPrefs): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(DIGITAL_TUNER_PREFS_KEY, JSON.stringify(normalizeDigitalTunerPrefs(prefs)))
  } catch {
    /* ignore quota */
  }
}
