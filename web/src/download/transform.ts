import type { AudioTransform, AudioEncodeQuality, DownloadFormat } from '../types/audio'
import { isIdentityTransform, transformFilenameSuffix } from '../types/audio'
import { processOfflineTransform } from '../audio/bakeClient'
import { encodeAudioBuffer, encodeAudioBufferToM4a, encodeAudioBufferToOggOpus, encodeDecodedBytes } from './encode'

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

async function decodeBytes(data: Uint8Array): Promise<AudioBuffer> {
  const ctx = new AudioContext()
  try {
    const ab = new ArrayBuffer(data.byteLength)
    new Uint8Array(ab).set(data)
    return await ctx.decodeAudioData(ab)
  } finally {
    await ctx.close()
  }
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

export interface PrepareDownloadOptions {
  input: Uint8Array
  format: DownloadFormat
  transform?: AudioTransform
  signal?: AbortSignal
  sourceRevision?: string
  /**
   * Compression when re-encoding.
   * For M4A: `original` keeps hosted bytes (identity only); otherwise stereo AAC.
   */
  encodeQuality?: AudioEncodeQuality
}

export async function prepareDownloadBytes(opts: PrepareDownloadOptions): Promise<Uint8Array> {
  const { input, format, transform, signal, encodeQuality = 'original', sourceRevision } = opts
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

  const outFormat = resolveOutputFormat(format, transform)
  const identity = isIdentityTransform(transform)
  const reencodeQuality: Exclude<AudioEncodeQuality, 'original'> =
    encodeQuality === 'original' ? 'standard' : encodeQuality
  const encOpts = { quality: reencodeQuality }

  // Identity: original-byte passthrough for hosted M4A at original quality.
  if (identity && outFormat === 'm4a' && encodeQuality === 'original') return input
  // MP3/OGG always encode; M4A with non-original quality re-encodes AAC.
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
    throw new Error('Pitch/speed transform unavailable; try Original download.')
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

export function downloadFilename(
  part: string,
  format: DownloadFormat,
  transform?: AudioTransform,
): string {
  const ext = resolveOutputFormat(format, transform)
  return `${part}${transformFilenameSuffix(transform ?? { pitchSemitones: 0, speed: 1 })}.${ext}`
}
