/**
 * Labs OS Share handoff — navigator.share({ files }) + Android share_target ingest.
 * Not a Quick Share API; users pick Quick Share / AirDrop from the system sheet.
 */
export const SHARE_TARGET_CACHE = 'singtags-share-target'
export const SHARE_TARGET_FILE_URL = '/__share_target_file__'

export function canShareFiles(file: File): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return false
  const data: ShareData = { files: [file], title: file.name }
  if (typeof navigator.canShare === 'function') {
    try {
      return navigator.canShare(data)
    } catch {
      return false
    }
  }
  return true
}

/** Open the OS share sheet with a SingTags transfer bundle. */
export async function shareTransferBundle(file: File): Promise<'shared' | 'aborted' | 'unsupported'> {
  if (!canShareFiles(file)) return 'unsupported'
  try {
    await navigator.share({
      files: [file],
      title: 'SingTags transfer',
      text: file.name,
    })
    return 'shared'
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return 'aborted'
    throw e
  }
}

/** Trigger a normal download when Web Share is unavailable. */
export function downloadTransferBundle(file: File): void {
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 2_000)
}

/**
 * Read files left by the service worker after an Android share_target POST.
 * Clears the cache entries after a successful read.
 */
export async function takeShareTargetFiles(): Promise<File[]> {
  if (typeof caches === 'undefined') return []
  const cache = await caches.open(SHARE_TARGET_CACHE)
  const keys = await cache.keys()
  const files: File[] = []
  for (const req of keys) {
    const res = await cache.match(req)
    if (!res) continue
    const blob = await res.blob()
    const name =
      res.headers.get('X-SingTags-Filename') ||
      decodeURIComponent(new URL(req.url).pathname.split('/').pop() || 'shared.bin')
    const type = res.headers.get('Content-Type') || blob.type || 'application/octet-stream'
    files.push(new File([blob], name, { type }))
    await cache.delete(req)
  }
  return files
}

export function isShareTargetQuery(query: Record<string, unknown> | { shareTarget?: unknown }): boolean {
  const q = query as { 'share-target'?: unknown; shareTarget?: unknown }
  const hasKey = Object.prototype.hasOwnProperty.call(q, 'share-target') || Object.prototype.hasOwnProperty.call(q, 'shareTarget')
  if (!hasKey) return false
  const raw = q['share-target'] ?? q.shareTarget
  // Vue Router: bare `?share-target` → null
  if (raw == null || raw === true) return true
  if (Array.isArray(raw)) return raw.some((v) => v === '' || v === '1' || v === 'true' || v == null)
  return raw === '' || raw === '1' || raw === 'true'
}
