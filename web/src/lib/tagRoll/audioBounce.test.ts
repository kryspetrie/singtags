import { describe, expect, it } from 'vitest'
import { createAudioBuffer } from '../../audio/audioBufferFactory'
import {
  buildMixBuffer,
  buildPartLeftBuffer,
  bounceTrackFilename,
  bufferToMono,
  firstContentMeasureTick,
  partSlug,
  planBounceSteps,
  TAG_ROLL_BOUNCE_MAX_SECONDS,
  ticksToSec,
  trimBufferFromTick,
} from './audioBounce'
import { createEmptyTagRollProject } from './normalize'
import { exportTagRollMidi } from './midiExport'
import { projectDurationSeconds, secondsAtTick } from './tempoMap'
import { TAG_ROLL_PPQ } from './types'

describe('audioBounce planning', () => {
  it('converts ticks to seconds at project BPM', () => {
    expect(ticksToSec(TAG_ROLL_PPQ, 120)).toBeCloseTo(0.5)
    expect(ticksToSec(TAG_ROLL_PPQ * 4, 60)).toBeCloseTo(4)
  })

  it('plans mix + part-left with hosted-style labels', () => {
    expect(partSlug('Lead Voice')).toBe('lead-voice')
    expect(bounceTrackFilename('Lilly Marlene', 'Lead', 'mp3')).toBe('Lilly Marlene - Lead.mp3')
    const p = createEmptyTagRollProject({ title: 'Lilly Marlene' })
    const lead = p.parts.find((x) => x.name === 'Lead')!
    const bass = p.parts.find((x) => x.name === 'Bass')!
    p.notes = [
      {
        id: 'n1',
        partId: lead.id,
        midi: 60,
        startTick: 0,
        durationTicks: TAG_ROLL_PPQ,
      },
      {
        id: 'n2',
        partId: bass.id,
        midi: 48,
        startTick: 0,
        durationTicks: TAG_ROLL_PPQ,
      },
    ]
    const both = planBounceSteps(p, { mix: true, perPart: true })
    expect(both.map((s) => s.label)).toEqual(['Mix', 'Lead Solo', 'Bass Solo'])
    const mixOnly = planBounceSteps(p, { mix: true, perPart: false })
    expect(mixOnly.map((s) => s.label)).toEqual(['Mix'])
    const partLeft = planBounceSteps(p, { mix: false, perPart: false, partLeft: true })
    expect(partLeft.map((s) => s.label)).toEqual(['Mix', 'Lead', 'Bass'])
    expect(partLeft[0]?.kind).toBe('mix')
    expect(partLeft.slice(1).every((s) => s.kind === 'partLeft')).toBe(true)
    expect(TAG_ROLL_BOUNCE_MAX_SECONDS).toBe(180)
  })

  it('finds first content measure and trims leading silence', () => {
    const p = createEmptyTagRollProject()
    p.bpm = 120
    p.tempoMarkers = [{ id: 't0', tick: 0, bpm: 120 }]
    const lead = p.parts[0]!
    p.notes = [
      {
        id: 'n1',
        partId: lead.id,
        midi: 60,
        startTick: TAG_ROLL_PPQ * 4 + 10,
        durationTicks: TAG_ROLL_PPQ,
      },
    ]
    expect(firstContentMeasureTick(p)).toBe(TAG_ROLL_PPQ * 4)
    const sr = 100
    const buf = createAudioBuffer(1, 400, sr)
    buf.getChannelData(0).fill(0.5)
    // At 120 BPM, 1920 ticks = 2s → 200 samples at sr=100
    const trimmed = trimBufferFromTick(buf, p, TAG_ROLL_PPQ * 4)
    expect(trimmed.length).toBe(200)
  })

  it('flags long arrangements over the bounce cap', () => {
    const sec = ticksToSec(TAG_ROLL_PPQ * 480, 120)
    expect(sec).toBeGreaterThan(TAG_ROLL_BOUNCE_MAX_SECONDS)
  })

  it('duration with rit is longer than constant start tempo', () => {
    const p = createEmptyTagRollProject()
    p.bpm = 120
    p.tempoMarkers = [{ id: 't0', tick: 0, bpm: 120 }]
    p.lengthTicks = TAG_ROLL_PPQ * 8
    p.expressions = [
      {
        id: 'r1',
        kind: 'rit',
        startTick: 0,
        endTick: TAG_ROLL_PPQ * 8,
        startBpm: 120,
        endBpm: 60,
      },
    ]
    const withRit = projectDurationSeconds(p)
    const constant = secondsAtTick(p.lengthTicks, p.tempoMarkers, [], 120)
    expect(withRit).toBeGreaterThan(constant)
  })

  it('fermata extends project duration', () => {
    const p = createEmptyTagRollProject()
    p.bpm = 120
    p.tempoMarkers = [{ id: 't0', tick: 0, bpm: 120 }]
    p.lengthTicks = TAG_ROLL_PPQ * 4
    const base = projectDurationSeconds(p)
    p.expressions = [
      {
        id: 'f1',
        kind: 'fermata',
        tick: TAG_ROLL_PPQ,
        holdTicks: TAG_ROLL_PPQ,
        gapTicks: TAG_ROLL_PPQ,
      },
    ]
    const withFermata = projectDurationSeconds(p)
    expect(withFermata).toBeGreaterThan(base + 0.9)
  })

  it('builds part-left stereo with solo on left and gain-split accompaniment', () => {
    const solo = new Float32Array([0.5, 0.5, 0.5, 0.5])
    const other = new Float32Array([0.3, 0.3, 0.3, 0.3])
    const other2 = new Float32Array([0.3, 0.3, 0.3, 0.3])
    const buf = buildPartLeftBuffer(solo, [other, other2], 44100)
    expect(buf.numberOfChannels).toBe(2)
    expect(buf.getChannelData(0)[0]).toBeCloseTo(0.5)
    // sideVoiceGain(2) = 0.5 → each 0.3*0.5 summed = 0.3
    expect(buf.getChannelData(1)[0]).toBeCloseTo(0.3)
    const mono = bufferToMono(buf)
    expect(mono[0]).toBeCloseTo(0.4)
  })

  it('builds mix with equal-power pans', () => {
    const a = new Float32Array([1, 1, 1, 1])
    const b = new Float32Array([0.5, 0.5, 0.5, 0.5])
    const buf = buildMixBuffer(
      [
        { mono: a, pan: -1 },
        { mono: b, pan: 1 },
      ],
      44100,
    )
    // Hard L/R + 0.99 headroom when peak would clip
    expect(buf.getChannelData(0)[0]).toBeCloseTo(0.99)
    expect(buf.getChannelData(1)[0]).toBeCloseTo(0.495)
  })
})

describe('midiExport tempo map', () => {
  it('emits multiple tempo meta events when markers exist', () => {
    const p = createEmptyTagRollProject()
    p.tempoMarkers = [
      { id: 't0', tick: 0, bpm: 104 },
      { id: 't1', tick: TAG_ROLL_PPQ * 4, bpm: 120 },
    ]
    const bytes = exportTagRollMidi(p, 'one')
    let tempos = 0
    for (let i = 0; i < bytes.length - 2; i++) {
      if (bytes[i] === 0xff && bytes[i + 1] === 0x51 && bytes[i + 2] === 0x03) tempos++
    }
    expect(tempos).toBeGreaterThanOrEqual(2)
  })
})
