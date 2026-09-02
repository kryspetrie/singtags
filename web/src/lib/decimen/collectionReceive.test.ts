/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  allocateReceivedCollectionName,
  buildReceivedCollectionName,
  collectionReceiveProgress,
  collectionSessionKey,
  importedTagIdsForSession,
  upsertCollectionSession,
} from './collectionReceive'
import type { CollectionBatchManifest } from './collectionTransfer'

function manifest(partial: Partial<CollectionBatchManifest> & Pick<CollectionBatchManifest, 'batchIndex'>): CollectionBatchManifest {
  return {
    v: 1,
    collectionName: 'Set A',
    batchCount: 3,
    tagIds: [1, 2],
    allTagIds: [1, 2, 3, 4],
    ...partial,
  }
}

describe('collectionReceive', () => {
  it('tracks batches independently for partial receive progress', () => {
    const sessions = new Map()
    const m0 = manifest({ batchIndex: 0 })
    const m2 = manifest({ batchIndex: 2, tagIds: [3, 4] })
    upsertCollectionSession(sessions, m0, 'item-0')
    upsertCollectionSession(sessions, m2, 'item-2')

    const session = sessions.get(collectionSessionKey(m0))!
    const progress = collectionReceiveProgress(session)
    expect(progress.batchesReceived).toBe(2)
    expect(progress.batchCount).toBe(3)
    expect(progress.tagsImported).toBe(0)
    expect(progress.complete).toBe(false)

    session.batches.get(0)!.importedTagIds = [1, 2]
    session.batches.get(2)!.importedTagIds = [3]
    expect(importedTagIdsForSession(session).sort()).toEqual([1, 2, 3])
    expect(collectionReceiveProgress(session).tagsImported).toBe(3)
  })

  it('names received collections with rx local date and disambiguates collisions', () => {
    const date = new Date(2026, 8, 1)
    const localDate = date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    })
    expect(buildReceivedCollectionName('Set A', date)).toBe(`Set A rx ${localDate}`)

    const existing = [`Set A rx ${localDate}`, 'Other']
    expect(allocateReceivedCollectionName('Set A', existing, date)).toBe(`Set A rx ${localDate} (2)`)
    expect(
      allocateReceivedCollectionName('Set A', [...existing, `Set A rx ${localDate} (2)`], date),
    ).toBe(`Set A rx ${localDate} (3)`)
  })

  it('treats collection name collisions case-insensitively', () => {
    const date = new Date(2026, 8, 1)
    const localDate = date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    })
    expect(allocateReceivedCollectionName('Set A', [`set a rx ${localDate}`], date)).toBe(
      `Set A rx ${localDate} (2)`,
    )
  })
})
