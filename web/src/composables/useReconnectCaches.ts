import { watch } from 'vue'
import { useStarsStore } from '../stores/stars'
import { useOfflineLibraryStore } from '../stores/offlineLibrary'
import { useOfflineModeStore } from '../stores/offlineMode'
import { useOnline } from './useOnline'

/**
 * When the browser comes back online, finish incomplete caches:
 * - starred tags missing audio blobs
 * - paused sheet / audio pack downloads
 */
export function useReconnectCaches(): void {
  const stars = useStarsStore()
  const offlineLib = useOfflineLibraryStore()
  const offlineMode = useOfflineModeStore()
  const { offline } = useOnline()
  let running = false

  watch(offline, async (now, prev) => {
    if (prev !== true || now !== false || running) return
    if (offlineMode.browserOffline) return
    running = true
    try {
      await stars.ensureLoaded()
      if (!offlineLib.loaded || !offlineLib.audioManifest || !offlineLib.sheetsManifest) {
        await offlineLib.loadManifests()
      }
      const needAudio = stars.records.some(
        (r) => !r.audioBlobs || Object.keys(r.audioBlobs).length === 0,
      )
      if (needAudio && !stars.busy && !stars.backgroundActive) {
        await stars.ensureAudioForAllStarred()
      }
      if (offlineLib.sheetsStatus === 'paused') {
        await offlineLib.startPack('sheets')
      }
      if (offlineLib.audioStatus === 'paused') {
        await offlineLib.startPack('audio')
      }
    } catch {
      /* best-effort; stores keep their own error state */
    } finally {
      running = false
    }
  })
}
