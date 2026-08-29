/**
 * Fetch hosted audio and optionally re-encode for smaller on-device storage.
 * Pre-published Opus tiers are stored as-is (no on-device re-encode).
 */

import { isNonAudioPayload } from '../audio/audioBytes'
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
    if (isNonAudioPayload(data)) return null
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

/** Best-effort MIME from magic bytes (legacy `.bin` learning tracks are often MP3/ADTS). */
export function sniffAudioMime(data: Uint8Array, fallback = HOSTED_AUDIO_MIME): string {
  if (data.byteLength >= 4) {
    const a = data[0]!,
      b = data[1]!,
      c = data[2]!,
      d = data[3]!
    if (a === 0x4f && b === 0x67 && c === 0x67 && d === 0x53) return 'audio/ogg' // OggS
    if (a === 0x49 && b === 0x44 && c === 0x33) return 'audio/mpeg' // ID3
    if (a === 0xff && (b & 0xe0) === 0xe0) return 'audio/mpeg' // MPEG ADTS
    if (a === 0x52 && b === 0x49 && c === 0x46 && d === 0x46) return 'audio/wav' // RIFF
    if (data.byteLength >= 8) {
      const box = String.fromCharCode(data[4]!, data[5]!, data[6]!, data[7]!)
      if (box === 'ftyp') return 'audio/mp4'
    }
  }
  return fallback
}

/** Re-encode downloaded bytes for offline pack storage. */
export async function encodeBytesForStorage(
  data: Uint8Array,
  quality: AudioEncodeQuality,
  hostedMime = HOSTED_AUDIO_MIME,
  sourcePath?: string,
): Promise<{ bytes: Uint8Array; mime: string }> {
  // Never persist SPA/API poison even when the caller skips the download-queue guard.
  if (isNonAudioPayload(data)) {
    throw new Error('Unable to store non-audio payload (HTML/JSON document)')
  }
  const mime = sniffAudioMime(data, hostedMime)
  if (!usesOpusStorage(quality) || (sourcePath && isPublishedTierPath(sourcePath))) {
    return { bytes: data, mime }
  }
  try {
    const encoded = await encodeDecodedBytes(data, 'ogg-opus', {
      quality: quality as Exclude<AudioEncodeQuality, 'original'>,
    })
    return { bytes: encoded, mime: 'audio/ogg' }
  } catch (err) {
    // Legacy .bin / corrupt stems must not abort the whole pack — store original bytes.
    // But never fall back to storing an obvious non-audio document.
    if (isNonAudioPayload(data)) throw err
    return { bytes: data, mime }
  }
}
