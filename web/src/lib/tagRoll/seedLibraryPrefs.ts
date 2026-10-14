/**
 * Persist Tag Studio seed / empty-library prefs so delete stays deleted.
 * Bundled seeds (polecat pitch reviews, coach trials) re-import on list refresh
 * unless the user has dismissed that seed id.
 */

const DISMISSED_KEY = 'singtags.tagRoll.dismissedSeedIds.v1'
const INIT_KEY = 'singtags.tagRoll.libraryInitialized.v1'

/** Auto-seeded project ids (public bundles + future seeds). */
export function isTagRollSeedId(id: string): boolean {
  return id.startsWith('seed-')
}

function readStorage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null
    return localStorage
  } catch {
    return null
  }
}

export function readDismissedSeedIds(): Set<string> {
  const ls = readStorage()
  if (!ls) return new Set()
  try {
    const raw = ls.getItem(DISMISSED_KEY)
    if (!raw) return new Set()
    const arr = JSON.parse(raw) as unknown
    if (!Array.isArray(arr)) return new Set()
    return new Set(arr.filter((x): x is string => typeof x === 'string' && x.length > 0))
  } catch {
    return new Set()
  }
}

export function dismissTagRollSeed(id: string): void {
  if (!isTagRollSeedId(id)) return
  const ls = readStorage()
  if (!ls) return
  const next = readDismissedSeedIds()
  next.add(id)
  try {
    ls.setItem(DISMISSED_KEY, JSON.stringify([...next]))
  } catch {
    /* quota / private mode */
  }
}

export function isTagRollSeedDismissed(id: string): boolean {
  return readDismissedSeedIds().has(id)
}

/** Drop dismissals for polecat pitch seeds so list refresh can re-import them. */
export function clearPolecatPitchSeedDismissals(): number {
  const ls = readStorage()
  if (!ls) return 0
  const prev = readDismissedSeedIds()
  const next = [...prev].filter((id) => !id.startsWith('seed-polecat-pitch-'))
  const removed = prev.size - next.length
  try {
    ls.setItem(DISMISSED_KEY, JSON.stringify(next))
  } catch {
    /* ignore */
  }
  return removed
}

export function isTagRollLibraryInitialized(): boolean {
  const ls = readStorage()
  if (!ls) return false
  try {
    return ls.getItem(INIT_KEY) === '1'
  } catch {
    return false
  }
}

/** Once set, an empty project list will not re-create starter demos. */
export function markTagRollLibraryInitialized(): void {
  const ls = readStorage()
  if (!ls) return
  try {
    ls.setItem(INIT_KEY, '1')
  } catch {
    /* ignore */
  }
}
