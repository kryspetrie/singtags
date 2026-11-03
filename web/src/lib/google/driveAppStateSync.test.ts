/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it } from 'vitest'
import type { FavoritesBackupFile } from '../favoritesBackup'
import {
  __resetDriveAppStateSyncForTests,
  decideDriveAppStateSync,
  mergeFavoritesByUnion,
  type DriveAppStateMeta,
} from './driveAppStateSync'

function fav(tags: Array<{ id: number; starredAt: string; title?: string }>): FavoritesBackupFile {
  return {
    version: 1,
    kind: 'singtags.favorites-backup',
    exportedAt: '2026-11-03T12:00:00.000Z',
    starred: {
      version: 1,
      kind: 'singtags.starred',
      exportedAt: '2026-11-03T12:00:00.000Z',
      tags: tags.map((t) => ({
        starredAt: t.starredAt,
        summary: {
          id: t.id,
          title: t.title ?? `Tag ${t.id}`,
          arranger: null,
          key: null,
          rating: null,
          type: null,
          collection: null,
          hasSheet: false,
          audioParts: [],
          sheet: null,
        },
        detail: null,
      })),
    },
    collections: [],
    practice: { order: tags.map((t) => t.id), autoAdvance: true },
  }
}

function meta(partial: Partial<DriveAppStateMeta> & Pick<DriveAppStateMeta, 'contentHash' | 'exportedAt'>): DriveAppStateMeta {
  return {
    schemaVersion: 1,
    deviceId: 'dev-a',
    ...partial,
  }
}

describe('decideDriveAppStateSync', () => {
  beforeEach(() => {
    __resetDriveAppStateSyncForTests()
  })

  it('uploads when cloud is missing', () => {
    expect(
      decideDriveAppStateSync({
        cloud: null,
        localHash: 'abc',
        localExportedAt: '2026-11-03T10:00:00.000Z',
        dirty: false,
        lastSync: null,
      }),
    ).toEqual({ action: 'upload', reason: 'no-cloud-copy' })
  })

  it('no-ops when hashes match', () => {
    expect(
      decideDriveAppStateSync({
        cloud: meta({ contentHash: 'abc', exportedAt: '2026-11-03T11:00:00.000Z' }),
        localHash: 'abc',
        localExportedAt: '2026-11-03T10:00:00.000Z',
        dirty: false,
        lastSync: null,
      }),
    ).toEqual({ action: 'noop', reason: 'same-hash' })
  })

  it('downloads when cloud is newer and local is clean', () => {
    expect(
      decideDriveAppStateSync({
        cloud: meta({ contentHash: 'cloud', exportedAt: '2026-11-03T12:00:00.000Z' }),
        localHash: 'local',
        localExportedAt: '2026-11-03T10:00:00.000Z',
        dirty: false,
        lastSync: meta({ contentHash: 'local', exportedAt: '2026-11-03T10:00:00.000Z' }),
      }),
    ).toEqual({ action: 'download', reason: 'cloud-newer' })
  })

  it('conflicts when cloud is newer and local is dirty', () => {
    expect(
      decideDriveAppStateSync({
        cloud: meta({ contentHash: 'cloud', exportedAt: '2026-11-03T12:00:00.000Z' }),
        localHash: 'local',
        localExportedAt: '2026-11-03T11:00:00.000Z',
        dirty: true,
        lastSync: meta({ contentHash: 'old', exportedAt: '2026-11-03T09:00:00.000Z' }),
      }),
    ).toEqual({ action: 'conflict', reason: 'cloud-newer-local-dirty' })
  })

  it('uploads when local is newer', () => {
    expect(
      decideDriveAppStateSync({
        cloud: meta({ contentHash: 'cloud', exportedAt: '2026-11-03T10:00:00.000Z' }),
        localHash: 'local',
        localExportedAt: '2026-11-03T12:00:00.000Z',
        dirty: false,
        lastSync: null,
      }),
    ).toEqual({ action: 'upload', reason: 'local-newer-or-dirty' })
  })
})

describe('mergeFavoritesByUnion', () => {
  it('unions tag ids and keeps newer starredAt', () => {
    const local = fav([
      { id: 1, starredAt: '2026-11-03T12:00:00.000Z', title: 'Local One' },
      { id: 2, starredAt: '2026-11-03T10:00:00.000Z' },
    ])
    const cloud = fav([
      { id: 1, starredAt: '2026-11-03T11:00:00.000Z', title: 'Cloud One' },
      { id: 3, starredAt: '2026-11-03T09:00:00.000Z' },
    ])
    const merged = mergeFavoritesByUnion(local, cloud)
    const ids = merged.starred.tags.map((t) => t.summary.id).sort((a, b) => a - b)
    expect(ids).toEqual([1, 2, 3])
    const one = merged.starred.tags.find((t) => t.summary.id === 1)!
    expect(one.summary.title).toBe('Local One')
    expect(merged.practice.order.sort((a, b) => a - b)).toEqual([1, 2, 3])
  })
})
