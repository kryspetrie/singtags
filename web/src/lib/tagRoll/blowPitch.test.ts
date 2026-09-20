import { afterEach, describe, expect, it, vi } from 'vitest'
import { FakeAudioBuffer } from '../../audio/audioBufferFactory'
import { stubOfflineAudioContext } from './bounceWebAudioMock'
import { createEmptyTagRollProject } from './normalize'
import {
  planBlowPitch,
  prependAudioBuffer,
  renderBlowPitchBufferAsync,
  shouldBlowPitchOnPlay,
  tonicMidiForPitchClass,
} from './blowPitch'
import { TAG_ROLL_PPQ } from './types'

describe('blowPitch', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('maps pitch class into the pay-the-key MIDI range', () => {
    expect(tonicMidiForPitchClass(0)).toBe(60) // C4
    expect(tonicMidiForPitchClass(7)).toBe(55) // G3
    expect(tonicMidiForPitchClass(4)).toBe(52) // E3
  })

  it('returns null when disabled or empty', () => {
    const p = createEmptyTagRollProject()
    expect(planBlowPitch(p)).toBeNull()
    p.blowPitchEnabled = true
    expect(planBlowPitch(p)).toBeNull()
  })

  it('plans one measure before first content with decay finishing in-measure', () => {
    const p = createEmptyTagRollProject({ title: 'Pitch Tag' })
    p.blowPitchEnabled = true
    p.tonality = 10 // Bb
    p.bpm = 120
    p.tempoMarkers = [{ id: 't0', tick: 0, bpm: 120 }]
    const lead = p.parts.find((x) => x.name === 'Lead')!
    p.notes = [
      {
        id: 'n1',
        partId: lead.id,
        midi: 60,
        startTick: TAG_ROLL_PPQ * 4,
        durationTicks: TAG_ROLL_PPQ,
      },
    ]
    const plan = planBlowPitch(p)
    expect(plan).not.toBeNull()
    expect(plan!.contentStartTick).toBe(TAG_ROLL_PPQ * 4)
    expect(plan!.pitchStartTick).toBe(0)
    expect(plan!.midi).toBe(58) // Bb3
    expect(plan!.holdSec + plan!.releaseSec).toBeLessThanOrEqual(plan!.measureSec + 1e-6)
    expect(plan!.holdSec).toBeLessThan(plan!.measureSec)
    expect(shouldBlowPitchOnPlay(p, 0)).toBe(true)
    expect(shouldBlowPitchOnPlay(p, plan!.contentStartTick)).toBe(true)
    expect(shouldBlowPitchOnPlay(p, plan!.contentStartTick + 1)).toBe(false)
  })

  it('uses a pre-roll when notes start in measure 1', () => {
    const p = createEmptyTagRollProject()
    p.blowPitchEnabled = true
    p.bpm = 104
    p.tempoMarkers = [{ id: 't0', tick: 0, bpm: 104 }]
    const lead = p.parts[0]!
    p.notes = [
      {
        id: 'n1',
        partId: lead.id,
        midi: 60,
        startTick: 10,
        durationTicks: TAG_ROLL_PPQ,
      },
    ]
    const plan = planBlowPitch(p)
    expect(plan).not.toBeNull()
    expect(plan!.contentStartTick).toBe(0)
    expect(plan!.pitchStartTick).toBeLessThan(0)
    expect(plan!.measureSec).toBeGreaterThan(1)
  })

  it('prepends pitch audio ahead of the body without mutating inputs', () => {
    const head = new FakeAudioBuffer(2, 4, 44100) as unknown as AudioBuffer
    const body = new FakeAudioBuffer(2, 6, 44100) as unknown as AudioBuffer
    head.getChannelData(0).fill(0.5)
    head.getChannelData(1).fill(0.5)
    body.getChannelData(0).fill(0.1)
    body.getChannelData(1).fill(0.1)
    const out = prependAudioBuffer(head, body)
    expect(out.length).toBe(10)
    expect(out.sampleRate).toBe(44100)
    expect(out.getChannelData(0)[0]).toBeCloseTo(0.5)
    expect(out.getChannelData(0)[4]).toBeCloseTo(0.1)
    expect(head.length).toBe(4)
    expect(body.length).toBe(6)
  })

  it('renders an offline stereo pitch measure matching plan length', async () => {
    stubOfflineAudioContext(0.33)
    const p = createEmptyTagRollProject()
    p.blowPitchEnabled = true
    p.bpm = 120
    p.tempoMarkers = [{ id: 't0', tick: 0, bpm: 120 }]
    const lead = p.parts[0]!
    p.notes = [
      {
        id: 'n1',
        partId: lead.id,
        midi: 60,
        startTick: 0,
        durationTicks: TAG_ROLL_PPQ,
      },
    ]
    const plan = planBlowPitch(p)!
    const sr = 8000
    const buf = await renderBlowPitchBufferAsync(plan, sr)
    expect(buf.numberOfChannels).toBe(2)
    expect(buf.sampleRate).toBe(sr)
    expect(buf.length).toBe(Math.ceil(plan.measureSec * sr))
    expect(buf.getChannelData(0)[0]).toBeCloseTo(0.33)
    expect(buf.getChannelData(1)[0]).toBeCloseTo(0.33)
  })
})
