import { describe, expect, it } from 'vitest'
import { lastNoteEndTick, notesAtTick, notesForPartSorted, playbackEndTick, hearStackNotesAtTick } from './notesAtTick'
import type { TagRollNote } from './types'
import { TAG_ROLL_PPQ } from './types'

const notes: TagRollNote[] = [
  { id: 'a', partId: 'lead', midi: 60, startTick: 0, durationTicks: 480 },
  { id: 'b', partId: 'bass', midi: 48, startTick: 240, durationTicks: 480 },
  { id: 'c', partId: 'lead', midi: 64, startTick: 480, durationTicks: 240 },
  { id: 'd', partId: 'lead', midi: 62, startTick: 0, durationTicks: 120 },
]

describe('notesAtTick', () => {
  it('returns notes spanning the tick', () => {
    expect(notesAtTick(notes, 0).map((n) => n.id).sort()).toEqual(['a', 'd'])
    expect(notesAtTick(notes, 240).map((n) => n.id).sort()).toEqual(['a', 'b'])
    expect(notesAtTick(notes, 500).map((n) => n.id).sort()).toEqual(['b', 'c'])
    expect(notesAtTick(notes, 900)).toEqual([])
  })

  it('hear stack keeps only the rightmost note per part on portamento overlap', () => {
    // a (0–480) and late (200–480) overlap at 300 on lead — hear only late.
    const overlapping: TagRollNote[] = [
      { id: 'early', partId: 'lead', midi: 60, startTick: 0, durationTicks: 480 },
      { id: 'late', partId: 'lead', midi: 64, startTick: 200, durationTicks: 280 },
      { id: 'bass', partId: 'bass', midi: 48, startTick: 0, durationTicks: 480 },
    ]
    expect(hearStackNotesAtTick(overlapping, 300).map((n) => n.id).sort()).toEqual([
      'bass',
      'late',
    ])
  })

  it('sorts part notes by start then midi', () => {
    const lead = notesForPartSorted(notes, 'lead')
    expect(lead.map((n) => n.id)).toEqual(['a', 'd', 'c'])
  })

  it('finds last note end and playback stop tick', () => {
    expect(lastNoteEndTick(notes)).toBe(720)
    expect(playbackEndTick(notes, TAG_ROLL_PPQ * 8)).toBe(720)
    expect(playbackEndTick([], TAG_ROLL_PPQ * 8)).toBe(TAG_ROLL_PPQ * 8)
    expect(playbackEndTick(notes, 100)).toBe(100)
  })
})
