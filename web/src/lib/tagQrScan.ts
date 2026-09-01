/**
 * Parse a scanned QR payload into an in-app tag navigation target.
 */

export type TagQrLocation = {
  path: string
  query: Record<string, string>
}

const TAG_PATH_RE = /\/tag\/(\d+)\/?$/i

/**
 * Accepts absolute tag URLs, same-app relative `/tag/:id` paths, and keeps
 * known session query keys (shift / detune / practice / fullscreen aliases).
 */
export function parseTagQrPayload(
  raw: string,
  opts?: { baseOrigin?: string },
): TagQrLocation | null {
  const text = raw.trim()
  if (!text) return null

  const base =
    opts?.baseOrigin ||
    (typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://singtags.local')

  let url: URL
  try {
    url = new URL(text, base)
  } catch {
    return null
  }

  const match = url.pathname.match(TAG_PATH_RE)
  if (!match) return null
  const id = match[1]!

  const query: Record<string, string> = {}
  for (const key of ['shift', 'detune', 'set', 'fullscreen', 'sheet', 'sing'] as const) {
    const value = url.searchParams.get(key)
    if (value != null && value !== '') query[key] = value
  }

  return { path: `/tag/${id}`, query }
}
