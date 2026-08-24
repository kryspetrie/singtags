/**
 * Fetch hosted audio and optionally re-encode for smaller on-device storage.
 * Non-original qualities stay stereo AAC in MP4.
 */

import { encodeDecodedBytes } from '../download/encode'
import type { AudioEncodeQuality } from '../types/audio'
import { sampleUrl } from '../download/zip'

export interface CompactedAudio {
  path: string
  mime: string
  data: ArrayBuffer
  /** True when bytes were re-encoded (not the hosted MP4). */
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
    const hostedMime = res.headers.get('content-type') || 'audio/mp4'

    if (quality === 'original') {
      return { path, mime: hostedMime, data, encoded: false }
    }

    onLabel?.('Encoding audio…')
    const encoded = await encodeDecodedBytes(new Uint8Array(data), 'mp4', {
      quality,
    })
    const copy = new Uint8Array(encoded.byteLength)
    copy.set(encoded)
    return {
      path,
      mime: 'audio/mp4',
      data: copy.buffer,
      encoded: true,
    }
  } catch {
    return null
  }
}
