import { describe, expect, it } from 'vitest'
import {
  bandColorsForNote,
  notesSharingPitch,
  sortNotesForOverlapPaint,
} from './overlapNotePaint'
import type { TagRollNote } from './types'

const parts = [
  { id: 'tenor', color: '#c45c26' },
  { id: 'lead', color: '#2a6' },
  { id: 'bari', color: '#2f7d4a' },
  { id: 'bass', color: '#5b3d8f' },
]

describe('overlapNotePaint', () => {
  it('finds same-midi time overlaps', () => {
    const a: TagRollNote = {
      id: 'a',
      partId: 'lead',
      midi: 60,
      startTick: 0,
      durationTicks: 480,
    }
    const b: TagRollNote = {
      id: 'b',
      partId: 'bari',
      midi: 60,
      startTick: 240,
      durationTicks: 480,
    }
    const c: TagRollNote = {
      id: 'c',
      partId: 'bass',
      midi: 48,
      startTick: 0,
      durationTicks: 480,
    }
    expect(notesSharingPitch([a, b, c], a).map((n) => n.id).sort()).toEqual(['a', 'b'])
  })

  it('puts active part color first (top band)', () => {
    const note: TagRollNote = {
      id: 'a',
      partId: 'lead',
      midi: 60,
      startTick: 0,
      durationTicks: 480,
    }
    const sharing: TagRollNote[] = [
      note,
      { id: 'b', partId: 'bari', midi: 60, startTick: 0, durationTicks: 480 },
      { id: 'c', partId: 'bass', midi: 60, startTick: 0, durationTicks: 480 },
    ]
    expect(bandColorsForNote(note, sharing, parts, { activePartId: 'lead' })).toEqual([
      '#2a6',
      '#2f7d4a',
      '#5b3d8f',
    ])
  })

  it('sorts active/selected last for z-order', () => {
    const sorted = sortNotesForOverlapPaint(
      [
        { id: '1', partId: 'bass' },
        { id: '2', partId: 'lead' },
        { id: '3', partId: 'bari' },
      ],
      { activePartId: 'lead', selectedIds: new Set(['3']) },
    )
    expect(sorted.map((n) => n.id)).toEqual(['1', '2', '3'])
  })
})
