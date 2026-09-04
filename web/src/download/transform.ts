/**
 * Per-track download pipeline: decode, optional pitch/speed transform, re-encode.
 * `original` quality keeps published source bytes (usually MP3) when no transform is applied.
 * M4A downloads re-encode that source to AAC at {@link DOWNLOAD_AAC_BITRATE}.
 */

import type { AudioTransform, AudioEncodeQuality, DownloadFormat } from '../types/audio'
import { DOWNLOAD_AAC_BITRATE, isIdentityTransform, transformFilenameSuffix } from '../types/audio'
import { processOfflineTransform } from '../audio/bakeClient'
import { encodeAudioBuffer, encodeAudioBufferToM4a, encodeAudioBufferToOggOpus, encodeDecodedBytes } from './encode'

/** Encode an {@link AudioBuffer} as 16-bit PCM WAV bytes. */
export function audioBufferToWav(buffer: AudioBuffer): Uint8Array {
  const numChannels = buffer.numberOfChannels
  const sampleRate = buffer.sampleRate
  const length = buffer.length
  const dataSize = length * numChannels * 2
  const array = new ArrayBuffer(44 + dataSize)
  const view = new DataView(array)
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i))
  }
  writeStr(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * numChannels * 2, true)
  view.setUint16(32, numChannels * 2, true)
  view.setUint16(34, 16, true)
  writeStr(36, 'data')
  view.setUint32(40, dataSize, true)
  let offset = 44
  for (let i = 0; i < length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const s = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i]!))
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
      offset += 2
    }
  }
  return new Uint8Array(array)
}

/** Decode raw audio bytes (serialized; OfflineAudioContext for download transforms). */
async function decodeBytes(data: Uint8Array): Promise<AudioBuffer> {
  const { decodeAudioDataExclusive } = await import('../audio/decodeLock')
  const ab = new ArrayBuffer(data.byteLength)
  new Uint8Array(ab).set(data)
  return await decodeAudioDataExclusive(ab, { offlineSampleRate: 48_000 })
}

/**
 * Prefer keeping the chosen container. Pitch/speed + M4A re-encodes to AAC when possible;
 * WAV is only a last-resort fallback inside prepareDownloadBytes if AAC encode fails.
 */
export function resolveOutputFormat(
  format: DownloadFormat,
  _transform?: AudioTransform,
): DownloadFormat {
  return format
}

/** Options for {@link prepareDownloadBytes}. */
export interface PrepareDownloadOptions {
  input: Uint8Array
  format: DownloadFormat
  transform?: AudioTransform
  signal?: AbortSignal
  sourceRevision?: string
  /**
   * Compression when re-encoding.
   * `original` + identity keeps published source bytes; otherwise re-encodes.
   */
  encodeQuality?: AudioEncodeQuality
}

/**
 * Fetch, optionally transform, and encode one media file for download or zip.
 * @throws When pitch/speed is requested but the offline bake path is unavailable.
 */
export async function prepareDownloadBytes(opts: PrepareDownloadOptions): Promise<Uint8Array> {
  const { input, format, transform, signal, encodeQuality = 'original', sourceRevision } = opts
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

  const outFormat = resolveOutputFormat(format, transform)
  const identity = isIdentityTransform(transform)
  const reencodeQuality: Exclude<AudioEncodeQuality, 'original'> =
    encodeQuality === 'original' ? 'standard' : encodeQuality
  const encOpts = {
    quality: reencodeQuality,
    ...(outFormat === 'm4a' ? { bitrate: DOWNLOAD_AAC_BITRATE } : {}),
  }

  // Identity + original: keep published source bytes (almost always MP3).
  if (identity && encodeQuality === 'original') return input
  // Re-encode to the requested container (M4A → 96 kbps AAC; MP3/OGG via wasm encoders).
  if (identity && (outFormat === 'mp3' || outFormat === 'ogg' || outFormat === 'm4a')) {
    return encodeDecodedBytes(input, outFormat, encOpts)
  }

  const decoded = await decodeBytes(input)
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

  const t = transform ?? { pitchSemitones: 0, speed: 1 }
  const processed = await processOfflineTransform(decoded, t.pitchSemitones, t.speed, {
    signal,
    sourceRevision: sourceRevision ?? 'download',
  })
  if (!processed) {
    throw new Error('Pitch/speed transform unavailable; try Original (as published) download.')
  }
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

  if (outFormat === 'm4a') {
    try {
      return await encodeAudioBufferToM4a(processed, encOpts)
    } catch {
      return audioBufferToWav(processed)
    }
  }
  if (outFormat === 'ogg-opus') {
    return encodeAudioBufferToOggOpus(processed, encOpts)
  }
  return encodeAudioBuffer(processed, outFormat as 'mp3' | 'ogg', encOpts)
}

/** Suggested filename for a downloaded part (includes transform suffix when non-identity). */
export function downloadFilename(
  part: string,
  format: DownloadFormat,
  transform?: AudioTransform,
): string {
  const ext = resolveOutputFormat(format, transform)
  return `${part}${transformFilenameSuffix(transform ?? { pitchSemitones: 0, speed: 1 })}.${ext}`
}
