/**
 * Cache high-res PDF page rasters (memory + IndexedDB) so fullscreen / PDF mode
 * can reuse prior work instead of re-running pdf.js or flashing low-res WebP.
 *
 * Eviction is FIFO by insertion time against a configurable byte budget
 * (Settings → Offline → max PDF cache MB).
 */
import { DEFAULT_PDF_RENDER_DPI } from '../lib/pdfRender'
import { idbReq, openOfflineDb, PDF_RASTER_STORE } from './offlineIndexedDb'

/** Bump when raster encoding / crop semantics change. */
export const PDF_RASTER_CACHE_VERSION = 1

/** localStorage key for max PDF raster cache size (mebibytes). */
export const PDF_RASTER_CACHE_MAX_MB_KEY = 'singtags.pdfRasterCacheMaxMb.v1'

/** Default byte budget when the preference is unset. */
export const DEFAULT_PDF_RASTER_CACHE_MAX_MB = 256

/** Allowed preference range (0 = disable durable cache writes). */
export const MIN_PDF_RASTER_CACHE_MAX_MB = 0
export const MAX_PDF_RASTER_CACHE_MAX_MB = 4096

/**
 * @deprecated Entry-count LRU was replaced by a byte-budget FIFO.
 * Kept as a soft safety valve so a tiny-page flood cannot unbounded-grow memory.
 */
export const MAX_PDF_RASTER_ENTRIES = 96

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
  createdAt: number
}

const memory = new Map<string, MemEntry>()

/** Optional override for tests (skips localStorage). */
let maxMbOverride: number | null = null

/** Clamp preference to the allowed MB range. */
export function normalizePdfRasterCacheMaxMb(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return DEFAULT_PDF_RASTER_CACHE_MAX_MB
  return Math.max(
    MIN_PDF_RASTER_CACHE_MAX_MB,
    Math.min(MAX_PDF_RASTER_CACHE_MAX_MB, Math.round(n)),
  )
}

/** Read max cache size in MB (override → localStorage → default). */
export function readPdfRasterCacheMaxMb(): number {
  if (maxMbOverride != null) return normalizePdfRasterCacheMaxMb(maxMbOverride)
  try {
    const raw = localStorage.getItem(PDF_RASTER_CACHE_MAX_MB_KEY)
    if (raw == null || raw === '') return DEFAULT_PDF_RASTER_CACHE_MAX_MB
    return normalizePdfRasterCacheMaxMb(Number(raw))
  } catch {
    return DEFAULT_PDF_RASTER_CACHE_MAX_MB
  }
}

/** Byte budget derived from {@link readPdfRasterCacheMaxMb}. */
export function pdfRasterCacheMaxBytes(): number {
  return readPdfRasterCacheMaxMb() * 1024 * 1024
}

/** Test/helper: force max MB (null restores localStorage). */
export function setPdfRasterCacheMaxMbForTests(mb: number | null): void {
  maxMbOverride = mb == null ? null : normalizePdfRasterCacheMaxMb(mb)
}

/**
 * Stable cache key for a PDF identity and render options.
 *
 * `pdfIdentity` should be a durable URL (catalog) or a stable local id
 * (e.g. `local-asset:<id>`), not a transient `blob:` object URL.
 *
 * Includes {@link PDF_RASTER_CACHE_VERSION} so format changes invalidate old entries.
 */
export function pdfRasterCacheKey(pdfIdentity: string, opts: PdfRasterCacheOpts = {}): string {
  const crop = opts.crop !== false
  let dpiPart: string
  if (opts.dpi != null) dpiPart = String(opts.dpi)
  else if (opts.targetWidth != null) dpiPart = `tw${opts.targetWidth}`
  else dpiPart = String(DEFAULT_PDF_RENDER_DPI)
  return `v${PDF_RASTER_CACHE_VERSION}|${pdfIdentity}|dpi=${dpiPart}|crop=${crop ? 1 : 0}`
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
  memory.set(key, {
    pages,
    bytes: rec.bytes,
    accessedAt,
    createdAt: rec.createdAt || accessedAt,
  })
  void touchIdbAccessed(key, accessedAt)
  return objectUrlsFromBlobs(pages)
}

async function listIdbRecords(): Promise<PdfRasterRecord[]> {
  try {
    const db = await openOfflineDb()
    try {
      const tx = db.transaction(PDF_RASTER_STORE, 'readonly')
      return (await idbReq(tx.objectStore(PDF_RASTER_STORE).getAll())) as PdfRasterRecord[]
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

type EvictRow = { key: string; bytes: number; createdAt: number }

function mergeEvictRows(idb: PdfRasterRecord[]): EvictRow[] {
  const byKey = new Map<string, EvictRow>()
  for (const rec of idb) {
    byKey.set(rec.key, {
      key: rec.key,
      bytes: rec.bytes || 0,
      createdAt: rec.createdAt || rec.accessedAt || 0,
    })
  }
  for (const [key, entry] of memory) {
    const prev = byKey.get(key)
    byKey.set(key, {
      key,
      bytes: entry.bytes,
      createdAt: prev?.createdAt ?? entry.createdAt,
    })
  }
  return [...byKey.values()]
}

/**
 * Drop oldest insertions until under the byte budget (and soft entry cap).
 * FIFO uses {@link PdfRasterRecord.createdAt}, not last access.
 */
async function evictFifoIfNeeded(): Promise<void> {
  const maxBytes = pdfRasterCacheMaxBytes()
  const rows = mergeEvictRows(await listIdbRecords())
  rows.sort((a, b) => a.createdAt - b.createdAt || a.key.localeCompare(b.key))

  let total = rows.reduce((n, r) => n + r.bytes, 0)
  let count = rows.length
  let i = 0

  const overBudget = () =>
    maxBytes <= 0 ? count > 0 : total > maxBytes || count > MAX_PDF_RASTER_ENTRIES

  while (i < rows.length && overBudget()) {
    const row = rows[i]!
    i += 1
    memory.delete(row.key)
    await deleteIdbKey(row.key)
    total -= row.bytes
    count -= 1
  }
}

/** Re-apply the configured byte budget (e.g. after the Settings preference changes). */
export async function enforcePdfRasterCacheBudget(): Promise<void> {
  await evictFifoIfNeeded()
}

/** Store page blobs under `key` (memory + IDB). */
export async function putPdfRasterBlobs(key: string, pages: Blob[]): Promise<void> {
  if (!pages.length) return
  const maxBytes = pdfRasterCacheMaxBytes()
  const bytes = pages.reduce((n, b) => n + (b.size || 0), 0)
  const now = Date.now()
  const existing = memory.get(key) ?? (await readIdb(key))
  const createdAt =
    existing && 'createdAt' in existing && typeof existing.createdAt === 'number'
      ? existing.createdAt
      : now

  // Session memory always updated (helps Local Library within a visit).
  memory.set(key, { pages, bytes, accessedAt: now, createdAt })

  if (maxBytes <= 0) {
    // Durable cache disabled — drop any prior IDB copy for this key.
    await deleteIdbKey(key)
    await evictFifoIfNeeded()
    return
  }

  // Skip durable write if a single entry alone exceeds the budget.
  if (bytes > maxBytes) {
    await deleteIdbKey(key)
    await evictFifoIfNeeded()
    return
  }

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
        createdAt,
      }
      await idbReq(tx.objectStore(PDF_RASTER_STORE).put(rec))
    } finally {
      db.close()
    }
  } catch {
    /* quota / private mode — memory still helps this session */
  }

  await evictFifoIfNeeded()
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
