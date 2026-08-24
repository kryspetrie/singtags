/** Concurrent pause/resume download queue into an OfflinePackStore. */

import type { OfflinePackStore } from './libraryPack'

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
    const concurrency = Math.max(1, this.options.concurrency ?? 4)
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
    this.emitProgress()
  }

  private emitProgress(currentPath?: string): void {
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
      currentPath,
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
        if (await this.store.has(item.url)) {
          this.done++
          this.doneBytes += item.bytes ?? 0
          this.options.onItemDone?.(item.path, i)
          this.emitProgress(item.path)
          continue
        }
        const res = await fetch(item.url, { signal: this.abort?.signal })
        if (!res.ok) throw new Error(`HTTP ${res.status} for ${item.path}`)
        let toStore = res
        if (this.options.transformResponse) {
          toStore = await this.options.transformResponse(item, res)
        }
        const clone = toStore.clone()
        const buf = await toStore.arrayBuffer()
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
        this.setStatus('error', e instanceof Error ? e.message : String(e))
        this.abort?.abort()
        return
      }
    }
  }
}
