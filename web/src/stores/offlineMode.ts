/**
 * Tracks whether the app should behave as offline: user-forced manual mode or
 * browser `navigator.onLine`. Drives fetch blocking via `manualOfflineFetch`.
 */
import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { setManualOfflineFetch } from '../lib/manualOfflineFetch'

const MANUAL_OFFLINE_KEY = 'singtags.manualOffline'
const LEGACY_OFFLINE_KEY = 'singtags.simulatedOffline'

/** Read manual-offline flag from localStorage (migrates legacy `simulatedOffline` key). */
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

/** Pinia store for combined offline detection and manual offline toggle. */
export const useOfflineModeStore = defineStore('offlineMode', () => {
  const manualOffline = ref(loadManualOffline())
  const browserOffline = ref(typeof navigator !== 'undefined' ? !navigator.onLine : false)

  /** True when manual offline is on or the browser reports no connectivity. */
  const offline = computed(() => manualOffline.value || browserOffline.value)

  /** Side effect: enable/disable network fetch blocking to match `offline`. */
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

  /**
   * Turn manual offline mode on or off.
   * Side effect: persists to localStorage; removes legacy key when toggling.
   */
  function setManualOffline(on: boolean): void {
    manualOffline.value = on
  }

  /** Flip manual offline mode. Side effect: localStorage + fetch blocking. */
  function toggleManualOffline(): void {
    manualOffline.value = !manualOffline.value
  }

  /** Subscribe to `online` / `offline` window events (no-op in SSR). */
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
