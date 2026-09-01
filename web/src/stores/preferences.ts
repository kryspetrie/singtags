/**
 * Shared UI preferences: multi-part audio mix/solo, pitch pipe, browse welcome,
 * and library audio part selection. Most fields persist to localStorage; pitch pipe
 * also round-trips through offline cache zip snapshots.
 */
import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import {
  PITCH_PIPE_A_TUNINGS,
  aHzToCents,
  normalizePitchPipeRange,
  type PitchPipeAHz,
  type PitchPipeLayout,
  type PitchPipeRange,
} from '../audio/pitchPlayer'
import type { LibraryAudioPartsMode } from '../lib/audioParts'
import { normalizeCustomParts } from '../lib/audioParts'

export type PartSide = 'left' | 'right'

/** Pitch-pipe UI prefs (localStorage + offline cache zip). */
export type PitchPipePrefs = {
  range: PitchPipeRange
  layout: PitchPipeLayout
  /** Concert A preset, or null when the detune slider is off-preset (“—”). */
  aHz: PitchPipeAHz | null
  /** Absolute cents vs A440 (drives the slider and playback). */
  detuneCents: number
}

const SOLO_IN_FILE_KEY = 'singtags.partSoloInFile.v1'
const MIX_PAN_KEY = 'singtags.partMixPan.v1'
const BROWSE_WELCOME_KEY = 'singtags.browseWelcomeDismissed.v1'
const SING_MODE_KEY = 'singtags.singMode.v1'
const SHARE_FULLSCREEN_KEY = 'singtags.shareFullscreen.v1'
const SHARE_BARBERSHOP_TAGS_KEY = 'singtags.shareBarbershopTags.v1'
const LIBRARY_PARTS_MODE_KEY = 'singtags.libraryAudioPartsMode.v1'
const LIBRARY_PARTS_KEY = 'singtags.libraryAudioParts.v1'
const PITCH_PIPE_PREFS_KEY = 'singtags.pitchPipe.v1'
const APPLY_DETUNE_GLOBAL_KEY = 'singtags.applyDetuneGlobally.v1'
/** @deprecated migrated into PITCH_PIPE_PREFS_KEY */
const PITCH_PIPE_RANGE_KEY = 'singtags.pitchPipeRange.v1'
/** @deprecated migrated into PITCH_PIPE_LAYOUT_KEY */
const PITCH_PIPE_LAYOUT_KEY = 'singtags.pitchPipeLayout.v1'
/** @deprecated quality is fixed at 64 kbps Opus; drop leftover user preference. */
const LEGACY_AUDIO_QUALITY_KEY = 'singtags.audioEncodeQuality.v1'
const A_HZ_SET = new Set<number>(PITCH_PIPE_A_TUNINGS.map((t) => t.hz))

try {
  localStorage.removeItem(LEGACY_AUDIO_QUALITY_KEY)
} catch {
  /* ignore */
}

/** Default pitch-pipe settings (E3–E4 grid at A440). */
export function defaultPitchPipePrefs(): PitchPipePrefs {
  return { range: 'e3-e4', layout: 'grid', aHz: 440, detuneCents: 0 }
}

/** Clamp detune slider to ±50 cents (integer). */
function clampDetuneCents(n: number): number {
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
  const layout = o.layout === 'grid' || o.layout === 'list' || o.layout === 'piano' ? o.layout : null
  if (!range || !layout) return null

  // New format: absolute detuneCents; aHz may be null (custom).
  if (typeof o.detuneCents === 'number') {
    const detuneCents = clampDetuneCents(o.detuneCents)
    const aHz =
      o.aHz === null
        ? null
        : typeof o.aHz === 'number' && A_HZ_SET.has(o.aHz)
          ? (o.aHz as PitchPipeAHz)
          : matchConcertA(detuneCents)
    return { range, layout, aHz, detuneCents }
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
    if (raw === 'grid' || raw === 'list' || raw === 'piano') return raw
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

/** Read a boolean flag from localStorage (`1`/`0`, `true`/`false`). */
function loadBool(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(key)
    if (raw === '1' || raw === 'true') return true
    if (raw === '0' || raw === 'false') return false
  } catch {
    /* ignore */
  }
  return fallback
}

/** Read a string array from localStorage JSON; normalizes custom audio part names. */
function loadStringArray(key: string, fallback: string[]): string[] {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return fallback
    return normalizeCustomParts(parsed.filter((v) => typeof v === 'string') as string[])
  } catch {
    return fallback
  }
}

/** Read library audio parts mode from localStorage. */
function loadPartsMode(): LibraryAudioPartsMode {
  try {
    const raw = localStorage.getItem(LIBRARY_PARTS_MODE_KEY)
    if (raw === 'all' || raw === 'mix' || raw === 'custom') return raw
  } catch {
    /* ignore */
  }
  return 'all'
}

/** Read per-part left/right map from localStorage (solo or mix pan). */
function loadSideMap(key: string): Record<string, PartSide> {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const out: Record<string, PartSide> = {}
    for (const [k, v] of Object.entries(parsed)) {
      if (v === 'left' || v === 'right') out[k] = v
    }
    return out
  } catch {
    return {}
  }
}

/**
 * Shared UI preferences: multi-part mix pan/solo, pitch pipe, browse welcome, library parts.
 */
export const usePreferencesStore = defineStore('preferences', () => {
  const initialPipe = loadPitchPipePrefs()
  const partSoloInFile = ref<Record<string, PartSide>>(loadSideMap(SOLO_IN_FILE_KEY))
  const partMixPan = ref<Record<string, PartSide>>(loadSideMap(MIX_PAN_KEY))
  /** Which learning-track parts to include in the full-library audio pack. */
  const libraryAudioPartsMode = ref<LibraryAudioPartsMode>(loadPartsMode())
  const libraryAudioParts = ref<string[]>(
    loadStringArray(LIBRARY_PARTS_KEY, ['lead']),
  )
  const pitchPipeRange = ref<PitchPipeRange>(initialPipe.range)
  const pitchPipeLayout = ref<PitchPipeLayout>(initialPipe.layout)
  const pitchPipeAHz = ref<PitchPipeAHz | null>(initialPipe.aHz)
  const pitchPipeDetuneCents = ref(initialPipe.detuneCents)
  /**
   * When true, pitch-pipe concert A / fine detune also applies to tag pay-the-key
   * (and any other app pitches that consult this preference).
   */
  const applyDetuneGlobally = ref(loadBool(APPLY_DETUNE_GLOBAL_KEY, false))
  /** When false, browse shows the one-time welcome / offline prompt. */
  const browseWelcomeDismissed = ref(loadBool(BROWSE_WELCOME_KEY, false))
  /**
   * When true, Browse/Recent/Favorites open tags into sheet fullscreen (`?fullscreen=1`).
   * When false, list taps open the normal tag page (default).
   */
  const singMode = ref(loadBool(SING_MODE_KEY, false))
  /**
   * When true, Copy/Share tag links include `fullscreen=1` so recipients open the sheet fullscreen.
   */
  const shareFullscreen = ref(loadBool(SHARE_FULLSCREEN_KEY, false))
  /**
   * When true, Copy/Share/QR use the barbershoptags.com tag page instead of this app.
   */
  const shareBarbershopTags = ref(loadBool(SHARE_BARBERSHOP_TAGS_KEY, false))

  /** Write current pitch-pipe refs to localStorage. Side effect: `savePitchPipePrefs`. */
  function persistPitchPipe(): void {
    savePitchPipePrefs({
      range: pitchPipeRange.value,
      layout: pitchPipeLayout.value,
      aHz: pitchPipeAHz.value,
      detuneCents: clampDetuneCents(pitchPipeDetuneCents.value),
    })
  }

  watch(
    libraryAudioPartsMode,
    (v) => {
      try {
        localStorage.setItem(LIBRARY_PARTS_MODE_KEY, v)
      } catch {
        /* ignore */
      }
    },
    { flush: 'sync' },
  )

  watch(
    libraryAudioParts,
    (v) => {
      try {
        localStorage.setItem(LIBRARY_PARTS_KEY, JSON.stringify(normalizeCustomParts(v)))
      } catch {
        /* ignore */
      }
    },
    { deep: true, flush: 'sync' },
  )

  watch(
    [pitchPipeRange, pitchPipeLayout, pitchPipeAHz, pitchPipeDetuneCents],
    () => persistPitchPipe(),
    { flush: 'sync' },
  )

  watch(
    browseWelcomeDismissed,
    (v) => {
      try {
        localStorage.setItem(BROWSE_WELCOME_KEY, v ? '1' : '0')
      } catch {
        /* ignore */
      }
    },
    { flush: 'sync' },
  )

  watch(
    applyDetuneGlobally,
    (v) => {
      try {
        localStorage.setItem(APPLY_DETUNE_GLOBAL_KEY, v ? '1' : '0')
      } catch {
        /* ignore */
      }
    },
    { flush: 'sync' },
  )

  watch(
    singMode,
    (v) => {
      try {
        localStorage.setItem(SING_MODE_KEY, v ? '1' : '0')
      } catch {
        /* ignore */
      }
    },
    { flush: 'sync' },
  )

  watch(
    shareFullscreen,
    (v) => {
      try {
        localStorage.setItem(SHARE_FULLSCREEN_KEY, v ? '1' : '0')
      } catch {
        /* ignore */
      }
    },
    { flush: 'sync' },
  )

  watch(
    shareBarbershopTags,
    (v) => {
      try {
        localStorage.setItem(SHARE_BARBERSHOP_TAGS_KEY, v ? '1' : '0')
      } catch {
        /* ignore */
      }
    },
    { flush: 'sync' },
  )

  watch(
    partSoloInFile,
    (v) => {
      try {
        localStorage.setItem(SOLO_IN_FILE_KEY, JSON.stringify(v))
      } catch {
        /* ignore */
      }
    },
    { deep: true, flush: 'sync' },
  )

  watch(
    partMixPan,
    (v) => {
      try {
        localStorage.setItem(MIX_PAN_KEY, JSON.stringify(v))
      } catch {
        /* ignore */
      }
    },
    { deep: true, flush: 'sync' },
  )

  /** Dismiss the one-time browse welcome / offline prompt. Side effect: localStorage. */
  function dismissBrowseWelcome(): void {
    browseWelcomeDismissed.value = true
  }

  /** Set which learning-track parts to include in full-library audio pack. Side effect: localStorage. */
  function setLibraryAudioPartsMode(mode: LibraryAudioPartsMode): void {
    libraryAudioPartsMode.value = mode
  }

  /** Toggle one part name in the custom library parts list (case-insensitive). */
  function toggleLibraryAudioPart(part: string): void {
    const key = part.toLowerCase()
    const next = new Set(libraryAudioParts.value.map((p) => p.toLowerCase()))
    if (next.has(key)) next.delete(key)
    else next.add(key)
    libraryAudioParts.value = [...next]
  }

  /** Solo channel for a part when playing a single file (`left` default). */
  function getPartSoloInFile(part: string): PartSide {
    return partSoloInFile.value[part] ?? 'left'
  }

  /** Set solo channel for a part. Side effect: localStorage. */
  function setPartSoloInFile(part: string, side: PartSide): void {
    partSoloInFile.value = { ...partSoloInFile.value, [part]: side }
  }

  /** Mix pan side for a part in multi-part playback (`left` default). */
  function getPartMixPan(part: string): PartSide {
    return partMixPan.value[part] ?? 'left'
  }

  /** Set mix pan side for a part. Side effect: localStorage. */
  function setPartMixPan(part: string, side: PartSide): void {
    partMixPan.value = { ...partMixPan.value, [part]: side }
  }

  /** Set pitch-pipe note range. Side effect: localStorage via pitch-pipe watcher. */
  function setPitchPipeRange(range: PitchPipeRange): void {
    pitchPipeRange.value = range
  }

  /** Set pitch-pipe layout (grid, list, piano). Side effect: localStorage. */
  function setPitchPipeLayout(layout: PitchPipeLayout): void {
    pitchPipeLayout.value = layout
  }

  /** Set concert-A preset highlight (may be null when detune is custom). */
  function setPitchPipeAHz(hz: PitchPipeAHz | null): void {
    pitchPipeAHz.value = hz
  }

  /** Absolute cents vs A440. Clears concert A when off-preset (pass `clearConcertA`). */
  function setPitchPipeDetuneCents(cents: number, opts?: { clearConcertA?: boolean }): void {
    pitchPipeDetuneCents.value = clampDetuneCents(cents)
    if (opts?.clearConcertA) pitchPipeAHz.value = null
  }

  /** Apply a concert A preset and snap detune to that pitch. */
  function setPitchPipeConcertA(hz: PitchPipeAHz): void {
    pitchPipeAHz.value = hz
    pitchPipeDetuneCents.value = clampDetuneCents(aHzToCents(hz))
  }

  /** Reload pitch-pipe prefs from storage (e.g. after offline cache restore). */
  function hydratePitchPipePrefs(): void {
    const p = loadPitchPipePrefs()
    pitchPipeRange.value = p.range
    pitchPipeLayout.value = p.layout
    pitchPipeAHz.value = p.aHz
    pitchPipeDetuneCents.value = p.detuneCents
  }

  /** Absolute cents to add to tag pay-the-key when global tuning is enabled. */
  function globalPitchDetuneCents(): number {
    return applyDetuneGlobally.value ? clampDetuneCents(pitchPipeDetuneCents.value) : 0
  }

  /** Toggle whether pitch-pipe tuning applies app-wide. */
  function setApplyDetuneGlobally(on: boolean): void {
    applyDetuneGlobally.value = on
  }

  /** Toggle Sing mode (list opens → fullscreen sheet). */
  function setSingMode(on: boolean): void {
    singMode.value = on
  }

  /** Include fullscreen=1 on shared tag links. */
  function setShareFullscreen(on: boolean): void {
    shareFullscreen.value = on
  }

  /** Share the barbershoptags.com page instead of a SingTags deep link. */
  function setShareBarbershopTags(on: boolean): void {
    shareBarbershopTags.value = on
  }

  return {
    partSoloInFile,
    partMixPan,
    browseWelcomeDismissed,
    applyDetuneGlobally,
    singMode,
    shareFullscreen,
    shareBarbershopTags,
    libraryAudioPartsMode,
    libraryAudioParts,
    pitchPipeRange,
    pitchPipeLayout,
    pitchPipeAHz,
    pitchPipeDetuneCents,
    setLibraryAudioPartsMode,
    toggleLibraryAudioPart,
    dismissBrowseWelcome,
    setApplyDetuneGlobally,
    setSingMode,
    setShareFullscreen,
    setShareBarbershopTags,
    globalPitchDetuneCents,
    getPartSoloInFile,
    setPartSoloInFile,
    getPartMixPan,
    setPartMixPan,
    setPitchPipeRange,
    setPitchPipeLayout,
    setPitchPipeAHz,
    setPitchPipeDetuneCents,
    setPitchPipeConcertA,
    hydratePitchPipePrefs,
  }
})
