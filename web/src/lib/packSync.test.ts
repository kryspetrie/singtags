import { describe, expect, it } from 'vitest'
import {
  expectedAudioFileCount,
  expectedSheetsFileCount,
  packMissingFileCount,
  packStartIndex,
  packSyncAvailable,
} from './packSync'
import type { OfflineManifest } from '../offline/manifestTypes'

const sheetsManifest: OfflineManifest = {
  version: 1,
  kind: 'sheets',
  builtAt: '2026-08-27T00:00:00Z',
  totalBytes: 300,
  entries: [
    {
      tagId: 1,
      paths: ['tags/1/a.webp', 'tags/1/b.webp'],
      bytes: 200,
      detailPath: 'tags/1/metadata.json',
    },
    { tagId: 2, paths: ['tags/2/a.webp'], bytes: 100, detailPath: 'tags/2/metadata.json' },
  ],
}

const audioManifest: OfflineManifest = {
  version: 1,
  kind: 'audio',
  builtAt: '2026-08-27T00:00:00Z',
  totalBytes: 400,
  entries: [
    { tagId: 1, paths: ['tags/1/lead.m4a', 'tags/1/bass.m4a'], bytes: 200 },
    { tagId: 2, paths: ['tags/2/mix.m4a'], bytes: 200 },
  ],
}

describe('packSync', () => {
  it('counts expected sheet files including detail JSON', () => {
    expect(expectedSheetsFileCount(sheetsManifest)).toBe(5)
    expect(expectedSheetsFileCount(null)).toBe(0)
  })

  it('counts expected audio files', () => {
    expect(expectedAudioFileCount(audioManifest)).toBe(3)
  })

  it('detects sync when remote has more files than cached', () => {
    expect(packSyncAvailable(0, 5)).toBe(false)
    expect(packSyncAvailable(5, 5)).toBe(false)
    expect(packSyncAvailable(3, 5)).toBe(true)
    expect(packSyncAvailable(3, 5, 'paused')).toBe(false)
    expect(packSyncAvailable(3, 5, 'done')).toBe(true)
    expect(packMissingFileCount(3, 5)).toBe(2)
    expect(packMissingFileCount(5, 5)).toBe(0)
    expect(packMissingFileCount(3, 5, 'paused')).toBe(0)
  })

  it('resumes only when paused/quota on same version', () => {
    expect(
      packStartIndex({
        status: 'done',
        progressVersion: 1,
        manifestVersion: 1,
        cursor: 40,
        itemCount: 50,
      }),
    ).toBe(0)
    expect(
      packStartIndex({
        status: 'paused',
        progressVersion: 1,
        manifestVersion: 1,
        cursor: 40,
        itemCount: 50,
      }),
    ).toBe(40)
    expect(
      packStartIndex({
        status: 'paused',
        progressVersion: 1,
        manifestVersion: 2,
        cursor: 40,
        itemCount: 50,
      }),
    ).toBe(0)
  })
})
