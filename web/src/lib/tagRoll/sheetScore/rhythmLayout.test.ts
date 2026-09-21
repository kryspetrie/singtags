import { describe, expect, it } from 'vitest'
import { assignSheetStaves } from './assignStaves'
import { mapTicksToDuration } from './durationMap'
import { engraveSheetScore } from './engrave'
import { buildSheetRhythm } from './rhythmLayout'
import { layoutSheetScore } from './staffGeometry'
import { writtenMidiToStaffPos, diatonicIndex } from './staffPitch'
import { TAG_ROLL_PPQ } from '../types'

const parts = [
  { id: 't', name: 'Tenor', color: '#c45c26', midiGroup: 'upper' as const },
  { id: 'l', name: 'Lead', color: '#1d6a9f', midiGroup: 'upper' as const },
  { id: 'r', name: 'Bari', color: '#2f7d4a', midiGroup: 'lower' as const },
  { id: 'b', name: 'Bass', color: '#5b3d8f', midiGroup: 'lower' as const },
]

describe('mapTicksToDuration', () => {
  it('maps common lengths', () => {
    expect(mapTicksToDuration(TAG_ROLL_PPQ).type).toBe('quarter')
    expect(mapTicksToDuration(TAG_ROLL_PPQ / 2).type).toBe('eighth')
    expect(mapTicksToDuration(TAG_ROLL_PPQ * 2).type).toBe('half')
    expect(mapTicksToDuration(TAG_ROLL_PPQ * 3).dots).toBe(1)
    expect(mapTicksToDuration(TAG_ROLL_PPQ / 2).flags).toBe(1)
  })
})

describe('staffPitch', () => {
  it('places treble middle-line B4 near staff center', () => {
    // B4 written on treble middle line → stepsFromTop = 4
    const pos = writtenMidiToStaffPos(71, 'treble', 8, false)
    expect(pos.stepsFromTop).toBe(4)
    expect(pos.yFromTop).toBe(16)
  })

  it('adds ledger lines below the staff', () => {
    // Middle C (60) on treble is one ledger below
    const pos = writtenMidiToStaffPos(60, 'treble', 8, false)
    expect(pos.stepsFromTop).toBeGreaterThan(8)
    expect(pos.ledgerStepsFromTop.length).toBeGreaterThan(0)
  })

  it('marks sharps from preferFlats=false', () => {
    const pos = writtenMidiToStaffPos(61, 'treble', 8, false) // C#
    expect(pos.accidental).toBe('sharp')
  })

  it('computes diatonic indices', () => {
    expect(diatonicIndex('C', 4)).toBe(28)
    expect(diatonicIndex('E', 4)).toBe(30)
  })
})

describe('buildSheetRhythm', () => {
  it('assigns tenor stems up and lead stems down', () => {
    const assignment = assignSheetStaves(parts, 'ttbb')
    const events = buildSheetRhythm({
      assignment,
      notes: [
        {
          id: 'n1',
          partId: 't',
          midi: 67,
          startTick: 0,
          durationTicks: TAG_ROLL_PPQ,
        },
        {
          id: 'n2',
          partId: 'l',
          midi: 60,
          startTick: 0,
          durationTicks: TAG_ROLL_PPQ,
        },
      ],
      lengthTicks: TAG_ROLL_PPQ * 4,
      timeSignature: { numerator: 4, denominator: 4 },
    })
    const tenor = events.find((e) => e.partId === 't' && e.concertMidi != null)
    const lead = events.find((e) => e.partId === 'l' && e.concertMidi != null)
    expect(tenor?.stemUp).toBe(true)
    expect(tenor?.voice).toBe(1)
    expect(lead?.stemUp).toBe(false)
    expect(lead?.voice).toBe(2)
  })

  it('beams consecutive eighths within a beat', () => {
    const assignment = assignSheetStaves(parts, 'ttbb')
    const events = buildSheetRhythm({
      assignment,
      notes: [
        {
          id: 'a',
          partId: 'l',
          midi: 60,
          startTick: 0,
          durationTicks: TAG_ROLL_PPQ / 2,
        },
        {
          id: 'b',
          partId: 'l',
          midi: 62,
          startTick: TAG_ROLL_PPQ / 2,
          durationTicks: TAG_ROLL_PPQ / 2,
        },
      ],
      lengthTicks: TAG_ROLL_PPQ * 4,
      timeSignature: { numerator: 4, denominator: 4 },
    })
    const notes = events.filter((e) => e.partId === 'l' && e.concertMidi != null)
    expect(notes).toHaveLength(2)
    expect(notes[0]!.beamGroupId).not.toBeNull()
    expect(notes[0]!.beamGroupId).toBe(notes[1]!.beamGroupId)
  })

  it('splits and ties notes across barlines', () => {
    const assignment = assignSheetStaves(parts, 'ttbb')
    const events = buildSheetRhythm({
      assignment,
      notes: [
        {
          id: 'long',
          partId: 'l',
          midi: 60,
          startTick: TAG_ROLL_PPQ * 3,
          durationTicks: TAG_ROLL_PPQ * 2,
        },
      ],
      lengthTicks: TAG_ROLL_PPQ * 8,
      timeSignature: { numerator: 4, denominator: 4 },
    })
    const notes = events.filter((e) => e.partId === 'l' && e.concertMidi != null)
    expect(notes.length).toBeGreaterThanOrEqual(2)
    expect(notes.some((n) => n.tieStart)).toBe(true)
    expect(notes.some((n) => n.tieStop)).toBe(true)
  })

  it('inserts rests for empty spans', () => {
    const assignment = assignSheetStaves(parts, 'ttbb')
    const events = buildSheetRhythm({
      assignment,
      notes: [
        {
          id: 'n',
          partId: 'l',
          midi: 60,
          startTick: TAG_ROLL_PPQ,
          durationTicks: TAG_ROLL_PPQ,
        },
      ],
      lengthTicks: TAG_ROLL_PPQ * 4,
      timeSignature: { numerator: 4, denominator: 4 },
    })
    const lead = events.filter((e) => e.partId === 'l')
    expect(lead.some((e) => e.concertMidi == null && e.startTick === 0)).toBe(true)
  })

  it('shows portamento destination after the source releases', () => {
    const assignment = assignSheetStaves(parts, 'ttbb')
    const events = buildSheetRhythm({
      assignment,
      notes: [
        {
          id: 'from',
          partId: 'l',
          midi: 60,
          startTick: 0,
          durationTicks: TAG_ROLL_PPQ * 2,
        },
        {
          id: 'to',
          partId: 'l',
          midi: 64,
          startTick: TAG_ROLL_PPQ,
          durationTicks: TAG_ROLL_PPQ * 2,
        },
      ],
      lengthTicks: TAG_ROLL_PPQ * 4,
      timeSignature: { numerator: 4, denominator: 4 },
    })
    const notes = events.filter((e) => e.partId === 'l' && e.concertMidi != null)
    expect(notes).toHaveLength(2)
    expect(notes[0]!.concertMidi).toBe(60)
    expect(notes[0]!.startTick).toBe(0)
    expect(notes[0]!.durationTicks).toBe(TAG_ROLL_PPQ * 2)
    expect(notes[1]!.concertMidi).toBe(64)
    expect(notes[1]!.startTick).toBe(TAG_ROLL_PPQ * 2)
    expect(notes[1]!.durationTicks).toBe(TAG_ROLL_PPQ)
  })

  it('carries Lead lyrics onto rhythm events (not on tie continuations)', () => {
    const assignment = assignSheetStaves(parts, 'ttbb')
    const events = buildSheetRhythm({
      assignment,
      notes: [
        {
          id: 'n',
          partId: 'l',
          midi: 60,
          startTick: TAG_ROLL_PPQ * 3,
          durationTicks: TAG_ROLL_PPQ * 2,
          lyric: 'Love-',
        },
      ],
      lengthTicks: TAG_ROLL_PPQ * 8,
      timeSignature: { numerator: 4, denominator: 4 },
    })
    const notes = events.filter((e) => e.partId === 'l' && e.concertMidi != null)
    expect(notes[0]!.lyric).toBe('Love-')
    expect(notes.slice(1).every((n) => !n.lyric)).toBe(true)
  })

  it('assigns solo extras their own staff with voice 1', () => {
    const withSolo = [
      ...parts,
      { id: 'x', name: 'Solo', color: '#999', midiGroup: 'solo' as const },
    ]
    const assignment = assignSheetStaves(withSolo, 'ttbb')
    expect(assignment.staves.some((s) => s.kind === 'solo')).toBe(true)
    const events = buildSheetRhythm({
      assignment,
      notes: [
        {
          id: 's1',
          partId: 'x',
          midi: 72,
          startTick: 0,
          durationTicks: TAG_ROLL_PPQ,
          lyric: 'Hey',
        },
      ],
      lengthTicks: TAG_ROLL_PPQ * 4,
      timeSignature: { numerator: 4, denominator: 4 },
    })
    const solo = events.find((e) => e.partId === 'x' && e.concertMidi != null)
    expect(solo?.role).toBe('solo')
    expect(solo?.lyric).toBe('Hey')
    expect(solo?.stemUp).toBe(true)
  })
})

describe('engraveSheetScore', () => {
  it('produces heads and forced stems for TTBB stack', () => {
    const assignment = assignSheetStaves(parts, 'ttbb')
    const layout = layoutSheetScore({
      assignment,
      lengthTicks: TAG_ROLL_PPQ * 4,
      timeSignature: { numerator: 4, denominator: 4 },
    })
    const events = buildSheetRhythm({
      assignment,
      notes: [
        { id: 't1', partId: 't', midi: 67, startTick: 0, durationTicks: TAG_ROLL_PPQ },
        { id: 'l1', partId: 'l', midi: 60, startTick: 0, durationTicks: TAG_ROLL_PPQ },
        { id: 'r1', partId: 'r', midi: 55, startTick: 0, durationTicks: TAG_ROLL_PPQ },
        { id: 'b1', partId: 'b', midi: 48, startTick: 0, durationTicks: TAG_ROLL_PPQ },
      ],
      lengthTicks: TAG_ROLL_PPQ * 4,
      timeSignature: { numerator: 4, denominator: 4 },
    })
    const eng = engraveSheetScore({
      layout,
      events,
      clefFamily: 'ttbb',
      preferFlats: false,
      pxPerBeat: 28,
    })
    expect(eng.heads).toHaveLength(4)
    expect(eng.stems.length).toBeGreaterThanOrEqual(4)
  })

  it('creates beams for beamed eighths', () => {
    const assignment = assignSheetStaves(parts, 'ttbb')
    const layout = layoutSheetScore({
      assignment,
      lengthTicks: TAG_ROLL_PPQ * 4,
      timeSignature: { numerator: 4, denominator: 4 },
    })
    const events = buildSheetRhythm({
      assignment,
      notes: [
        {
          id: 'a',
          partId: 'l',
          midi: 60,
          startTick: 0,
          durationTicks: TAG_ROLL_PPQ / 2,
        },
        {
          id: 'b',
          partId: 'l',
          midi: 62,
          startTick: TAG_ROLL_PPQ / 2,
          durationTicks: TAG_ROLL_PPQ / 2,
        },
      ],
      lengthTicks: TAG_ROLL_PPQ * 4,
      timeSignature: { numerator: 4, denominator: 4 },
    })
    const eng = engraveSheetScore({
      layout,
      events,
      clefFamily: 'ttbb',
      preferFlats: false,
      pxPerBeat: 40,
    })
    expect(eng.beams.length).toBeGreaterThanOrEqual(1)
    expect(eng.flags).toHaveLength(0)
  })

  it('engraves Lead lyrics under the upper staff', () => {
    const assignment = assignSheetStaves(parts, 'ttbb')
    const layout = layoutSheetScore({
      assignment,
      lengthTicks: TAG_ROLL_PPQ * 4,
      timeSignature: { numerator: 4, denominator: 4 },
    })
    expect(layout.staves.find((s) => s.kind === 'upper')?.lyricBand).toBeGreaterThan(0)
    const events = buildSheetRhythm({
      assignment,
      notes: [
        {
          id: 'l1',
          partId: 'l',
          midi: 60,
          startTick: 0,
          durationTicks: TAG_ROLL_PPQ,
          lyric: 'Tag',
        },
        {
          id: 't1',
          partId: 't',
          midi: 67,
          startTick: 0,
          durationTicks: TAG_ROLL_PPQ,
          lyric: 'ignored',
        },
      ],
      lengthTicks: TAG_ROLL_PPQ * 4,
      timeSignature: { numerator: 4, denominator: 4 },
    })
    const eng = engraveSheetScore({
      layout,
      events,
      clefFamily: 'ttbb',
      preferFlats: false,
      pxPerBeat: 28,
    })
    expect(eng.lyrics).toHaveLength(1)
    expect(eng.lyrics[0]!.text).toBe('Tag')
    const upper = layout.staves.find((s) => s.kind === 'upper')!
    expect(eng.lyrics[0]!.y).toBeGreaterThan(upper.topY + upper.height)
  })

  it('engraves fermatas and rit/accel marks', () => {
    const assignment = assignSheetStaves(parts, 'ttbb')
    const layout = layoutSheetScore({
      assignment,
      lengthTicks: TAG_ROLL_PPQ * 8,
      timeSignature: { numerator: 4, denominator: 4 },
    })
    const events = buildSheetRhythm({
      assignment,
      notes: [],
      lengthTicks: TAG_ROLL_PPQ * 8,
      timeSignature: { numerator: 4, denominator: 4 },
    })
    const eng = engraveSheetScore({
      layout,
      events,
      clefFamily: 'ttbb',
      preferFlats: false,
      pxPerBeat: 28,
      expressions: [
        {
          id: 'f1',
          kind: 'fermata',
          tick: TAG_ROLL_PPQ * 2,
          holdTicks: TAG_ROLL_PPQ,
          gapTicks: TAG_ROLL_PPQ / 2,
        },
        {
          id: 'r1',
          kind: 'rit',
          startTick: TAG_ROLL_PPQ * 4,
          endTick: TAG_ROLL_PPQ * 6,
          startBpm: 104,
          endBpm: 80,
        },
      ],
    })
    expect(eng.fermatas).toHaveLength(1)
    expect(eng.ramps).toHaveLength(1)
    expect(eng.ramps[0]!.kind).toBe('rit')
    expect(eng.fermatas[0]!.y).toBeLessThan(layout.staves[0]!.topY)
  })
})
