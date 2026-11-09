import { describe, expect, it } from 'vitest'
import { buildZip } from '../download/zip'
import type { LocalLibraryArchiveStore } from '../ports/LocalLibraryArchive'
import {
  importLocalLibraryZip,
  LOCAL_LIBRARY_BACKUP_KIND,
  LOCAL_LIBRARY_BACKUP_VERSION,
} from './localLibraryBackup'
import { unzipSync } from 'fflate'

describe('localLibraryBackup manifest', () => {
  it('round-trips manifest JSON inside a zip', () => {
    const manifest = {
      kind: LOCAL_LIBRARY_BACKUP_KIND,
      version: LOCAL_LIBRARY_BACKUP_VERSION,
      exportedAt: '2026-09-05T00:00:00.000Z',
      entryCount: 1,
      assetCount: 1,
      blobCount: 1,
    }
    const zipped = buildZip([
      {
        name: 'manifest.json',
        data: new TextEncoder().encode(JSON.stringify(manifest)),
      },
    ])
    const tree = unzipSync(zipped) as Record<string, Uint8Array>
    const parsed = JSON.parse(new TextDecoder().decode(tree['manifest.json']!))
    expect(parsed.kind).toBe(LOCAL_LIBRARY_BACKUP_KIND)
    expect(parsed.version).toBe(LOCAL_LIBRARY_BACKUP_VERSION)
    expect(parsed.entryCount).toBe(1)
  })

  it('restores entries through the archive port', async () => {
    const entries: unknown[] = []
    const store = {
      listEntries: async () => [],
      listAssets: async () => [],
      listBlobs: async () => [],
      listGroups: async () => [],
      listPlaylists: async () => [],
      getPrefs: async () => ({ id: 'prefs' }),
      putEntry: async (entry: unknown) => {
        entries.push(entry)
      },
      putAsset: async () => undefined,
      putGroup: async () => undefined,
      putPlaylist: async () => undefined,
      putPrefs: async () => undefined,
    } as LocalLibraryArchiveStore
    const zipped = buildZip([
      {
        name: 'manifest.json',
        data: new TextEncoder().encode(
          JSON.stringify({
            kind: LOCAL_LIBRARY_BACKUP_KIND,
            version: LOCAL_LIBRARY_BACKUP_VERSION,
          }),
        ),
      },
      {
        name: 'entries.json',
        data: new TextEncoder().encode(JSON.stringify([{ id: 'song-1', title: 'Keep' }])),
      },
    ])
    const result = await importLocalLibraryZip(store, zipped)
    expect(result.entries).toBe(1)
    expect(entries).toEqual([{ id: 'song-1', title: 'Keep' }])
  })
})
