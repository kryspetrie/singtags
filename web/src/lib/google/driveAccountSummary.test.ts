/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest'
import { summarizeDriveListing } from './driveAccountSummary'
import type { DriveCacheManifest } from './driveCacheSync'

const HASH = 'a'.repeat(64)

const manifest: DriveCacheManifest = {
  kind: 'singtags.drive-cache',
  schemaVersion: 1,
  formatId: 'singtags-offline-cache-v1',
  exportedAt: '2026-11-05T00:00:00.000Z',
  source: { sheetsContentFormat: 's', audioContentFormat: 'a' },
  packs: {
    sheets: [
      { path: 'sheets/9/page.webp', hash: HASH, bytes: 100 },
      { path: 'sheets/9/page-2.webp', hash: 'b'.repeat(64), bytes: 50 },
    ],
    audio: [{ path: 'media/9/lead.opus', hash: 'c'.repeat(64), bytes: 1000 }],
  },
}

describe('summarizeDriveListing', () => {
  it('sums app-data bytes and describes settings and song packs', () => {
    const summary = summarizeDriveListing({
      files: [
        { id: '1', name: 'singtags', mimeType: 'application/vnd.google-apps.folder', size: 0 },
        { id: '2', name: 'app-state.json', mimeType: 'application/json', size: 400 },
        { id: '3', name: 'app-state.meta.json', mimeType: 'application/json', size: 80 },
        { id: '4', name: 'manifest.json', mimeType: 'application/json', size: 200 },
        { id: '5', name: HASH, mimeType: 'image/webp', size: 100 },
        { id: '6', name: 'b'.repeat(64), mimeType: 'image/webp', size: 50 },
        { id: '7', name: 'c'.repeat(64), mimeType: 'audio/ogg', size: 1000 },
      ],
      manifest,
      settings: {
        version: 1,
        kind: 'singtags.app-state',
        exportedAt: '2026-11-05T15:00:00.000Z',
        favorites: {
          version: 1,
          kind: 'singtags.favorites-backup',
          exportedAt: '2026-11-05T15:00:00.000Z',
          starred: {
            version: 1,
            kind: 'singtags.starred',
            exportedAt: '2026-11-05T15:00:00.000Z',
            tags: [{ starredAt: '2026-11-05T15:00:00.000Z', summary: { id: 9 }, detail: null }],
          },
          collections: [],
          practice: { order: [], autoAdvance: true },
        },
        localStorage: {},
      },
    })

    expect(summary.totalBytes).toBe(400 + 80 + 200 + 100 + 50 + 1000)
    expect(summary.fileCount).toBe(6)
    expect(summary.settingsBytes).toBe(480)
    expect(summary.settingsPresent).toBe(true)
    expect(summary.favoriteCount).toBe(1)
    expect(summary.sheets).toMatchObject({ present: true, files: 2, tags: 1, bytes: 150 })
    expect(summary.audio).toMatchObject({ present: true, files: 1, tags: 1, bytes: 1000 })
  })
})
