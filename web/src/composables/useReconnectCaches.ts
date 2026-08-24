import { watch } from 'vue'
import { useStarsStore } from '../stores/stars'
import { useOfflineLibraryStore } from '../stores/offlineLibrary'
import { useOnline } from './useOnline'

/**
 * When the browser comes back online, finish incomplete caches:
 * - starred tags missing audio blobs
 * - paused sheet / audio pack downloads
 */
export function useReconnectCaches(): void {
  const stars = useStarsStore()
  const offlineLib = useOfflineLibraryStore()
  const { offline } = useOnline()
  let running = false

  watch(offline, async (now, prev) => {
    if (prev !== true || now !== false || running) return
    if (typeof navigator !== 'undefined' && !navigator.onLine) return
    running = true
    try {
      await stars.ensureLoaded()
      const needAudio = stars.records.some(
        (r) => !r.audioBlobs || Object.keys(r.audioBlobs).length === 0,
      )
      if (needAudio && !stars.busy) {
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
