/**
 * Shared audio transform, download format, and on-device encode quality types.
 * Identity transform means hosted files play without re-encoding or baking.
 */
import { canonicalizeTransform, isCanonicalIdentity } from '../audio/transformContract'

/** Playback / download pitch+tempo transform. Identity = hosted as-is. */
export interface AudioTransform {
  pitchSemitones: number
  speed: number
}

export type TransformMode = 'original' | 'key' | 'speed' | 'key+speed'

export type DownloadFormat = 'm4a' | 'mp3' | 'ogg' | 'ogg-opus'

/** IANA MIME for `.m4a` containers (AAC); not MP4 video. */
export const HOSTED_AUDIO_MIME = 'audio/mp4'

/**
 * Formats offered in download UI.
 * - `mp3` = published original as-is (almost always an MP3 from the catalog mirror)
 * - `m4a` = re-encode that source to AAC in an M4A at {@link DOWNLOAD_AAC_BITRATE}
 */
export type UserDownloadFormat = 'm4a' | 'mp3'

/** AAC bitrate when the user chooses M4A download (re-encode from published original). */
export const DOWNLOAD_AAC_BITRATE = 96_000

export const DOWNLOAD_FORMAT_OPTIONS: Array<{ value: UserDownloadFormat; label: string }> = [
  { value: 'mp3', label: 'Original (as published)' },
  { value: 'm4a', label: 'M4A (96 kbps AAC)' },
]

/** Coerce persisted queue format values to supported download formats. */
export function normalizeDownloadFormat(format: string | undefined | null): DownloadFormat {
  return format === 'm4a' ? 'm4a' : 'mp3'
}

export function downloadFormatLabel(format: DownloadFormat | undefined | null): string {
  if (format === 'm4a') return 'M4A (96 kbps AAC)'
  return 'Original (as published)'
}

/**
 * `prepareDownloadBytes` quality:
 * - Original → passthrough hosted source bytes (usually MP3)
 * - M4A → re-encode AAC (bitrate {@link DOWNLOAD_AAC_BITRATE} in the download path)
 */
export function encodeQualityForDownload(format: DownloadFormat): AudioEncodeQuality {
  return format === 'mp3' ? 'original' : 'standard'
}

/**
 * How aggressively to compress when saving audio on this device after download.
 * When publish tiers exist, non-original settings fetch pre-encoded Opus from the server.
 * Legacy tags without tiers may still re-encode locally.
 */
export type AudioEncodeQuality = 'original' | 'standard' | 'compact' | 'lofi'

/**
 * Fixed on-device storage for favorited tags: 64 kbps Opus playback.
 * The whole-library offline audio pack uses published ultra/lo-fi paths from the manifest
 * (not this constant) — see Settings → Learning tracks library.
 */
export const DEVICE_AUDIO_STORAGE_QUALITY: AudioEncodeQuality = 'standard'

export const AUDIO_ENCODE_QUALITY_LABELS: Record<AudioEncodeQuality, string> = {
  original: 'Original (published source — usually MP3)',
  standard: 'Playback (64 kbps Opus)',
  compact: 'Playback (64 kbps Opus — legacy alias)',
  lofi: 'Ultra (16k solo / 32k mix)',
}

/** Opus/Vorbis-style target bitrate for downsampled on-device storage. */
export function opusBitrate(quality: Exclude<AudioEncodeQuality, 'original'>): number {
  return aacBitrate(quality)
}

/** Rough on-device size vs hosted original when re-encoding. */
export function storageSizeFactor(quality: AudioEncodeQuality): number {
  if (quality === 'original') return 1
  if (quality === 'standard' || quality === 'compact') return 0.5
  return 0.3
}

export function usesOpusStorage(quality: AudioEncodeQuality): boolean {
  return quality !== 'original'
}

/**
 * Target AAC bitrate for M4A re-encode (stereo).
 * Device-storage helpers use 64/32 kbps; user downloads use {@link DOWNLOAD_AAC_BITRATE}.
 */
export function aacBitrate(quality: Exclude<AudioEncodeQuality, 'original'>): number {
  switch (quality) {
    case 'lofi':
      return 32_000
    case 'compact':
    case 'standard':
      return 64_000
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
  return isCanonicalIdentity(canonicalizeTransform(t.pitchSemitones, t.speed))
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
