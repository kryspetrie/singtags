/**
 * Concurrent pause/resume download queue into an {@link OfflinePackStore}.
 *
 * Fetches manifest items in parallel, skips valid cached entries, rejects SPA/HTML poison,
 * and supports optional response transforms (e.g. audio re-encode).
 *
 * When {@link DownloadQueueOptions.transformConcurrency} is set below fetch concurrency,
 * heavy transforms are limited by a semaphore so other workers keep fetching (pipeline).
 * Optional {@link DownloadQueueOptions.inflight} shares a global network-fetch cap across packs.
 */

import { isNonAudioPayload } from '../audio/audioBytes'
import type { OfflinePackStore } from './libraryPack'
import { InflightLimiter } from './downloadConcurrency'

/**
 * True when bytes look like an HTML document (SPA fallback poison).
 *
 * @param buf Response body (only the first 64 bytes are inspected).
 */
export function bodyLooksLikeHtml(buf: ArrayBuffer): boolean {
  const n = Math.min(buf.byteLength, 64)
  if (n < 15) return false
  const head = new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(buf, 0, n))
  const t = head.trimStart().toLowerCase()
  return t.startsWith('<!doctype html') || t.startsWith('<html')
}

/** Reject empty/truncated responses (real media is never this small). */
export function isEmptyMediaBody(buf: ArrayBuffer): boolean {
  return buf.byteLength < 64
}

/**
 * True when a cached/fetched body is safe to keep as media.
 *
 * Rejects HTML/JSON/XML bodies and payloads flagged by {@link isNonAudioPayload}.
 * Do not use for sheet-pack `metadata.json` — see {@link isCatalogJsonPath}.
 */
export function isPlausibleMediaBody(buf: ArrayBuffer, contentType = ''): boolean {
  if (/text\/html|application\/json|text\/plain|application\/xml|text\/xml/i.test(contentType)) {
    return false
  }
  if (isEmptyMediaBody(buf) || bodyLooksLikeHtml(buf)) return false
  // Also reject JSON/XML SPA/API bodies even when Content-Type is wrong/missing.
  if (isNonAudioPayload(buf)) return false
  return true
}

/** Tag detail JSON queued with the sheets pack (`tags/{id}/metadata.json`). */
export function isCatalogJsonPath(path: string): boolean {
  return /(?:^|\/)tags\/\d+\/metadata\.json$/i.test(path.replace(/^\//, ''))
}

/**
 * True when a download-queue body is safe to keep for `path`.
 *
 * Media paths use {@link isPlausibleMediaBody}. Catalog `metadata.json` accepts
 * `application/json` (and JSON-looking bodies) while still rejecting HTML SPA shells.
 */
export function isPlausibleDownloadBody(
  buf: ArrayBuffer,
  contentType = '',
  path = '',
): boolean {
  if (isCatalogJsonPath(path)) {
    if (bodyLooksLikeHtml(buf) || /text\/html/i.test(contentType)) return false
    if (buf.byteLength < 2) return false
    if (/application\/json/i.test(contentType)) return true
    const head = new TextDecoder('utf-8', { fatal: false })
      .decode(new Uint8Array(buf, 0, Math.min(buf.byteLength, 16)))
      .trimStart()
    return head.startsWith('{') || head.startsWith('[')
  }
  return isPlausibleMediaBody(buf, contentType)
}

/** Progress snapshot emitted while a queue is running, paused, or finished. */
export interface DownloadProgress {
  label: string
  done: number
  total: number
  doneBytes: number
  totalBytes: number
  ratio: number
  /** Relative path of the item currently being processed, when known. */
  currentPath?: string
}

/** One manifest row to fetch and store under {@link DownloadItem.url}. */
export interface DownloadItem {
  /** Absolute URL to fetch and cache. */
  url: string
  /** Relative path for display / logging. */
  path: string
  /** Expected size in bytes (for progress totals). */
  bytes?: number
}

/** Lifecycle state of a {@link DownloadQueue} run. */
export type DownloadStatus = 'idle' | 'running' | 'paused' | 'done' | 'error' | 'quota'

/** Configuration for {@link DownloadQueue}. */
export interface DownloadQueueOptions {
  /** Parallel fetch/store workers. Default 16 (tiny files are latency-bound). */
  concurrency?: number
  /**
   * Max concurrent {@link transformResponse} calls. When lower than {@link concurrency},
   * workers pipeline: published/passthrough items keep fetching while encodes run.
   */
  transformConcurrency?: number
  /**
   * Optional predicate — when false, skip {@link transformResponse} (store fetch as-is).
   * Use for published Opus tiers that need no on-device re-encode.
   */
  needsTransform?: (item: DownloadItem) => boolean
  /** Shared gate around network `fetch` (sheets + audio packs). */
  inflight?: InflightLimiter
  onProgress?: (p: DownloadProgress) => void
  /** Called when status changes. */
  onStatus?: (s: DownloadStatus, error?: string) => void
  /** Persist cursor after each successful item (path index). */
  onItemDone?: (path: string, index: number) => void
  /**
   * Optional transform after fetch (e.g. re-encode audio). Receives cloned response body.
   * Return a new Response to store.
   */
  transformResponse?: (item: DownloadItem, response: Response) => Promise<Response>
  /** Min ms between UI progress emits while running (status changes always emit). Default 100. */
  progressMinMs?: number
  /** Skip failed items instead of aborting the whole pack (audio sync). */
  continueOnError?: boolean
  onItemError?: (path: string, error: string) => void
}

/**
 * Worker pool that downloads manifest items into a pack store with pause/resume.
 *
 * Skips entries already cached with plausible bodies; aborts or pauses on quota/errors.
 */
export class DownloadQueue {
  private items: DownloadItem[] = []
  private index = 0
  private done = 0
  private doneBytes = 0
  private totalBytes = 0
  private status: DownloadStatus = 'idle'
  private pauseRequested = false
  private abort: AbortController | null = null
  private error: string | null = null
  private store: OfflinePackStore
  private options: DownloadQueueOptions
  private lastProgressAt = 0
  private pendingProgressPath: string | undefined
  private transformLimiter: InflightLimiter | null = null

  /** @param store Target pack (sheets or audio). */
  constructor(store: OfflinePackStore, options: DownloadQueueOptions = {}) {
    this.store = store
    this.options = options
  }

  /** Current queue status. */
  getStatus(): DownloadStatus {
    return this.status
  }

  /** Last error message when status is `'error'`. */
  getError(): string | null {
    return this.error
  }

  /** Next item index (for resume persistence via {@link PackProgressRecord.cursor}). */
  getCursor(): number {
    return this.index
  }

  /**
   * Replace the item list and optionally seek to a saved cursor.
   *
   * @param items Manifest download rows.
   * @param startIndex Resume index (clamped to `[0, items.length]`).
   */
  setItems(items: DownloadItem[], startIndex = 0): void {
    this.items = items
    this.index = Math.max(0, Math.min(startIndex, items.length))
    this.done = this.index
    this.doneBytes = items.slice(0, this.index).reduce((s, i) => s + (i.bytes ?? 0), 0)
    this.totalBytes = items.reduce((s, i) => s + (i.bytes ?? 0), 0)
    this.error = null
  }

  /** Start or resume downloading until done, paused, errored, or quota-exceeded. */
  async start(): Promise<void> {
    if (this.status === 'running') return
    this.pauseRequested = false
    this.abort = new AbortController()
    this.setStatus('running')
    const concurrency = Math.max(1, this.options.concurrency ?? 16)
    const transformN = this.options.transformConcurrency
    this.transformLimiter =
      transformN != null && transformN > 0 && this.options.transformResponse
        ? new InflightLimiter(transformN)
        : null
    const workers = Array.from({ length: concurrency }, () => this.worker())
    await Promise.all(workers)
    this.transformLimiter = null
    if (this.status === 'quota' || this.status === 'error') return
    if (this.pauseRequested) {
      this.setStatus('paused')
      return
    }
    this.setStatus('done')
  }

  /** Request cooperative pause; in-flight fetches abort and status becomes `'paused'`. */
  pause(): void {
    this.pauseRequested = true
    this.abort?.abort()
  }

  private setStatus(s: DownloadStatus, err?: string): void {
    this.status = s
    if (err) this.error = err
    this.options.onStatus?.(s, err)
    this.emitProgress(undefined, true)
  }

  private emitProgress(currentPath?: string, force = false): void {
    if (currentPath !== undefined) this.pendingProgressPath = currentPath
    const minMs = this.options.progressMinMs ?? 100
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
    if (!force && this.status === 'running' && now - this.lastProgressAt < minMs) {
      return
    }
    this.lastProgressAt = now
    const path = this.pendingProgressPath
    this.pendingProgressPath = undefined
    const total = this.items.length
    this.options.onProgress?.({
      label:
        this.status === 'running'
          ? `Downloading… ${this.done}/${total}`
          : this.status === 'paused'
            ? `Paused ${this.done}/${total}`
            : this.status === 'done'
              ? 'Complete'
              : this.status === 'quota'
                ? 'Storage full'
                : this.status === 'error'
                  ? this.error || 'Error'
                  : 'Idle',
      done: this.done,
      total,
      doneBytes: this.doneBytes,
      totalBytes: this.totalBytes,
      ratio: total <= 0 ? 1 : this.done / total,
      currentPath: path,
    })
  }

  private async nextIndex(): Promise<number | null> {
    if (this.pauseRequested || this.status === 'quota' || this.status === 'error') return null
    if (this.index >= this.items.length) return null
    return this.index++
  }

  private async applyTransform(item: DownloadItem, res: Response): Promise<Response> {
    const transform = this.options.transformResponse
    if (!transform) return res
    if (this.options.needsTransform && !this.options.needsTransform(item)) {
      return res
    }
    const limiter = this.transformLimiter
    if (!limiter) {
      return transform(item, res)
    }
    const release = await limiter.acquire()
    try {
      return await transform(item, res)
    } finally {
      release()
    }
  }

  /** Single worker loop — claims indices until pause/error/quota/complete. */
  private async worker(): Promise<void> {
    for (;;) {
      const i = await this.nextIndex()
      if (i == null) return
      const item = this.items[i]!
      try {
        // Single lookup (avoid has+get opening Cache twice per file).
        const existing = await this.store.get(item.url)
        if (existing) {
          const existingBuf = await existing.arrayBuffer()
          const existingType = existing.headers.get('Content-Type') || ''
          if (isPlausibleDownloadBody(existingBuf, existingType, item.path)) {
            this.done++
            this.doneBytes += item.bytes ?? existingBuf.byteLength
            this.options.onItemDone?.(item.path, i)
            this.emitProgress(item.path)
            continue
          }
          await this.store.delete(item.url)
        }

        const releaseFetch = this.options.inflight ? await this.options.inflight.acquire() : null
        let res: Response
        try {
          res = await fetch(item.url, { signal: this.abort?.signal })
        } finally {
          releaseFetch?.()
        }

        if (!res.ok) throw new Error(`HTTP ${res.status} for ${item.path}`)
        const contentType = res.headers.get('Content-Type') || ''
        const catalogJson = isCatalogJsonPath(item.path)
        if (/text\/html/i.test(contentType) || (/application\/json/i.test(contentType) && !catalogJson)) {
          throw new Error(`Got non-media Content-Type (${contentType}) for ${item.path}`)
        }

        const toStore = await this.applyTransform(item, res)
        const clone = toStore.clone()
        const buf = await toStore.arrayBuffer()
        // Guard against SPA shells / empty bodies (not tiny-but-valid WebPs or catalog JSON).
        if (!isPlausibleDownloadBody(buf, clone.headers.get('Content-Type') || contentType, item.path)) {
          throw new Error(`Invalid media body for ${item.path} (${buf.byteLength} bytes)`)
        }
        await this.store.put(
          item.url,
          new Response(buf, {
            status: 200,
            headers: {
              'Content-Type': clone.headers.get('Content-Type') || 'application/octet-stream',
            },
          }),
        )
        this.done++
        this.doneBytes += item.bytes ?? buf.byteLength
        this.options.onItemDone?.(item.path, i)
        this.emitProgress(item.path)
      } catch (e) {
        if (this.pauseRequested || (e instanceof DOMException && e.name === 'AbortError')) {
          return
        }
        if (e instanceof DOMException && e.name === 'QuotaExceededError') {
          this.setStatus('quota', 'Storage quota exceeded — pack partially saved.')
          this.abort?.abort()
          return
        }
        const msg = e instanceof Error ? e.message : String(e)
        this.options.onItemError?.(item.path, msg)
        if (this.options.continueOnError) {
          this.done++
          this.emitProgress(item.path)
          continue
        }
        this.setStatus('error', msg)
        this.abort?.abort()
        return
      }
    }
  }
}
