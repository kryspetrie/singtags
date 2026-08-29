/**
 * Combine multiple learning-track solos into one stereo mix.
 * Each part: extract solo channel from file, pan hard L or hard R.
 * Voices sharing a side are attenuated by 1/N so that side stays near
 * single-voice loudness (L/R stay roughly balanced when N differs).
 */

import { audioBufferToWavBlob, getSharedAudioContext, resumeAudioContextBestEffort } from './channelSolo'
import type { PartSide } from '../stores/preferences'
import { assertDecodableAudioBytes } from './audioBytes'

export interface MixPartInput {
  url: string
  /** Which channel of the source file holds the solo voice. */
  soloInFile: PartSide
  /** Hard pan in the output mix. */
  pan: PartSide
}

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

/** Gain for each voice on a hard-pan side (equal power share of that channel). */
export function sideVoiceGain(voicesOnSide: number): number {
  if (voicesOnSide <= 1) return 1
  return 1 / voicesOnSide
}

/**
 * Default hard-pan when the user checks a part into the custom track.
 * First selection → left; every later selection → right.
 */
export function defaultMixPanForNextSelection(alreadySelectedCount: number): PartSide {
  return alreadySelectedCount <= 0 ? 'left' : 'right'
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
 * Decode parts, extract solo channels, pan hard L/R, return a stereo WAV object URL.
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
    decoded.push(await ctx.decodeAudioData(buf.slice(0)))
  }

  const sampleRate = decoded[0]!.sampleRate
  let length = decoded[0]!.length
  for (const b of decoded) {
    if (b.sampleRate !== sampleRate) {
      throw new Error('Combined parts must share the same sample rate')
    }
    length = Math.min(length, b.length)
  }

  let leftCount = 0
  let rightCount = 0
  for (const p of parts) {
    if (p.pan === 'left') leftCount++
    else rightCount++
  }
  const gainL = sideVoiceGain(leftCount)
  const gainR = sideVoiceGain(rightCount)

  const out = ctx.createBuffer(2, length, sampleRate)
  const outL = out.getChannelData(0)
  const outR = out.getChannelData(1)

  for (let i = 0; i < parts.length; i++) {
    const spec = parts[i]!
    const buf = decoded[i]!
    const chIdx = soloInFileChannelIndex(spec.soloInFile, buf.numberOfChannels)
    const src = buf.getChannelData(chIdx)
    const dest = spec.pan === 'left' ? outL : outR
    const gain = spec.pan === 'left' ? gainL : gainR
    for (let s = 0; s < length; s++) {
      dest[s]! += src[s]! * gain
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
