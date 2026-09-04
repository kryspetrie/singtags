/**
 * Deduplicating decode service + session decode cache.
 * Keyed by source identity + content revision + sample-rate policy.
 */
import { assertDecodableAudioBytes } from './audioBytes'
import { channelsEffectivelyMono } from './playerUtils'
import { createAudioBuffer } from './audioBufferFactory'

/** Stable identity for deduplicating decode across URL + content revision. */
export type SourceIdentity = {
  url: string
  /** Content revision: ETag, version query, or hash. Falls back to url. */
  revision: string
}

/** Cached decode result with channel peaks and mono detection for the player graph. */
export type DecodedTrack = {
  buffer: AudioBuffer
  identity: SourceIdentity
  sampleRate: number
  channels: number
  peakL: number
  peakR: number
  effectivelyMono: boolean
  byteSize: number
}

/** Session counters for decode cache hit rate and retained byte size. */
export type DecodeCacheStats = {
  hits: number
  misses: number
  bytes: number
}

const DEFAULT_BUDGET = 64 * 1024 * 1024 // 64 MiB decode+bake shared externally

function channelPeak(data: Float32Array): number {
  let peak = 0
  const step = data.length > 500_000 ? 4 : 1
  for (let i = 0; i < data.length; i += step) {
    const a = Math.abs(data[i]!)
    if (a > peak) peak = a
  }
  return peak
}

function bufferBytes(buf: AudioBuffer): number {
  return buf.length * buf.numberOfChannels * 4
}

/** Explicit stereo downmix: L = ch0, R = mean(rest). Never silently drop channels. */
function downmixOrReject(buf: AudioBuffer): AudioBuffer {
  if (buf.numberOfChannels <= 2) return buf
  const out = createAudioBuffer(2, buf.length, buf.sampleRate)
  const L = out.getChannelData(0)
  const R = out.getChannelData(1)
  const c0 = buf.getChannelData(0)
  L.set(c0)
  for (let i = 0; i < buf.length; i++) {
    let sum = 0
    for (let c = 1; c < buf.numberOfChannels; c++) sum += buf.getChannelData(c)[i]!
    R[i] = sum / (buf.numberOfChannels - 1)
  }
  return out
}

/** Build a cache revision string from fetch response headers (ETag / Last-Modified). */
export function sourceRevisionFromResponse(url: string, res: Response): string {
  const etag = res.headers.get('ETag') || res.headers.get('etag')
  const lastMod = res.headers.get('Last-Modified')
  if (etag) return `${url}#${etag}`
  if (lastMod) return `${url}#${lastMod}`
  return url
}

/**
 * Fetch, validate, downmix (>2ch), and cache decoded tracks under a byte budget.
 * Deduplicates concurrent decodes for the same URL or revision key.
 */
export class DecodeService {
  private cache = new Map<string, DecodedTrack>()
  private inflight = new Map<string, Promise<DecodedTrack>>()
  private budgetBytes: number
  private stats: DecodeCacheStats = { hits: 0, misses: 0, bytes: 0 }

  constructor(budgetBytes = DEFAULT_BUDGET) {
    this.budgetBytes = budgetBytes
  }

  getStats(): DecodeCacheStats {
    return { ...this.stats }
  }

  currentBytes(): number {
    return this.stats.bytes
  }

  clear(): void {
    this.cache.clear()
    this.inflight.clear()
    this.stats.bytes = 0
  }

  getCached(revision: string): DecodedTrack | undefined {
    return this.cache.get(revision)
  }

  private evictToFit(need: number): void {
    if (this.stats.bytes + need <= this.budgetBytes) return
    for (const [key, entry] of this.cache) {
      this.cache.delete(key)
      this.stats.bytes -= entry.byteSize
      if (this.stats.bytes + need <= this.budgetBytes) return
    }
  }

  /**
   * Fetch, decode, cache, and return a track. Dedupes by `revision` or in-flight URL.
   * @param offlineSampleRate When set, decode via `OfflineAudioContext` at this rate.
   */
  async decode(
    url: string,
    opts?: {
      signal?: AbortSignal
      revision?: string
      /** Prefer OfflineAudioContext for pre-gesture decode. */
      offlineSampleRate?: number
    },
  ): Promise<DecodedTrack> {
    const signal = opts?.signal
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

    // Fast path: known revision hit
    if (opts?.revision) {
      const hit = this.cache.get(opts.revision)
      if (hit) {
        this.stats.hits++
        return hit
      }
      const pending = this.inflight.get(opts.revision)
      if (pending) {
        this.stats.hits++
        return pending
      }
    }

    const run = this.fetchAndDecode(url, opts)
    // Temporary key until revision known — also dedupe by url while in flight
    const urlKey = `url:${url}`
    if (!opts?.revision) {
      const existing = this.inflight.get(urlKey)
      if (existing) {
        this.stats.hits++
        return existing
      }
      this.inflight.set(urlKey, run)
    } else {
      this.inflight.set(opts.revision, run)
    }

    try {
      return await run
    } finally {
      this.inflight.delete(urlKey)
      if (opts?.revision) this.inflight.delete(opts.revision)
    }
  }

  private async fetchAndDecode(
    url: string,
    opts?: {
      signal?: AbortSignal
      revision?: string
      offlineSampleRate?: number
    },
  ): Promise<DecodedTrack> {
    this.stats.misses++
    const res = await fetch(url, { signal: opts?.signal })
    if (!res.ok) throw new Error(`Failed to load audio (${res.status})`)
    const revision = opts?.revision ?? sourceRevisionFromResponse(url, res)
    const cached = this.cache.get(revision)
    if (cached) {
      this.stats.hits++
      this.stats.misses-- // was speculative miss
      return cached
    }

    const ab = await res.arrayBuffer()
    if (opts?.signal?.aborted) throw new DOMException('Aborted', 'AbortError')

    // Refuse HTML/JSON/empty before decodeAudioData — Chromium logs the native
    // "Unable to decode audio data" even when that promise is caught.
    assertDecodableAudioBytes(ab)

    // decodeAudioData is uncancellable — generation gates happen in the player.
    // Serialize + retry: iOS often fails concurrent decode while favorites cache.
    const { decodeAudioDataExclusive } = await import('./decodeLock')
    let decoded = await decodeAudioDataExclusive(ab, {
      offlineSampleRate: opts?.offlineSampleRate,
    })

    decoded = downmixOrReject(decoded)
    const left = decoded.getChannelData(0)
    const right = decoded.numberOfChannels > 1 ? decoded.getChannelData(1) : null
    const peakL = channelPeak(left)
    const peakR = right ? channelPeak(right) : peakL
    const entry: DecodedTrack = {
      buffer: decoded,
      identity: { url, revision },
      sampleRate: decoded.sampleRate,
      channels: decoded.numberOfChannels,
      peakL,
      peakR,
      effectivelyMono: channelsEffectivelyMono(left, right),
      byteSize: bufferBytes(decoded),
    }
    this.evictToFit(entry.byteSize)
    this.cache.set(revision, entry)
    this.stats.bytes += entry.byteSize
    this.inflight.delete(revision)
    return entry
  }
}

/** Shared singleton for the app session. */
export const decodeService = new DecodeService()
