import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { setManualOfflineFetch } from '../lib/manualOfflineFetch'

const MANUAL_OFFLINE_KEY = 'singtags.manualOffline'
const LEGACY_OFFLINE_KEY = 'singtags.simulatedOffline'

function loadManualOffline(): boolean {
  try {
    if (localStorage.getItem(MANUAL_OFFLINE_KEY) === '1') return true
    // Migrate from earlier “simulated offline” testing label.
    if (localStorage.getItem(LEGACY_OFFLINE_KEY) === '1') return true
  } catch {
    /* ignore */
  }
  return false
}

export const useOfflineModeStore = defineStore('offlineMode', () => {
  const manualOffline = ref(loadManualOffline())
  const browserOffline = ref(typeof navigator !== 'undefined' ? !navigator.onLine : false)

  const offline = computed(() => manualOffline.value || browserOffline.value)

  function syncFetchBlock(): void {
    setManualOfflineFetch(offline.value)
  }

  watch(
    manualOffline,
    (on) => {
      try {
        localStorage.setItem(MANUAL_OFFLINE_KEY, on ? '1' : '0')
        localStorage.removeItem(LEGACY_OFFLINE_KEY)
      } catch {
        /* ignore */
      }
    },
    { flush: 'sync' },
  )

  watch(offline, syncFetchBlock, { flush: 'sync' })

  function setManualOffline(on: boolean): void {
    manualOffline.value = on
  }

  function toggleManualOffline(): void {
    manualOffline.value = !manualOffline.value
  }

  function bindBrowserConnectivity(): void {
    if (typeof window === 'undefined') return
    const sync = () => {
      browserOffline.value = !navigator.onLine
    }
    window.addEventListener('online', sync)
    window.addEventListener('offline', sync)
    sync()
  }

  /** Call once at app startup (after Pinia is installed). */
  function init(): void {
    syncFetchBlock()
    bindBrowserConnectivity()
  }

  return {
    manualOffline,
    browserOffline,
    offline,
    setManualOffline,
    toggleManualOffline,
    init,
  }
})
