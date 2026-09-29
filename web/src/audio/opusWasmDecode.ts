/**
 * Software Ogg Opus decode for browsers whose Web Audio cannot decode Opus
 * (notably Safari / iOS before 18.4). Keeps the Opus network tier; converts to
 * PCM {@link AudioBuffer} on device before playback.
 *
 * Prefers a Web Worker decoder; falls back to the main-thread decoder when the
 * worker fails to load (some iOS PWA / Private Mode edge cases).
 */
import { createAudioBuffer } from './audioBufferFactory'

type OpusWasmDecoder = {
  ready: Promise<unknown>
  decodeFile: (data: Uint8Array) => Promise<{
    channelData: Float32Array[]
    samplesDecoded: number
    sampleRate: number
    errors?: Array<{ message?: string }>
  }>
  reset: () => Promise<void>
  free: () => Promise<void> | void
}

let decoderPromise: Promise<OpusWasmDecoder> | null = null

async function createDecoder(): Promise<OpusWasmDecoder> {
  const mod = await import('ogg-opus-decoder')
  // Prefer worker (keeps UI responsive); main-thread if worker construction fails.
  try {
    const worker = new mod.OggOpusDecoderWebWorker() as OpusWasmDecoder
    await worker.ready
    return worker
  } catch (workerErr) {
    console.warn('[opusWasm] worker decoder unavailable; using main thread', workerErr)
    const main = new mod.OggOpusDecoder() as OpusWasmDecoder
    await main.ready
    return main
  }
}

async function getDecoder(): Promise<OpusWasmDecoder> {
  if (!decoderPromise) {
    decoderPromise = createDecoder().catch((err) => {
      decoderPromise = null
      throw err
    })
  }
  return decoderPromise
}

/** @internal test helper */
export function resetOpusWasmDecoderForTests(): void {
  decoderPromise = null
}

/** Compile / construct the WASM decoder without decoding a file (idle warm-up). */
export async function warmOpusWasmDecoder(): Promise<void> {
  await getDecoder()
}

/**
 * Decode a complete Ogg Opus file to an {@link AudioBuffer} via libopus WASM.
 *
 * @param data Full Ogg Opus file bytes.
 */
export async function decodeOggOpusToAudioBuffer(
  data: ArrayBuffer | Uint8Array,
): Promise<AudioBuffer> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
  let decoder: OpusWasmDecoder
  try {
    decoder = await getDecoder()
  } catch (err) {
    try {
      const { noteOpusWasmUnavailable } = await import('./opusPlayable')
      noteOpusWasmUnavailable()
    } catch {
      /* circular-safe */
    }
    const hint = err instanceof Error ? err.message : String(err)
    throw new Error(
      `Couldn’t load Opus decoder for this browser (${hint}). Update Safari or try again on Wi‑Fi.`,
    )
  }
  const result = await decoder.decodeFile(bytes)
  await decoder.reset()

  const { channelData, samplesDecoded, sampleRate, errors } = result
  if (!samplesDecoded || !channelData?.length) {
    const hint = errors?.[0]?.message
    throw new Error(hint ? `Opus decode failed: ${hint}` : 'Opus decode produced no samples')
  }

  const channels = Math.min(2, Math.max(1, channelData.length))
  const buffer = createAudioBuffer(channels, samplesDecoded, sampleRate)
  for (let c = 0; c < channels; c++) {
    const src = channelData[c]!
    buffer.getChannelData(c).set(src.subarray(0, samplesDecoded))
  }
  return buffer
}
