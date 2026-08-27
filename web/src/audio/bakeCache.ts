/**
 * Bounded byte-accounted LRU for baked AudioBuffers.
 * Pinned playable cannot be evicted.
 */
import { bakeCacheKey } from './transformContract'

export type BakedEntry = {
  key: string
  buffer: AudioBuffer
  pitchSemitones: number
  speed: number
  peakL: number
  peakR: number
  sourceRevision: string
  byteSize: number
}

const DEFAULT_BUDGET = 96 * 1024 * 1024

function bufferBytes(buf: AudioBuffer): number {
  return buf.length * buf.numberOfChannels * 4
}

export class BakeCache {
  private map = new Map<string, BakedEntry>()
  private budgetBytes: number
  private bytes = 0
  private pinnedKey: string | null = null
  private inflight = new Map<string, Promise<BakedEntry | null>>()

  constructor(budgetBytes = DEFAULT_BUDGET) {
    this.budgetBytes = budgetBytes
  }

  currentBytes(): number {
    return this.bytes
  }

  setPinned(key: string | null): void {
    this.pinnedKey = key
  }

  get(key: string): BakedEntry | undefined {
    const e = this.map.get(key)
    if (!e) return undefined
    // refresh LRU order
    this.map.delete(key)
    this.map.set(key, e)
    return e
  }

  getInflight(key: string): Promise<BakedEntry | null> | undefined {
    return this.inflight.get(key)
  }

  setInflight(key: string, p: Promise<BakedEntry | null>): void {
    this.inflight.set(key, p)
    void p.finally(() => {
      if (this.inflight.get(key) === p) this.inflight.delete(key)
    })
  }

  put(entry: Omit<BakedEntry, 'byteSize' | 'key'> & { key?: string }): BakedEntry {
    const key =
      entry.key ??
      bakeCacheKey({
        sourceRevision: entry.sourceRevision,
        sampleRate: entry.buffer.sampleRate,
        channels: entry.buffer.numberOfChannels,
        pitchSemitones: entry.pitchSemitones,
        speed: entry.speed,
      })
    const byteSize = bufferBytes(entry.buffer)
    const full: BakedEntry = { ...entry, key, byteSize }
    if (this.map.has(key)) {
      const old = this.map.get(key)!
      this.bytes -= old.byteSize
      this.map.delete(key)
    }
    this.evictToFit(byteSize)
    this.map.set(key, full)
    this.bytes += byteSize
    return full
  }

  /** Returns false if entry cannot fit alongside pinned buffer. */
  canFit(byteSize: number): boolean {
    let pinnedBytes = 0
    if (this.pinnedKey) {
      const p = this.map.get(this.pinnedKey)
      if (p) pinnedBytes = p.byteSize
    }
    if (pinnedBytes + byteSize > this.budgetBytes) return false
    return true
  }

  private evictToFit(need: number): void {
    if (this.bytes + need <= this.budgetBytes) return
    for (const [key, entry] of this.map) {
      if (key === this.pinnedKey) continue
      this.map.delete(key)
      this.bytes -= entry.byteSize
      if (this.bytes + need <= this.budgetBytes) return
    }
  }

  clear(): void {
    this.map.clear()
    this.inflight.clear()
    this.bytes = 0
    this.pinnedKey = null
  }

  clearSource(sourceRevision: string): void {
    for (const [key, entry] of [...this.map]) {
      if (entry.sourceRevision === sourceRevision && key !== this.pinnedKey) {
        this.map.delete(key)
        this.bytes -= entry.byteSize
      }
    }
  }
}

export const bakeCache = new BakeCache()
