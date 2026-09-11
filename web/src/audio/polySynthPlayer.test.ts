/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi } from 'vitest'
import { PolySynthPlayer } from './polySynthPlayer'
import { SamplePianoPlayer } from './samplePianoPlayer'
import { MELLOW_PITCH_PIPE_VOICE } from './pitchPipeVoice'

function mockAudioContext() {
  const start = vi.fn()
  const stop = vi.fn()
  const connect = vi.fn()
  const disconnect = vi.fn()
  const linearRampToValueAtTime = vi.fn()
  const cancelScheduledValues = vi.fn()
  const setValueAtTime = vi.fn()
  const oscillator = {
    type: '',
    frequency: { value: 0 },
    detune: { value: 0 },
    connect,
    disconnect,
    start,
    stop,
  }
  const gain = {
    gain: { value: 0, linearRampToValueAtTime, cancelScheduledValues, setValueAtTime },
    connect,
    disconnect,
  }
  const ctx = {
    state: 'running',
    currentTime: 0,
    destination: {},
    resume: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
    createOscillator: () => ({ ...oscillator }),
    createGain: () => ({ ...gain, gain: { ...gain.gain } }),
    createBiquadFilter: () => ({
      type: 'lowpass',
      frequency: { value: 0 },
      Q: { value: 0 },
      connect,
      disconnect,
    }),
  }
  vi.stubGlobal(
    'AudioContext',
    vi.fn(function AudioContext() {
      return ctx
    }),
  )
  return { start, stop }
}

describe('PolySynthPlayer', () => {
  it('keeps multiple notes sounding until each is released', async () => {
    const { stop } = mockAudioContext()
    const p = new PolySynthPlayer(MELLOW_PITCH_PIPE_VOICE)
    await p.noteOn('C4')
    await p.noteOn('E4')
    await p.noteOn('G4')
    expect(p.activeNotes().sort()).toEqual(['C4', 'E4', 'G4'])
    p.noteOff('E4', false)
    expect(p.activeNotes().sort()).toEqual(['C4', 'G4'])
    expect(stop).toHaveBeenCalled()
    p.allNotesOff(false)
    expect(p.activeNotes()).toEqual([])
    p.dispose()
  })
})

describe('SamplePianoPlayer poly API', () => {
  it('exposes noteOn/noteOff without requiring buffers in unit scope', () => {
    const p = new SamplePianoPlayer()
    expect(p.activeNotes()).toEqual([])
    expect(p.isNoteActive('C4')).toBe(false)
    p.dispose()
  })
})
