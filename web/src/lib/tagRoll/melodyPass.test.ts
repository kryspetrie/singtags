/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  canLinkMelodyPass,
  melodyPartAtTick,
  orderMelodyPassPair,
  pruneMelodyPasses,
  resolveMelodyPasses,
  toggleMelodyHandoff,
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

  it('keeps Lead as the melody until a handoff, then stays on the new part', () => {
    const notes = [n('a', 'lead', 0), n('b', 'tenor', 480), n('c', 'tenor', 960), n('d', 'lead', 1440)]
    const project = {
      notes,
      parts: [],
      view: { melodyPartId: 'lead' },
      melodyPasses: [] as { id: string; fromNoteId: string; toNoteId: string }[],
    }
    expect(melodyPartAtTick(project, 0)).toBe('lead')
    expect(melodyPartAtTick(project, 480)).toBe('lead')
    const moved = toggleMelodyHandoff(project, 'b')
    expect(moved?.changed).toBe(true)
    const next = { ...project, melodyPasses: moved!.passes }
    expect(melodyPartAtTick(next, 0)).toBe('lead')
    expect(melodyPartAtTick(next, 480)).toBe('tenor')
    expect(melodyPartAtTick(next, 960)).toBe('tenor')
    const back = toggleMelodyHandoff(next, 'd')
    const both = { ...next, melodyPasses: back!.passes }
    expect(melodyPartAtTick(both, 960)).toBe('tenor')
    expect(melodyPartAtTick(both, 1440)).toBe('lead')
    const undone = toggleMelodyHandoff(both, 'b')
    expect(melodyPartAtTick({ ...both, melodyPasses: undone!.passes }, 480)).toBe('lead')
  })

  it('starts the chart on another part when that note has no earlier melody', () => {
    const notes = [n('a', 'tenor', 0), n('b', 'lead', 480)]
    const project = {
      notes,
      parts: [],
      view: { melodyPartId: 'lead' },
      melodyPasses: [] as { id: string; fromNoteId: string; toNoteId: string }[],
    }
    const start = toggleMelodyHandoff(project, 'a')
    expect(start?.startingPartId).toBe('tenor')
    expect(start?.passes).toEqual([])
    const moved = toggleMelodyHandoff(
      { ...project, view: { melodyPartId: 'tenor' } },
      'b',
    )
    expect(melodyPartAtTick({ ...project, view: { melodyPartId: 'tenor' }, melodyPasses: moved!.passes }, 480)).toBe('lead')
  })
})
