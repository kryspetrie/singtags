/**
 * Shared Web Audio context, WAV encoding, and solo-channel extraction.
 * Learning tracks use hard L/R panning elsewhere; this module isolates one channel
 * from stereo sources and reuses a single `AudioContext` to avoid browser limits.
 */
import { assertDecodableAudioBytes } from './audioBytes'

/** Playback routing: full stereo, left channel only, or right channel only. */
export type SoloMode = 'stereo' | 'left' | 'right'

let sharedCtx: AudioContext | null = null

/** Lazily create the app-wide decode/mix `AudioContext` (one per session). */
export function getSharedAudioContext(): AudioContext {
  if (!sharedCtx) sharedCtx = new AudioContext()
  return sharedCtx
}

/**
 * Resume without blocking forever — browsers often leave AudioContext suspended
 * until a user gesture, and `await resume()` can hang during tag-page warm-up.
 * decodeAudioData still works while suspended in modern Chromium/Firefox.
 */
export async function resumeAudioContextBestEffort(
  ctx: AudioContext = getSharedAudioContext(),
  timeoutMs = 50,
): Promise<void> {
  if (ctx.state !== 'suspended') return
  try {
    await Promise.race([
      ctx.resume().then(() => undefined),
      new Promise<void>((resolve) => {
        setTimeout(resolve, timeoutMs)
      }),
    ])
  } catch {
    /* ignore — decode may still succeed while suspended */
  }
}

/** @internal test helper */
export function resetSharedAudioContextForTests(): void {
  sharedCtx = null
}

/** Encode mono or stereo AudioBuffer as a WAV Blob. */
export function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numChannels = Math.min(2, Math.max(1, buffer.numberOfChannels))
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
  const chans: Float32Array[] = []
  for (let c = 0; c < numChannels; c++) chans.push(buffer.getChannelData(c))
  for (let i = 0; i < length; i++) {
    for (let c = 0; c < numChannels; c++) {
      const s = Math.max(-1, Math.min(1, chans[c]![i]!))
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
      offset += 2
    }
  }
  return new Blob([array], { type: 'audio/wav' })
}

/**
 * Fetch stereo audio, extract one channel to mono WAV, return a blob object URL.
 * Caller must `URL.revokeObjectURL` when done.
 */
export async function soloChannelToObjectUrl(
  audioUrl: string,
  channel: 'left' | 'right',
): Promise<string> {
  const ctx = getSharedAudioContext()
  await resumeAudioContextBestEffort(ctx)
  const res = await fetch(audioUrl)
  if (!res.ok) throw new Error(`Failed to fetch audio (${res.status})`)
  const buf = await res.arrayBuffer()
  assertDecodableAudioBytes(buf)
  const { decodeAudioDataExclusive } = await import('./decodeLock')
  const decoded = await decodeAudioDataExclusive(buf)
  const idx = channel === 'left' ? 0 : Math.min(1, decoded.numberOfChannels - 1)
  const data = decoded.getChannelData(idx)
  const mono = ctx.createBuffer(1, decoded.length, decoded.sampleRate)
  mono.copyToChannel(data, 0)
  const wav = audioBufferToWavBlob(mono)
  return URL.createObjectURL(wav)
}
