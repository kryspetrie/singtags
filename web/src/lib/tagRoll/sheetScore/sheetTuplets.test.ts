import { describe, expect, it } from 'vitest'
import { assignSheetStaves } from './assignStaves'
import { buildSheetRhythm } from './rhythmLayout'
import { TAG_ROLL_PPQ } from '../types'
import { tupletMemberDuration, tupletMemberWrittenDuration } from './sheetTuplets'

const parts = [
  { id: 't', name: 'Tenor', color: '#a' },
  { id: 'l', name: 'Lead', color: '#b' },
  { id: 'r', name: 'Bari', color: '#c' },
  { id: 'b', name: 'Bass', color: '#d' },
]

describe('sheetTuplets', () => {
  it('maps a quarter-span triplet to eighth glyphs', () => {
    const d = tupletMemberDuration(TAG_ROLL_PPQ)
    expect(d.type).toBe('eighth')
    expect(d.dots).toBe(0)
  })

  it('maps a quarter-span sextuplet to sixteenth glyphs', () => {
    const d = tupletMemberDuration(TAG_ROLL_PPQ, TAG_ROLL_PPQ, 4)
    expect(d.type).toBe('sixteenth')
    expect(d.dots).toBe(0)
  })

  it('maps multi-slot / dotted-span tuplet members to dotted glyphs', () => {
    const span = Math.round(TAG_ROLL_PPQ * 1.5)
    const unit = Math.round(span / 3)
    const one = tupletMemberWrittenDuration(unit, span, 3, 2, TAG_ROLL_PPQ)
    expect(one.type).toBe('eighth')
    expect(one.dots).toBe(1)
    const two = tupletMemberWrittenDuration(unit * 2, span, 3, 2, TAG_ROLL_PPQ)
    expect(two.type).toBe('quarter')
    expect(two.dots).toBe(1)
  })

  it('engraves unequal dotted-quarter-span triplet members', () => {
    const assignment = assignSheetStaves(parts, 'ttbb')
    const span = Math.round(TAG_ROLL_PPQ * 1.5)
    const unit = Math.round(span / 3)
    const events = buildSheetRhythm({
      assignment,
      notes: [
        {
          id: 'a',
          partId: 'l',
          midi: 60,
          startTick: 0,
          durationTicks: unit * 2,
          tuplet: { groupId: 'dq-trip', actualNotes: 3, normalNotes: 2 },
        },
        {
          id: 'b',
          partId: 'l',
          midi: 62,
          startTick: unit * 2,
          durationTicks: span - unit * 2,
          tuplet: { groupId: 'dq-trip', actualNotes: 3, normalNotes: 2 },
        },
      ],
      lengthTicks: TAG_ROLL_PPQ * 4,
      timeSignature: { numerator: 4, denominator: 4 },
      tuplets: [
        {
          id: 'dq-trip',
          partId: 'l',
          startTick: 0,
          spanTicks: span,
          actualNotes: 3,
          normalNotes: 2,
        },
      ],
    })
    const notes = events.filter((e) => e.partId === 'l' && e.concertMidi != null)
    expect(notes).toHaveLength(2)
    expect(notes[0]!.duration).toMatchObject({ type: 'quarter', dots: 1 })
    expect(notes[1]!.duration).toMatchObject({ type: 'eighth', dots: 1 })
  })

  it('uses explicit container membership without re-inferring', () => {
    const assignment = assignSheetStaves(parts, 'ttbb')
    const third = Math.round(TAG_ROLL_PPQ / 3)
    const d0 = third
    const d1 = third
    const d2 = TAG_ROLL_PPQ - d0 - d1
    const events = buildSheetRhythm({
      assignment,
      notes: [
        {
          id: 'a',
          partId: 'l',
          midi: 60,
          startTick: 0,
          durationTicks: d0,
          tuplet: { groupId: 'explicit', actualNotes: 3, normalNotes: 2 },
        },
        {
          id: 'b',
          partId: 'l',
          midi: 62,
          startTick: d0,
          durationTicks: d1,
          tuplet: { groupId: 'explicit', actualNotes: 3, normalNotes: 2 },
        },
        {
          id: 'c',
          partId: 'l',
          midi: 64,
          startTick: d0 + d1,
          durationTicks: d2,
          tuplet: { groupId: 'explicit', actualNotes: 3, normalNotes: 2 },
        },
      ],
      lengthTicks: TAG_ROLL_PPQ * 4,
      timeSignature: { numerator: 4, denominator: 4 },
      tuplets: [
        {
          id: 'explicit',
          partId: 'l',
          startTick: 0,
          spanTicks: TAG_ROLL_PPQ,
          actualNotes: 3,
          normalNotes: 2,
        },
      ],
    })
    const notes = events.filter((e) => e.partId === 'l' && e.concertMidi != null)
    expect(notes).toHaveLength(3)
    expect(notes.every((n) => n.tuplet != null)).toBe(true)
    expect(notes.every((n) => n.duration.type === 'eighth')).toBe(true)
    // Not binary-split into 16th+32nd.
    expect(notes.every((n) => n.durationTicks === n.duration.ticks || n.tuplet)).toBe(true)
  })

  it('stamps from container when note.tuplet is missing', () => {
    const assignment = assignSheetStaves(parts, 'ttbb')
    const third = Math.round(TAG_ROLL_PPQ / 3)
    const d0 = third
    const d1 = third
    const d2 = TAG_ROLL_PPQ - d0 - d1
    const events = buildSheetRhythm({
      assignment,
      notes: [
        { id: 'a', partId: 'l', midi: 60, startTick: 0, durationTicks: d0 },
        { id: 'b', partId: 'l', midi: 62, startTick: d0, durationTicks: d1 },
        { id: 'c', partId: 'l', midi: 64, startTick: d0 + d1, durationTicks: d2 },
      ],
      lengthTicks: TAG_ROLL_PPQ * 4,
      timeSignature: { numerator: 4, denominator: 4 },
      tuplets: [
        {
          id: 'from-container',
          partId: 'l',
          startTick: 0,
          spanTicks: TAG_ROLL_PPQ,
          actualNotes: 3,
          normalNotes: 2,
        },
      ],
    })
    const notes = events.filter((e) => e.partId === 'l' && e.concertMidi != null)
    expect(notes.every((n) => n.tuplet?.actualNotes === 3)).toBe(true)
  })

  it('empty container span still fills with a rest', () => {
    const assignment = assignSheetStaves(parts, 'ttbb')
    const events = buildSheetRhythm({
      assignment,
      notes: [],
      lengthTicks: TAG_ROLL_PPQ * 4,
      timeSignature: { numerator: 4, denominator: 4 },
      tuplets: [
        {
          id: 'empty',
          partId: 'l',
          startTick: 0,
          spanTicks: TAG_ROLL_PPQ,
          actualNotes: 3,
          normalNotes: 2,
        },
      ],
    })
    const lead = events.filter((e) => e.partId === 'l')
    expect(lead.some((e) => e.concertMidi == null)).toBe(true)
    const covered = lead.reduce((s, e) => s + e.durationTicks, 0)
    expect(covered).toBeGreaterThanOrEqual(TAG_ROLL_PPQ * 4)
  })

  it('infers eighth triplets that fill a quarter', () => {
    const assignment = assignSheetStaves(parts, 'ttbb')
    const third = Math.round(TAG_ROLL_PPQ / 3)
    // Adjust so three sum exactly to a quarter.
    const d0 = third
    const d1 = third
    const d2 = TAG_ROLL_PPQ - d0 - d1
    const events = buildSheetRhythm({
      assignment,
      notes: [
        { id: 'a', partId: 'l', midi: 60, startTick: 0, durationTicks: d0 },
        { id: 'b', partId: 'l', midi: 62, startTick: d0, durationTicks: d1 },
        { id: 'c', partId: 'l', midi: 64, startTick: d0 + d1, durationTicks: d2 },
      ],
      lengthTicks: TAG_ROLL_PPQ * 4,
      timeSignature: { numerator: 4, denominator: 4 },
    })
    const notes = events.filter((e) => e.partId === 'l' && e.concertMidi != null)
    expect(notes).toHaveLength(3)
    expect(notes.every((n) => n.tuplet != null)).toBe(true)
    expect(notes[0]!.tuplet!.actualNotes).toBe(3)
    expect(notes[0]!.tuplet!.normalNotes).toBe(2)
    expect(notes.map((n) => n.tuplet!.index)).toEqual([0, 1, 2])
    expect(notes[0]!.duration.type).toBe('eighth')
  })

  it('does not infer a triplet from three quarters in 3/4', () => {
    const assignment = assignSheetStaves(parts, 'ttbb')
    const events = buildSheetRhythm({
      assignment,
      notes: [
        { id: 'a', partId: 'l', midi: 60, startTick: 0, durationTicks: TAG_ROLL_PPQ },
        { id: 'b', partId: 'l', midi: 62, startTick: TAG_ROLL_PPQ, durationTicks: TAG_ROLL_PPQ },
        { id: 'c', partId: 'l', midi: 64, startTick: TAG_ROLL_PPQ * 2, durationTicks: TAG_ROLL_PPQ },
      ],
      lengthTicks: TAG_ROLL_PPQ * 3,
      timeSignature: { numerator: 3, denominator: 4 },
    })
    const notes = events.filter((e) => e.partId === 'l' && e.concertMidi != null)
    expect(notes).toHaveLength(3)
    expect(notes.every((n) => n.tuplet == null)).toBe(true)
    expect(notes.every((n) => n.duration.type === 'quarter' && n.duration.dots === 0)).toBe(true)
  })

  it('does not infer a triplet from three eighths filling a dotted quarter', () => {
    const assignment = assignSheetStaves(parts, 'ttbb')
    const eighth = TAG_ROLL_PPQ / 2
    const events = buildSheetRhythm({
      assignment,
      notes: [
        { id: 'a', partId: 'l', midi: 60, startTick: 0, durationTicks: eighth },
        { id: 'b', partId: 'l', midi: 62, startTick: eighth, durationTicks: eighth },
        { id: 'c', partId: 'l', midi: 64, startTick: eighth * 2, durationTicks: eighth },
      ],
      lengthTicks: TAG_ROLL_PPQ * 3,
      timeSignature: { numerator: 3, denominator: 4 },
    })
    const notes = events.filter((e) => e.partId === 'l' && e.concertMidi != null)
    expect(notes).toHaveLength(3)
    expect(notes.every((n) => n.tuplet == null)).toBe(true)
    expect(notes.every((n) => n.duration.type === 'eighth' && n.duration.dots === 0)).toBe(true)
  })
})
