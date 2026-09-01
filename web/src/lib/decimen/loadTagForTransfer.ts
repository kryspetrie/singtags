/**
 * Load tag metadata + sheet image for optical transfer.
 */
import type { TagDetail, TagSummary } from '../../types/tag'
import { isPdfPath } from '../sheetPath'
import { tagDetailUrl } from '../mediaUrl'
import { fetchCached } from '../manualOfflineFetch'
import { sheetsPack } from '../../offline/libraryPack'
import { getStarred } from '../../offline/favoritesDb'
import { getTransferredTag } from '../../offline/transferredDb'
import { resolvePathUrl } from '../../offline/resolveMedia'
import { sheetDisplayPages } from '../sheetPaths'
import { resolveSheetAssets } from '../sheetAssets'
import { DEFAULT_PDF_RENDER_DPI, renderPdfToPageUrls } from '../pdfRender'
import { mediaUrl } from '../mediaUrl'
import {
  encodeSheetImageForTransfer,
  type SheetTransferMeta,
} from '../sheetQrTransfer'
import { fetchBytes } from '../../download/zip'

/** On-screen / catalog WebP previews — sized for reliable optical scan. */
export const STANDARD_TRANSFER_MAX_WIDTH = 960

/** 300 DPI PDF raster — larger payload, sharper received sheet. */
export const HIGH_TRANSFER_MAX_WIDTH = 2400

export type TransferSheetQuality = 'standard' | 'high'

export function highResTransferAvailable(detail: TagDetail): boolean {
  return resolveSheetAssets(detail).pdfs.length > 0
}

/** Quick PDF hint from catalog summary (`sheet` path ending in .pdf). */
export function highResTransferAvailableFromSummary(summary: TagSummary | undefined): boolean {
  return isPdfPath(summary?.sheet ?? null)
}

/** True when at least one tag has an upgraded PDF available for high-quality transfer. */
export async function anyHighResTransferAvailable(
  tagIds: number[],
  summaries?: Map<number, TagSummary>,
): Promise<boolean> {
  const ids = [...new Set(tagIds.filter((id) => Number.isFinite(id)))]
  for (const tagId of ids) {
    if (highResTransferAvailableFromSummary(summaries?.get(tagId))) return true
  }
  for (const tagId of ids) {
    const detail = await loadTagDetail(tagId)
    if (detail && highResTransferAvailable(detail)) return true
  }
  return false
}

export function sheetTransferMetaFromTag(
  detail: TagDetail,
  summary: TagSummary | undefined,
  encoded: { mime: string; width: number; height: number },
): SheetTransferMeta {
  return {
    v: 1,
    id: detail.tag_id,
    title: detail.title ?? summary?.title ?? null,
    altTitle: detail.alt_title ?? summary?.altTitle ?? null,
    arranger: detail.arranger ?? summary?.arranger ?? null,
    key: detail.key ?? summary?.key ?? null,
    writKey: detail.writ_key ?? summary?.writKey ?? null,
    type: detail.type ?? summary?.type ?? null,
    collection: detail.collection ?? summary?.collection ?? null,
    year: detail.year ?? summary?.year ?? null,
    parts: detail.parts_count ?? summary?.parts ?? null,
    mime: encoded.mime,
    width: encoded.width,
    height: encoded.height,
  }
}

async function loadTagDetail(tagId: number): Promise<TagDetail | null> {
  try {
    const res = await fetchCached(tagDetailUrl(tagId))
    if (res.ok) return (await res.json()) as TagDetail
  } catch {
    /* fall through */
  }
  try {
    const packed = await sheetsPack.get(tagDetailUrl(tagId))
    if (packed) return (await packed.json()) as TagDetail
  } catch {
    /* fall through */
  }
  const starred = await getStarred(tagId)
  if (starred?.detail) return starred.detail
  const transferred = await getTransferredTag(tagId)
  return transferred?.detail ?? null
}

async function blobFromUrl(url: string): Promise<Blob | null> {
  if (url.startsWith('blob:') || url.startsWith('data:')) {
    const res = await fetch(url)
    if (!res.ok) return null
    return res.blob()
  }
  try {
    const bytes = await fetchBytes(url)
    return new Blob([bytes])
  } catch {
    return null
  }
}

async function loadHighResPdfBlob(
  detail: TagDetail,
  opts?: { offlineOnly?: boolean; starred?: Awaited<ReturnType<typeof getStarred>> },
): Promise<Blob | null> {
  const pdf = resolveSheetAssets(detail).pdfs[0]
  if (!pdf) return null
  if (opts?.offlineOnly) return null
  const resolved = await resolvePathUrl(pdf.path, { starred: opts?.starred ?? null, offlineOnly: false })
  const pdfUrl =
    resolved?.kind === 'blob'
      ? resolved.url
      : resolved?.kind === 'network'
        ? resolved.url
        : mediaUrl(pdf.path)
  let urls: string[] = []
  try {
    urls = await renderPdfToPageUrls(pdfUrl, { dpi: DEFAULT_PDF_RENDER_DPI, crop: true })
    if (!urls.length) return null
    return blobFromUrl(urls[0]!)
  } finally {
    for (const url of urls) {
      if (url.startsWith('blob:')) URL.revokeObjectURL(url)
    }
  }
}

async function loadStandardSheetBlob(
  detail: TagDetail,
  opts?: { offlineOnly?: boolean; starred?: Awaited<ReturnType<typeof getStarred>> },
): Promise<Blob | null> {
  const paths = sheetDisplayPages(detail)
  const transferred = await getTransferredTag(detail.tag_id)
  if (!paths.length && transferred?.sheet.data) {
    return new Blob([transferred.sheet.data], { type: transferred.sheet.mime || 'image/jpeg' })
  }
  if (!paths.length) return null

  const resolved = await resolvePathUrl(paths[0]!, {
    starred: opts?.starred ?? null,
    offlineOnly: opts?.offlineOnly ?? false,
  })
  if (!resolved) return null

  if (resolved.kind === 'blob') {
    const res = await fetch(resolved.url)
    if (!res.ok) return null
    return res.blob()
  }
  return blobFromUrl(resolved.url)
}

/** Load one tag's sheet for optical transfer, or null when unavailable. */
export async function loadTagForTransfer(
  tagId: number,
  opts?: {
    summary?: TagSummary
    offlineOnly?: boolean
    quality?: TransferSheetQuality
  },
): Promise<{ meta: SheetTransferMeta; imageBytes: Uint8Array } | null> {
  const detail = await loadTagDetail(tagId)
  if (!detail) return null

  const quality = opts?.quality ?? 'standard'
  const starred = await getStarred(tagId)
  let blob: Blob | null = null
  if (quality === 'high' && highResTransferAvailable(detail)) {
    blob = await loadHighResPdfBlob(detail, { offlineOnly: opts?.offlineOnly, starred })
  }
  if (!blob) {
    blob = await loadStandardSheetBlob(detail, { offlineOnly: opts?.offlineOnly, starred })
  }
  if (!blob) return null

  const maxWidth = quality === 'high' && highResTransferAvailable(detail)
    ? HIGH_TRANSFER_MAX_WIDTH
    : STANDARD_TRANSFER_MAX_WIDTH
  const encoded = await encodeSheetImageForTransfer(blob, { maxWidth })
  const meta = sheetTransferMetaFromTag(detail, opts?.summary, encoded)
  return { meta, imageBytes: encoded.bytes }
}
