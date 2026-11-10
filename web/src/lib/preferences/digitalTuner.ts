/**
 * Digital Tuner settings blob (`singtags.digitalTuner.v1`).
 * Settings only — never persist f0 history.
 */

import { DIGITAL_TUNER_PREFS_KEY } from './keys'
import type { KeyGridTemperament } from '../../domain/tuner/keyGridTemperament'

export type DigitalTunerA4 = number | 'followPitchPipe'
export type DigitalTunerTuneDisplay = 'needle' | 'strobe'
export type DigitalTunerDensity = 'auto' | 'comfortable' | 'compact'
export type DigitalTunerAnalyzeSurface = 'hidden' | 'fft' | 'spectrogram' | 'chord'
export type DigitalTunerScaleMode = 'major' | 'minor' | 'chromatic'

export type DigitalTunerPrefs = {
  schema: 'singtags.digitalTuner.v1'
  analyzeSurface: DigitalTunerAnalyzeSurface
  tuneDisplay: DigitalTunerTuneDisplay
  keyPc: number
  scaleMode: DigitalTunerScaleMode
  keyGridTemperament: KeyGridTemperament
  customOffsetsCents: number[]
  chordLockEnabled: boolean
  chordNatureId: string | null
  chordRootPolicy: 'lowest' | 'pinned' | 'commonShift'
  pinnedRootPc: number | null
  a4Hz: DigitalTunerA4
  inTuneWindowCents: number
  chordLockWindowCents: number
  inputDeviceId: string | null
  noiseGateDb: number | null
  fftSize: number
  historyCapSec: number
  pianoVisible: boolean
  pianoPinned: boolean
  density: DigitalTunerDensity
  glanceFullscreen: boolean
}

const FFT_SIZES = new Set([2048, 4096, 8192, 16384])

export function defaultDigitalTunerPrefs(): DigitalTunerPrefs {
  return {
    schema: 'singtags.digitalTuner.v1',
    analyzeSurface: 'hidden',
    tuneDisplay: 'needle',
    keyPc: 0,
    scaleMode: 'chromatic',
    keyGridTemperament: 'equal',
    customOffsetsCents: Array.from({ length: 12 }, () => 0),
    chordLockEnabled: false,
    chordNatureId: null,
    chordRootPolicy: 'commonShift',
    pinnedRootPc: null,
    a4Hz: 'followPitchPipe',
    inTuneWindowCents: 10,
    chordLockWindowCents: 5,
    inputDeviceId: null,
    noiseGateDb: null,
    fftSize: 4096,
    historyCapSec: 15,
    pianoVisible: false,
    pianoPinned: false,
    density: 'auto',
    glanceFullscreen: false,
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

  const analyzeSurface =
    o.analyzeSurface === 'fft' ||
    o.analyzeSurface === 'spectrogram' ||
    o.analyzeSurface === 'chord' ||
    o.analyzeSurface === 'hidden'
      ? o.analyzeSurface
      : d.analyzeSurface
  const tuneDisplay = o.tuneDisplay === 'strobe' ? 'strobe' : 'needle'
  const keyGridTemperament =
    o.keyGridTemperament === 'justTriad' || o.keyGridTemperament === 'custom'
      ? o.keyGridTemperament
      : 'equal'
  const scaleMode =
    o.scaleMode === 'major' || o.scaleMode === 'minor' || o.scaleMode === 'chromatic'
      ? o.scaleMode
      : d.scaleMode
  const chordRootPolicy =
    o.chordRootPolicy === 'lowest' ||
    o.chordRootPolicy === 'pinned' ||
    o.chordRootPolicy === 'commonShift'
      ? o.chordRootPolicy
      : d.chordRootPolicy
  const density =
    o.density === 'comfortable' || o.density === 'compact' || o.density === 'auto'
      ? o.density
      : d.density

  let a4Hz: DigitalTunerA4 = d.a4Hz
  if (o.a4Hz === 'followPitchPipe') a4Hz = 'followPitchPipe'
  else if (typeof o.a4Hz === 'number' && o.a4Hz > 400 && o.a4Hz < 480) a4Hz = o.a4Hz

  const fftSize = typeof o.fftSize === 'number' && FFT_SIZES.has(o.fftSize) ? o.fftSize : d.fftSize
  const historyCapSec =
    typeof o.historyCapSec === 'number' && Number.isFinite(o.historyCapSec)
      ? Math.max(5, Math.min(30, Math.round(o.historyCapSec)))
      : d.historyCapSec

  return {
    schema: 'singtags.digitalTuner.v1',
    analyzeSurface,
    tuneDisplay,
    keyPc: clampPc(o.keyPc, d.keyPc),
    scaleMode,
    keyGridTemperament,
    customOffsetsCents: normalizeCustomOffsets(o.customOffsetsCents),
    chordLockEnabled: o.chordLockEnabled === true,
    chordNatureId: typeof o.chordNatureId === 'string' ? o.chordNatureId : null,
    chordRootPolicy,
    pinnedRootPc:
      o.pinnedRootPc == null ? null : clampPc(o.pinnedRootPc, 0),
    a4Hz,
    inTuneWindowCents: clampWindow(o.inTuneWindowCents, d.inTuneWindowCents),
    chordLockWindowCents: clampWindow(o.chordLockWindowCents, d.chordLockWindowCents),
    inputDeviceId: typeof o.inputDeviceId === 'string' ? o.inputDeviceId : null,
    noiseGateDb:
      typeof o.noiseGateDb === 'number' && Number.isFinite(o.noiseGateDb) ? o.noiseGateDb : null,
    fftSize,
    historyCapSec,
    pianoVisible: o.pianoVisible === true,
    pianoPinned: o.pianoPinned === true,
    density,
    glanceFullscreen: o.glanceFullscreen === true,
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
    /* ignore */
  }
}
