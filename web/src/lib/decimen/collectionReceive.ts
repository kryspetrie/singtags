/**
 * Track multi-batch collection receives and import tags safely per batch.
 */
import type { CollectionBatchManifest, CollectionTransferBatch } from './collectionTransfer'
import { putTransferredTag } from '../../offline/transferredDb'
import type { useUserCollectionsStore } from '../../stores/userCollections'

export type CollectionReceiveSession = {
  key: string
  collectionName: string
  allTagIds: number[]
  batchCount: number
  /** batchIndex → received item metadata */
  batches: Map<number, { itemId: string; tagIds: number[]; importedTagIds: number[] }>
}

export type CollectionReceiveProgress = {
  batchesReceived: number
  batchCount: number
  tagsImported: number
  tagsTotal: number
  complete: boolean
}

export function collectionSessionKey(manifest: CollectionBatchManifest): string {
  const ids = [...manifest.allTagIds].sort((a, b) => a - b).join(',')
  return `${manifest.collectionName}\0${ids}\0${manifest.batchCount}`
}

export function upsertCollectionSession(
  sessions: Map<string, CollectionReceiveSession>,
  manifest: CollectionBatchManifest,
  itemId: string,
): CollectionReceiveSession {
  const key = collectionSessionKey(manifest)
  let session = sessions.get(key)
  if (!session) {
    session = {
      key,
      collectionName: manifest.collectionName,
      allTagIds: [...manifest.allTagIds],
      batchCount: manifest.batchCount,
      batches: new Map(),
    }
    sessions.set(key, session)
  }
  session.batches.set(manifest.batchIndex, {
    itemId,
    tagIds: [...manifest.tagIds],
    importedTagIds: session.batches.get(manifest.batchIndex)?.importedTagIds ?? [],
  })
  return session
}

export function collectionReceiveProgress(session: CollectionReceiveSession): CollectionReceiveProgress {
  const batchesReceived = session.batches.size
  const tagsTotal = session.allTagIds.length
  const imported = new Set<number>()
  for (const batch of session.batches.values()) {
    for (const id of batch.importedTagIds) imported.add(id)
  }
  return {
    batchesReceived,
    batchCount: session.batchCount,
    tagsImported: imported.size,
    tagsTotal,
    complete: batchesReceived >= session.batchCount,
  }
}

export function markCollectionBatchImported(
  session: CollectionReceiveSession,
  batchIndex: number,
  tagIds: number[],
): void {
  const batch = session.batches.get(batchIndex)
  if (!batch) return
  batch.importedTagIds = [...new Set([...batch.importedTagIds, ...tagIds])]
}

/** Import each tag in a verified batch independently (partial success is OK). */
export async function importCollectionBatchTags(
  batch: CollectionTransferBatch,
): Promise<{ imported: number[]; failed: Array<{ tagId: number; error: string }> }> {
  const imported: number[] = []
  const failed: Array<{ tagId: number; error: string }> = []
  for (const tag of batch.tags) {
    try {
      await putTransferredTag(tag.meta, tag.imageBytes)
      imported.push(tag.meta.id)
    } catch (e) {
      failed.push({
        tagId: tag.meta.id,
        error: e instanceof Error ? e.message : 'Import failed',
      })
    }
  }
  return { imported, failed }
}

/** Local calendar date label for received collection names (`rx` suffix). */
export function formatReceivedCollectionLocalDate(date = new Date()): string {
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  })
}

/** `{name} rx {local date}` — never reuses an existing collection name as-is. */
export function buildReceivedCollectionName(baseName: string, date = new Date()): string {
  const trimmed = baseName.trim().replace(/\s+/g, ' ')
  return `${trimmed} rx ${formatReceivedCollectionLocalDate(date)}`
}

function collectionNameKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase()
}

/** Pick a unique received collection name; append `(n)` when the dated name collides. */
export function allocateReceivedCollectionName(
  baseName: string,
  existingNames: readonly string[],
  date = new Date(),
): string {
  const taken = new Set(existingNames.map((name) => collectionNameKey(name)))
  const root = buildReceivedCollectionName(baseName, date)
  if (!taken.has(collectionNameKey(root))) return root
  let n = 2
  while (taken.has(collectionNameKey(`${root} (${n})`))) n += 1
  return `${root} (${n})`
}

/** Create a new user collection for a received transfer (no merge with same-name collections). */
export function applyReceivedCollectionToLibrary(
  store: ReturnType<typeof useUserCollectionsStore>,
  collectionName: string,
  tagIds: number[],
  date = new Date(),
): { collectionId: string; collectionName: string } {
  const unique = [...new Set(tagIds)]
  const allocated = allocateReceivedCollectionName(
    collectionName,
    store.collections.map((c) => c.name),
    date,
  )
  const col = store.create(allocated, unique)
  if (!col) throw new Error('Could not create collection.')
  return { collectionId: col.id, collectionName: allocated }
}

/** Collect tag ids imported across all received batches in a session. */
export function importedTagIdsForSession(session: CollectionReceiveSession): number[] {
  const ids = new Set<number>()
  for (const batch of session.batches.values()) {
    for (const id of batch.importedTagIds) ids.add(id)
  }
  return [...ids]
}
