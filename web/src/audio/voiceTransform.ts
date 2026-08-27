/**
 * Offline pitch/speed bake — WSOLA stretch + formant pitch shift.
 * Pure Float32Array DSP (worker-safe). Playback always uses rate 1.
 *
 * Selected pipeline (Phase 2): stretch then pitch; same opts on L/R.
 * Algorithm id/version recorded in transformContract.
 */
import wsola from '@audio/stretch-wsola'
import formant from '@audio/shift-formant'
import {
  canonicalizeTransform,
  expectedFrames,
  isCanonicalIdentity,
  normalizeToFrameCount,
  stretchFactor,
  type CanonicalTransform,
} from './transformContract'
import { createAudioBuffer } from './audioBufferFactory'

export type ChannelArrays = Float32Array[]

export type BakeResult = {
  channels: ChannelArrays
  sampleRate: number
  peakL: number
  peakR: number
}

function peakOf(data: Float32Array): number {
  let p = 0
  for (let i = 0; i < data.length; i++) {
    const a = Math.abs(data[i]!)
    if (a > p) p = a
  }
  return p
}

function assertFinite(data: Float32Array, label: string): void {
  for (let i = 0; i < data.length; i++) {
    if (!Number.isFinite(data[i]!)) {
      throw new Error(`${label}: non-finite sample at ${i}`)
    }
  }
}

function stretchChannel(data: Float32Array, factor: number): Float32Array {
  if (Math.abs(factor - 1) < 1e-9) return new Float32Array(data)
  return wsola(data, { factor }) as Float32Array
}

function pitchChannel(
  data: Float32Array,
  semitones: number,
  sampleRate: number,
): Float32Array {
  if (Math.abs(semitones) < 1e-6) return new Float32Array(data)
  return formant(data, { semitones, sampleRate }) as Float32Array
}

/**
 * Transform channel arrays in place of AudioBuffer (worker path).
 * Always starts from original channels; never chains prior bakes.
 * `isCancelled` is checked between DSP stages (not mid-kernel).
 */
export function bakeChannels(
  channels: ChannelArrays,
  sampleRate: number,
  transform: CanonicalTransform,
  opts?: { isCancelled?: () => boolean },
): BakeResult {
  const checkCancel = (): void => {
    if (opts?.isCancelled?.()) throw new DOMException('Aborted', 'AbortError')
  }
  checkCancel()

  const t = canonicalizeTransform(transform.pitchSemitones, transform.speed)
  if (channels.length < 1 || channels.length > 2) {
    throw new Error(`Unsupported channel count ${channels.length}`)
  }
  for (let c = 0; c < channels.length; c++) {
    assertFinite(channels[c]!, `input[${c}]`)
  }

  if (isCanonicalIdentity(t)) {
    const copies = channels.map((ch) => new Float32Array(ch))
    return {
      channels: copies,
      sampleRate,
      peakL: peakOf(copies[0]!),
      peakR: peakOf(copies[Math.min(1, copies.length - 1)]!),
    }
  }

  const inputFrames = channels[0]!.length
  const target = expectedFrames(inputFrames, t.speed)
  const factor = stretchFactor(t.speed)

  // Stretch first (tempo), then pitch (same length). Linked opts for L/R.
  const stretched: Float32Array[] = []
  for (let c = 0; c < channels.length; c++) {
    checkCancel()
    const out = stretchChannel(channels[c]!, factor)
    stretched.push(normalizeToFrameCount(out, target))
  }

  checkCancel()
  const pitched: Float32Array[] = []
  if (Math.abs(t.pitchSemitones) < 1e-6) {
    pitched.push(...stretched)
  } else {
    for (let c = 0; c < stretched.length; c++) {
      checkCancel()
      const out = pitchChannel(stretched[c]!, t.pitchSemitones, sampleRate)
      pitched.push(normalizeToFrameCount(out, target))
    }
  }

  checkCancel()
  for (let c = 0; c < pitched.length; c++) {
    assertFinite(pitched[c]!, `output[${c}]`)
    if (pitched[c]!.length !== target) {
      throw new Error(`Frame contract violated: got ${pitched[c]!.length}, want ${target}`)
    }
  }

  return {
    channels: pitched,
    sampleRate,
    peakL: peakOf(pitched[0]!),
    peakR: peakOf(pitched[Math.min(1, pitched.length - 1)]!),
  }
}

/** Main-thread convenience: bake an AudioBuffer (tests / download without worker). */
export function bakeAudioBufferSync(
  input: AudioBuffer,
  pitchSemitones: number,
  speed: number,
): AudioBuffer | null {
  try {
    const t = canonicalizeTransform(pitchSemitones, speed)
    if (isCanonicalIdentity(t)) return input
    const chans: Float32Array[] = []
    const n = Math.min(2, input.numberOfChannels)
    for (let c = 0; c < n; c++) chans.push(new Float32Array(input.getChannelData(c)))
    const result = bakeChannels(chans, input.sampleRate, t)
    const buf = createAudioBuffer(
      result.channels.length,
      result.channels[0]!.length,
      result.sampleRate,
    )
    for (let c = 0; c < result.channels.length; c++) {
      buf.copyToChannel(result.channels[c]! as Float32Array<ArrayBuffer>, c)
    }
    return buf
  } catch (err) {
    console.warn('[voiceTransform] bake failed', err)
    return null
  }
}
