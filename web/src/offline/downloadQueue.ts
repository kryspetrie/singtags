/** Concurrent pause/resume download queue into an OfflinePackStore. */

import { isNonAudioPayload } from '../audio/audioBytes'
import type { OfflinePackStore } from './libraryPack'

/** True when bytes look like an HTML document (SPA fallback poison). */
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

/** True when a cached/fetched body is safe to keep as media. */
export function isPlausibleMediaBody(buf: ArrayBuffer, contentType = ''): boolean {
  if (/text\/html|application\/json|text\/plain|application\/xml|text\/xml/i.test(contentType)) {
    return false
  }
  if (isEmptyMediaBody(buf) || bodyLooksLikeHtml(buf)) return false
  // Also reject JSON/XML SPA/API bodies even when Content-Type is wrong/missing.
  if (isNonAudioPayload(buf)) return false
  return true
}

export interface DownloadProgress {
  label: string
  done: number
  total: number
  doneBytes: number
  totalBytes: number
  ratio: number
  currentPath?: string
}

export interface DownloadItem {
  /** Absolute URL to fetch and cache. */
  url: string
  /** Relative path for display / logging. */
  path: string
  bytes?: number
}

export type DownloadStatus = 'idle' | 'running' | 'paused' | 'done' | 'error' | 'quota'

export interface DownloadQueueOptions {
  /** Parallel fetch/store workers. Default 16 (tiny files are latency-bound). */
  concurrency?: number
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

  constructor(store: OfflinePackStore, options: DownloadQueueOptions = {}) {
    this.store = store
    this.options = options
  }

  getStatus(): DownloadStatus {
    return this.status
  }

  getError(): string | null {
    return this.error
  }

  /** Next item index (for resume persistence). */
  getCursor(): number {
    return this.index
  }

  setItems(items: DownloadItem[], startIndex = 0): void {
    this.items = items
    this.index = Math.max(0, Math.min(startIndex, items.length))
    this.done = this.index
    this.doneBytes = items.slice(0, this.index).reduce((s, i) => s + (i.bytes ?? 0), 0)
    this.totalBytes = items.reduce((s, i) => s + (i.bytes ?? 0), 0)
    this.error = null
  }

  async start(): Promise<void> {
    if (this.status === 'running') return
    this.pauseRequested = false
    this.abort = new AbortController()
    this.setStatus('running')
    const concurrency = Math.max(1, this.options.concurrency ?? 16)
    const workers = Array.from({ length: concurrency }, () => this.worker())
    await Promise.all(workers)
    if (this.status === 'quota' || this.status === 'error') return
    if (this.pauseRequested) {
      this.setStatus('paused')
      return
    }
    this.setStatus('done')
  }

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
          if (isPlausibleMediaBody(existingBuf, existingType)) {
            this.done++
            this.doneBytes += item.bytes ?? existingBuf.byteLength
            this.options.onItemDone?.(item.path, i)
            this.emitProgress(item.path)
            continue
          }
          await this.store.delete(item.url)
        }
        const res = await fetch(item.url, { signal: this.abort?.signal })
        if (!res.ok) throw new Error(`HTTP ${res.status} for ${item.path}`)
        const contentType = res.headers.get('Content-Type') || ''
        if (/text\/html|application\/json/i.test(contentType)) {
          throw new Error(`Got non-media Content-Type (${contentType}) for ${item.path}`)
        }
        let toStore = res
        if (this.options.transformResponse) {
          toStore = await this.options.transformResponse(item, res)
        }
        const clone = toStore.clone()
        const buf = await toStore.arrayBuffer()
        // Guard against SPA shells / empty bodies (not tiny-but-valid WebPs).
        if (!isPlausibleMediaBody(buf, clone.headers.get('Content-Type') || contentType)) {
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
