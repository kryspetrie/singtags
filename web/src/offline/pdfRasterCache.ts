/**
 * Cache high-res PDF page rasters (memory + IndexedDB) so fullscreen / PDF mode
 * can reuse prior work instead of re-running pdf.js or flashing low-res WebP.
 */
import { DEFAULT_PDF_RENDER_DPI } from '../lib/pdfRender'
import { idbReq, openOfflineDb, PDF_RASTER_STORE } from './offlineIndexedDb'

/** Bump when raster encoding / crop semantics change. */
export const PDF_RASTER_CACHE_VERSION = 1

/** Soft cap on how many distinct PDF renders to keep (LRU). */
export const MAX_PDF_RASTER_ENTRIES = 48

/** Options encoded into a {@link pdfRasterCacheKey}. */
export type PdfRasterCacheOpts = {
  dpi?: number
  crop?: boolean
  /** @deprecated Matches {@link import('../lib/pdfRender').RenderPdfOptions}. */
  targetWidth?: number
}

/** Durable page payload — ArrayBuffer survives IDB better than Blob in test envs. */
export type PdfRasterPageBytes = {
  type: string
  data: ArrayBuffer
}

/** IndexedDB record for one cached PDF render (multiple page images). */
export interface PdfRasterRecord {
  key: string
  pages: PdfRasterPageBytes[]
  bytes: number
  accessedAt: number
  createdAt: number
}

type MemEntry = {
  pages: Blob[]
  bytes: number
  accessedAt: number
}

const memory = new Map<string, MemEntry>()

/**
 * Stable cache key for a PDF URL and render options.
 *
 * Includes {@link PDF_RASTER_CACHE_VERSION} so format changes invalidate old entries.
 */
export function pdfRasterCacheKey(pdfUrl: string, opts: PdfRasterCacheOpts = {}): string {
  const crop = opts.crop !== false
  let dpiPart: string
  if (opts.dpi != null) dpiPart = String(opts.dpi)
  else if (opts.targetWidth != null) dpiPart = `tw${opts.targetWidth}`
  else dpiPart = String(DEFAULT_PDF_RENDER_DPI)
  return `v${PDF_RASTER_CACHE_VERSION}|${pdfUrl}|dpi=${dpiPart}|crop=${crop ? 1 : 0}`
}

function objectUrlsFromBlobs(pages: Blob[]): string[] {
  return pages.map((b) => URL.createObjectURL(b))
}

function blobsFromPageBytes(pages: PdfRasterPageBytes[]): Blob[] {
  return pages.map((p) => new Blob([p.data], { type: p.type || 'image/webp' }))
}

async function pageBytesFromBlobs(pages: Blob[]): Promise<PdfRasterPageBytes[]> {
  return Promise.all(
    pages.map(async (b) => ({
      type: b.type || 'image/webp',
      data: await b.arrayBuffer(),
    })),
  )
}

/** Sync session hit — high-res without awaiting IDB. */
export function pdfRasterMemoryHit(key: string): string[] | null {
  const entry = memory.get(key)
  if (!entry?.pages.length) return null
  entry.accessedAt = Date.now()
  void touchIdbAccessed(key, entry.accessedAt)
  return objectUrlsFromBlobs(entry.pages)
}

async function readIdb(key: string): Promise<PdfRasterRecord | undefined> {
  try {
    const db = await openOfflineDb()
    try {
      const tx = db.transaction(PDF_RASTER_STORE, 'readonly')
      return (await idbReq(tx.objectStore(PDF_RASTER_STORE).get(key))) as
        | PdfRasterRecord
        | undefined
    } finally {
      db.close()
    }
  } catch {
    return undefined
  }
}

async function touchIdbAccessed(key: string, accessedAt: number): Promise<void> {
  try {
    const db = await openOfflineDb()
    try {
      const tx = db.transaction(PDF_RASTER_STORE, 'readwrite')
      const store = tx.objectStore(PDF_RASTER_STORE)
      const rec = (await idbReq(store.get(key))) as PdfRasterRecord | undefined
      if (!rec) return
      rec.accessedAt = accessedAt
      await idbReq(store.put(rec))
    } finally {
      db.close()
    }
  } catch {
    /* ignore */
  }
}

/**
 * Memory first, then IndexedDB.
 * Caller owns returned object URLs (must revoke).
 */
export async function loadPdfRasterObjectUrls(key: string): Promise<string[] | null> {
  const mem = pdfRasterMemoryHit(key)
  if (mem) return mem

  const rec = await readIdb(key)
  if (!rec?.pages?.length) return null

  const pages = blobsFromPageBytes(rec.pages)
  const accessedAt = Date.now()
  memory.set(key, { pages, bytes: rec.bytes, accessedAt })
  void touchIdbAccessed(key, accessedAt)
  return objectUrlsFromBlobs(pages)
}

async function listIdbKeysWithAccess(): Promise<Array<{ key: string; accessedAt: number }>> {
  try {
    const db = await openOfflineDb()
    try {
      const tx = db.transaction(PDF_RASTER_STORE, 'readonly')
      const all = (await idbReq(tx.objectStore(PDF_RASTER_STORE).getAll())) as PdfRasterRecord[]
      return all.map((r) => ({ key: r.key, accessedAt: r.accessedAt }))
    } finally {
      db.close()
    }
  } catch {
    return []
  }
}

async function deleteIdbKey(key: string): Promise<void> {
  try {
    const db = await openOfflineDb()
    try {
      const tx = db.transaction(PDF_RASTER_STORE, 'readwrite')
      await idbReq(tx.objectStore(PDF_RASTER_STORE).delete(key))
    } finally {
      db.close()
    }
  } catch {
    /* ignore */
  }
}

async function evictLruIfNeeded(): Promise<void> {
  while (memory.size > MAX_PDF_RASTER_ENTRIES) {
    let oldestKey: string | null = null
    let oldestAt = Infinity
    for (const [k, v] of memory) {
      if (v.accessedAt < oldestAt) {
        oldestAt = v.accessedAt
        oldestKey = k
      }
    }
    if (!oldestKey) break
    memory.delete(oldestKey)
    await deleteIdbKey(oldestKey)
  }

  const idbEntries = await listIdbKeysWithAccess()
  if (idbEntries.length <= MAX_PDF_RASTER_ENTRIES) return
  idbEntries.sort((a, b) => a.accessedAt - b.accessedAt)
  const excess = idbEntries.length - MAX_PDF_RASTER_ENTRIES
  for (let i = 0; i < excess; i++) {
    const k = idbEntries[i]!.key
    memory.delete(k)
    await deleteIdbKey(k)
  }
}

/** Store page blobs under `key` (memory + IDB). */
export async function putPdfRasterBlobs(key: string, pages: Blob[]): Promise<void> {
  if (!pages.length) return
  const bytes = pages.reduce((n, b) => n + (b.size || 0), 0)
  const now = Date.now()
  memory.set(key, { pages, bytes, accessedAt: now })

  try {
    const pageBytes = await pageBytesFromBlobs(pages)
    const db = await openOfflineDb()
    try {
      const tx = db.transaction(PDF_RASTER_STORE, 'readwrite')
      const rec: PdfRasterRecord = {
        key,
        pages: pageBytes,
        bytes,
        accessedAt: now,
        createdAt: now,
      }
      await idbReq(tx.objectStore(PDF_RASTER_STORE).put(rec))
    } finally {
      db.close()
    }
  } catch {
    /* quota / private mode — memory still helps this session */
  }

  await evictLruIfNeeded()
}

/** Copy blob: object URLs into the cache. Best-effort (ignores fetch failures). */
export async function putPdfRasterFromObjectUrls(key: string, urls: string[]): Promise<void> {
  if (!urls.length) return
  try {
    const pages: Blob[] = []
    for (const u of urls) {
      const res = await fetch(u)
      if (!res.ok) return
      pages.push(await res.blob())
    }
    await putPdfRasterBlobs(key, pages)
  } catch {
    /* ignore — cache is an optimization */
  }
}

/** True when memory or IndexedDB already has rasters for `key` (no object URLs created). */
export async function hasPdfRasterCached(key: string): Promise<boolean> {
  if (memory.has(key) && (memory.get(key)?.pages.length ?? 0) > 0) return true
  const rec = await readIdb(key)
  return !!rec?.pages?.length
}

/** Wipe in-memory and IndexedDB PDF raster entries. */
export async function clearPdfRasterCache(): Promise<void> {
  memory.clear()
  try {
    const db = await openOfflineDb()
    try {
      const tx = db.transaction(PDF_RASTER_STORE, 'readwrite')
      await idbReq(tx.objectStore(PDF_RASTER_STORE).clear())
    } finally {
      db.close()
    }
  } catch {
    /* ignore */
  }
}

/** Sum of stored PDF raster page bytes (memory + IndexedDB; best-effort). */
export async function pdfRasterCacheBytes(): Promise<number> {
  let total = 0
  for (const entry of memory.values()) total += entry.bytes
  try {
    const db = await openOfflineDb()
    try {
      const tx = db.transaction(PDF_RASTER_STORE, 'readonly')
      const all = (await idbReq(tx.objectStore(PDF_RASTER_STORE).getAll())) as PdfRasterRecord[]
      for (const rec of all) {
        if (!memory.has(rec.key)) total += rec.bytes
      }
    } finally {
      db.close()
    }
  } catch {
    /* ignore */
  }
  return total
}

/** Test helper: memory size. */
export function pdfRasterMemorySizeForTests(): number {
  return memory.size
}

/** Test helper: drop in-memory entries without touching IndexedDB. */
export function wipePdfRasterMemoryForTests(): void {
  memory.clear()
}
