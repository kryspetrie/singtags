/**
 * Feature-detect formats that Web Audio `decodeAudioData` can handle.
 *
 * Online playback defaults to Ogg Opus. Safari only gained reliable Ogg Opus
 * support in iOS/macOS 18.4 — older iPhones reject with EncodingError
 * "Decoding failed". Prefer original AAC/MP3 on those browsers.
 */

let oggOpusSupported: boolean | null = null

/** Reset cached detection (tests only). */
export function resetCodecSupportForTests(): void {
  oggOpusSupported = null
}

/**
 * Mark Ogg Opus as unusable for this session after a native decode failure.
 * Next online resolves fall back to original without waiting for canPlayType.
 */
export function noteOggOpusDecodeFailed(): void {
  oggOpusSupported = false
}

/**
 * Whether this browser can decode Ogg Opus for Web Audio playback.
 * Uses `HTMLMediaElement.canPlayType` (same signal Safari documents for Ogg).
 */
export function supportsOggOpusWebAudio(): boolean {
  if (oggOpusSupported != null) return oggOpusSupported
  if (typeof document === 'undefined') {
    oggOpusSupported = true
    return true
  }
  try {
    const probe = document.createElement('audio')
    const rank = probe.canPlayType('audio/ogg; codecs="opus"')
    oggOpusSupported = rank === 'probably' || rank === 'maybe'
  } catch {
    oggOpusSupported = false
  }
  return oggOpusSupported
}
