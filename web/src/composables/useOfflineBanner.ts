/**
 * Offline status strip copy for the app chrome.
 *
 * Combines browser offline state with offline-library catalog cache metadata.
 */

import { computed, type ComputedRef } from 'vue'
import { useOfflineLibraryStore } from '../stores/offlineLibrary'
import { useOnline } from './useOnline'

/**
 * Pure helper: user-facing offline banner text (also used in unit tests).
 *
 * @param isOffline Whether the app considers itself offline.
 * @param catalogCachedAt ISO timestamp when the catalog was last cached, or `null`.
 * @param statusLabel Fallback label from the offline library store (pack progress, etc.).
 * @returns Banner message, or `null` when online.
 */
export function offlineBannerText(
  isOffline: boolean,
  catalogCachedAt: string | null,
  statusLabel: string,
): string | null {
  if (!isOffline) return null
  if (!catalogCachedAt) {
    return 'Offline — catalog not cached yet. Reconnect before refreshing.'
  }
  return statusLabel
}

/**
 * Reactive offline banner message for the current session.
 *
 * @returns `message` — computed banner text, or `null` when online.
 */
export function useOfflineBanner(): { message: ComputedRef<string | null> } {
  const { offline } = useOnline()
  const offlineLib = useOfflineLibraryStore()

  const message = computed(() =>
    offlineBannerText(offline.value, offlineLib.catalogCachedAt, offlineLib.statusLabel),
  )

  return { message }
}
