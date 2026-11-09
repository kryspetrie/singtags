/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it } from 'vitest'
import type { FavoritesBackupFile } from '../favoritesBackup'
import { googleAuthState } from './googleAuth'
import type { AppStateBackupFile } from '../appStateBackup'
import {
  __resetDriveAppStateSyncForTests,
  configureDriveAppStateSync,
  checkDriveForUpdates,
  decideDriveAppStateSync,
  summarizeDriveUpdateCheck,
  DRIVE_DIRTY_KEY,
  DRIVE_PUSH_BATCH_DEFAULT_SECONDS,
  DRIVE_PUSH_BATCH_SECONDS_KEY,
  drivePushBatchLabel,
  getDrivePushBatchSeconds,
  hashAppState,
  mergeAppStates,
  mergeFavoritesByUnion,
  scheduleDriveAppStatePush,
  setDrivePushBatchSeconds,
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

function meta(
  partial: Partial<DriveAppStateMeta> & Pick<DriveAppStateMeta, 'contentHash' | 'exportedAt'>,
): DriveAppStateMeta {
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
        dirty: false,
        lastSync: null,
      }),
    ).toEqual({ action: 'noop', reason: 'same-hash' })
  })

  it('downloads on first hydrate when cloud exists and local is clean', () => {
    expect(
      decideDriveAppStateSync({
        cloud: meta({ contentHash: 'cloud', exportedAt: '2026-11-03T12:00:00.000Z' }),
        localHash: 'empty-local',
        dirty: false,
        lastSync: null,
      }),
    ).toEqual({ action: 'download', reason: 'first-hydrate-prefer-cloud' })
  })

  it('downloads when cloud changed since last sync and local is clean', () => {
    expect(
      decideDriveAppStateSync({
        cloud: meta({ contentHash: 'cloud', exportedAt: '2026-11-03T12:00:00.000Z' }),
        localHash: 'local',
        dirty: false,
        lastSync: meta({ contentHash: 'local', exportedAt: '2026-11-03T10:00:00.000Z' }),
      }),
    ).toEqual({ action: 'download', reason: 'cloud-changed' })
  })

  it('merges when both sides changed since last sync (no wipe)', () => {
    expect(
      decideDriveAppStateSync({
        cloud: meta({ contentHash: 'cloud', exportedAt: '2026-11-03T12:00:00.000Z' }),
        localHash: 'local',
        dirty: true,
        lastSync: meta({ contentHash: 'old', exportedAt: '2026-11-03T09:00:00.000Z' }),
      }),
    ).toEqual({ action: 'merge', reason: 'both-changed' })
  })

  it('uploads when local is dirty and cloud matches last sync', () => {
    expect(
      decideDriveAppStateSync({
        cloud: meta({ contentHash: 'same', exportedAt: '2026-11-03T10:00:00.000Z' }),
        localHash: 'local',
        dirty: true,
        lastSync: meta({ contentHash: 'same', exportedAt: '2026-11-03T10:00:00.000Z' }),
      }),
    ).toEqual({ action: 'upload', reason: 'local-changed' })
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

describe('mergeAppStates', () => {
  it('unions favorites and prefers local localStorage keys', () => {
    const local: AppStateBackupFile = {
      version: 1,
      kind: 'singtags.app-state',
      exportedAt: '2026-11-03T12:00:00.000Z',
      includeCache: false,
      favorites: fav([{ id: 1, starredAt: '2026-11-03T12:00:00.000Z' }]),
      localStorage: { 'singtags.theme.v1': 'dark', 'only-local': '1' },
    }
    const cloud: AppStateBackupFile = {
      version: 1,
      kind: 'singtags.app-state',
      exportedAt: '2026-11-03T11:00:00.000Z',
      includeCache: false,
      favorites: fav([{ id: 2, starredAt: '2026-11-03T11:00:00.000Z' }]),
      localStorage: { 'singtags.theme.v1': 'light', 'only-cloud': '1' },
    }
    const merged = mergeAppStates(local, cloud)
    expect(merged.favorites.starred.tags.map((t) => t.summary.id).sort()).toEqual([1, 2])
    expect(merged.localStorage).toEqual({
      'singtags.theme.v1': 'dark',
      'only-cloud': '1',
      'only-local': '1',
    })
  })
})

describe('hashAppState', () => {
  it('treats two snapshots of the same favorites and settings as equal', async () => {
    const base: AppStateBackupFile = {
      version: 1,
      kind: 'singtags.app-state',
      exportedAt: '2026-11-03T12:00:00.000Z',
      includeCache: false,
      favorites: fav([
        { id: 2, starredAt: '2026-11-03T10:00:00.000Z' },
        { id: 1, starredAt: '2026-11-03T11:00:00.000Z' },
      ]),
      localStorage: { 'singtags.theme.v1': 'dark', 'singtags.recent.v2': '[]' },
    }
    const later: AppStateBackupFile = {
      ...base,
      exportedAt: '2026-11-05T18:00:00.000Z',
      favorites: {
        ...base.favorites,
        exportedAt: '2026-11-05T18:00:00.000Z',
        starred: {
          ...base.favorites.starred,
          exportedAt: '2026-11-05T18:00:01.000Z',
          tags: [...base.favorites.starred.tags].reverse(),
        },
      },
      localStorage: {
        'singtags.recent.v2': '[]',
        'singtags.theme.v1': 'dark',
      },
    }
    expect(await hashAppState(base)).toBe(await hashAppState(later))

    const withStar = {
      ...base,
      favorites: fav([
        { id: 2, starredAt: '2026-11-03T10:00:00.000Z' },
        { id: 1, starredAt: '2026-11-03T11:00:00.000Z' },
        { id: 9, starredAt: '2026-11-03T12:00:00.000Z' },
      ]),
    }
    expect(await hashAppState(withStar)).not.toBe(await hashAppState(base))
  })
})

describe('drive push batch', () => {
  beforeEach(() => {
    localStorage.clear()
    __resetDriveAppStateSyncForTests()
  })

  it('defaults to a 5 second upload batch', () => {
    expect(getDrivePushBatchSeconds()).toBe(DRIVE_PUSH_BATCH_DEFAULT_SECONDS)
    expect(drivePushBatchLabel(0)).toBe('Off')
    expect(drivePushBatchLabel(5)).toBe('Every 5 seconds')
  })

  it('persists the batch window on this device', () => {
    setDrivePushBatchSeconds(15)
    expect(localStorage.getItem(DRIVE_PUSH_BATCH_SECONDS_KEY)).toBe('15')
    expect(getDrivePushBatchSeconds()).toBe(15)
    setDrivePushBatchSeconds(0)
    expect(getDrivePushBatchSeconds()).toBe(0)
  })

  it('remembers a local edit before Drive is connected', () => {
    scheduleDriveAppStatePush()
    expect(localStorage.getItem(DRIVE_DIRTY_KEY)).toBeTruthy()
  })

  it('queues recents and settings writes for the same upload batch', () => {
    configureDriveAppStateSync({
      getSnapshot: async () => ({
        records: [],
        collections: [],
        practice: { order: [], autoAdvance: true },
      }),
      applyFavorites: async () => undefined,
    })
    const proto = Object.getPrototypeOf(localStorage) as Storage
    localStorage.removeItem(DRIVE_DIRTY_KEY)
    localStorage.setItem('singtags.recent.v2', '[]')
    localStorage.removeItem(DRIVE_DIRTY_KEY)
    localStorage.setItem('singtags.recent.v2', '[]')
    expect(localStorage.getItem(DRIVE_DIRTY_KEY)).toBeTruthy()
  })

  it('asks for a sign-in before checking Drive', async () => {
    googleAuthState.connected = false
    googleAuthState.driveSyncEnabled = false
    const result = await checkDriveForUpdates()
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/Sign in/)
  })

  it('reports app state, saved files, and the song cache together', () => {
    expect(
      summarizeDriveUpdateCheck({ stateMessage: 'Drive synced', restoredItems: 0, cacheMessage: '' }),
    ).toBe('Up to date')
    expect(
      summarizeDriveUpdateCheck({
        stateMessage: 'Drive synced',
        restoredItems: 2,
        cacheMessage: 'Restored 4 tags from Google Drive',
      }),
    ).toBe('Brought in 2 items from Drive. Restored 4 tags from Google Drive.')
    expect(
      summarizeDriveUpdateCheck({
        stateMessage: 'Restored app state from Drive',
        restoredItems: 0,
        cacheMessage: '',
      }),
    ).toBe('Restored app state from Drive.')
  })
})
