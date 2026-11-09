/**
 * OS share sheet / clipboard adapter for Labs OS Share.
 * URL building stays in `lib/tagShare`.
 */
export type ShareOrCopyResult = 'shared' | 'copied' | 'cancelled' | 'failed'

/**
 * Whether to prefer the Web Share sheet over clipboard.
 * Desktop browsers often expose `navigator.share` but reject URL-only payloads —
 * check `canShare` when present, otherwise only auto-open share on touch devices.
 */
export function shouldPreferWebShare(data: ShareData): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return false
  if (typeof navigator.canShare === 'function') {
    try {
      return navigator.canShare(data)
    } catch {
      return false
    }
  }
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(pointer: coarse)').matches
}

/**
 * Share via the OS sheet when reliable; otherwise copy the URL to the clipboard.
 */
export async function shareOrCopyUrl(
  url: string,
  opts?: { title?: string; text?: string },
): Promise<ShareOrCopyResult> {
  const title = opts?.title || 'SingTags'
  const text = opts?.text || title
  const data: ShareData = { title, text, url }

  if (shouldPreferWebShare(data)) {
    try {
      await navigator.share(data)
      return 'shared'
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled'
    }
  }

  try {
    await navigator.clipboard.writeText(url)
    return 'copied'
  } catch {
    return 'failed'
  }
}
