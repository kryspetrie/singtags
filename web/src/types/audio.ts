/** Playback / download pitch+tempo transform. Identity = hosted as-is. */
export interface AudioTransform {
  pitchSemitones: number
  speed: number
}

export type TransformMode = 'original' | 'key' | 'speed' | 'key+speed'

export type DownloadFormat = 'mp4' | 'mp3' | 'ogg'

/**
 * How aggressively to compress when re-encoding (star cache, zip, offline pack).
 * `original` keeps hosted MP4 bytes and skips encode.
 * Re-encodes stay **stereo** AAC in MP4 (or stereo MP3/OGG when that format is chosen).
 */
export type AudioEncodeQuality = 'original' | 'standard' | 'compact' | 'lofi'

export const AUDIO_ENCODE_QUALITY_LABELS: Record<AudioEncodeQuality, string> = {
  original: 'Original (hosted MP4 ~128 kbps)',
  standard: 'Standard (stereo AAC ~96 kbps)',
  compact: 'Compact (stereo AAC ~64 kbps)',
  lofi: 'Lo-fi (stereo AAC ~32 kbps)',
}

/** Target AAC bitrate for MP4 re-encode (stereo). Hosted files are ~128 kbps. */
export function aacBitrate(quality: Exclude<AudioEncodeQuality, 'original'>): number {
  switch (quality) {
    case 'lofi':
      return 32_000
    case 'compact':
      return 64_000
    default:
      return 96_000
  }
}

/** LAME VBR quality: 0 = best, 9 = smallest. Always stereo. */
export function mp3VbrQuality(quality: Exclude<AudioEncodeQuality, 'original'>): number {
  switch (quality) {
    case 'lofi':
      return 7
    case 'compact':
      return 5
    default:
      return 2
  }
}

/** Vorbis-ish quality scale used by wasm-media-encoders. Always stereo. */
export function oggVbrQuality(quality: Exclude<AudioEncodeQuality, 'original'>): number {
  switch (quality) {
    case 'lofi':
      return 1
    case 'compact':
      return 3
    default:
      return 5
  }
}

export const IDENTITY_TRANSFORM: AudioTransform = { pitchSemitones: 0, speed: 1 }

export function isIdentityTransform(t: AudioTransform | undefined | null): boolean {
  if (!t) return true
  return Math.abs(t.pitchSemitones) < 0.01 && Math.abs(t.speed - 1) < 0.001
}

export function transformFromMode(
  mode: TransformMode,
  current: AudioTransform,
): AudioTransform {
  switch (mode) {
    case 'original':
      return { ...IDENTITY_TRANSFORM }
    case 'key':
      return { pitchSemitones: current.pitchSemitones, speed: 1 }
    case 'speed':
      return { pitchSemitones: 0, speed: current.speed }
    case 'key+speed':
      return { pitchSemitones: current.pitchSemitones, speed: current.speed }
  }
}

/** Filename suffix for transformed downloads, e.g. `_+2st_95pct`. */
export function transformFilenameSuffix(t: AudioTransform): string {
  if (isIdentityTransform(t)) return ''
  const parts: string[] = []
  if (Math.abs(t.pitchSemitones) >= 0.01) {
    const n = Math.round(t.pitchSemitones)
    parts.push(`${n >= 0 ? '+' : ''}${n}st`)
  }
  if (Math.abs(t.speed - 1) >= 0.001) {
    parts.push(`${Math.round(t.speed * 100)}pct`)
  }
  return parts.length ? `_${parts.join('_')}` : ''
}
