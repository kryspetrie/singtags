import { onMounted, onUnmounted, ref, type Ref } from 'vue'

export function useOnline(): { offline: Ref<boolean> } {
  const offline = ref(typeof navigator !== 'undefined' ? !navigator.onLine : false)

  function onOnline(): void {
    offline.value = false
  }
  function onOffline(): void {
    offline.value = true
  }

  onMounted(() => {
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    offline.value = !navigator.onLine
  })
  onUnmounted(() => {
    window.removeEventListener('online', onOnline)
    window.removeEventListener('offline', onOffline)
  })

  return { offline }
}
