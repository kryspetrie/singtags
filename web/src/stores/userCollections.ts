/**
 * User-defined tag groupings (custom collections), separate from catalog series.
 * Persisted in localStorage; used as browse filters and organizational lists.
 */
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

const STORAGE_KEY = 'singtags.userCollections.v1'

/** User-defined favorite grouping (not catalog series from barbershoptags.com). */
export type UserCollection = {
  id: string
  name: string
  tagIds: number[]
  createdAt: string
  updatedAt: string
}

/** Generate a stable collection id (crypto UUID or time-based fallback). */
function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

/** Trim and collapse whitespace in collection display names. */
function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ')
}

/** Case-insensitive key for duplicate-name checks. */
function nameKey(name: string): string {
  return normalizeName(name).toLowerCase()
}

/** Whether another collection already uses this name (optionally excluding one id). */
function isNameTaken(collections: UserCollection[], name: string, exceptId?: string): boolean {
  const key = nameKey(name)
  if (!key) return false
  return collections.some((c) => c.id !== exceptId && nameKey(c.name) === key)
}

/** Parse and validate collection records from JSON backup or localStorage. */
function parseCollections(raw: unknown): UserCollection[] {
  if (!Array.isArray(raw)) return []
  const out: UserCollection[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const id = typeof o.id === 'string' ? o.id : null
    const name = typeof o.name === 'string' ? normalizeName(o.name) : ''
    if (!id || !name) continue
    const tagIds = Array.isArray(o.tagIds)
      ? o.tagIds.filter((n): n is number => typeof n === 'number' && Number.isFinite(n))
      : []
    const createdAt = typeof o.createdAt === 'string' ? o.createdAt : new Date().toISOString()
    const updatedAt = typeof o.updatedAt === 'string' ? o.updatedAt : createdAt
    out.push({ id, name, tagIds: [...new Set(tagIds)], createdAt, updatedAt })
  }
  return out
}

/** Load collections from localStorage. */
function loadCollections(): UserCollection[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return parseCollections(JSON.parse(raw) as unknown)
  } catch {
    return []
  }
}

/** Pinia store for user-created tag collections. */
export const useUserCollectionsStore = defineStore('userCollections', () => {
  const collections = ref<UserCollection[]>(loadCollections())

  watch(
    collections,
    (v) => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(v))
      } catch {
        /* ignore quota / private mode */
      }
    },
    { deep: true, flush: 'sync' },
  )

  const count = computed(() => collections.value.length)

  /** Find one collection by id. */
  function byId(id: string): UserCollection | undefined {
    return collections.value.find((c) => c.id === id)
  }

  /**
   * Validate a collection display name.
   *
   * @returns Error message, or null when the name is usable.
   */
  function validateName(name: string, exceptId?: string): string | null {
    const trimmed = normalizeName(name)
    if (!trimmed) return 'Enter a collection name'
    if (isNameTaken(collections.value, trimmed, exceptId)) {
      return 'A collection with that name already exists'
    }
    return null
  }

  /**
   * Create a new collection.
   *
   * @param name - Display name (trimmed; empty or duplicate name returns null).
   * @param tagIds - Initial member tag ids.
   * @returns New collection or null when name is invalid. Side effect: localStorage.
   */
  function create(name: string, tagIds: number[] = []): UserCollection | null {
    const trimmed = normalizeName(name)
    if (!trimmed || isNameTaken(collections.value, trimmed)) return null
    const now = new Date().toISOString()
    const col: UserCollection = {
      id: newId(),
      name: trimmed,
      tagIds: [...new Set(tagIds.filter((n) => Number.isFinite(n)))],
      createdAt: now,
      updatedAt: now,
    }
    collections.value = [...collections.value, col]
    return col
  }

  /**
   * Rename a collection.
   *
   * @returns false when id missing or name empty.
   */
  function rename(id: string, name: string): boolean {
    const trimmed = normalizeName(name)
    if (!trimmed || isNameTaken(collections.value, trimmed, id)) return false
    const i = collections.value.findIndex((c) => c.id === id)
    if (i < 0) return false
    const cur = collections.value[i]!
    const next = [...collections.value]
    next[i] = { ...cur, name: trimmed, updatedAt: new Date().toISOString() }
    collections.value = next
    return true
  }

  /** Delete a collection by id. @returns true when one was removed. */
  function remove(id: string): boolean {
    const before = collections.value.length
    collections.value = collections.value.filter((c) => c.id !== id)
    return collections.value.length < before
  }

  /**
   * Add tag ids to a collection (deduped).
   *
   * @returns false when collection id not found.
   */
  function addTags(id: string, tagIds: number[]): boolean {
    const i = collections.value.findIndex((c) => c.id === id)
    if (i < 0) return false
    const cur = collections.value[i]!
    const merged = [...new Set([...cur.tagIds, ...tagIds.filter((n) => Number.isFinite(n))])]
    if (merged.length === cur.tagIds.length) {
      // Still touch updatedAt when caller expects an add (ids may already be members).
      return true
    }
    const next = [...collections.value]
    next[i] = { ...cur, tagIds: merged, updatedAt: new Date().toISOString() }
    collections.value = next
    return true
  }

  /**
   * Remove tag ids from a collection.
   * Deletes the collection when it becomes empty.
   *
   * @returns false when collection id not found.
   */
  function removeTags(id: string, tagIds: number[]): boolean {
    const i = collections.value.findIndex((c) => c.id === id)
    if (i < 0) return false
    const drop = new Set(tagIds)
    const cur = collections.value[i]!
    const filtered = cur.tagIds.filter((t) => !drop.has(t))
    if (filtered.length === cur.tagIds.length) return true
    if (filtered.length === 0) {
      collections.value = collections.value.filter((c) => c.id !== id)
      return true
    }
    const next = [...collections.value]
    next[i] = { ...cur, tagIds: filtered, updatedAt: new Date().toISOString() }
    collections.value = next
    return true
  }

  /** Whether a tag is a member of the given collection. */
  function hasTag(id: string, tagId: number): boolean {
    return byId(id)?.tagIds.includes(tagId) ?? false
  }

  /**
   * Drop tag ids that are no longer favorited from every collection.
   * Removes collections that become empty.
   * Keeps custom collections aligned with the Favorites list.
   *
   * @param favoriteIds - Iterable of favorited tag ids (often from favorites store `ids`).
   */
  function pruneToStarred(favoriteIds: Iterable<number>): void {
    const keep = new Set(favoriteIds)
    let changed = false
    const next = collections.value
      .map((c) => {
        const tagIds = c.tagIds.filter((id) => keep.has(id))
        if (tagIds.length === c.tagIds.length) return c
        changed = true
        return { ...c, tagIds, updatedAt: new Date().toISOString() }
      })
      .filter((c) => c.tagIds.length > 0)
    if (changed || next.length !== collections.value.length) collections.value = next
  }

  /**
   * Replace member order within a collection.
   * Unknown ids are ignored; any members omitted from `tagIds` are appended in prior order.
   */
  function setTagOrder(id: string, tagIds: number[]): boolean {
    const i = collections.value.findIndex((c) => c.id === id)
    if (i < 0) return false
    const cur = collections.value[i]!
    const allowed = new Set(cur.tagIds)
    const ordered = tagIds.filter((t) => allowed.has(t))
    const seen = new Set(ordered)
    for (const t of cur.tagIds) {
      if (!seen.has(t)) ordered.push(t)
    }
    if (ordered.length === cur.tagIds.length && ordered.every((t, idx) => t === cur.tagIds[idx])) {
      return true
    }
    const next = [...collections.value]
    next[i] = { ...cur, tagIds: ordered, updatedAt: new Date().toISOString() }
    collections.value = next
    return true
  }

  /** Move one tag within a collection to a new index (via `setTagOrder`). */
  function reorderTag(id: string, tagId: number, toIndex: number): boolean {
    const col = byId(id)
    if (!col) return false
    const from = col.tagIds.indexOf(tagId)
    if (from < 0) return false
    const clamped = Math.max(0, Math.min(col.tagIds.length - 1, toIndex))
    if (from === clamped) return true
    const nextIds = [...col.tagIds]
    const [item] = nextIds.splice(from, 1)
    nextIds.splice(clamped, 0, item!)
    return setTagOrder(id, nextIds)
  }

  /**
   * Reorder collections (Favorites bar / pickers use this order).
   * Unknown ids are ignored; any collections omitted from `ids` are appended in prior order.
   */
  function setOrder(ids: string[]): boolean {
    if (!ids.length && !collections.value.length) return true
    const byIdMap = new Map(collections.value.map((c) => [c.id, c]))
    const ordered: UserCollection[] = []
    for (const id of ids) {
      const c = byIdMap.get(id)
      if (!c) continue
      ordered.push(c)
      byIdMap.delete(id)
    }
    for (const c of collections.value) {
      if (byIdMap.has(c.id)) ordered.push(c)
    }
    if (
      ordered.length === collections.value.length &&
      ordered.every((c, i) => c.id === collections.value[i]?.id)
    ) {
      return true
    }
    collections.value = ordered
    return true
  }

  /** Move one collection to a new index in the ordered list. */
  function moveCollection(id: string, toIndex: number): boolean {
    const from = collections.value.findIndex((c) => c.id === id)
    if (from < 0) return false
    const clamped = Math.max(0, Math.min(collections.value.length - 1, toIndex))
    if (from === clamped) return true
    const next = [...collections.value]
    const [item] = next.splice(from, 1)
    next.splice(clamped, 0, item!)
    collections.value = next
    return true
  }

  /**
   * Replace all collections (backup restore).
   * Side effect: localStorage via watcher.
   */
  function replaceAll(next: UserCollection[]): void {
    collections.value = parseCollections(next)
  }

  /** Deep copy of all collections for export/backup. */
  function exportSnapshot(): UserCollection[] {
    return collections.value.map((c) => ({
      id: c.id,
      name: c.name,
      tagIds: [...c.tagIds],
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }))
  }


  return {
    collections,
    count,
    byId,
    validateName,
    create,
    rename,
    remove,
    addTags,
    removeTags,
    hasTag,
    pruneToStarred,
    setTagOrder,
    reorderTag,
    setOrder,
    moveCollection,
    replaceAll,
    exportSnapshot,
  }
})
