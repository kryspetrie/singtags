/**
 * Vue composable for tracking `blob:` object URLs and revoking them on teardown.
 *
 * Use when components create temporary blob URLs (offline media, prepared sheets)
 * and must not leak them across route changes or unmount.
 */

import { onUnmounted, ref } from 'vue'

/**
 * Track blob URLs created during a component lifetime.
 *
 * @returns Helpers to register URLs and revoke all tracked URLs (also runs on unmount).
 */
export function useObjectUrls() {
  const urls = ref<string[]>([])

  /** Register a blob URL for automatic cleanup; returns the same URL for chaining. */
  function track(url: string): string {
    urls.value.push(url)
    return url
  }

  /** Revoke every tracked URL and clear the internal list. */
  function revokeAll(): void {
    for (const u of urls.value) URL.revokeObjectURL(u)
    urls.value = []
  }

  onUnmounted(revokeAll)

  return { track, revokeAll, urls }
}
