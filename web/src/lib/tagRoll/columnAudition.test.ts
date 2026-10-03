import { describe, expect, it } from 'vitest'
import { notesForColumnAudition } from './columnAudition'
import type { TagRollNote } from './types'

const lead: TagRollNote = {
  id: 'l',
  partId: 'lead',
  midi: 60,
  startTick: 0,
  durationTicks: 480,
}
const bari: TagRollNote = {
  id: 'b',
  partId: 'bari',
  midi: 55,
  startTick: 0,
  durationTicks: 480,
}
const bass: TagRollNote = {
  id: 's',
  partId: 'bass',
  midi: 48,
  startTick: 0,
  durationTicks: 480,
}

describe('notesForColumnAudition', () => {
  it('returns written stack when no ghosts', () => {
    const notes = notesForColumnAudition({
      notes: [lead, bari, bass],
      tick: 0,
      melodyPartId: 'lead',
    })
    expect(notes.map((n) => n.id).sort()).toEqual(['b', 'l', 's'])
  })

  it('prefers ghosts over written TTBB when preview covers tick', () => {
    const notes = notesForColumnAudition({
      notes: [lead, bari, bass],
      tick: 0,
      melodyPartId: 'lead',
      ghosts: [
        { midi: 64, startTick: 0, durationTicks: 480 },
        { midi: 52, startTick: 0, durationTicks: 480 },
        { midi: 45, startTick: 0, durationTicks: 480 },
      ],
    })
    expect(notes.some((n) => n.id === 'b')).toBe(false)
    expect(notes.some((n) => n.id === 's')).toBe(false)
    expect(notes.some((n) => n.id === 'l')).toBe(true)
    expect(notes.filter((n) => n.id.startsWith('ghost-')).map((n) => n.midi).sort()).toEqual([
      45, 52, 64,
    ])
  })
})
