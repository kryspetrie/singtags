import type { StarredTagRecord, StarredTagsFile } from '../offline/starredDb'
import { parseStarredFile, toStarredFile } from '../offline/starredDb'
import type { UserCollection } from '../stores/userCollections'

/** Portable Favorites backup: starred tags + custom collections + practice order. */
export type FavoritesBackupFile = {
  version: 1
  kind: 'singtags.favorites-backup'
  exportedAt: string
  starred: StarredTagsFile
  collections: UserCollection[]
  practice: {
    order: number[]
    autoAdvance: boolean
  }
}

export function buildFavoritesBackup(input: {
  records: StarredTagRecord[]
  collections: UserCollection[]
  practice: { order: number[]; autoAdvance: boolean }
}): FavoritesBackupFile {
  return {
    version: 1,
    kind: 'singtags.favorites-backup',
    exportedAt: new Date().toISOString(),
    starred: toStarredFile(input.records),
    collections: input.collections.map((c) => ({
      id: c.id,
      name: c.name,
      tagIds: [...c.tagIds],
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    })),
    practice: {
      order: [...input.practice.order],
      autoAdvance: input.practice.autoAdvance,
    },
  }
}

function parseCollections(raw: unknown): UserCollection[] {
  if (!Array.isArray(raw)) return []
  const out: UserCollection[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const id = typeof o.id === 'string' ? o.id : null
    const name = typeof o.name === 'string' ? o.name.trim() : ''
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

function parsePractice(raw: unknown): { order: number[]; autoAdvance: boolean } {
  if (!raw || typeof raw !== 'object') return { order: [], autoAdvance: true }
  const o = raw as Record<string, unknown>
  const order = Array.isArray(o.order)
    ? o.order.filter((n): n is number => typeof n === 'number' && Number.isFinite(n))
    : []
  const autoAdvance = typeof o.autoAdvance === 'boolean' ? o.autoAdvance : true
  return { order, autoAdvance }
}

/**
 * Accepts either a favorites-backup file or a legacy starred.tags file.
 * Legacy files restore tags only (empty collections / default practice).
 */
export function parseFavoritesBackup(raw: unknown): FavoritesBackupFile {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid favorites backup file')
  const obj = raw as Record<string, unknown>

  if (obj.kind === 'singtags.favorites-backup') {
    if (obj.version !== 1 || !obj.starred) {
      throw new Error('Not a SingTags favorites-backup v1 file')
    }
    return {
      version: 1,
      kind: 'singtags.favorites-backup',
      exportedAt: typeof obj.exportedAt === 'string' ? obj.exportedAt : new Date().toISOString(),
      starred: parseStarredFile(obj.starred),
      collections: parseCollections(obj.collections),
      practice: parsePractice(obj.practice),
    }
  }

  const starred = parseStarredFile(raw)
  return {
    version: 1,
    kind: 'singtags.favorites-backup',
    exportedAt: starred.exportedAt,
    starred,
    collections: [],
    practice: { order: [], autoAdvance: true },
  }
}
