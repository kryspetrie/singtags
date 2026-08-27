/**
 * Reconstruct stereo learning tracks from ultra-low mono solos
 * (docs/decisions/audio-storage-cache.md).
 *
 * Offline voice parts use part-left layout: solo hard L, accompaniment hard R.
 * Mix pans (constant-power positions −1…+1):
 *   Tenor −0.5 · Lead −0.25 · Bass +0.25 · Bari +0.5
 */

import { audioBufferToWavBlob, getSharedAudioContext, resumeAudioContextBestEffort } from './channelSolo'
import { sideVoiceGain } from './multiPartMix'
import type { PartSide } from '../lib/audioLayout'

/** Fixed barbershop mix pan positions (−1 full L … +1 full R). */
export const ULTRA_MIX_PAN: Record<string, number> = {
  tenor: -0.5,
  lead: -0.25,
  bass: 0.25,
  bari: 0.5,
  baritone: 0.5,
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

/** Equal-power pan gains for a mono source at pan ∈ [−1, 1]. */
export function equalPowerPanGains(pan: number): { l: number; r: number } {
  const p = Math.max(-1, Math.min(1, pan))
  const angle = ((p + 1) / 2) * (Math.PI / 2)
  return { l: Math.cos(angle), r: Math.sin(angle) }
}

export function mixPanForPart(part: string): number {
  return ULTRA_MIX_PAN[part.toLowerCase()] ?? 0
}

async function decodeUrl(url: string): Promise<AudioBuffer> {
  const ctx = getSharedAudioContext()
  await resumeAudioContextBestEffort(ctx)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch audio (${res.status})`)
  const buf = await res.arrayBuffer()
  return ctx.decodeAudioData(buf.slice(0))
}

function monoChannel(buf: AudioBuffer): Float32Array {
  return buf.getChannelData(0)
}

/**
 * Build a stereo mix from mono solo URLs using the fixed barbershop pan table.
 * Caller must revoke the returned object URL.
 */
export async function buildUltraMixObjectUrl(
  parts: Array<{ part: string; url: string; pan?: number }>,
): Promise<{ url: string; sampleRate: number; length: number }> {
  if (!parts.length) throw new Error('Need at least one part to mix')

  const ctx = getSharedAudioContext()
  await resumeAudioContextBestEffort(ctx)

  const decoded: Array<{ part: string; mono: Float32Array; sampleRate: number; pan: number }> = []
  for (const p of parts) {
    const buf = await decodeUrl(p.url)
    decoded.push({
      part: p.part,
      mono: monoChannel(buf),
      sampleRate: buf.sampleRate,
      pan: p.pan ?? mixPanForPart(p.part),
    })
  }

  const sampleRate = decoded[0]!.sampleRate
  const length = Math.max(...decoded.map((d) => d.mono.length))
  const left = new Float32Array(length)
  const right = new Float32Array(length)

  for (const d of decoded) {
    const { l, r } = equalPowerPanGains(d.pan)
    const src = d.mono
    for (let i = 0; i < src.length; i++) {
      const s = src[i]!
      left[i]! += s * l
      right[i]! += s * r
    }
  }

  const peak = Math.max(peakOf(left), peakOf(right), 1e-9)
  const gain = peak > OUTPUT_HEADROOM ? OUTPUT_HEADROOM / peak : 1
  if (gain !== 1) {
    for (let i = 0; i < length; i++) {
      left[i]! *= gain
      right[i]! *= gain
    }
  }

  const out = ctx.createBuffer(2, length, sampleRate)
  out.getChannelData(0).set(left)
  out.getChannelData(1).set(right)
  const url = URL.createObjectURL(audioBufferToWavBlob(out))
  return { url, sampleRate, length }
}

/**
 * @deprecated Dual-mono (same signal L+R). Prefer {@link monoSoloToHardPanObjectUrl}.
 * Caller must revoke the returned object URL.
 */
export async function monoSoloToStereoObjectUrl(
  url: string,
): Promise<{ url: string; sampleRate: number; length: number }> {
  const ctx = getSharedAudioContext()
  await resumeAudioContextBestEffort(ctx)
  const buf = await decodeUrl(url)
  const mono = monoChannel(buf)
  const out = ctx.createBuffer(2, mono.length, buf.sampleRate)
  out.getChannelData(0).set(mono)
  out.getChannelData(1).set(mono)
  const objectUrl = URL.createObjectURL(audioBufferToWavBlob(out))
  return { url: objectUrl, sampleRate: buf.sampleRate, length: mono.length }
}

/**
 * Hard-pan a mono solo onto one channel; the other channel is silence.
 * Used when accompaniment stems aren't available yet — never dual-mono for learning tracks.
 */
export async function monoSoloToHardPanObjectUrl(
  url: string,
  soloSide: PartSide,
): Promise<{ url: string; sampleRate: number; length: number }> {
  const ctx = getSharedAudioContext()
  await resumeAudioContextBestEffort(ctx)
  const buf = await decodeUrl(url)
  const mono = monoChannel(buf)
  const out = ctx.createBuffer(2, mono.length, buf.sampleRate)
  const left = out.getChannelData(0)
  const right = out.getChannelData(1)
  left.fill(0)
  right.fill(0)
  if (soloSide === 'left') left.set(mono)
  else right.set(mono)
  const objectUrl = URL.createObjectURL(audioBufferToWavBlob(out))
  return { url: objectUrl, sampleRate: buf.sampleRate, length: mono.length }
}

function sumMonos(
  parts: Array<{ mono: Float32Array }>,
  length: number,
  gain: number,
): Float32Array {
  const out = new Float32Array(length)
  for (const p of parts) {
    const src = p.mono
    for (let i = 0; i < src.length; i++) out[i]! += src[i]! * gain
  }
  return out
}

/**
 * Reconstruct a learning-track stereo file from ultra mono solos:
 * solo voice on one side, the other three parts summed on the other (matches hosted originals).
 * Caller must revoke the returned object URL and any input URLs it still owns.
 */
export async function buildPartLearningStereoObjectUrl(opts: {
  activePart: string
  activeUrl: string
  otherParts: Array<{ part: string; url: string }>
  soloSide: PartSide
}): Promise<{ url: string; sampleRate: number; length: number }> {
  const { activeUrl, otherParts, soloSide } = opts
  if (!otherParts.length) throw new Error('Need accompaniment stems to reconstruct learning stereo')

  const ctx = getSharedAudioContext()
  await resumeAudioContextBestEffort(ctx)

  const activeBuf = await decodeUrl(activeUrl)
  const activeMono = monoChannel(activeBuf)
  const othersDecoded: Array<{ part: string; mono: Float32Array; sampleRate: number }> = []
  for (const p of otherParts) {
    const buf = await decodeUrl(p.url)
    othersDecoded.push({ part: p.part, mono: monoChannel(buf), sampleRate: buf.sampleRate })
  }

  const sampleRate = activeBuf.sampleRate
  const length = Math.max(activeMono.length, ...othersDecoded.map((d) => d.mono.length))
  const accompanimentGain = sideVoiceGain(othersDecoded.length)
  const accompaniment = sumMonos(othersDecoded, length, accompanimentGain)

  const left = new Float32Array(length)
  const right = new Float32Array(length)
  const solo = activeMono
  if (soloSide === 'left') {
    for (let i = 0; i < solo.length; i++) left[i]! = solo[i]!
    for (let i = 0; i < length; i++) right[i]! = accompaniment[i]!
  } else {
    for (let i = 0; i < length; i++) left[i]! = accompaniment[i]!
    for (let i = 0; i < solo.length; i++) right[i]! = solo[i]!
  }

  const peak = Math.max(peakOf(left), peakOf(right), 1e-9)
  const gain = peak > OUTPUT_HEADROOM ? OUTPUT_HEADROOM / peak : 1
  if (gain !== 1) {
    for (let i = 0; i < length; i++) {
      left[i]! *= gain
      right[i]! *= gain
    }
  }

  const out = ctx.createBuffer(2, length, sampleRate)
  out.getChannelData(0).set(left)
  out.getChannelData(1).set(right)
  const url = URL.createObjectURL(audioBufferToWavBlob(out))
  return { url, sampleRate, length }
}
