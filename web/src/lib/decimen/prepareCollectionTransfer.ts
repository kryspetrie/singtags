/**
 * Build optical-transfer batch files for a user collection.
 */
import {
  packSingtagsCollectionBatch,
  type CollectionBatchManifest,
  type CollectionTransferBatch,
} from './collectionTransfer'
import { loadTagForTransfer, type TransferSheetQuality } from './loadTagForTransfer'
import {
  OPTICAL_FRAME_BYTES_OPTIONS,
  opticalPayloadFits,
} from './sendSettings'
import type { SheetTransferPackage } from '../sheetQrTransfer'
import type { TagSummary } from '../../types/tag'

/** Smallest frame size — conservative cap so batches fit at any density setting. */
const BATCH_FRAME_BYTES = Math.min(...OPTICAL_FRAME_BYTES_OPTIONS)

export type PreparedCollectionBatch = {
  manifest: CollectionBatchManifest
  file: File
  containerBytes: number
  tagCount: number
}

export type PrepareCollectionSkipped = {
  tagId: number
  reason: string
}

export type PrepareCollectionResult = {
  collectionName: string
  allTagIds: number[]
  batches: PreparedCollectionBatch[]
  skipped: PrepareCollectionSkipped[]
}

export type PrepareCollectionOptions = {
  collectionName: string
  tagIds: number[]
  summaries?: Map<number, TagSummary>
  offlineOnly?: boolean
  quality?: TransferSheetQuality
  onProgress?: (message: string) => void
}

function estimateTagBytes(tag: SheetTransferPackage): number {
  const metaLen = JSON.stringify(tag.meta).length
  return 8 + metaLen + tag.imageBytes.length
}

function estimateBatchRawBytes(tags: SheetTransferPackage[], manifest: Omit<CollectionBatchManifest, 'batchIndex' | 'batchCount'>): number {
  const manifestLen = JSON.stringify({
    ...manifest,
    batchIndex: 0,
    batchCount: 1,
  }).length
  return 4 + manifestLen + tags.reduce((sum, tag) => sum + estimateTagBytes(tag), 0)
}

async function containerBytesForBatch(batch: CollectionTransferBatch): Promise<number> {
  const packed = await packSingtagsCollectionBatch(batch)
  return packed.container.length
}

async function batchFits(batch: CollectionTransferBatch): Promise<boolean> {
  const bytes = await containerBytesForBatch(batch)
  return opticalPayloadFits(bytes, BATCH_FRAME_BYTES)
}

/** Split loaded tags into batches that each fit one Decimen stream. */
export function splitTagsIntoBatches(
  collectionName: string,
  allTagIds: number[],
  loaded: SheetTransferPackage[],
): SheetTransferPackage[][] {
  if (!loaded.length) return []
  const groups: SheetTransferPackage[][] = []
  let current: SheetTransferPackage[] = []

  const baseManifest = {
    v: 1 as const,
    collectionName,
    tagIds: [] as number[],
    allTagIds,
  }

  for (const tag of loaded) {
    const candidate = [...current, tag]
    const manifest = { ...baseManifest, tagIds: candidate.map((t) => t.meta.id) }
    const estimate = estimateBatchRawBytes(candidate, manifest)
    if (current.length > 0 && estimate > 6 * 1024 * 1024) {
      groups.push(current)
      current = [tag]
    } else {
      current = candidate
    }
  }
  if (current.length) groups.push(current)
  return groups
}

/** Refine batch groups until each packed container fits the optical stream limit. */
export async function refineBatchGroups(
  collectionName: string,
  allTagIds: number[],
  groups: SheetTransferPackage[][],
): Promise<SheetTransferPackage[][]> {
  const out: SheetTransferPackage[][] = []
  for (const group of groups) {
    const manifest: CollectionBatchManifest = {
      v: 1,
      collectionName,
      batchIndex: 0,
      batchCount: 1,
      tagIds: group.map((t) => t.meta.id),
      allTagIds,
    }
    if (await batchFits({ manifest, tags: group })) {
      out.push(group)
      continue
    }
    if (group.length <= 1) {
      throw new Error(
        `Tag ${group[0]!.meta.id} is too large for optical transfer even alone.`,
      )
    }
    const mid = Math.ceil(group.length / 2)
    const split = await refineBatchGroups(collectionName, allTagIds, [
      group.slice(0, mid),
      group.slice(mid),
    ])
    out.push(...split)
  }
  return out
}

/** Load tags and pack one batch file per optical stream. */
export async function prepareCollectionTransfer(
  opts: PrepareCollectionOptions,
): Promise<PrepareCollectionResult> {
  const { collectionName, tagIds, summaries, offlineOnly, quality, onProgress } = opts
  const allTagIds = [...new Set(tagIds.filter((n) => Number.isFinite(n)))]
  const loaded: SheetTransferPackage[] = []
  const skipped: PrepareCollectionSkipped[] = []

  for (let i = 0; i < allTagIds.length; i++) {
    const tagId = allTagIds[i]!
    onProgress?.(`Loading tag ${i + 1} of ${allTagIds.length}…`)
    const tag = await loadTagForTransfer(tagId, {
      summary: summaries?.get(tagId),
      offlineOnly,
      quality,
    })
    if (!tag) {
      skipped.push({ tagId, reason: 'Sheet not available offline' })
      continue
    }
    loaded.push(tag)
  }

  if (!loaded.length) {
    throw new Error('No tags in this collection could be loaded for transfer.')
  }

  onProgress?.('Packing batches…')
  let groups = splitTagsIntoBatches(collectionName, allTagIds, loaded)
  groups = await refineBatchGroups(collectionName, allTagIds, groups)
  const batchCount = groups.length

  const batches: PreparedCollectionBatch[] = []
  for (let batchIndex = 0; batchIndex < groups.length; batchIndex++) {
    const tags = groups[batchIndex]!
    const manifest: CollectionBatchManifest = {
      v: 1,
      collectionName,
      batchIndex,
      batchCount,
      tagIds: tags.map((t) => t.meta.id),
      allTagIds,
    }
    const packed = await packSingtagsCollectionBatch({ manifest, tags })
    const file = new File([new Uint8Array(packed.container)], packed.filename, {
      type: 'application/octet-stream',
    })
    batches.push({
      manifest,
      file,
      containerBytes: packed.container.length,
      tagCount: tags.length,
    })
  }

  return { collectionName, allTagIds, batches, skipped }
}

/** Quick estimate of batch count without loading sheet bytes. */
export function estimateCollectionBatchCount(tagCount: number): number {
  if (tagCount <= 0) return 0
  return Math.max(1, Math.ceil(tagCount / 8))
}
