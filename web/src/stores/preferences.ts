import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import type { AudioEncodeQuality } from '../types/audio'
import type { PitchPipeRange } from '../audio/pitchPlayer'
import type { LibraryAudioPartsMode } from '../lib/audioParts'
import { normalizeCustomParts } from '../lib/audioParts'

export type PartSide = 'left' | 'right'

const STORAGE_KEY = 'singtags.audioEncodeQuality.v1'
const SOLO_IN_FILE_KEY = 'singtags.partSoloInFile.v1'
const MIX_PAN_KEY = 'singtags.partMixPan.v1'
const BROWSE_WELCOME_KEY = 'singtags.browseWelcomeDismissed.v1'
const LIBRARY_PARTS_MODE_KEY = 'singtags.libraryAudioPartsMode.v1'
const LIBRARY_PARTS_KEY = 'singtags.libraryAudioParts.v1'
const PITCH_PIPE_RANGE_KEY = 'singtags.pitchPipeRange.v1'
const DEFAULT_QUALITY: AudioEncodeQuality = 'standard'

function loadQuality(): AudioEncodeQuality {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === 'original' || raw === 'standard' || raw === 'compact' || raw === 'lofi') return raw
  } catch {
    /* ignore */
  }
  return DEFAULT_QUALITY
}

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

function loadPartsMode(): LibraryAudioPartsMode {
  try {
    const raw = localStorage.getItem(LIBRARY_PARTS_MODE_KEY)
    if (raw === 'all' || raw === 'mix' || raw === 'custom') return raw
  } catch {
    /* ignore */
  }
  return 'all'
}

function loadPitchPipeRange(): PitchPipeRange {
  try {
    const raw = localStorage.getItem(PITCH_PIPE_RANGE_KEY)
    if (raw === 'f3-f4' || raw === 'e3-e4') return raw
  } catch {
    /* ignore */
  }
  return 'f3-f4'
}

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
 * Shared preference for offline starring, audio pack downloads, and zip re-encode quality.
 * Zip format (m4a/mp3) stays on the queue store; this controls compression strength.
 * Also stores multi-part mix: which file channel is the solo, and hard-pan placement.
 */
export const usePreferencesStore = defineStore('preferences', () => {
  const audioEncodeQuality = ref<AudioEncodeQuality>(loadQuality())
  const partSoloInFile = ref<Record<string, PartSide>>(loadSideMap(SOLO_IN_FILE_KEY))
  const partMixPan = ref<Record<string, PartSide>>(loadSideMap(MIX_PAN_KEY))
  /** Which learning-track parts to include in the full-library audio pack. */
  const libraryAudioPartsMode = ref<LibraryAudioPartsMode>(loadPartsMode())
  const libraryAudioParts = ref<string[]>(
    loadStringArray(LIBRARY_PARTS_KEY, ['lead']),
  )
  /** Pitch-pipe grid: F3–F4 (default) or E3–E4. */
  const pitchPipeRange = ref<PitchPipeRange>(loadPitchPipeRange())
  /** When false, browse shows the one-time welcome / offline prompt. */
  const browseWelcomeDismissed = ref(loadBool(BROWSE_WELCOME_KEY, false))

  watch(
    audioEncodeQuality,
    (v) => {
      try {
        localStorage.setItem(STORAGE_KEY, v)
      } catch {
        /* ignore */
      }
    },
    { flush: 'sync' },
  )

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
    pitchPipeRange,
    (v) => {
      try {
        localStorage.setItem(PITCH_PIPE_RANGE_KEY, v)
      } catch {
        /* ignore */
      }
    },
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

  function dismissBrowseWelcome(): void {
    browseWelcomeDismissed.value = true
  }

  function setLibraryAudioPartsMode(mode: LibraryAudioPartsMode): void {
    libraryAudioPartsMode.value = mode
  }

  function toggleLibraryAudioPart(part: string): void {
    const key = part.toLowerCase()
    const next = new Set(libraryAudioParts.value.map((p) => p.toLowerCase()))
    if (next.has(key)) next.delete(key)
    else next.add(key)
    libraryAudioParts.value = [...next]
  }

  function setAudioEncodeQuality(q: AudioEncodeQuality): void {
    audioEncodeQuality.value = q
  }

  function getPartSoloInFile(part: string): PartSide {
    return partSoloInFile.value[part] ?? 'left'
  }

  function setPartSoloInFile(part: string, side: PartSide): void {
    partSoloInFile.value = { ...partSoloInFile.value, [part]: side }
  }

  function getPartMixPan(part: string): PartSide {
    return partMixPan.value[part] ?? 'left'
  }

  function setPartMixPan(part: string, side: PartSide): void {
    partMixPan.value = { ...partMixPan.value, [part]: side }
  }

  function setPitchPipeRange(range: PitchPipeRange): void {
    pitchPipeRange.value = range
  }

  return {
    audioEncodeQuality,
    partSoloInFile,
    partMixPan,
    browseWelcomeDismissed,
    libraryAudioPartsMode,
    libraryAudioParts,
    pitchPipeRange,
    setAudioEncodeQuality,
    setLibraryAudioPartsMode,
    toggleLibraryAudioPart,
    dismissBrowseWelcome,
    getPartSoloInFile,
    setPartSoloInFile,
    getPartMixPan,
    setPartMixPan,
    setPitchPipeRange,
  }
})
