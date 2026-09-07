/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest'
import { peaksFromAudioBuffer } from './waveform'

function fakeBuffer(left: Float32Array, right?: Float32Array): AudioBuffer {
  const length = left.length
  return {
    length,
    sampleRate: 44100,
    numberOfChannels: right ? 2 : 1,
    duration: length / 44100,
    getChannelData: (c: number) => (c === 0 ? left : (right ?? left)),
    copyFromChannel: () => {},
    copyToChannel: () => {},
  } as unknown as AudioBuffer
}

describe('peaksFromAudioBuffer', () => {
  it('peak-normalizes quiet buffers so the loudest bar reaches 1', () => {
    const left = new Float32Array(1000)
    for (let i = 0; i < 1000; i++) left[i] = i === 500 ? 0.2 : 0.05
    const peaks = peaksFromAudioBuffer(fakeBuffer(left), 10)
    expect(Math.max(...peaks)).toBeCloseTo(1, 5)
    expect(Math.min(...peaks)).toBeGreaterThan(0)
  })

  it('keeps already-hot buffers at full scale without clipping bars above 1', () => {
    const left = new Float32Array(100)
    left.fill(0.95)
    left[50] = 1
    const peaks = peaksFromAudioBuffer(fakeBuffer(left), 10)
    expect(Math.max(...peaks)).toBeCloseTo(1, 5)
    expect(peaks.every((p) => p <= 1)).toBe(true)
  })
})
