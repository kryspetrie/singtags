/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { audioPack, sheetsPack } from '../../offline/libraryPack'
import {
  AUDIO_CONTENT_FORMAT_ID,
  SHEETS_CONTENT_FORMAT_ID,
} from '../offlineContentFormat'
import {
  __resetDriveCacheSyncForTests,
  DRIVE_CACHE_AUDIO_KEY,
  DRIVE_CACHE_FORMAT_ID,
  DRIVE_CACHE_SHEETS_KEY,
  buildLocalDriveCacheManifest,
  decideDriveCacheAction,
  driveCacheSyncState,
  driveCacheTransferLabel,
  isDriveCacheTransferActive,
  isSupportedDriveCacheManifest,
  pathForPackUrl,
  readDriveCachePref,
  selectCacheEntriesToUpload,
  setDriveAudioCacheEnabled,
  setDriveSheetsCacheEnabled,
  tagIdFromCachePath,
  tagIdsInCachePaths,
  urlFromPackPath,
} from './driveCacheSync'

describe('driveCacheSync', () => {
  beforeEach(async () => {
    localStorage.clear()
    __resetDriveCacheSyncForTests()
    await sheetsPack.clear()
    await audioPack.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('persists explicit sheet/audio prefs including off', () => {
    expect(readDriveCachePref(DRIVE_CACHE_SHEETS_KEY)).toBeNull()
    setDriveSheetsCacheEnabled(true)
    expect(readDriveCachePref(DRIVE_CACHE_SHEETS_KEY)).toBe(true)
    setDriveSheetsCacheEnabled(false)
    expect(readDriveCachePref(DRIVE_CACHE_SHEETS_KEY)).toBe(false)
    expect(localStorage.getItem(DRIVE_CACHE_SHEETS_KEY)).toBe('0')

    setDriveAudioCacheEnabled(true)
    expect(readDriveCachePref(DRIVE_CACHE_AUDIO_KEY)).toBe(true)
  })

  it('labels Drive transfers with source and progress', () => {
    expect(isDriveCacheTransferActive()).toBe(false)
    expect(driveCacheTransferLabel()).toBe('')

    driveCacheSyncState.status = 'hydrating'
    driveCacheSyncState.done = 3
    driveCacheSyncState.total = 10
    expect(isDriveCacheTransferActive()).toBe(true)
    expect(driveCacheTransferLabel()).toMatch(/Downloading from Google Drive/)
    expect(driveCacheTransferLabel()).toMatch(/3\/10 tags/)

    driveCacheSyncState.status = 'uploading'
    driveCacheSyncState.done = 1
    driveCacheSyncState.total = 4
    expect(driveCacheTransferLabel()).toMatch(/Uploading to Google Drive/)
    expect(driveCacheTransferLabel()).toMatch(/1\/4 tags/)

    driveCacheSyncState.done = 12
    driveCacheSyncState.total = 4
    expect(driveCacheTransferLabel()).toMatch(/4\/4 tags/)

    driveCacheSyncState.status = 'idle'
    driveCacheSyncState.message = 'Uploaded 4 files to Google Drive'
    driveCacheSyncState.done = 0
    driveCacheSyncState.total = 0
    expect(isDriveCacheTransferActive()).toBe(false)
    expect(driveCacheTransferLabel()).toBe('Uploaded 4 files to Google Drive')
  })

  it('counts tags and skips hashes already on Drive', () => {
    expect(tagIdFromCachePath('sheets/42/page-1.webp')).toBe(42)
    expect(tagIdFromCachePath('/media/7/lead.opus')).toBe(7)
    expect(tagIdFromCachePath('/tags/15/metadata.json')).toBe(15)
    expect(
      tagIdFromCachePath(
        'Smile%20%28G%20Major%29%20-%20Bobby%20Gray%20Jr%20-%201/Smile%20-%20Sheet%20Preview.webp',
      ),
    ).toBe(1)
    expect(
      tagIdFromCachePath(
        'polecats/Down By The Old Mill Stream (Ab Major) - 90011/Down By The Old Mill Stream - Lead.opus',
      ),
    ).toBe(90011)
    expect(
      tagIdsInCachePaths([
        'Smile%20%28G%20Major%29%20-%20Bobby%20Gray%20Jr%20-%201/a.webp',
        'Smile%20%28G%20Major%29%20-%20Bobby%20Gray%20Jr%20-%201/b.webp',
        'polecats/Down Our Way (Bb Major) - Floyd Connett - 90004/lead.opus',
      ]),
    ).toEqual([1, 90004])

    const local = [
      { path: 'sheets/1/a.webp', hash: 'aaa', bytes: 10 },
      { path: 'sheets/1/b.webp', hash: 'bbb', bytes: 10 },
      { path: 'media/2/lead.opus', hash: 'ccc', bytes: 10 },
      { path: 'sheets/3/a.webp', hash: 'aaa', bytes: 10 },
    ]
    const missing = selectCacheEntriesToUpload(local, new Set(['bbb']))
    expect(missing.map((e) => e.hash)).toEqual(['aaa', 'ccc'])
    expect(tagIdsInCachePaths(missing.map((e) => e.path)).sort()).toEqual([1, 2])
  })

  it('round-trips pack paths', () => {
    const abs = 'https://cdn.example/media/1.webp'
    const byUrl = pathForPackUrl(abs)
    expect(byUrl.startsWith('by-url/') || !byUrl.includes('://')).toBe(true)
    expect(urlFromPackPath(`by-url/${encodeURIComponent(abs)}`)).toBe(abs)
  })

  it('keeps Drive media on metadata upgrades; purges only on media-format mismatch', () => {
    const good = {
      kind: 'singtags.drive-cache' as const,
      schemaVersion: 1,
      formatId: DRIVE_CACHE_FORMAT_ID,
      exportedAt: '2026-01-01T00:00:00.000Z',
      source: {
        sheetsContentFormat: SHEETS_CONTENT_FORMAT_ID,
        audioContentFormat: AUDIO_CONTENT_FORMAT_ID,
      },
      packs: {
        sheets: [{ path: 'a.webp', hash: 'aaa', bytes: 1 }],
        audio: [{ path: 'b.opus', hash: 'bbb', bytes: 2 }],
      },
    }
    expect(decideDriveCacheAction(good).action).toBe('use')
    expect(isSupportedDriveCacheManifest(good)).toBe(true)

    // Legacy / missing source → metadata rewrite, keep pack entries (objects stay).
    const { source: _s, ...legacy } = good
    const legacyDecision = decideDriveCacheAction(legacy)
    expect(legacyDecision.action).toBe('rewrite-metadata')
    if (legacyDecision.action === 'rewrite-metadata') {
      expect(legacyDecision.manifest.packs.sheets).toHaveLength(1)
      expect(legacyDecision.manifest.packs.audio).toHaveLength(1)
    }

    // Schema bump we still understand via coerce → rewrite metadata, keep objects.
    expect(
      decideDriveCacheAction({
        ...good,
        schemaVersion: 1,
        formatId: 'singtags-offline-cache-v0',
      }).action,
    ).toBe('rewrite-metadata')

    // Media stamp change for audio only → purge audio, keep sheets entries for rewrite.
    const purge = decideDriveCacheAction({
      ...good,
      source: {
        sheetsContentFormat: SHEETS_CONTENT_FORMAT_ID,
        audioContentFormat: 'audio-ancient-v0',
      },
    })
    expect(purge.action).toBe('purge-media')
    if (purge.action === 'purge-media') {
      expect(purge.sheets).toBe(false)
      expect(purge.audio).toBe(true)
      expect(purge.manifest.packs.sheets).toHaveLength(1)
    }
  })

  it('summarizes Drive pack presence from coerced manifests', async () => {
    // probeDriveCachePresence needs network; unit-test the packPresence shape via decide + coerce.
    const decision = decideDriveCacheAction({
      kind: 'singtags.drive-cache',
      schemaVersion: 1,
      formatId: DRIVE_CACHE_FORMAT_ID,
      exportedAt: '2026-01-01T00:00:00.000Z',
      source: {
        sheetsContentFormat: SHEETS_CONTENT_FORMAT_ID,
        audioContentFormat: AUDIO_CONTENT_FORMAT_ID,
      },
      packs: {
        sheets: [
          { path: 'a.webp', hash: 'a', bytes: 100 },
          { path: 'b.webp', hash: 'b', bytes: 50 },
        ],
        audio: [],
      },
    })
    expect(decision.action).toBe('use')
    if (decision.action === 'use') {
      expect(decision.manifest.packs.sheets).toHaveLength(2)
      expect(decision.manifest.packs.audio).toHaveLength(0)
    }
  })

  it('builds a local manifest from pack stores including source stamps', async () => {
    const url = 'https://example.test/sheets/1.webp'
    await sheetsPack.put(
      url,
      new Response(new Uint8Array([1, 2, 3, 4]), {
        headers: { 'Content-Type': 'image/webp' },
      }),
    )
    const manifest = await buildLocalDriveCacheManifest({ sheets: true, audio: false })
    expect(manifest.kind).toBe('singtags.drive-cache')
    expect(manifest.source.sheetsContentFormat).toBe(SHEETS_CONTENT_FORMAT_ID)
    expect(manifest.source.audioContentFormat).toBe(AUDIO_CONTENT_FORMAT_ID)
    expect(manifest.packs.sheets).toHaveLength(1)
    expect(manifest.packs.sheets[0]?.bytes).toBe(4)
    expect(manifest.packs.sheets[0]?.hash).toMatch(/^[a-f0-9]{64}$/)
    expect(manifest.packs.audio).toEqual([])
  })
})
