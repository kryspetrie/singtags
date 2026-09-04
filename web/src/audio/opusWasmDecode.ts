/**
 * Software Ogg Opus decode for browsers whose Web Audio cannot decode Opus
 * (notably Safari / iOS before 18.4). Keeps the Opus network tier; converts to
 * PCM {@link AudioBuffer} on device before playback.
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

async function getDecoder(): Promise<OpusWasmDecoder> {
  if (!decoderPromise) {
    decoderPromise = (async () => {
      const { OggOpusDecoderWebWorker } = await import('ogg-opus-decoder')
      const decoder = new OggOpusDecoderWebWorker() as OpusWasmDecoder
      await decoder.ready
      return decoder
    })().catch((err) => {
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

/**
 * Decode a complete Ogg Opus file to an {@link AudioBuffer} via libopus WASM.
 *
 * @param data Full Ogg Opus file bytes.
 */
export async function decodeOggOpusToAudioBuffer(
  data: ArrayBuffer | Uint8Array,
): Promise<AudioBuffer> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
  const decoder = await getDecoder()
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
