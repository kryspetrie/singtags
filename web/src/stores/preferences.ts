import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import type { AudioEncodeQuality } from '../types/audio'

export type PartSide = 'left' | 'right'

const STORAGE_KEY = 'singtags.audioEncodeQuality.v1'
const SOLO_IN_FILE_KEY = 'singtags.partSoloInFile.v1'
const MIX_PAN_KEY = 'singtags.partMixPan.v1'
const PLAY_ORIGINAL_KEY = 'singtags.playOriginalWhileOnline.v1'
const UPGRADE_ON_PLAY_KEY = 'singtags.upgradeCachedOnPlay.v1'
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
 * Zip format (mp4/mp3/ogg) stays on the queue store; this controls compression strength.
 * Also stores multi-part mix: which file channel is the solo, and hard-pan placement.
 */
export const usePreferencesStore = defineStore('preferences', () => {
  const audioEncodeQuality = ref<AudioEncodeQuality>(loadQuality())
  const partSoloInFile = ref<Record<string, PartSide>>(loadSideMap(SOLO_IN_FILE_KEY))
  const partMixPan = ref<Record<string, PartSide>>(loadSideMap(MIX_PAN_KEY))
  /** Prefer hosted original over lower-quality device cache when online. */
  const playOriginalWhileOnline = ref(loadBool(PLAY_ORIGINAL_KEY, false))
  /** When an original is fetched for playback, replace the starred cache entry. */
  const upgradeCachedOnPlay = ref(loadBool(UPGRADE_ON_PLAY_KEY, false))

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
    playOriginalWhileOnline,
    (v) => {
      try {
        localStorage.setItem(PLAY_ORIGINAL_KEY, v ? '1' : '0')
      } catch {
        /* ignore */
      }
    },
    { flush: 'sync' },
  )

  watch(
    upgradeCachedOnPlay,
    (v) => {
      try {
        localStorage.setItem(UPGRADE_ON_PLAY_KEY, v ? '1' : '0')
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

  function setAudioEncodeQuality(q: AudioEncodeQuality): void {
    audioEncodeQuality.value = q
  }

  function setPlayOriginalWhileOnline(on: boolean): void {
    playOriginalWhileOnline.value = on
  }

  function setUpgradeCachedOnPlay(on: boolean): void {
    upgradeCachedOnPlay.value = on
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

  return {
    audioEncodeQuality,
    partSoloInFile,
    partMixPan,
    playOriginalWhileOnline,
    upgradeCachedOnPlay,
    setAudioEncodeQuality,
    setPlayOriginalWhileOnline,
    setUpgradeCachedOnPlay,
    getPartSoloInFile,
    setPartSoloInFile,
    getPartMixPan,
    setPartMixPan,
  }
})
