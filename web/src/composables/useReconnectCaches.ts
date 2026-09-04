/**
 * Offer to resume incomplete offline caches when connectivity returns.
 *
 * Watches the offline flag and, on reconnect, shows a dismissable prompt to:
 * - download missing audio for favorited tags (IndexedDB `starred` records)
 * - resume paused sheet / audio pack downloads
 *
 * Call {@link useReconnectCaches} once from the app root. The prompt UI reads
 * {@link reconnectMediaPromptVisible} / {@link reconnectMediaPlan} and calls
 * {@link acceptReconnectMediaPrompt} or {@link dismissReconnectMediaPrompt}.
 */

import { computed, ref, watch } from 'vue'
import { useFavoritesStore } from '../stores/favorites'
import { useOfflineLibraryStore } from '../stores/offlineLibrary'
import { useOfflineModeStore } from '../stores/offlineMode'
import { packIncomplete } from '../lib/packSync'
import { useOnline } from './useOnline'

/** What a reconnect prompt would download / resume if accepted. */
export type ReconnectMediaPlan = {
  favoritesAudio: boolean
  resumeSheets: boolean
  resumeAudio: boolean
}

/** True while the reconnect toast should be shown. */
export const reconnectMediaPromptVisible = ref(false)

/** Active plan for the reconnect toast (null when hidden). */
export const reconnectMediaPlan = ref<ReconnectMediaPlan | null>(null)

/** True while the user-accepted reconnect download pass is running. */
export const reconnectMediaBusy = ref(false)

let scanning = false

/** Human-readable toast body for a reconnect plan. */
export function reconnectMediaPromptMessage(plan: ReconnectMediaPlan): string {
  const parts: string[] = []
  if (plan.favoritesAudio) parts.push('missing learning tracks for your favorites')
  if (plan.resumeSheets) parts.push('your paused sheet download')
  if (plan.resumeAudio) parts.push('your paused audio pack download')
  if (!parts.length) return 'You’re back online.'
  if (parts.length === 1) return `You’re back online. Download ${parts[0]}?`
  if (parts.length === 2) return `You’re back online. Download ${parts[0]} and ${parts[1]}?`
  return `You’re back online. Download ${parts[0]}, ${parts[1]}, and ${parts[2]}?`
}

/** Short primary-button label for the reconnect toast. */
export const reconnectMediaPromptActionLabel = computed(() => {
  const plan = reconnectMediaPlan.value
  if (!plan) return 'Download'
  if (plan.resumeSheets || plan.resumeAudio) {
    return plan.favoritesAudio ? 'Download & resume' : 'Resume'
  }
  return 'Download'
})

/** Hide the reconnect toast without starting downloads (this session only). */
export function dismissReconnectMediaPrompt(): void {
  reconnectMediaPromptVisible.value = false
  reconnectMediaPlan.value = null
}

/**
 * Run the current reconnect plan (favorites audio + paused packs), then hide the toast.
 * Side effects: network, IndexedDB / Cache API via favorites + offline library stores.
 */
export async function acceptReconnectMediaPrompt(): Promise<void> {
  const plan = reconnectMediaPlan.value
  if (!plan || reconnectMediaBusy.value) return
  dismissReconnectMediaPrompt()

  const favorites = useFavoritesStore()
  const offlineLib = useOfflineLibraryStore()
  reconnectMediaBusy.value = true
  try {
    if (plan.favoritesAudio && !favorites.busy && !favorites.backgroundActive) {
      await favorites.ensureAudioForAllStarred()
    }
    if (plan.resumeSheets) {
      await offlineLib.startPack('sheets')
    }
    if (plan.resumeAudio) {
      await offlineLib.startPack('audio')
    }
  } catch {
    /* best-effort; stores keep their own error state */
  } finally {
    reconnectMediaBusy.value = false
  }
}

/**
 * Register a reconnect watcher. Call once from the app root (e.g. `App.vue`).
 *
 * On offline → online, scans for missing favorite audio and paused packs; if
 * anything is pending, shows {@link reconnectMediaPromptVisible} instead of
 * starting downloads automatically.
 */
export function useReconnectCaches(): void {
  const favorites = useFavoritesStore()
  const offlineLib = useOfflineLibraryStore()
  const offlineMode = useOfflineModeStore()
  const { offline } = useOnline()

  watch(offline, async (now, prev) => {
    if (prev !== true || now !== false || scanning) return
    if (offlineMode.browserOffline) return
    scanning = true
    try {
      await favorites.ensureLoaded()
      if (!offlineLib.loaded || !offlineLib.audioManifest || !offlineLib.sheetsManifest) {
        await offlineLib.loadManifests()
      }
      const favoritesAudio =
        !favorites.busy &&
        !favorites.backgroundActive &&
        favorites.records.some((r) => !r.audioBlobs || Object.keys(r.audioBlobs).length === 0)
      const resumeSheets =
        offlineLib.sheetsStatus === 'paused' ||
        offlineLib.sheetsStatus === 'quota' ||
        packIncomplete(offlineLib.sheetsCachedCount, offlineLib.sheetsExpectedCount)
      const resumeAudio =
        offlineLib.audioStatus === 'paused' ||
        offlineLib.audioStatus === 'quota' ||
        packIncomplete(offlineLib.audioCachedCount, offlineLib.audioExpectedCount)
      if (!favoritesAudio && !resumeSheets && !resumeAudio) return

      reconnectMediaPlan.value = { favoritesAudio, resumeSheets, resumeAudio }
      reconnectMediaPromptVisible.value = true
    } catch {
      /* best-effort; stores keep their own error state */
    } finally {
      scanning = false
    }
  })
}
