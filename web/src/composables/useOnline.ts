import { storeToRefs } from 'pinia'
import type { Ref } from 'vue'
import { useOfflineModeStore } from '../stores/offlineMode'

export function useOnline(): { offline: Ref<boolean> } {
  const { offline } = storeToRefs(useOfflineModeStore())
  return { offline }
}
