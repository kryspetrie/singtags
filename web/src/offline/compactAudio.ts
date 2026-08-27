/**
 * Fetch hosted audio and optionally re-encode for smaller on-device storage.
 * Pre-published Opus tiers are stored as-is (no on-device re-encode).
 */

import { encodeDecodedBytes } from '../download/encode'
import { isPublishedTierPath } from '../lib/audioTiers'
import type { AudioEncodeQuality } from '../types/audio'
import { HOSTED_AUDIO_MIME, usesOpusStorage } from '../types/audio'
import { sampleUrl } from '../download/zip'

export interface CompactedAudio {
  path: string
  mime: string
  data: ArrayBuffer
  /** True when bytes were re-encoded (not the hosted M4A). */
  encoded: boolean
}

export async function fetchAudioForStorage(
  path: string,
  quality: AudioEncodeQuality,
  onLabel?: (label: string) => void,
): Promise<CompactedAudio | null> {
  try {
    const res = await fetch(sampleUrl(path))
    if (!res.ok) return null
    const data = await res.arrayBuffer()
    const hostedMime = res.headers.get('content-type') || HOSTED_AUDIO_MIME

    if (!usesOpusStorage(quality) || isPublishedTierPath(path)) {
      return { path, mime: hostedMime, data, encoded: false }
    }

    onLabel?.('Encoding Opus…')
    const encoded = await encodeDecodedBytes(new Uint8Array(data), 'ogg-opus', {
      quality: quality as Exclude<AudioEncodeQuality, 'original'>,
    })
    const copy = new Uint8Array(encoded.byteLength)
    copy.set(encoded)
    return {
      path,
      mime: 'audio/ogg',
      data: copy.buffer,
      encoded: true,
    }
  } catch {
    return null
  }
}

/** Re-encode downloaded bytes for offline pack storage. */
export async function encodeBytesForStorage(
  data: Uint8Array,
  quality: AudioEncodeQuality,
  hostedMime = HOSTED_AUDIO_MIME,
  sourcePath?: string,
): Promise<{ bytes: Uint8Array; mime: string }> {
  if (!usesOpusStorage(quality) || (sourcePath && isPublishedTierPath(sourcePath))) {
    return { bytes: data, mime: hostedMime }
  }
  const encoded = await encodeDecodedBytes(data, 'ogg-opus', {
    quality: quality as Exclude<AudioEncodeQuality, 'original'>,
  })
  return { bytes: encoded, mime: 'audio/ogg' }
}
