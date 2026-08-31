/**
 * Reactive offline flag shared across the app.
 *
 * Wraps {@link useOfflineModeStore} so components avoid importing the Pinia store directly.
 */

import { storeToRefs } from 'pinia'
import type { Ref } from 'vue'
import { useOfflineModeStore } from '../stores/offlineMode'

/**
 * Expose whether the app is in offline mode (browser offline and/or user toggled offline).
 *
 * @returns `offline` — `true` when network-backed features should be suppressed.
 */
export function useOnline(): { offline: Ref<boolean> } {
  const { offline } = storeToRefs(useOfflineModeStore())
  return { offline }
}
