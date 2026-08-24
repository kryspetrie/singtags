import { ref } from 'vue'

export function useRegisterSW(_opts?: unknown) {
  return {
    needRefresh: ref(false),
    offlineReady: ref(false),
    updateServiceWorker: async (_reload?: boolean) => {},
  }
}
