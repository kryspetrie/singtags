/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  APP_STATE_LOCAL_KEYS,
  applyLocalStorageSnapshot,
  buildAppStateBackup,
  parseAppStateBackup,
} from './appStateBackup'
import type { StarredTagRecord } from '../offline/starredDb'
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

describe('appStateBackup', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('captures known localStorage keys and favorites', () => {
    localStorage.setItem('singtags.manualOffline', '1')
    localStorage.setItem('unrelated.key', 'nope')
    const file = buildAppStateBackup(
      {
        records: [rec(3)],
        collections: [
          {
            id: 'u1',
            name: 'Warmups',
            tagIds: [3],
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:00:00.000Z',
          },
        ],
        practice: { order: [3], autoAdvance: true },
      },
      false,
    )
    expect(file.kind).toBe('singtags.app-state')
    expect(file.includeCache).toBe(false)
    expect(file.localStorage['singtags.manualOffline']).toBe('1')
    expect(file.localStorage['unrelated.key']).toBeUndefined()
    expect(file.favorites.collections[0]?.name).toBe('Warmups')
    const round = parseAppStateBackup(file)
    expect(round.favorites.starred.tags).toHaveLength(1)
  })

  it('applies snapshot only for allowlisted keys', () => {
    applyLocalStorageSnapshot({
      'singtags.manualOffline': '1',
      'evil.key': 'x',
    })
    expect(localStorage.getItem('singtags.manualOffline')).toBe('1')
    expect(localStorage.getItem('evil.key')).toBeNull()
    expect(APP_STATE_LOCAL_KEYS).toContain('singtags.manualOffline')
  })
})
