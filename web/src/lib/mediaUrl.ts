/** Single source for static media / tag detail paths. */

/** Strip trailing slash from the Vite app base path. */
function appBase(): string {
  const base = import.meta.env.BASE_URL || '/'
  return base.replace(/\/$/, '')
}

/**
 * Media (library audio/sheets) base.
 * Local default: `/library` (Vite serves ../library).
 * Prod: set VITE_MEDIA_BASE to the S3/CDN library prefix.
 */
export function mediaBaseUrl(): string {
  const env = import.meta.env.VITE_MEDIA_BASE as string | undefined
  if (env) return env.endsWith('/') ? env.slice(0, -1) : env
  return `${appBase()}/library`
}

/** Build an absolute URL for a catalog-relative media or sheet path. */
export function mediaUrl(path: string): string {
  if (
    path.startsWith('/') ||
    path.startsWith('blob:') ||
    path.startsWith('http://') ||
    path.startsWith('https://') ||
    path.startsWith('data:')
  ) {
    return path
  }
  return `${mediaBaseUrl()}/${path}`
}

/** Slim per-tag JSON published under the app origin (not the media library). */
export function tagDetailUrl(id: number | string): string {
  return `${appBase()}/tags/${id}/metadata.json`
}

/** URL for a gzip/plain catalog index under `/indexes/`. */
export function indexesUrl(name: string): string {
  return `${appBase()}/indexes/${name}`
}
