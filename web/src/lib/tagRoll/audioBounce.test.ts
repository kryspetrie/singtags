import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAudioBuffer } from '../../audio/audioBufferFactory'
import {
  buildMixBuffer,
  buildPartLeftBuffer,
  bounceTagRollTracks,
  bounceTrackFilename,
  bufferToMono,
  firstContentMeasureTick,
  monoToDualStereo,
  partSlug,
  planBounceSteps,
  planPartBounceEvents,
  safeTrackNamePart,
  TAG_ROLL_BOUNCE_MAX_SECONDS,
  ticksToSec,
  trimBufferFromTick,
} from './audioBounce'
import { planBlowPitch } from './blowPitch'
import { stubOfflineAudioContext, wavStereoFrameCount } from './bounceWebAudioMock'
import { createEmptyTagRollProject } from './normalize'
import { exportTagRollMidi } from './midiExport'
import { projectDurationSeconds, secondsAtTick } from './tempoMap'
import { TAG_ROLL_PPQ } from './types'

function projectWithLeadNote(opts?: {
  blowPitchEnabled?: boolean
  startTick?: number
  bpm?: number
}) {
  const p = createEmptyTagRollProject({ title: 'Bounce Tag' })
  p.blowPitchEnabled = !!opts?.blowPitchEnabled
  p.bpm = opts?.bpm ?? 120
  p.tempoMarkers = [{ id: 't0', tick: 0, bpm: p.bpm }]
  p.lengthTicks = TAG_ROLL_PPQ * 8
  const lead = p.parts.find((x) => x.name === 'Lead')!
  const bass = p.parts.find((x) => x.name === 'Bass')!
  p.notes = [
    {
      id: 'n1',
      partId: lead.id,
      midi: 60,
      startTick: opts?.startTick ?? 0,
      durationTicks: TAG_ROLL_PPQ,
    },
    {
      id: 'n2',
      partId: bass.id,
      midi: 48,
      startTick: opts?.startTick ?? 0,
      durationTicks: TAG_ROLL_PPQ,
    },
  ]
  return p
}

describe('audioBounce planning', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('plans bounce note onsets with swing baked into wall-clock', () => {
    const p = projectWithLeadNote({ startTick: TAG_ROLL_PPQ / 2, bpm: 120 })
    p.notes = p.notes.slice(0, 1)
    p.notes[0]!.durationTicks = TAG_ROLL_PPQ / 2
    p.swing = { enabled: true, unit: 'eighth', style: 'triplet', amount: 1 }
    const straight = planPartBounceEvents(p.notes, {
      ...p,
      swing: { enabled: false, unit: 'eighth', style: 'triplet', amount: 0 },
    })
    const swung = planPartBounceEvents(p.notes, p)
    expect(straight[0]!.kind).toBe('attack')
    expect(swung[0]!.kind).toBe('attack')
    if (straight[0]!.kind === 'attack' && swung[0]!.kind === 'attack') {
      expect(swung[0].startSec).toBeGreaterThan(straight[0].startSec)
      // Pair total still one beat — note ends on the downbeat.
      expect(swung[0].endSec).toBeCloseTo(straight[0].endSec, 5)
    }
  })

  it('sanitizes track name fragments', () => {
    expect(safeTrackNamePart('A/B:C*?')).toBe('ABC')
    expect(safeTrackNamePart('   ')).toBe('track')
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

  it('duplicates mono into dual stereo', () => {
    const mono = new Float32Array([0.2, 0.4])
    const buf = monoToDualStereo(mono, 22050)
    expect(buf.numberOfChannels).toBe(2)
    expect(buf.sampleRate).toBe(22050)
    expect(buf.getChannelData(0)[1]).toBeCloseTo(0.4)
    expect(buf.getChannelData(1)[1]).toBeCloseTo(0.4)
  })

  it('plans attack then glide for overlapping monophonic notes', () => {
    const p = createEmptyTagRollProject()
    p.bpm = 120
    p.tempoMarkers = [{ id: 't0', tick: 0, bpm: 120 }]
    const lead = p.parts[0]!
    const notes = [
      {
        id: 'a',
        partId: lead.id,
        midi: 60,
        startTick: 0,
        durationTicks: TAG_ROLL_PPQ * 2,
      },
      {
        id: 'b',
        partId: lead.id,
        midi: 64,
        startTick: TAG_ROLL_PPQ,
        durationTicks: TAG_ROLL_PPQ,
      },
    ]
    p.notes = notes
    const events = planPartBounceEvents(notes, p)
    expect(events[0]?.kind).toBe('attack')
    expect(events.some((e) => e.kind === 'glide')).toBe(true)
  })
})

describe('bounceTagRollTracks + blow pitch', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('prepends a blow-pitch measure to mix WAV when enabled', async () => {
    stubOfflineAudioContext(0.15)
    const off = projectWithLeadNote({ blowPitchEnabled: false })
    const on = projectWithLeadNote({ blowPitchEnabled: true })
    const plan = planBlowPitch(on)!
    expect(plan.measureSec).toBeGreaterThan(1)

    const [offTrack] = await bounceTagRollTracks(off, {
      mix: true,
      perPart: false,
      format: 'wav',
    })
    const [onTrack] = await bounceTagRollTracks(on, {
      mix: true,
      perPart: false,
      format: 'wav',
    })
    expect(offTrack?.filename).toBe('Bounce Tag - Mix.wav')
    expect(onTrack?.filename).toBe('Bounce Tag - Mix.wav')

    const offFrames = wavStereoFrameCount(offTrack!.bytes)
    const onFrames = wavStereoFrameCount(onTrack!.bytes)
    const expectedPitchFrames = Math.ceil(plan.measureSec * 44100)
    expect(onFrames - offFrames).toBe(expectedPitchFrames)
  })

  it('prepends blow pitch to every part-left and mix track', async () => {
    stubOfflineAudioContext(0.2)
    const p = projectWithLeadNote({ blowPitchEnabled: true, startTick: TAG_ROLL_PPQ * 4 })
    const plan = planBlowPitch(p)!
    const tracks = await bounceTagRollTracks(p, {
      mix: false,
      perPart: false,
      partLeft: true,
      format: 'wav',
    })
    expect(tracks.map((t) => t.label)).toEqual(['Mix', 'Lead', 'Bass'])
    const pitchFrames = Math.ceil(plan.measureSec * 44100)
    for (const t of tracks) {
      const frames = wavStereoFrameCount(t.bytes)
      expect(frames).toBeGreaterThan(pitchFrames)
    }
    const without = projectWithLeadNote({
      blowPitchEnabled: false,
      startTick: TAG_ROLL_PPQ * 4,
    })
    const [mixOff] = await bounceTagRollTracks(without, {
      mix: true,
      perPart: false,
      format: 'wav',
    })
    const mixOn = tracks.find((t) => t.label === 'Mix')!
    expect(wavStereoFrameCount(mixOn.bytes) - wavStereoFrameCount(mixOff!.bytes)).toBe(
      pitchFrames,
    )
  })

  it('skips blow pitch render when disabled', async () => {
    stubOfflineAudioContext(0.1)
    const p = projectWithLeadNote({ blowPitchEnabled: false })
    expect(planBlowPitch(p)).toBeNull()
    const tracks = await bounceTagRollTracks(p, {
      mix: true,
      perPart: true,
      format: 'wav',
    })
    expect(tracks.map((t) => t.label)).toEqual(['Mix', 'Lead Solo', 'Bass Solo'])
    expect(tracks.every((t) => t.bytes.byteLength > 44)).toBe(true)
  })

  it('reports bounce progress including pitch when enabled', async () => {
    stubOfflineAudioContext(0.1)
    const p = projectWithLeadNote({ blowPitchEnabled: true })
    const labels: string[] = []
    await bounceTagRollTracks(p, {
      mix: true,
      perPart: false,
      format: 'wav',
      onProgress: (pr) => labels.push(pr.label),
    })
    expect(labels.some((l) => /pitch/i.test(l))).toBe(true)
    expect(labels.at(-1)).toBe('Done')
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
