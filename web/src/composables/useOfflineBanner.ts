import { computed, type ComputedRef } from 'vue'
import { useOfflineLibraryStore } from '../stores/offlineLibrary'
import { useOnline } from './useOnline'

/** User-facing offline strip copy (pure helper for tests). */
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

export function useOfflineBanner(): { message: ComputedRef<string | null> } {
  const { offline } = useOnline()
  const offlineLib = useOfflineLibraryStore()

  const message = computed(() =>
    offlineBannerText(offline.value, offlineLib.catalogCachedAt, offlineLib.statusLabel),
  )

  return { message }
}
