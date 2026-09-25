import { describe, expect, it } from 'vitest'
import {
  neighborNoteInStack,
  neighborNoteSamePart,
  notesOverlappingTick,
} from './noteSelectionNav'
import type { TagRollNote } from './types'

function n(
  id: string,
  partId: string,
  midi: number,
  startTick: number,
  durationTicks = 480,
): TagRollNote {
  return { id, partId, midi, startTick, durationTicks }
}

describe('noteSelectionNav', () => {
  const notes = [
    n('t1', 'tenor', 72, 0),
    n('l1', 'lead', 67, 0),
    n('b1', 'bari', 64, 0),
    n('s1', 'bass', 55, 0),
    n('l2', 'lead', 69, 480),
  ]

  it('lists stack mates overlapping a tick', () => {
    expect(notesOverlappingTick(notes, 0).map((x) => x.id).sort()).toEqual([
      'b1',
      'l1',
      's1',
      't1',
    ])
  })

  it('walks same-part neighbors by time', () => {
    expect(neighborNoteSamePart(notes, 'l1', 1)?.id).toBe('l2')
    expect(neighborNoteSamePart(notes, 'l2', -1)?.id).toBe('l1')
    expect(neighborNoteSamePart(notes, 'l2', 1)).toBeNull()
  })

  it('walks vertical stack without changing when empty', () => {
    expect(neighborNoteInStack(notes, 'l1', 'up')?.id).toBe('t1')
    expect(neighborNoteInStack(notes, 'l1', 'down')?.id).toBe('b1')
    expect(neighborNoteInStack(notes, 't1', 'up')).toBeNull()
    expect(neighborNoteInStack(notes, 's1', 'down')).toBeNull()
  })
})
