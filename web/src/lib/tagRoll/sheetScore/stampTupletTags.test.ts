/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { createTupletContainer } from '../tupletContainers'
import { TAG_ROLL_PPQ, type TagRollNote } from '../types'
import { stampNotesFromTupletContainers } from './stampTupletTags'

describe('stampNotesFromTupletContainers', () => {
  it('stamps untagged notes inside a container span', () => {
    const tuplet = createTupletContainer({
      id: 'g1',
      partId: 'lead',
      startTick: 0,
      spanTicks: TAG_ROLL_PPQ,
      actualNotes: 3,
      normalNotes: 2,
    })
    const notes: TagRollNote[] = [
      { id: 'a', partId: 'lead', midi: 60, startTick: 0, durationTicks: 160 },
      { id: 'b', partId: 'bass', midi: 48, startTick: 0, durationTicks: 160 },
    ]
    const out = stampNotesFromTupletContainers(notes, [tuplet])
    expect(out[0]!.tuplet).toEqual({
      groupId: 'g1',
      actualNotes: 3,
      normalNotes: 2,
    })
    expect(out[1]!.tuplet).toBeUndefined()
  })

  it('syncs ratio from matching container id', () => {
    const tuplet = createTupletContainer({
      id: 'g1',
      partId: 'lead',
      startTick: 0,
      spanTicks: TAG_ROLL_PPQ,
      actualNotes: 6,
      normalNotes: 4,
    })
    const notes: TagRollNote[] = [
      {
        id: 'a',
        partId: 'lead',
        midi: 60,
        startTick: 0,
        durationTicks: 80,
        tuplet: { groupId: 'g1', actualNotes: 3, normalNotes: 2 },
      },
    ]
    const out = stampNotesFromTupletContainers(notes, [tuplet])
    expect(out[0]!.tuplet).toEqual({
      groupId: 'g1',
      actualNotes: 6,
      normalNotes: 4,
    })
  })
})
