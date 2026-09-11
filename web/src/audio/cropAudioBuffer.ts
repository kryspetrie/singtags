/**
 * Slice an AudioBuffer to [startSec, endSec) and encode as WAV bytes.
 */
import { audioBufferToWav } from '../download/transform'
import { getSharedAudioContext, resumeAudioContextBestEffort } from './channelSolo'
import { assertDecodableAudioBytes } from './audioBytes'

export async function decodeAudioBytes(data: ArrayBuffer | Uint8Array): Promise<AudioBuffer> {
  const { decodeAudioDataExclusive } = await import('./decodeLock')
  const ab = data instanceof ArrayBuffer ? data.slice(0) : data.slice().buffer
  return decodeAudioDataExclusive(ab)
}

/**
 * Crop decoded audio to the given region (seconds on the buffer timeline).
 * Returns 16-bit PCM WAV bytes and duration.
 */
export function cropAudioBufferToWav(
  buffer: AudioBuffer,
  startSec: number,
  endSec: number,
): { bytes: Uint8Array; durationSec: number; sampleRate: number; channels: number } {
  const sr = buffer.sampleRate
  const start = Math.max(0, Math.min(buffer.length, Math.floor(startSec * sr)))
  const end = Math.max(start + 1, Math.min(buffer.length, Math.ceil(endSec * sr)))
  const length = end - start
  const channels = buffer.numberOfChannels
  const ctx = getSharedAudioContext()
  const out = ctx.createBuffer(channels, length, sr)
  for (let ch = 0; ch < channels; ch++) {
    const src = buffer.getChannelData(ch)
    out.getChannelData(ch).set(src.subarray(start, end))
  }
  return {
    bytes: audioBufferToWav(out),
    durationSec: length / sr,
    sampleRate: sr,
    channels,
  }
}

/** Decode raw take bytes, crop, return WAV. */
export async function cropTakeBytesToWav(
  input: ArrayBuffer | Uint8Array,
  startSec: number,
  endSec: number,
): Promise<{ bytes: Uint8Array; durationSec: number; sampleRate: number; channels: number }> {
  assertDecodableAudioBytes(input instanceof ArrayBuffer ? input : input.buffer)
  const ctx = getSharedAudioContext()
  await resumeAudioContextBestEffort(ctx)
  const decoded = await decodeAudioBytes(input)
  if (endSec - startSec < 0.05) throw new Error('Selection too short to crop')
  return cropAudioBufferToWav(decoded, startSec, endSec)
}
