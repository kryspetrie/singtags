/**
 * Offline take level processing: peak normalize and compress + auto-makeup.
 */
import { audioBufferToWav } from '../download/transform'
import { channelPeak } from './analyzeTone'
import { assertDecodableAudioBytes } from './audioBytes'
import { getSharedAudioContext, resumeAudioContextBestEffort } from './channelSolo'
import { decodeAudioBytes } from './cropAudioBuffer'
import { OUTPUT_HEADROOM } from './playerUtils'

export type TakeLevelProcessResult = {
  bytes: Uint8Array
  durationSec: number
  sampleRate: number
  channels: number
  /** Peak before processing (linear). */
  peakBefore: number
  /** Peak after processing (linear). */
  peakAfter: number
  /** Makeup / normalize gain applied after dynamics (linear). */
  gainApplied: number
  mode?: TakeCompressMode
  intensity?: TakeCompressIntensity
}

/** Character of the compressor envelope / curve. */
export type TakeCompressMode = 'gentle' | 'vocal' | 'punch' | 'broadcast'

/**
 * How hard the chosen mode digs in.
 * Prefer 0..1 (slider). Legacy 'light'|'medium'|'heavy' still accepted.
 */
export type TakeCompressIntensity = number | 'light' | 'medium' | 'heavy'

export type TakeCompressSettings = {
  thresholdDb: number
  kneeDb: number
  ratio: number
  attackSec: number
  releaseSec: number
}

export const TAKE_COMPRESS_MODE_OPTIONS: Array<{
  value: TakeCompressMode
  label: string
  hint: string
}> = [
  { value: 'gentle', label: 'Gentle', hint: 'Transparent leveling; keeps natural dynamics' },
  { value: 'vocal', label: 'Vocal', hint: 'Balanced for sung takes and phrases' },
  { value: 'punch', label: 'Punch', hint: 'Faster attack for presence and edge' },
  { value: 'broadcast', label: 'Broadcast', hint: 'Heavier evening for dense, consistent loudness' },
]

const MODE_BASE: Record<
  TakeCompressMode,
  Omit<TakeCompressSettings, 'thresholdDb' | 'ratio'> & {
    thresholdDb: number
    ratio: number
  }
> = {
  gentle: { thresholdDb: -16, kneeDb: 18, ratio: 2, attackSec: 0.025, releaseSec: 0.28 },
  vocal: { thresholdDb: -18, kneeDb: 12, ratio: 3, attackSec: 0.012, releaseSec: 0.18 },
  punch: { thresholdDb: -14, kneeDb: 6, ratio: 4, attackSec: 0.003, releaseSec: 0.1 },
  broadcast: { thresholdDb: -22, kneeDb: 10, ratio: 5, attackSec: 0.008, releaseSec: 0.22 },
}

const INTENSITY_LIGHT = { thresholdDeltaDb: 4, ratioMul: 0.75 }
const INTENSITY_HEAVY = { thresholdDeltaDb: -5, ratioMul: 1.45 }

/** Map legacy labels / clamp slider values to 0..1. */
export function normalizeCompressIntensity(intensity: TakeCompressIntensity = 0.5): number {
  if (intensity === 'light') return 0
  if (intensity === 'medium') return 0.5
  if (intensity === 'heavy') return 1
  if (!Number.isFinite(intensity)) return 0.5
  return Math.max(0, Math.min(1, intensity))
}

/** Resolve DynamicsCompressor params for mode + intensity. Always pair with auto-makeup. */
export function resolveTakeCompressSettings(
  mode: TakeCompressMode = 'vocal',
  intensity: TakeCompressIntensity = 0.5,
): TakeCompressSettings {
  const base = MODE_BASE[mode] ?? MODE_BASE.vocal
  const t = normalizeCompressIntensity(intensity)
  const thresholdDeltaDb =
    INTENSITY_LIGHT.thresholdDeltaDb +
    t * (INTENSITY_HEAVY.thresholdDeltaDb - INTENSITY_LIGHT.thresholdDeltaDb)
  const ratioMul =
    INTENSITY_LIGHT.ratioMul + t * (INTENSITY_HEAVY.ratioMul - INTENSITY_LIGHT.ratioMul)
  const thresholdDb = Math.max(-48, Math.min(-6, base.thresholdDb + thresholdDeltaDb))
  const ratio = Math.max(1.2, Math.min(12, base.ratio * ratioMul))
  return {
    thresholdDb,
    kneeDb: base.kneeDb,
    ratio,
    attackSec: base.attackSec,
    releaseSec: base.releaseSec,
  }
}

function bufferPeak(buf: AudioBuffer): number {
  let peak = 0
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    peak = Math.max(peak, channelPeak(buf.getChannelData(ch)))
  }
  return peak
}

function copyBuffer(ctx: BaseAudioContext, src: AudioBuffer): AudioBuffer {
  const out = ctx.createBuffer(src.numberOfChannels, src.length, src.sampleRate)
  for (let ch = 0; ch < src.numberOfChannels; ch++) {
    out.getChannelData(ch).set(src.getChannelData(ch))
  }
  return out
}

function scaleBufferInPlace(buf: AudioBuffer, gain: number): void {
  if (gain === 1) return
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const data = buf.getChannelData(ch)
    for (let i = 0; i < data.length; i++) data[i]! *= gain
  }
}

/**
 * Peak-normalize so the loudest sample lands near OUTPUT_HEADROOM (~-0.1 dBFS).
 * Quiet takes get louder; already-hot takes only trim slightly if over headroom.
 */
export function normalizeAudioBuffer(
  buffer: AudioBuffer,
  targetPeak = OUTPUT_HEADROOM,
): { buffer: AudioBuffer; gain: number; peakBefore: number; peakAfter: number } {
  const ctx = getSharedAudioContext()
  const out = copyBuffer(ctx, buffer)
  const peakBefore = bufferPeak(out)
  if (peakBefore < 1e-6) {
    return { buffer: out, gain: 1, peakBefore, peakAfter: peakBefore }
  }
  const gain = targetPeak / peakBefore
  scaleBufferInPlace(out, gain)
  return { buffer: out, gain, peakBefore, peakAfter: bufferPeak(out) }
}

/**
 * Compress via OfflineAudioContext DynamicsCompressor, then auto-makeup
 * (peak normalize to OUTPUT_HEADROOM) so average level comes back up.
 */
export async function compressAudioBuffer(
  buffer: AudioBuffer,
  opts?: {
    mode?: TakeCompressMode
    intensity?: TakeCompressIntensity
    /** Override resolved settings (tests / advanced). */
    settings?: Partial<TakeCompressSettings>
    /** Auto-makeup after compress (default true). */
    autoMakeup?: boolean
  },
): Promise<{
  buffer: AudioBuffer
  peakBefore: number
  peakAfter: number
  gain: number
  settings: TakeCompressSettings
  mode: TakeCompressMode
  intensity: TakeCompressIntensity
}> {
  const mode = opts?.mode ?? 'vocal'
  const intensity = normalizeCompressIntensity(opts?.intensity ?? 0.5)
  const resolved = { ...resolveTakeCompressSettings(mode, intensity), ...opts?.settings }
  const autoMakeup = opts?.autoMakeup !== false
  const peakBefore = bufferPeak(buffer)

  const offline = new OfflineAudioContext(
    buffer.numberOfChannels,
    buffer.length,
    buffer.sampleRate,
  )
  const src = offline.createBufferSource()
  src.buffer = buffer
  const comp = offline.createDynamicsCompressor()
  comp.threshold.value = resolved.thresholdDb
  comp.knee.value = resolved.kneeDb
  comp.ratio.value = resolved.ratio
  comp.attack.value = resolved.attackSec
  comp.release.value = resolved.releaseSec
  src.connect(comp)
  comp.connect(offline.destination)
  src.start(0)
  let rendered = await offline.startRendering()
  let gain = 1
  if (autoMakeup) {
    const n = normalizeAudioBuffer(rendered)
    rendered = n.buffer
    gain = n.gain
  }
  return {
    buffer: rendered,
    peakBefore,
    peakAfter: bufferPeak(rendered),
    gain,
    settings: resolved,
    mode,
    intensity,
  }
}

/** @deprecated Prefer compressAudioBuffer */
export async function softCompressAudioBuffer(
  buffer: AudioBuffer,
  opts?: {
    thresholdDb?: number
    kneeDb?: number
    ratio?: number
    attackSec?: number
    releaseSec?: number
    normalizeAfter?: boolean
  },
): Promise<{ buffer: AudioBuffer; peakBefore: number; peakAfter: number; gain: number }> {
  const result = await compressAudioBuffer(buffer, {
    autoMakeup: opts?.normalizeAfter !== false,
    settings: {
      thresholdDb: opts?.thresholdDb,
      kneeDb: opts?.kneeDb,
      ratio: opts?.ratio,
      attackSec: opts?.attackSec,
      releaseSec: opts?.releaseSec,
    },
  })
  return {
    buffer: result.buffer,
    peakBefore: result.peakBefore,
    peakAfter: result.peakAfter,
    gain: result.gain,
  }
}

export async function normalizeTakeBytesToWav(
  input: ArrayBuffer | Uint8Array,
): Promise<TakeLevelProcessResult> {
  assertDecodableAudioBytes(input)
  const ctx = getSharedAudioContext()
  await resumeAudioContextBestEffort(ctx)
  const decoded = await decodeAudioBytes(input)
  const { buffer, gain, peakBefore, peakAfter } = normalizeAudioBuffer(decoded)
  return {
    bytes: audioBufferToWav(buffer),
    durationSec: buffer.duration,
    sampleRate: buffer.sampleRate,
    channels: buffer.numberOfChannels,
    peakBefore,
    peakAfter,
    gainApplied: gain,
  }
}

export async function compressTakeBytesToWav(
  input: ArrayBuffer | Uint8Array,
  opts?: { mode?: TakeCompressMode; intensity?: TakeCompressIntensity },
): Promise<TakeLevelProcessResult> {
  assertDecodableAudioBytes(input)
  const ctx = getSharedAudioContext()
  await resumeAudioContextBestEffort(ctx)
  const decoded = await decodeAudioBytes(input)
  const { buffer, peakBefore, peakAfter, gain, mode, intensity } = await compressAudioBuffer(
    decoded,
    { mode: opts?.mode, intensity: opts?.intensity, autoMakeup: true },
  )
  return {
    bytes: audioBufferToWav(buffer),
    durationSec: buffer.duration,
    sampleRate: buffer.sampleRate,
    channels: buffer.numberOfChannels,
    peakBefore,
    peakAfter,
    gainApplied: gain,
    mode,
    intensity,
  }
}

/** @deprecated Prefer compressTakeBytesToWav */
export async function softCompressTakeBytesToWav(
  input: ArrayBuffer | Uint8Array,
): Promise<TakeLevelProcessResult> {
  return compressTakeBytesToWav(input, { mode: 'vocal', intensity: 'medium' })
}
