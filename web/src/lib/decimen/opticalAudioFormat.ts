/**
 * Optical send audio format: AAC 96 (default), MP3 VBR medium, Opus 64, Original.
 * Background prepare so Start transfer rarely waits on encode.
 */
import {
  encodeAudioBufferToM4a,
  encodeAudioBufferToOggOpus,
} from '../../download/encode'
import { DOWNLOAD_AAC_BITRATE, opusBitrate } from '../../types/audio'
import { isLocalAudioMime } from '../../types/localLibrary'

export type OpticalAudioFormat = 'aac96' | 'mp3vbr' | 'opus64' | 'original'

export const OPTICAL_AUDIO_FORMAT_OPTIONS: Array<{
  value: OpticalAudioFormat
  label: string
}> = [
  { value: 'aac96', label: 'AAC 96 kbps' },
  { value: 'mp3vbr', label: 'MP3 VBR (~128 kbps)' },
  { value: 'opus64', label: 'Opus 64 kbps' },
  { value: 'original', label: 'Original' },
]

export const DEFAULT_OPTICAL_AUDIO_FORMAT: OpticalAudioFormat = 'aac96'

/** LAME VBR quality ≈ medium / ~128 kbps. */
const MP3_VBR_MEDIUM = 4
/** Nominal average bitrate for MP3 VBR quality 4 size estimates. */
export const OPTICAL_MP3_VBR_BITRATE_BPS = 128_000
/** Container/header padding on top of bitrate × duration. */
const ENCODED_CONTAINER_OVERHEAD_BYTES = 2_048
/**
 * Assumed source bitrate when duration is unknown (typical catalog MP3).
 * Used only for a rough shrink factor before metadata probe finishes.
 */
const ASSUMED_SOURCE_BITRATE_BPS = 192_000

/** Target encode bitrate for optical audio formats (0 = passthrough). */
export function opticalAudioTargetBitrateBps(format: OpticalAudioFormat): number {
  switch (format) {
    case 'original':
      return 0
    case 'aac96':
      return DOWNLOAD_AAC_BITRATE
    case 'opus64':
      return opusBitrate('standard')
    case 'mp3vbr':
      return OPTICAL_MP3_VBR_BITRATE_BPS
  }
}

export function isOpticalAudioFile(file: Pick<File, 'name' | 'type'>): boolean {
  return isLocalAudioMime(file.type || '', file.name || '')
}

export type PreparedOpticalAudio = {
  bytes: Uint8Array
  name: string
  type: string
  format: OpticalAudioFormat
  passthrough: boolean
}

function replaceExtension(name: string, ext: string): string {
  const base = name.replace(/\.[^.]+$/, '') || name
  return `${base}.${ext}`
}

async function decodeAudioBytes(data: Uint8Array): Promise<AudioBuffer> {
  const { decodeAudioDataExclusive } = await import('../../audio/decodeLock')
  const ab = new ArrayBuffer(data.byteLength)
  new Uint8Array(ab).set(data)
  return await decodeAudioDataExclusive(ab, { offlineSampleRate: 48_000 })
}

/** Rough bitrate from byte length and PCM duration (bits/sec). */
export function estimateBitrateBps(byteLength: number, durationSec: number): number {
  if (!(durationSec > 0) || !(byteLength > 0)) return Number.POSITIVE_INFINITY
  return (byteLength * 8) / durationSec
}

/**
 * AAC 96 default: passthrough when source is already ≤96 kbps (any codec).
 */
export function shouldPassthroughAac96(bitrateBps: number): boolean {
  return bitrateBps <= DOWNLOAD_AAC_BITRATE * 1.05
}

/**
 * Estimate encoded payload bytes for an optical audio format.
 * Prefers duration × target bitrate; falls back to a source-bitrate ratio.
 * AAC 96 never exceeds the original size (passthrough when already ≤96 kbps).
 */
export function estimateOpticalAudioPayloadBytes(opts: {
  byteLength: number
  format: OpticalAudioFormat
  durationSec?: number | null
}): number {
  const sourceBytes = Math.max(0, Math.floor(opts.byteLength))
  if (opts.format === 'original' || sourceBytes === 0) return sourceBytes

  const targetBps = opticalAudioTargetBitrateBps(opts.format)
  const duration = opts.durationSec
  let encoded: number
  if (duration != null && Number.isFinite(duration) && duration > 0) {
    encoded = Math.ceil((duration * targetBps) / 8) + ENCODED_CONTAINER_OVERHEAD_BYTES
  } else {
    encoded =
      Math.ceil(sourceBytes * (targetBps / ASSUMED_SOURCE_BITRATE_BPS)) +
      ENCODED_CONTAINER_OVERHEAD_BYTES
  }

  // AAC path passthroughs when source is already ≤96 kbps.
  if (opts.format === 'aac96') return Math.min(sourceBytes, Math.max(1, encoded))
  return Math.max(1, encoded)
}

/** Metadata-only duration probe from a File (no full decode when the browser allows). */
export function probeFileAudioDurationSeconds(file: File): Promise<number | null> {
  if (!file.size) return Promise.resolve(null)
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const audio = new Audio()
    let settled = false
    const done = (sec: number | null) => {
      if (settled) return
      settled = true
      URL.revokeObjectURL(url)
      audio.removeAttribute('src')
      audio.load()
      resolve(sec)
    }
    audio.preload = 'metadata'
    audio.onloadedmetadata = () => {
      const sec = audio.duration
      done(Number.isFinite(sec) && sec > 0 ? sec : null)
    }
    audio.onerror = () => done(null)
    window.setTimeout(() => done(null), 4000)
    audio.src = url
  })
}

export async function prepareOpticalAudioFile(
  file: File,
  format: OpticalAudioFormat,
  signal?: AbortSignal,
): Promise<PreparedOpticalAudio> {
  const input = new Uint8Array(await file.arrayBuffer())
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

  if (format === 'original') {
    return {
      bytes: input,
      name: file.name,
      type: file.type || 'application/octet-stream',
      format,
      passthrough: true,
    }
  }

  const buffer = await decodeAudioBytes(input)
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

  const bitrate = estimateBitrateBps(input.byteLength, buffer.duration)
  if (format === 'aac96' && shouldPassthroughAac96(bitrate)) {
    return {
      bytes: input,
      name: file.name,
      type: file.type || 'application/octet-stream',
      format,
      passthrough: true,
    }
  }

  if (format === 'aac96') {
    const bytes = await encodeAudioBufferToM4a(buffer, {
      quality: 'standard',
      bitrate: DOWNLOAD_AAC_BITRATE,
    })
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    return {
      bytes,
      name: replaceExtension(file.name, 'm4a'),
      type: 'audio/mp4',
      format,
      passthrough: false,
    }
  }

  if (format === 'opus64') {
    const bytes = await encodeAudioBufferToOggOpus(buffer, { quality: 'standard' })
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    return {
      bytes,
      name: replaceExtension(file.name, 'opus'),
      type: 'audio/ogg',
      format,
      passthrough: false,
    }
  }

  // mp3vbr — configure LAME via encodeAudioBuffer; override vbr by temporarily encoding with custom path
  const bytes = await encodeMp3VbrMedium(buffer)
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  return {
    bytes,
    name: replaceExtension(file.name, 'mp3'),
    type: 'audio/mpeg',
    format,
    passthrough: false,
  }
}

async function encodeMp3VbrMedium(buffer: AudioBuffer): Promise<Uint8Array> {
  // encodeAudioBuffer uses mp3VbrQuality(quality); 'compact' is 5 (~lower). Use direct LAME configure.
  const { createEncoder } = await import('wasm-media-encoders')
  const mod = await import('wasm-media-encoders/wasm/mp3?url')
  const url = mod.default as string
  const encoder = (await createEncoder('audio/mpeg', url)) as {
    configure: (opts: { sampleRate: number; channels: number; vbrQuality?: number }) => void
    encode: (samples: Float32Array[]) => Uint8Array
    finalize: () => Uint8Array
  }
  const channels = Math.min(2, Math.max(1, buffer.numberOfChannels))
  encoder.configure({
    sampleRate: buffer.sampleRate,
    channels,
    vbrQuality: MP3_VBR_MEDIUM,
  })
  const chans: Float32Array[] = []
  for (let c = 0; c < channels; c++) chans.push(buffer.getChannelData(c))
  const parts: Uint8Array[] = [encoder.encode(chans), encoder.finalize()]
  let total = 0
  for (const p of parts) total += p.byteLength
  const out = new Uint8Array(total)
  let off = 0
  for (const p of parts) {
    out.set(p, off)
    off += p.byteLength
  }
  return out
}

type PrepareJob = {
  key: string
  controller: AbortController
  promise: Promise<PreparedOpticalAudio>
}

/**
 * Single-flight background prepares keyed by queue item + format.
 * Concurrency 1 so the UI stays responsive.
 */
export class OpticalAudioPrepareQueue {
  private readonly jobs = new Map<string, PrepareJob>()
  private chain: Promise<void> = Promise.resolve()

  prepare(itemId: string, file: File, format: OpticalAudioFormat): Promise<PreparedOpticalAudio> {
    const key = `${itemId}:${format}`
    const existing = this.jobs.get(key)
    if (existing) return existing.promise

    // Cancel other formats for this item.
    for (const [k, job] of this.jobs) {
      if (k.startsWith(`${itemId}:`) && k !== key) {
        job.controller.abort()
        this.jobs.delete(k)
      }
    }

    const controller = new AbortController()
    const promise = this.chain.then(async () => {
      if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError')
      return prepareOpticalAudioFile(file, format, controller.signal)
    })
    this.chain = promise.then(
      () => undefined,
      () => undefined,
    )
    this.jobs.set(key, { key, controller, promise })
    void promise.finally(() => {
      const cur = this.jobs.get(key)
      if (cur?.promise === promise) this.jobs.delete(key)
    })
    return promise
  }

  /** Await prepared audio for Start, or run now if missing. */
  async ensure(
    itemId: string,
    file: File,
    format: OpticalAudioFormat,
  ): Promise<PreparedOpticalAudio> {
    return this.prepare(itemId, file, format)
  }

  cancelItem(itemId: string): void {
    for (const [k, job] of this.jobs) {
      if (k.startsWith(`${itemId}:`)) {
        job.controller.abort()
        this.jobs.delete(k)
      }
    }
  }

  clear(): void {
    for (const job of this.jobs.values()) job.controller.abort()
    this.jobs.clear()
  }
}
