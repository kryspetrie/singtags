import { describe, expect, it } from 'vitest'
import { buildZip } from '../download/zip'
import {
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
})
