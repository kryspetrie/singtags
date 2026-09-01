/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
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
})
