/**
 * Safari / no-native-Opus playable bridge.
 *
 * WebAssembly is supported in Safari; {@link decodeOggOpusToAudioBuffer} turns
 * compact Ogg Opus into PCM for Web Audio. For blob URLs that may also hit
 * HTMLMediaElement (or to avoid re-running WASM on every resolve), this module
 * can on-the-fly transcode Opus → WAV in session memory — storage stays Opus.
 */
import { sniffAudioMagic } from './audioBytes'
import { audioBufferToWavBlob } from './channelSolo'
import { supportsOggOpusWebAudio } from './codecSupport'

const MAX_SESSION_WAV = 12

/** cacheKey → WAV Blob (callers get a fresh object URL each time; safe to revoke). */
const sessionWavBlobs = new Map<string, Blob>()
const sessionWavOrder: string[] = []

let opusWasmUnavailable = false

/** Reset session state (tests only). */
export function resetOpusPlayableForTests(): void {
  sessionWavBlobs.clear()
  sessionWavOrder.length = 0
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
 * Browsers without native Ogg Opus need on-device software decode (and may use
 * session WAV object URLs for MediaElement-safe playback).
 */
export function needsOpusOnDeviceTranscode(): boolean {
  return !supportsOggOpusWebAudio()
}

function rememberSessionWav(cacheKey: string, blob: Blob): void {
  if (sessionWavBlobs.has(cacheKey)) {
    sessionWavBlobs.set(cacheKey, blob)
    return
  }
  while (sessionWavOrder.length >= MAX_SESSION_WAV) {
    const evict = sessionWavOrder.shift()
    if (!evict) break
    sessionWavBlobs.delete(evict)
  }
  sessionWavBlobs.set(cacheKey, blob)
  sessionWavOrder.push(cacheKey)
}

/**
 * Decode Opus bytes via WASM and return a `blob:` WAV URL.
 * Session-caches the WAV Blob so repeat resolves skip WASM; each call returns a
 * fresh object URL the caller may revoke.
 */
export async function opusBytesToPlayableObjectUrl(
  data: ArrayBuffer | Uint8Array,
  cacheKey: string,
): Promise<string> {
  let blob = sessionWavBlobs.get(cacheKey)
  if (!blob) {
    try {
      const { decodeOggOpusToAudioBuffer } = await import('./opusWasmDecode')
      const buffer = await decodeOggOpusToAudioBuffer(data)
      blob = audioBufferToWavBlob(buffer)
      rememberSessionWav(cacheKey, blob)
    } catch (err) {
      noteOpusWasmUnavailable()
      throw err
    }
  }
  return URL.createObjectURL(blob)
}

/**
 * Object URL for cached audio bytes. On Safari (no native Opus), Ogg Opus is
 * transcoded on-the-fly to WAV; other formats stay as-is.
 */
export async function playableObjectUrlFromAudioBytes(
  data: ArrayBuffer,
  mime: string,
  cacheKey: string,
): Promise<string> {
  if (needsOpusOnDeviceTranscode() && sniffAudioMagic(data) === 'ogg') {
    return opusBytesToPlayableObjectUrl(data, cacheKey)
  }
  return URL.createObjectURL(new Blob([data], { type: mime || 'application/octet-stream' }))
}

/** Idle warm-up so first Safari play doesn't pay WASM compile latency. */
export function preloadOpusWasmDecoder(): void {
  if (!needsOpusOnDeviceTranscode()) return
  if (opusWasmUnavailable) return
  void import('./opusWasmDecode')
    .then((m) => m.warmOpusWasmDecoder())
    .catch(() => {
      noteOpusWasmUnavailable()
    })
}
