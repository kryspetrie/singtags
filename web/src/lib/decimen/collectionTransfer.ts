/**
 * SingTags collection batches for Decimen optical transfer.
 * Each batch is one verified Decimen file — partial receive keeps earlier batches intact.
 */
import { deflateSync, inflateSync } from 'fflate'
import { packFile, type OpticalFile } from '../../../vendor/decimen/shared/protocol'
import type { SheetTransferMeta, SheetTransferPackage } from '../sheetQrTransfer'

export const SINGTAGS_COLLECTION_MIME = 'application/vnd.singtags.collection-transfer'

export type CollectionBatchManifest = {
  v: 1
  collectionName: string
  batchIndex: number
  batchCount: number
  tagIds: number[]
  allTagIds: number[]
}

export type CollectionTransferBatch = {
  manifest: CollectionBatchManifest
  tags: SheetTransferPackage[]
}

function textEncoder(): TextEncoder {
  return new TextEncoder()
}

function textDecoder(): TextDecoder {
  return new TextDecoder()
}

function writeU32(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value >>> 0, false)
}

function readU32(view: DataView, offset: number): number {
  return view.getUint32(offset, false)
}

function sanitizeFilenamePart(name: string): string {
  const base = name.trim().replace(/[/\\?%*:|"<>]/g, '-').replace(/\s+/g, '-')
  return base.slice(0, 48) || 'collection'
}

export function singtagsCollectionFilename(manifest: CollectionBatchManifest): string {
  const base = sanitizeFilenamePart(manifest.collectionName)
  return `singtags-collection-${base}-${manifest.batchIndex + 1}-of-${manifest.batchCount}.bundle`
}

/** Whether a received optical file is a SingTags collection batch. */
export function isSingtagsCollectionFile(file: OpticalFile): boolean {
  return (
    file.type === SINGTAGS_COLLECTION_MIME ||
    /^singtags-collection-.+-(\d+)-of-(\d+)\.bundle$/i.test(file.name)
  )
}

function packRaw(batch: CollectionTransferBatch): Uint8Array {
  const manifestBytes = textEncoder().encode(JSON.stringify(batch.manifest))
  const tagChunks: Uint8Array[] = []
  for (const tag of batch.tags) {
    const metaBytes = textEncoder().encode(JSON.stringify(tag.meta))
    const chunk = new Uint8Array(4 + metaBytes.length + 4 + tag.imageBytes.length)
    const view = new DataView(chunk.buffer)
    writeU32(view, 0, metaBytes.length)
    chunk.set(metaBytes, 4)
    writeU32(view, 4 + metaBytes.length, tag.imageBytes.length)
    chunk.set(tag.imageBytes, 4 + metaBytes.length + 4)
    tagChunks.push(chunk)
  }
  const tagsBytes = tagChunks.reduce((sum, c) => sum + c.length, 0)
  const raw = new Uint8Array(4 + manifestBytes.length + tagsBytes)
  writeU32(new DataView(raw.buffer), 0, manifestBytes.length)
  raw.set(manifestBytes, 4)
  let offset = 4 + manifestBytes.length
  for (const chunk of tagChunks) {
    raw.set(chunk, offset)
    offset += chunk.length
  }
  return deflateSync(raw, { level: 6 })
}

/** Pack one collection batch into a Decimen-ready file container. */
export async function packSingtagsCollectionBatch(
  batch: CollectionTransferBatch,
): Promise<{ filename: string; container: Uint8Array }> {
  if (batch.manifest.v !== 1) throw new Error('Unsupported collection manifest.')
  if (batch.tags.length !== batch.manifest.tagIds.length) {
    throw new Error('Collection batch tag list does not match manifest.')
  }
  const payload = packRaw(batch)
  const filename = singtagsCollectionFilename(batch.manifest)
  const packed = await packFile(filename, SINGTAGS_COLLECTION_MIME, payload)
  return { filename, container: packed.container }
}

function parseMeta(raw: unknown): SheetTransferMeta {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid tag metadata.')
  const meta = raw as SheetTransferMeta
  if (meta.v !== 1 || typeof meta.id !== 'number') throw new Error('Unsupported tag metadata.')
  return meta
}

/** Inflate and parse a collection batch payload (post-Decimen file bytes). */
export function unpackCollectionTransfer(compressed: Uint8Array): CollectionTransferBatch {
  const raw = inflateSync(compressed)
  if (raw.length < 8) throw new Error('Collection batch too short.')
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength)
  const manifestLen = readU32(view, 0)
  if (manifestLen < 2 || 4 + manifestLen > raw.length) {
    throw new Error('Invalid collection manifest length.')
  }
  const manifest = JSON.parse(
    textDecoder().decode(raw.subarray(4, 4 + manifestLen)),
  ) as CollectionBatchManifest
  if (!manifest || manifest.v !== 1 || !Array.isArray(manifest.tagIds)) {
    throw new Error('Unsupported collection manifest.')
  }

  const tags: SheetTransferPackage[] = []
  let offset = 4 + manifestLen
  while (offset < raw.length) {
    if (offset + 8 > raw.length) throw new Error('Truncated collection tag entry.')
    const metaLen = readU32(view, offset)
    const imageLen = readU32(view, offset + 4 + metaLen)
    const entryEnd = offset + 8 + metaLen + imageLen
    if (metaLen < 2 || imageLen < 1 || entryEnd > raw.length) {
      throw new Error('Invalid collection tag entry length.')
    }
    const meta = parseMeta(
      JSON.parse(textDecoder().decode(raw.subarray(offset + 4, offset + 4 + metaLen))),
    )
    const imageBytes = raw.subarray(offset + 8 + metaLen, entryEnd)
    tags.push({ meta, imageBytes })
    offset = entryEnd
  }

  if (tags.length !== manifest.tagIds.length) {
    throw new Error('Collection batch tag count does not match manifest.')
  }
  for (let i = 0; i < tags.length; i++) {
    if (tags[i]!.meta.id !== manifest.tagIds[i]) {
      throw new Error('Collection batch tag order does not match manifest.')
    }
  }
  return { manifest, tags }
}

/** Unpack a received Decimen optical file into a collection batch. */
export function unpackSingtagsCollectionFile(file: OpticalFile): CollectionTransferBatch {
  if (!isSingtagsCollectionFile(file)) {
    throw new Error('Received file is not a SingTags collection transfer.')
  }
  return unpackCollectionTransfer(file.bytes)
}
