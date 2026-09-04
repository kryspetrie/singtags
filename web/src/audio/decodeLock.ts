/**
 * Serialize Web Audio `decodeAudioData` and soften Safari/iOS contention failures.
 *
 * Concurrent native decodes often reject on iPhone with EncodingError
 * "Decoding failed". Browsers without Ogg Opus Web Audio support (Safari before
 * iOS 18.4) keep fetching Opus tiers and software-decode via WASM instead of
 * falling back to original AAC/MP3.
 */
import { assertDecodableAudioBytes, sniffAudioMagic } from './audioBytes'
import { noteOggOpusDecodeFailed, supportsOggOpusWebAudio } from './codecSupport'

let chain: Promise<unknown> = Promise.resolve()

async function decodeOggViaWasm(data: ArrayBuffer): Promise<AudioBuffer> {
  const { decodeOggOpusToAudioBuffer } = await import('./opusWasmDecode')
  return decodeOggOpusToAudioBuffer(data)
}

/** True for Safari/iOS EncodingError and related native decode failures. */
export function isAudioDecodeFailure(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const name = 'name' in err ? String((err as { name?: unknown }).name) : ''
  const msg = ('message' in err ? String((err as { message?: unknown }).message) : '').toLowerCase()
  return (
    name === 'EncodingError' ||
    msg.includes('decoding failed') ||
    msg.includes('unable to decode audio data')
  )
}

/** User-facing copy when a decode fails after native + WASM attempts. */
export function formatAudioDecodeError(err: unknown): string {
  if (isAudioDecodeFailure(err)) {
    return 'Couldn’t decode audio. Wait a moment and try again — if a favorite is caching, let it finish first.'
  }
  return err instanceof Error ? err.message : String(err)
}

async function decodeNative(
  data: ArrayBuffer,
  opts?: { offlineSampleRate?: number },
): Promise<AudioBuffer> {
  const copy = data.slice(0)
  const sr = opts?.offlineSampleRate
  if (sr != null && typeof OfflineAudioContext !== 'undefined') {
    const offline = new OfflineAudioContext(2, 1, sr)
    return await offline.decodeAudioData(copy)
  }
  const ctx = new AudioContext()
  try {
    return await ctx.decodeAudioData(copy)
  } finally {
    try {
      await ctx.close?.()
    } catch {
      /* test shims may omit close */
    }
  }
}

async function decodeOggWithFallback(
  data: ArrayBuffer,
  opts?: { offlineSampleRate?: number },
): Promise<AudioBuffer> {
  if (!supportsOggOpusWebAudio()) {
    return decodeOggViaWasm(data)
  }
  try {
    return await decodeNative(data, opts)
  } catch (err) {
    if (!isAudioDecodeFailure(err)) throw err
    noteOggOpusDecodeFailed()
    await new Promise((r) => setTimeout(r, 80))
    try {
      return await decodeNative(data, opts)
    } catch (retryErr) {
      if (!isAudioDecodeFailure(retryErr)) throw retryErr
      noteOggOpusDecodeFailed()
      return decodeOggViaWasm(data)
    }
  }
}

/**
 * Decode audio bytes with a process-wide lock.
 * Ogg Opus uses native decode when available, otherwise libopus WASM.
 *
 * @param data Full file bytes (not a stream chunk).
 * @param opts.offlineSampleRate When set, native decode uses OfflineAudioContext
 *   at this rate (background compaction / downloads).
 */
export async function decodeAudioDataExclusive(
  data: ArrayBuffer,
  opts?: { offlineSampleRate?: number },
): Promise<AudioBuffer> {
  assertDecodableAudioBytes(data)
  const magic = sniffAudioMagic(data)

  const run = async (): Promise<AudioBuffer> => {
    if (magic === 'ogg') return decodeOggWithFallback(data, opts)
    try {
      return await decodeNative(data, opts)
    } catch (err) {
      if (!isAudioDecodeFailure(err)) throw err
      await new Promise((r) => setTimeout(r, 150))
      return await decodeNative(data, opts)
    }
  }

  const next = chain.then(run, run)
  chain = next.then(
    () => undefined,
    () => undefined,
  )
  return next
}
