import { describe, expect, it } from 'vitest'
import {
  canTieNotes,
  sanitizeNoteTies,
  tieChainEndTick,
  tieNotesInList,
  tieSelectionState,
  untieNotesInList,
} from './noteTies'
import type { TagRollNote } from './types'

function note(
  id: string,
  partial: Partial<TagRollNote> & Pick<TagRollNote, 'startTick' | 'durationTicks'>,
): TagRollNote {
  return {
    id,
    partId: partial.partId ?? 'lead',
    midi: partial.midi ?? 60,
    startTick: partial.startTick,
    durationTicks: partial.durationTicks,
    ...(partial.lyric ? { lyric: partial.lyric } : {}),
    ...(partial.tie ? { tie: partial.tie } : {}),
  }
}

describe('noteTies', () => {
  it('canTieNotes accepts adjacent same-pitch same-part', () => {
    const a = note('a', { startTick: 0, durationTicks: 480 })
    const b = note('b', { startTick: 480, durationTicks: 480 })
    const v = canTieNotes(a, b)
    expect(v.ok).toBe(true)
    if (v.ok) {
      expect(v.earlier.id).toBe('a')
      expect(v.later.id).toBe('b')
    }
  })

  it('canTieNotes rejects different midi / part / gap', () => {
    const a = note('a', { startTick: 0, durationTicks: 480 })
    expect(canTieNotes(a, note('b', { startTick: 480, durationTicks: 480, midi: 62 })).ok).toBe(
      false,
    )
    expect(
      canTieNotes(a, note('b', { startTick: 480, durationTicks: 480, partId: 'bass' })).ok,
    ).toBe(false)
    expect(canTieNotes(a, note('b', { startTick: 500, durationTicks: 480 })).ok).toBe(false)
  })

  it('sanitizeNoteTies drops dangling and invalid targets', () => {
    const notes = sanitizeNoteTies([
      note('a', { startTick: 0, durationTicks: 480, tie: { toNoteId: 'missing' } }),
      note('b', { startTick: 480, durationTicks: 480, midi: 62, tie: { toNoteId: 'c' } }),
      note('c', { startTick: 1000, durationTicks: 480, midi: 62 }),
      note('d', {
        startTick: 0,
        durationTicks: 240,
        partId: 'bass',
        tie: { toNoteId: 'e' },
      }),
      note('e', { startTick: 240, durationTicks: 240, partId: 'bass' }),
    ])
    expect(notes.find((n) => n.id === 'a')?.tie).toBeUndefined()
    expect(notes.find((n) => n.id === 'b')?.tie).toBeUndefined()
    expect(notes.find((n) => n.id === 'd')?.tie?.toNoteId).toBe('e')
  })

  it('tieNotesInList / untieNotesInList round-trip', () => {
    const base = [
      note('a', { startTick: 0, durationTicks: 480 }),
      note('b', { startTick: 480, durationTicks: 480 }),
    ]
    const tied = tieNotesInList(base, 'b', 'a')
    expect(tied).not.toBeNull()
    expect(tied!.find((n) => n.id === 'a')?.tie?.toNoteId).toBe('b')
    expect(tied!.find((n) => n.id === 'b')?.tie).toBeUndefined()
    const untied = untieNotesInList(tied!, 'a', 'b')
    expect(untied.every((n) => !n.tie)).toBe(true)
  })

  it('tieNotesInList rejects invalid pairs', () => {
    expect(
      tieNotesInList(
        [
          note('a', { startTick: 0, durationTicks: 480 }),
          note('b', { startTick: 480, durationTicks: 480, midi: 64 }),
        ],
        'a',
        'b',
      ),
    ).toBeNull()
  })

  it('tieSelectionState reports canTie / canUntie', () => {
    const notes = [
      note('a', { startTick: 0, durationTicks: 480 }),
      note('b', { startTick: 480, durationTicks: 480 }),
    ]
    expect(tieSelectionState(notes, ['a', 'b']).canTie).toBe(true)
    const tied = tieNotesInList(notes, 'a', 'b')!
    expect(tieSelectionState(tied, ['a', 'b']).canUntie).toBe(true)
    expect(tieSelectionState(tied, ['a']).canTie).toBe(false)
  })

  it('tieChainEndTick sums the chain', () => {
    const notes = [
      note('a', { startTick: 0, durationTicks: 480, tie: { toNoteId: 'b' } }),
      note('b', { startTick: 480, durationTicks: 240, tie: { toNoteId: 'c' } }),
      note('c', { startTick: 720, durationTicks: 240 }),
    ]
    expect(tieChainEndTick(notes, notes[0]!)).toBe(960)
  })
})
