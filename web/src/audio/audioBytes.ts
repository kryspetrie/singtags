/**
 * Cheap magic-byte checks before decodeAudioData.
 * Chromium logs native "Unable to decode audio data" even when the promise is
 * caught — so skip decode when the payload is clearly not audio (HTML/JSON/empty).
 */

export type AudioMagicKind = 'ogg' | 'mpeg' | 'mp4' | 'wav' | 'aac-adts' | 'unknown'

export function sniffAudioMagic(data: ArrayBuffer | Uint8Array): AudioMagicKind {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
  if (bytes.byteLength < 4) return 'unknown'
  const a = bytes[0]!,
    b = bytes[1]!,
    c = bytes[2]!,
    d = bytes[3]!
  if (a === 0x4f && b === 0x67 && c === 0x67 && d === 0x53) return 'ogg' // OggS
  if (a === 0x49 && b === 0x44 && c === 0x33) return 'mpeg' // ID3
  if (a === 0xff && (b & 0xe0) === 0xe0) return 'aac-adts' // MPEG ADTS / MP3 frame
  if (a === 0x52 && b === 0x49 && c === 0x46 && d === 0x46) return 'wav' // RIFF
  if (bytes.byteLength >= 8) {
    const box = String.fromCharCode(bytes[4]!, bytes[5]!, bytes[6]!, bytes[7]!)
    if (box === 'ftyp') return 'mp4'
  }
  return 'unknown'
}

function headText(data: ArrayBuffer | Uint8Array, n = 64): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
  const slice = bytes.subarray(0, Math.min(n, bytes.byteLength))
  return new TextDecoder('utf-8', { fatal: false }).decode(slice).trimStart().toLowerCase()
}

/** True when bytes look like a non-audio document (SPA shell, JSON API, etc.). */
export function isNonAudioPayload(data: ArrayBuffer | Uint8Array): boolean {
  const len = data instanceof Uint8Array ? data.byteLength : data.byteLength
  if (len === 0) return true
  const head = headText(data)
  // JSON can be tiny (`{}`); treat leading brace/bracket as non-audio at any size.
  if (head.startsWith('{') || head.startsWith('[')) return true
  if (len < 12) return false
  if (head.startsWith('<!doctype html') || head.startsWith('<html') || head.startsWith('<head')) {
    return true
  }
  if (head.startsWith('<?xml')) return true
  return false
}

/**
 * Throws a clear Error when `data` is obviously not decodable audio.
 * Call this *before* decodeAudioData to avoid Chromium console noise.
 */
export function assertDecodableAudioBytes(data: ArrayBuffer | Uint8Array): void {
  const len = data instanceof Uint8Array ? data.byteLength : data.byteLength
  if (len === 0) {
    throw new Error('Unable to decode audio data (empty response)')
  }
  if (isNonAudioPayload(data)) {
    const head = headText(data, 24)
    if (head.startsWith('<!doctype') || head.startsWith('<html')) {
      throw new Error(
        'Unable to decode audio data (received HTML — clear Offline audio pack and re-sync)',
      )
    }
    if (head.startsWith('{') || head.startsWith('[')) {
      throw new Error('Unable to decode audio data (received JSON instead of an audio file)')
    }
    throw new Error('Unable to decode audio data (received a non-audio document)')
  }
  // Known containers are fine; unknown binary may still be valid (rare codecs) —
  // let decodeAudioData decide. We only gate obvious text/document payloads.
}

/** decodeAudioData wrapper that refuses HTML/JSON/empty before calling the browser. */
export async function decodeAudioArrayBuffer(
  ctx: { decodeAudioData: (data: ArrayBuffer) => Promise<AudioBuffer> },
  data: ArrayBuffer,
): Promise<AudioBuffer> {
  assertDecodableAudioBytes(data)
  return ctx.decodeAudioData(data.slice(0))
}
