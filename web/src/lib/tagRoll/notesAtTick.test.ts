import { describe, expect, it } from 'vitest'
import { notesAtTick, notesForPartSorted } from './notesAtTick'
import type { TagRollNote } from './types'

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

  it('sorts part notes by start then midi', () => {
    const lead = notesForPartSorted(notes, 'lead')
    expect(lead.map((n) => n.id)).toEqual(['a', 'd', 'c'])
  })
})
