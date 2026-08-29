/**
 * Encode helpers:
 * - M4A/AAC via Mediabunny (+ WASM AAC when WebCodecs lacks it)
 * - MP3 / Ogg via wasm-media-encoders (LAME / Vorbis)
 *
 * All paths keep stereo — never downmix to mono for quality presets.
 */

import { createEncoder } from 'wasm-media-encoders'
import type { AudioEncodeQuality, DownloadFormat } from '../types/audio'
import { aacBitrate, mp3VbrQuality, oggVbrQuality, opusBitrate } from '../types/audio'
import { assertDecodableAudioBytes } from '../audio/audioBytes'

type Encoder = {
  configure: (opts: {
    sampleRate: number
    channels: number
    vbrQuality?: number
  }) => void
  encode: (samples: Float32Array[]) => Uint8Array
  finalize: () => Uint8Array
}

export interface EncodeOptions {
  quality?: Exclude<AudioEncodeQuality, 'original'>
  /** Explicit mono only when caller requests it (never used by quality presets). */
  mono?: boolean
}

let mp3Encoder: Encoder | null = null
let oggEncoder: Encoder | null = null
let mp3Ready: Promise<Encoder> | null = null
let oggReady: Promise<Encoder> | null = null
let aacEncoderReady: Promise<void> | null = null

async function loadWasmUrl(format: 'mp3' | 'ogg'): Promise<string> {
  // Package exports `./wasm/mp3` → mp3.wasm (the `./wasm/mp3.wasm` export path is broken upstream).
  if (format === 'mp3') {
    const mod = await import('wasm-media-encoders/wasm/mp3?url')
    return mod.default as string
  }
  const mod = await import('wasm-media-encoders/wasm/ogg?url')
  return mod.default as string
}

async function getEncoder(format: 'mp3' | 'ogg'): Promise<Encoder> {
  if (format === 'mp3') {
    if (mp3Encoder) return mp3Encoder
    if (!mp3Ready) {
      mp3Ready = (async () => {
        const url = await loadWasmUrl('mp3')
        const enc = (await createEncoder('audio/mpeg', url)) as Encoder
        mp3Encoder = enc
        return enc
      })()
    }
    return mp3Ready
  }
  if (oggEncoder) return oggEncoder
  if (!oggReady) {
    oggReady = (async () => {
      const url = await loadWasmUrl('ogg')
      const enc = (await createEncoder('audio/ogg', url)) as Encoder
      oggEncoder = enc
      return enc
    })()
  }
  return oggReady
}

async function ensureAacEncoder(): Promise<void> {
  if (!aacEncoderReady) {
    aacEncoderReady = (async () => {
      const { canEncodeAudio } = await import('mediabunny')
      if (!(await canEncodeAudio('aac'))) {
        const { registerAacEncoder } = await import('@mediabunny/aac-encoder')
        registerAacEncoder()
      }
    })()
  }
  return aacEncoderReady
}

function concatChunks(parts: Uint8Array[]): Uint8Array {
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

export function downmixToMono(buffer: AudioBuffer): AudioBuffer {
  if (buffer.numberOfChannels <= 1) return buffer
  const length = buffer.length
  const sampleRate = buffer.sampleRate
  const n = buffer.numberOfChannels
  const ac = new OfflineAudioContext(1, length, sampleRate)
  const mono = ac.createBuffer(1, length, sampleRate)
  const out = mono.getChannelData(0)
  for (let i = 0; i < length; i++) {
    let sum = 0
    for (let c = 0; c < n; c++) sum += buffer.getChannelData(c)[i]!
    out[i] = sum / n
  }
  return mono
}

/** Encode an AudioBuffer to stereo AAC in an M4A container. */
export async function encodeAudioBufferToM4a(
  buffer: AudioBuffer,
  opts: EncodeOptions = {},
): Promise<Uint8Array> {
  const quality = opts.quality ?? 'standard'
  const source = opts.mono ? downmixToMono(buffer) : buffer
  await ensureAacEncoder()
  const { Output, BufferTarget, Mp4OutputFormat, AudioBufferSource } = await import('mediabunny')
  const target = new BufferTarget()
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
    target,
  })
  const track = new AudioBufferSource({
    codec: 'aac',
    bitrate: aacBitrate(quality),
  })
  output.addAudioTrack(track)
  await output.start()
  await track.add(source)
  track.close()
  await output.finalize()
  const buf = target.buffer
  if (!buf) throw new Error('AAC M4A encode produced no output')
  return new Uint8Array(buf)
}

/** Encode an AudioBuffer to Opus in an Ogg container (preferred for on-device storage). */
export async function encodeAudioBufferToOggOpus(
  buffer: AudioBuffer,
  opts: EncodeOptions = {},
): Promise<Uint8Array> {
  const quality = opts.quality ?? 'standard'
  const source = opts.mono ? downmixToMono(buffer) : buffer
  const { canEncodeAudio, Output, BufferTarget, OggOutputFormat, AudioBufferSource } =
    await import('mediabunny')
  if (!(await canEncodeAudio('opus'))) {
    throw new Error('Opus encoding is not supported in this browser')
  }
  const target = new BufferTarget()
  const output = new Output({
    format: new OggOutputFormat(),
    target,
  })
  const track = new AudioBufferSource({
    codec: 'opus',
    bitrate: opusBitrate(quality),
  })
  output.addAudioTrack(track)
  await output.start()
  await track.add(source)
  track.close()
  await output.finalize()
  const buf = target.buffer
  if (!buf) throw new Error('Opus Ogg encode produced no output')
  return new Uint8Array(buf)
}

/** Encode an AudioBuffer to MP3 (LAME VBR) or Ogg Vorbis. Stereo by default. */
export async function encodeAudioBuffer(
  buffer: AudioBuffer,
  format: 'mp3' | 'ogg',
  opts: EncodeOptions = {},
): Promise<Uint8Array> {
  const quality = opts.quality ?? 'standard'
  const source = opts.mono ? downmixToMono(buffer) : buffer
  const channels = Math.min(2, Math.max(1, source.numberOfChannels))
  const encoder = await getEncoder(format)
  encoder.configure({
    sampleRate: source.sampleRate,
    channels,
    vbrQuality: format === 'mp3' ? mp3VbrQuality(quality) : oggVbrQuality(quality),
  })

  const chans: Float32Array[] = []
  for (let c = 0; c < channels; c++) {
    chans.push(source.getChannelData(c))
  }

  const block = 1152 * 40
  const parts: Uint8Array[] = []
  for (let i = 0; i < source.length; i += block) {
    const end = Math.min(source.length, i + block)
    const slice = chans.map((ch) => ch.subarray(i, end))
    const chunk = encoder.encode(slice)
    if (chunk.byteLength) parts.push(chunk.slice())
  }
  const tail = encoder.finalize()
  if (tail.byteLength) parts.push(tail.slice())
  return concatChunks(parts)
}

async function decodeBytes(input: Uint8Array): Promise<AudioBuffer> {
  assertDecodableAudioBytes(input)
  const ctx = new AudioContext()
  try {
    const ab = new ArrayBuffer(input.byteLength)
    new Uint8Array(ab).set(input)
    return await ctx.decodeAudioData(ab)
  } finally {
    await ctx.close()
  }
}

export async function encodeDecodedBytes(
  input: Uint8Array,
  format: DownloadFormat,
  opts: EncodeOptions = {},
): Promise<Uint8Array> {
  const decoded = await decodeBytes(input)
  if (format === 'm4a') return encodeAudioBufferToM4a(decoded, opts)
  if (format === 'ogg-opus') return encodeAudioBufferToOggOpus(decoded, opts)
  return encodeAudioBuffer(decoded, format, opts)
}
