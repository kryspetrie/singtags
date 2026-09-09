/**
 * Query helpers for Local Library entry routes (/library/:id).
 */
import type { LocationQuery, Router } from 'vue-router'
import { FULLSCREEN_QUERY_FLAG, hasFullscreenQuery } from './fullscreenQuery'

export function isLocalEntryEditQuery(query: LocationQuery): boolean {
  const v = query.edit
  return v === '1' || v === 'true'
}

export function isLocalEntryFullscreenQuery(query: LocationQuery): boolean {
  if (hasFullscreenQuery(query)) return true
  const v = query.fullscreen
  return v === 'sheet' || v === 'sing'
}

export function parseImportQueue(query: LocationQuery): string[] {
  const raw = query.importQueue
  if (typeof raw !== 'string' || !raw.trim()) return []
  return [...new Set(raw.split(',').map((s) => s.trim()).filter(Boolean))]
}

export function localEntryEditQuery(opts?: {
  edit?: boolean
  importQueue?: string[]
  fullscreen?: boolean
}): Record<string, string | null> {
  const q: Record<string, string | null> = {}
  if (opts?.edit) q.edit = '1'
  if (opts?.importQueue?.length) q.importQueue = opts.importQueue.join(',')
  if (opts?.fullscreen) q.fullscreen = FULLSCREEN_QUERY_FLAG
  return q
}

export function navigateToLocalEntry(
  router: Router,
  entryId: string,
  opts?: { edit?: boolean; importQueue?: string[]; fullscreen?: boolean },
): ReturnType<Router['push']> {
  return router.push({
    name: 'library-doc',
    params: { id: entryId },
    query: localEntryEditQuery(opts),
  })
}

/**
 * Patch the current local-entry query.
 * - `undefined` removes the key
 * - `null` sets a bare flag (`?fullscreen`)
 * - string sets that value
 */
export async function patchLocalEntryQuery(
  router: Router,
  patch: Record<string, string | null | undefined>,
): Promise<void> {
  const route = router.currentRoute.value
  const next: Record<string, string | null> = {}
  for (const [k, v] of Object.entries(route.query)) {
    if (v === null) next[k] = null
    else if (typeof v === 'string') next[k] = v
  }
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete next[k]
    else next[k] = v
  }
  await router.replace({ path: route.path, query: next })
}
