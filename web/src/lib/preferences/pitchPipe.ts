import {
  PITCH_PIPE_A_TUNINGS,
  aHzToCents,
  isPitchPipeLayout,
  normalizePitchPipeGridScale,
  normalizePitchPipePianoDefaultOctave,
  normalizePitchPipeRange,
  type PitchPipeAHz,
  type PitchPipeLayout,
  type PitchPipeRange,
} from '../../audio/pitchPlayer'
import { isPitchPipeSoundId, type PitchPipeSoundId } from '../../audio/pitchPipeVoice'
import { isPianoSoundEngineId, type PianoSoundEngineId } from '../../audio/pianoSamples'
import {
  PITCH_PIPE_LAYOUT_KEY,
  PITCH_PIPE_PREFS_KEY,
  PITCH_PIPE_RANGE_KEY,
} from './keys'
import type { PitchPipePrefs } from './types'

const A_HZ_SET = new Set<number>(PITCH_PIPE_A_TUNINGS.map((t) => t.hz))

/** Default pitch-pipe settings (E3–E4 grid at A440, mellow sound). */
export function defaultPitchPipePrefs(): PitchPipePrefs {
  return {
    range: 'e3-e4',
    layout: 'grid',
    aHz: 440,
    detuneCents: 0,
    showOctave: false,
    sound: 'mellow',
    gridScale: 100,
    showFullKeyboard: false,
    pianoDefaultOctave: 4,
    pianoEngine: 'synth',
    pianoLockPosition: false,
    showPcKeyRange: true,
  }
}

/** Clamp detune slider to ±50 cents (integer). */
export function clampDetuneCents(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.max(-50, Math.min(50, Math.round(n)))
}

/** Map absolute detune cents to a known concert-A preset, if exact match. */
function matchConcertA(cents: number): PitchPipeAHz | null {
  for (const t of PITCH_PIPE_A_TUNINGS) {
    if (aHzToCents(t.hz) === cents) return t.hz
  }
  return null
}

/** Legacy: `fineCents` was an offset on top of concert A. */
function fromLegacyFineCents(aHz: PitchPipeAHz, fineCents: number): PitchPipePrefs['detuneCents'] {
  return clampDetuneCents(aHzToCents(aHz) + fineCents)
}

/**
 * Parse pitch-pipe prefs from JSON (localStorage or offline zip).
 * Supports current `detuneCents` format and legacy `fineCents` offset format.
 *
 * @returns Parsed prefs or null when invalid.
 */
export function parsePitchPipePrefs(raw: unknown): PitchPipePrefs | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const range = normalizePitchPipeRange(o.range)
  const layout = isPitchPipeLayout(o.layout) ? o.layout : null
  if (!range || !layout) return null

  const showOctave = o.showOctave === true
  const sound: PitchPipeSoundId = isPitchPipeSoundId(o.sound) ? o.sound : 'mellow'
  const gridScale = normalizePitchPipeGridScale(o.gridScale)
  const showFullKeyboard = o.showFullKeyboard === true
  const pianoDefaultOctave = normalizePitchPipePianoDefaultOctave(o.pianoDefaultOctave)
  const pianoEngine: PianoSoundEngineId = isPianoSoundEngineId(o.pianoEngine)
    ? o.pianoEngine
    : 'synth'
  const pianoLockPosition = o.pianoLockPosition === true
  /** Missing key → true (legacy prefs keep highlighting). */
  const showPcKeyRange = o.showPcKeyRange !== false

  // New format: absolute detuneCents; aHz may be null (custom).
  if (typeof o.detuneCents === 'number') {
    const detuneCents = clampDetuneCents(o.detuneCents)
    const aHz =
      o.aHz === null
        ? null
        : typeof o.aHz === 'number' && A_HZ_SET.has(o.aHz)
          ? (o.aHz as PitchPipeAHz)
          : matchConcertA(detuneCents)
    return {
      range,
      layout,
      aHz,
      detuneCents,
      showOctave,
      sound,
      gridScale,
      showFullKeyboard,
      pianoDefaultOctave,
      pianoEngine,
      pianoLockPosition,
      showPcKeyRange,
    }
  }

  // Legacy format: aHz required + fineCents on top of that A.
  const aHz = typeof o.aHz === 'number' && A_HZ_SET.has(o.aHz) ? (o.aHz as PitchPipeAHz) : null
  if (aHz == null) return null
  const fine = typeof o.fineCents === 'number' ? o.fineCents : 0
  const detuneCents = fromLegacyFineCents(aHz, fine)
  return {
    range,
    layout,
    aHz: matchConcertA(detuneCents),
    detuneCents,
    showOctave,
    sound,
    gridScale,
    showFullKeyboard,
    pianoDefaultOctave,
    pianoEngine,
    pianoLockPosition,
    showPcKeyRange,
  }
}

/** Read deprecated per-key pitch pipe range from localStorage. */
function loadLegacyPitchPipeRange(): PitchPipeRange {
  try {
    const mapped = normalizePitchPipeRange(localStorage.getItem(PITCH_PIPE_RANGE_KEY))
    if (mapped) return mapped
  } catch {
    /* ignore */
  }
  return 'e3-e4'
}

/** Read deprecated per-key pitch pipe layout from localStorage. */
function loadLegacyPitchPipeLayout(): PitchPipeLayout {
  try {
    const raw = localStorage.getItem(PITCH_PIPE_LAYOUT_KEY)
    if (isPitchPipeLayout(raw)) return raw
  } catch {
    /* ignore */
  }
  return 'grid'
}

/**
 * Load pitch-pipe prefs from localStorage, with legacy key migration fallback.
 * Side effect: reads localStorage only.
 */
export function loadPitchPipePrefs(): PitchPipePrefs {
  try {
    const raw = localStorage.getItem(PITCH_PIPE_PREFS_KEY)
    if (raw) {
      const parsed = parsePitchPipePrefs(JSON.parse(raw) as unknown)
      if (parsed) return parsed
    }
  } catch {
    /* ignore */
  }
  return {
    range: loadLegacyPitchPipeRange(),
    layout: loadLegacyPitchPipeLayout(),
    aHz: 440,
    detuneCents: 0,
    showOctave: false,
    sound: 'mellow',
    gridScale: 100,
    showFullKeyboard: false,
    pianoDefaultOctave: 4,
    pianoEngine: 'synth',
    pianoLockPosition: false,
    showPcKeyRange: true,
  }
}

/**
 * Persist pitch-pipe prefs and remove deprecated split keys.
 * Side effect: localStorage write/remove.
 */
export function savePitchPipePrefs(prefs: PitchPipePrefs): void {
  try {
    localStorage.setItem(PITCH_PIPE_PREFS_KEY, JSON.stringify(prefs))
    localStorage.removeItem(PITCH_PIPE_RANGE_KEY)
    localStorage.removeItem(PITCH_PIPE_LAYOUT_KEY)
  } catch {
    /* ignore */
  }
}

/** Snapshot for offline cache zip (`preferences/pitch-pipe.json`). */
export function pitchPipePrefsSnapshot(): PitchPipePrefs {
  return loadPitchPipePrefs()
}

/** Apply snapshot from offline cache zip into localStorage. */
export function applyPitchPipePrefsSnapshot(raw: unknown): boolean {
  const parsed = parsePitchPipePrefs(raw)
  if (!parsed) return false
  savePitchPipePrefs(parsed)
  return true
}
