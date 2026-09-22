/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  canLinkMelodyPass,
  orderMelodyPassPair,
  pruneMelodyPasses,
  resolveMelodyPasses,
  upsertMelodyPass,
} from './melodyPass'
import { melodyPassInspectHint } from './melodyPassActions'
import type { TagRollNote } from './types'

const n = (
  id: string,
  partId: string,
  startTick: number,
  midi = 60,
): TagRollNote => ({
  id,
  partId,
  midi,
  startTick,
  durationTicks: 240,
})

describe('melodyPass', () => {
  it('requires two different parts', () => {
    expect(canLinkMelodyPass(n('a', 'lead', 0), n('b', 'lead', 480))).toBe(false)
    expect(canLinkMelodyPass(n('a', 'lead', 0), n('b', 'bari', 480))).toBe(true)
  })

  it('orders earlier → later', () => {
    const { from, to } = orderMelodyPassPair(n('b', 'bari', 480), n('a', 'lead', 0))
    expect(from.id).toBe('a')
    expect(to.id).toBe('b')
  })

  it('resolves and prunes orphan links', () => {
    const notes = [n('a', 'lead', 0), n('b', 'bari', 480)]
    const passes = [
      { id: 'p1', fromNoteId: 'a', toNoteId: 'b' },
      { id: 'p2', fromNoteId: 'a', toNoteId: 'gone' },
    ]
    expect(resolveMelodyPasses({ notes, melodyPasses: passes })).toHaveLength(1)
    expect(pruneMelodyPasses(passes, notes).map((p) => p.id)).toEqual(['p1'])
  })

  it('upsert replaces reverse duplicate', () => {
    const next = upsertMelodyPass(
      [{ id: 'old', fromNoteId: 'b', toNoteId: 'a' }],
      'a',
      'b',
      'new',
    )
    expect(next).toEqual([{ id: 'new', fromNoteId: 'a', toNoteId: 'b' }])
  })

  it('inspect hint coaches until a valid pair is selected', () => {
    const notes = [n('a', 'lead', 0), n('b', 'lead', 480), n('c', 'bari', 480)]
    expect(melodyPassInspectHint(notes, ['a', 'b', 'c'])).toMatch(/exactly 2/i)
    expect(melodyPassInspectHint(notes, ['a', 'b'])).toMatch(/different parts/i)
    expect(melodyPassInspectHint(notes, ['a', 'c'])).toBe('')
  })
})
