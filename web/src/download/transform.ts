import type { AudioTransform, AudioEncodeQuality, DownloadFormat } from '../types/audio'
import { isIdentityTransform, transformFilenameSuffix } from '../types/audio'
import { processOfflineTransform } from '../audio/soundtouch'
import { encodeAudioBuffer, encodeAudioBufferToMp4, encodeDecodedBytes } from './encode'

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
 * Prefer keeping the chosen container. Pitch/speed + MP4 re-encodes to AAC when possible;
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
  /**
   * Compression when re-encoding.
   * For MP4: `original` keeps hosted bytes (identity only); otherwise stereo AAC.
   */
  encodeQuality?: AudioEncodeQuality
}

export async function prepareDownloadBytes(opts: PrepareDownloadOptions): Promise<Uint8Array> {
  const { input, format, transform, signal, encodeQuality = 'original' } = opts
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

  const outFormat = resolveOutputFormat(format, transform)
  const identity = isIdentityTransform(transform)
  const reencodeQuality: Exclude<AudioEncodeQuality, 'original'> =
    encodeQuality === 'original' ? 'standard' : encodeQuality
  const encOpts = { quality: reencodeQuality }

  // Hosted MP4 passthrough only when quality is original and no pitch/speed bake.
  if (identity && outFormat === 'mp4' && encodeQuality === 'original') return input
  // MP3/OGG always encode; MP4 with non-original quality re-encodes AAC.
  if (identity && (outFormat === 'mp3' || outFormat === 'ogg' || outFormat === 'mp4')) {
    return encodeDecodedBytes(input, outFormat, encOpts)
  }

  const decoded = await decodeBytes(input)
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

  const t = transform ?? { pitchSemitones: 0, speed: 1 }
  const processed = await processOfflineTransform(decoded, t.pitchSemitones, t.speed)
  if (!processed) {
    throw new Error('SoundTouch offline transform unavailable; try Original download.')
  }
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

  if (outFormat === 'mp4') {
    try {
      return await encodeAudioBufferToMp4(processed, encOpts)
    } catch {
      return audioBufferToWav(processed)
    }
  }
  return encodeAudioBuffer(processed, outFormat, encOpts)
}

export function downloadFilename(
  part: string,
  format: DownloadFormat,
  transform?: AudioTransform,
): string {
  const ext = resolveOutputFormat(format, transform)
  return `${part}${transformFilenameSuffix(transform ?? { pitchSemitones: 0, speed: 1 })}.${ext}`
}
