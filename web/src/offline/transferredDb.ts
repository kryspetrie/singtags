/**
 * Peer-received sheet transfers (QR data mode) — metadata + sheet blob.
 */
import type { TagDetail, TagSummary } from '../types/tag'
import type { SheetTransferMeta } from '../lib/sheetQrTransfer'
import { idbReq, openOfflineDb, TRANSFERRED_TAGS_STORE } from './offlineIndexedDb'

export type TransferredTagRecord = {
  tagId: number
  receivedAt: string
  summary: TagSummary
  detail: TagDetail
  sheet: { path: string; mime: string; data: ArrayBuffer }
}

/** Map transfer meta + local sheet path into catalog-shaped summary/detail. */
export function tagRecordsFromTransferMeta(
  meta: SheetTransferMeta,
  sheetPath: string,
): { summary: TagSummary; detail: TagDetail } {
  const summary: TagSummary = {
    id: meta.id,
    title: meta.title,
    altTitle: meta.altTitle ?? null,
    arranger: meta.arranger,
    key: meta.key,
    writKey: meta.writKey ?? null,
    rating: null,
    type: meta.type ?? null,
    collection: meta.collection ?? null,
    year: meta.year ?? null,
    parts: meta.parts ?? null,
    hasSheet: true,
    audioParts: [],
    sheet: sheetPath,
    sheetPreview: sheetPath,
    sheetPages: [sheetPath],
  }
  const detail: TagDetail = {
    tag_id: meta.id,
    title: meta.title,
    alt_title: meta.altTitle ?? null,
    arranger: meta.arranger,
    key: meta.key,
    writ_key: meta.writKey ?? null,
    type: meta.type ?? null,
    collection: meta.collection ?? null,
    year: meta.year ?? null,
    parts_count: meta.parts ?? null,
    sheet: sheetPath,
    sheets: [sheetPath],
    sheet_preview: sheetPath,
    sheet_pages: [sheetPath],
    audio: {},
  }
  return { summary, detail }
}

export async function putTransferredTag(
  meta: SheetTransferMeta,
  imageBytes: Uint8Array,
): Promise<TransferredTagRecord> {
  const path = `transferred/${meta.id}/sheet.jpg`
  const { summary, detail } = tagRecordsFromTransferMeta(meta, path)
  const record: TransferredTagRecord = {
    tagId: meta.id,
    receivedAt: new Date().toISOString(),
    summary,
    detail,
    sheet: {
      path,
      mime: meta.mime || 'image/jpeg',
      data: imageBytes.buffer.slice(
        imageBytes.byteOffset,
        imageBytes.byteOffset + imageBytes.byteLength,
      ) as ArrayBuffer,
    },
  }
  const db = await openOfflineDb()
  try {
    await idbReq(db.transaction(TRANSFERRED_TAGS_STORE, 'readwrite').objectStore(TRANSFERRED_TAGS_STORE).put(record))
  } finally {
    db.close()
  }
  return record
}

export async function getTransferredTag(tagId: number): Promise<TransferredTagRecord | undefined> {
  const db = await openOfflineDb()
  try {
    return await idbReq(
      db.transaction(TRANSFERRED_TAGS_STORE, 'readonly').objectStore(TRANSFERRED_TAGS_STORE).get(tagId),
    )
  } finally {
    db.close()
  }
}

export async function listTransferredTags(): Promise<TransferredTagRecord[]> {
  const db = await openOfflineDb()
  try {
    return await idbReq(
      db.transaction(TRANSFERRED_TAGS_STORE, 'readonly').objectStore(TRANSFERRED_TAGS_STORE).getAll(),
    )
  } finally {
    db.close()
  }
}
