import { describe, expect, it } from 'vitest'
import { buildFavoritesBackup, parseFavoritesBackup } from './favoritesBackup'
import type { StarredTagRecord } from '../offline/favoritesDb'
import type { TagSummary } from '../types/tag'

function summary(id: number): TagSummary {
  return {
    id,
    title: `Tag ${id}`,
    arranger: null,
    key: null,
    rating: null,
    type: null,
    collection: null,
    hasSheet: true,
    audioParts: [],
    sheet: null,
  }
}

function rec(id: number): StarredTagRecord {
  return {
    tagId: id,
    starredAt: '2024-01-01T00:00:00.000Z',
    summary: summary(id),
    detail: null,
    offlineMedia: false,
  }
}

describe('favoritesBackup', () => {
  it('round-trips collections and practice with starred tags', () => {
    const file = buildFavoritesBackup({
      records: [rec(1), rec(2)],
      collections: [
        {
          id: 'c1',
          name: 'Contest set',
          tagIds: [2, 1],
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-02T00:00:00.000Z',
        },
      ],
      practice: { order: [2, 1], autoAdvance: false },
    })
    expect(file.kind).toBe('singtags.favorites-backup')
    const parsed = parseFavoritesBackup(file)
    expect(parsed.collections[0]?.name).toBe('Contest set')
    expect(parsed.collections[0]?.tagIds).toEqual([2, 1])
    expect(parsed.practice).toEqual({ order: [2, 1], autoAdvance: false })
    expect(parsed.starred.tags.map((t) => t.summary.id)).toEqual([1, 2])
  })

  it('accepts legacy starred.tags files', () => {
    const legacy = {
      version: 1 as const,
      kind: 'singtags.starred' as const,
      exportedAt: '2024-01-01T00:00:00.000Z',
      tags: [
        {
          starredAt: '2024-01-01T00:00:00.000Z',
          summary: summary(9),
          detail: null,
        },
      ],
    }
    const parsed = parseFavoritesBackup(legacy)
    expect(parsed.starred.tags).toHaveLength(1)
    expect(parsed.collections).toEqual([])
    expect(parsed.practice.autoAdvance).toBe(true)
  })
})
