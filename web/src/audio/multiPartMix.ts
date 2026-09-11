/**
 * Combine multiple learning-track solos into one stereo mix.
 * Each part: extract solo channel from file, pan with equal-power (−1…+1).
 */

import { audioBufferToWavBlob, getSharedAudioContext, resumeAudioContextBestEffort } from './channelSolo'
import { equalPowerPanGains } from './partLeftReconstruct'
import type { PartSide } from '../lib/audioLayout'
import { assertDecodableAudioBytes } from './audioBytes'

/** Hard L / Hard R / Custom continuous pan (−1…+1 when custom). */
export type MixPanMode = 'left' | 'right' | 'custom'

export interface MixPanSetting {
  mode: MixPanMode
  /** Continuous pan used when mode is `custom` (−1 = full L, +1 = full R). */
  value: number
}

/** One learning part fed into a custom mix. */
export interface MixPartInput {
  url: string
  /** Which channel of the source file holds the solo voice. */
  soloInFile: PartSide
  /** Output pan (−1…+1). Hard L/R are ±1. */
  pan: number
}

/** Stereo WAV object URL plus timing metadata from {@link buildSoloMixObjectUrl}. */
export interface SoloMixResult {
  url: string
  sampleRate: number
  length: number
}

const OUTPUT_HEADROOM = 0.99

function peakOf(data: Float32Array): number {
  let peak = 0
  const step = data.length > 500_000 ? 4 : 1
  for (let i = 0; i < data.length; i += step) {
    const a = Math.abs(data[i]!)
    if (a > peak) peak = a
  }
  return peak
}

/** @deprecated Prefer equal-power pan; kept for older tests / hard-side attenuation notes. */
export function sideVoiceGain(voicesOnSide: number): number {
  if (voicesOnSide <= 1) return 1
  return 1 / voicesOnSide
}

export function clampMixPanValue(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.max(-1, Math.min(1, n))
}

export function normalizeMixPanSetting(raw: unknown): MixPanSetting {
  if (raw === 'left') return { mode: 'left', value: -1 }
  if (raw === 'right') return { mode: 'right', value: 1 }
  if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>
    if (o.mode === 'left') return { mode: 'left', value: -1 }
    if (o.mode === 'right') return { mode: 'right', value: 1 }
    if (o.mode === 'custom') {
      return { mode: 'custom', value: clampMixPanValue(typeof o.value === 'number' ? o.value : 0) }
    }
  }
  return { mode: 'left', value: -1 }
}

/** Resolve a mix-pan setting to a continuous −1…+1 position. */
export function mixPanPosition(setting: MixPanSetting): number {
  if (setting.mode === 'left') return -1
  if (setting.mode === 'right') return 1
  return clampMixPanValue(setting.value)
}

/**
 * Default pan when the user checks a part into the custom track.
 * First selection → Hard L; every later selection → Hard R.
 */
export function defaultMixPanForNextSelection(alreadySelectedCount: number): MixPanSetting {
  return alreadySelectedCount <= 0
    ? { mode: 'left', value: -1 }
    : { mode: 'right', value: 1 }
}

/**
 * Channel index in a decoded buffer for “solo in file” Part L / Part R.
 * Mono files always use channel 0.
 */
export function soloInFileChannelIndex(
  soloInFile: PartSide,
  numberOfChannels: number,
): number {
  if (numberOfChannels < 2) return 0
  return soloInFile === 'left' ? 0 : 1
}

/**
 * Decode parts, extract solo channels, pan continuously, return a stereo WAV object URL.
 * Caller must revoke the URL when done.
 */
export async function buildSoloMixObjectUrl(parts: MixPartInput[]): Promise<SoloMixResult> {
  if (parts.length < 2) throw new Error('Need at least two parts to combine')

  const ctx = getSharedAudioContext()
  await resumeAudioContextBestEffort(ctx)

  const decoded: AudioBuffer[] = []
  for (const p of parts) {
    const res = await fetch(p.url)
    if (!res.ok) throw new Error(`Failed to fetch audio (${res.status})`)
    const buf = await res.arrayBuffer()
    assertDecodableAudioBytes(buf)
    const { decodeAudioDataExclusive } = await import('./decodeLock')
    decoded.push(await decodeAudioDataExclusive(buf))
  }

  const sampleRate = decoded[0]!.sampleRate
  let length = decoded[0]!.length
  for (const b of decoded) {
    if (b.sampleRate !== sampleRate) {
      throw new Error('Combined parts must share the same sample rate')
    }
    length = Math.min(length, b.length)
  }

  const out = ctx.createBuffer(2, length, sampleRate)
  const outL = out.getChannelData(0)
  const outR = out.getChannelData(1)

  for (let i = 0; i < parts.length; i++) {
    const spec = parts[i]!
    const buf = decoded[i]!
    const chIdx = soloInFileChannelIndex(spec.soloInFile, buf.numberOfChannels)
    const src = buf.getChannelData(chIdx)
    const { l, r } = equalPowerPanGains(spec.pan)
    for (let s = 0; s < length; s++) {
      const v = src[s]!
      outL[s]! += v * l
      outR[s]! += v * r
    }
  }

  const peak = Math.max(peakOf(outL), peakOf(outR))
  if (peak > OUTPUT_HEADROOM) {
    const scale = OUTPUT_HEADROOM / peak
    for (let s = 0; s < length; s++) {
      outL[s]! *= scale
      outR[s]! *= scale
    }
  }

  const url = URL.createObjectURL(audioBufferToWavBlob(out))
  return { url, sampleRate, length }
}
