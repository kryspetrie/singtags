/** Single source for static media / tag detail paths (avoid scattered `/sample-data/`). */

function appBase(): string {
  const base = import.meta.env.BASE_URL || '/'
  return base.replace(/\/$/, '')
}

export function mediaBaseUrl(): string {
  const env = import.meta.env.VITE_MEDIA_BASE as string | undefined
  if (env) return env.endsWith('/') ? env.slice(0, -1) : env
  return `${appBase()}/sample-data`
}

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

export function tagDetailUrl(id: number | string): string {
  return `${mediaBaseUrl()}/tags/${id}/metadata.json`
}

export function indexesUrl(name: string): string {
  return `${appBase()}/indexes/${name}`
}
