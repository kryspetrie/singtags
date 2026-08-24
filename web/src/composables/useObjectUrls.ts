import { onUnmounted, ref } from 'vue'

/** Track blob: URLs and revoke on unmount / reset. */
export function useObjectUrls() {
  const urls = ref<string[]>([])

  function track(url: string): string {
    urls.value.push(url)
    return url
  }

  function revokeAll(): void {
    for (const u of urls.value) URL.revokeObjectURL(u)
    urls.value = []
  }

  onUnmounted(revokeAll)

  return { track, revokeAll, urls }
}
