/**
 * Shared OfflineAudioContext stub for Tag Roll bounce / blow-pitch tests.
 * Produces {@link FakeAudioBuffer}s so WAV encode + prepend math work without Web Audio.
 */
import { vi } from 'vitest'
import { FakeAudioBuffer } from '../../audio/audioBufferFactory'

export type OfflineFill = number | ((channels: number, length: number, sampleRate: number) => number)

function audioParamStub() {
  return {
    value: 0,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    setTargetAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
  }
}

/** Install a global OfflineAudioContext that renders filled FakeAudioBuffers. */
export function stubOfflineAudioContext(fill: OfflineFill = 0.12): void {
  vi.stubGlobal(
    'OfflineAudioContext',
    vi.fn(function OfflineAudioContext(
      this: {
        destination: object
        sampleRate: number
        length: number
        createBuffer: (ch: number, len: number, sr: number) => AudioBuffer
        createGain: () => object
        createOscillator: () => object
        createBiquadFilter: () => object
        startRendering: () => Promise<AudioBuffer>
      },
      channels: number,
      length: number,
      sampleRate: number,
    ) {
      this.destination = {}
      this.sampleRate = sampleRate
      this.length = length
      this.createBuffer = (ch: number, len: number, sr: number) =>
        new FakeAudioBuffer(ch, len, sr) as unknown as AudioBuffer
      this.createGain = () => ({
        gain: audioParamStub(),
        connect: vi.fn(),
      })
      this.createOscillator = () => ({
        type: 'sine',
        frequency: audioParamStub(),
        detune: audioParamStub(),
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      })
      this.createBiquadFilter = () => ({
        type: 'lowpass',
        frequency: audioParamStub(),
        Q: audioParamStub(),
        connect: vi.fn(),
      })
      this.startRendering = async () => {
        const buf = new FakeAudioBuffer(channels, length, sampleRate) as unknown as AudioBuffer
        const v = typeof fill === 'function' ? fill(channels, length, sampleRate) : fill
        for (let c = 0; c < channels; c++) buf.getChannelData(c).fill(v)
        return buf
      }
    }),
  )
}

/** Stereo PCM frame count from a 16-bit WAV blob (assumes 2 channels). */
export function wavStereoFrameCount(bytes: ArrayBuffer): number {
  const u8 = new Uint8Array(bytes)
  if (u8.byteLength < 44) return 0
  const view = new DataView(bytes)
  const channels = view.getUint16(22, true)
  const bits = view.getUint16(34, true)
  const dataSize = view.getUint32(40, true)
  const bytesPerFrame = channels * (bits / 8)
  return bytesPerFrame > 0 ? Math.floor(dataSize / bytesPerFrame) : 0
}
