/**
 * Feature-detect formats that Web Audio `decodeAudioData` can handle natively.
 *
 * Online play prefers compact Opus everywhere; Safari without native Ogg Opus
 * software-decodes via WASM (and may session-transcode Opus → WAV). Original
 * AAC/MP3 is only an online fallback when WASM fails to load (see
 * `onlinePlayAudioPath` + `isOpusWasmUnavailable`).
 */

let oggOpusSupported: boolean | null = null
let opusWasmUnavailable = false

/** Reset cached detection (tests only). */
export function resetCodecSupportForTests(): void {
  oggOpusSupported = null
  opusWasmUnavailable = false
}

/** True when the Opus WASM module failed to load this session. */
export function isOpusWasmUnavailable(): boolean {
  return opusWasmUnavailable
}

/** Mark WASM Opus decode as unusable; online play may fall back to Original. */
export function noteOpusWasmUnavailable(): void {
  opusWasmUnavailable = true
}

/**
 * Mark native Ogg Opus as unusable for this session after a decode failure.
 * Further resolves prefer original AAC/MP3 via `onlinePlayAudioPath`.
 */
export function noteOggOpusDecodeFailed(): void {
  oggOpusSupported = false
}

/**
 * Whether this browser can decode Ogg Opus natively for Web Audio.
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
