import { describe, expect, it } from 'vitest'
import { assignSheetStaves } from './assignStaves'
import { buildSheetRhythm } from './rhythmLayout'
import { TAG_ROLL_PPQ } from '../types'
import { tupletMemberDuration } from './sheetTuplets'

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
})
