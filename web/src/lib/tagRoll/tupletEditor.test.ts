/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { createTupletContainer } from './tupletContainers'
import {
  applyTupletDraft,
  draftFromTuplet,
  resliceDraftSlots,
  type TupletEditorDraft,
} from './tupletEditor'
import { TAG_ROLL_PPQ, type TagRollNote } from './types'

describe('tupletEditor', () => {
  const tuplet = createTupletContainer({
    id: 'g',
    partId: 'lead',
    startTick: 0,
    spanTicks: TAG_ROLL_PPQ,
    actualNotes: 3,
    normalNotes: 2,
  })

  it('apply 3:2 C-E-G creates 3 notes equal durs same groupId', () => {
    const draft: TupletEditorDraft = {
      tupletId: 'g',
      partId: 'lead',
      startTick: 0,
      spanTicks: TAG_ROLL_PPQ,
      actualNotes: 3,
      normalNotes: 2,
      slots: [{ midi: 60 }, { midi: 64 }, { midi: 67 }],
    }
    let n = 0
    const out = applyTupletDraft([], [tuplet], draft, {
      newNoteId: () => `n${++n}`,
    })
    expect(out.notes).toHaveLength(3)
    expect(out.notes.every((x) => x.tuplet?.groupId === 'g')).toBe(true)
    expect(out.notes.map((x) => x.midi)).toEqual([60, 64, 67])
    const sum = out.notes.reduce((s, x) => s + x.durationTicks, 0)
    expect(sum).toBe(TAG_ROLL_PPQ)
    expect(out.notes[0]!.durationTicks).toBe(out.notes[1]!.durationTicks)
  })

  it('apply clears prior members with same groupId', () => {
    const prior: TagRollNote[] = [
      {
        id: 'old',
        partId: 'lead',
        midi: 72,
        startTick: 0,
        durationTicks: 160,
        tuplet: { groupId: 'g', actualNotes: 3, normalNotes: 2 },
      },
      {
        id: 'keep',
        partId: 'lead',
        midi: 48,
        startTick: 480,
        durationTicks: 240,
      },
    ]
    const draft: TupletEditorDraft = {
      tupletId: 'g',
      partId: 'lead',
      startTick: 0,
      spanTicks: TAG_ROLL_PPQ,
      actualNotes: 3,
      normalNotes: 2,
      slots: [{ midi: 60 }, { midi: null }, { midi: 67 }],
    }
    let n = 0
    const out = applyTupletDraft(prior, [tuplet], draft, {
      newNoteId: () => `n${++n}`,
    })
    expect(out.notes.map((n) => n.id).sort()).toEqual(['keep', 'n1', 'n2'])
    expect(out.notes.filter((x) => x.tuplet?.groupId === 'g')).toHaveLength(2)
    expect(out.notes.find((x) => x.id === 'old')).toBeUndefined()
  })

  it('draftFromTuplet loads existing members into slots', () => {
    const third = Math.floor(TAG_ROLL_PPQ / 3)
    const notes: TagRollNote[] = [
      {
        id: 'a',
        partId: 'lead',
        midi: 60,
        startTick: 0,
        durationTicks: third,
        tuplet: { groupId: 'g', actualNotes: 3, normalNotes: 2 },
      },
      {
        id: 'b',
        partId: 'lead',
        midi: 64,
        startTick: third,
        durationTicks: third,
        lyric: 'la',
        tuplet: { groupId: 'g', actualNotes: 3, normalNotes: 2 },
      },
    ]
    const draft = draftFromTuplet(tuplet, notes)
    expect(draft.slots[0]).toEqual({ midi: 60 })
    expect(draft.slots[1]).toMatchObject({ midi: 64, lyric: 'la' })
    expect(draft.slots[2]).toEqual({ midi: null })
  })

  it('preset 6:4 reslices to 6 slots keeping early pitches', () => {
    const draft: TupletEditorDraft = {
      tupletId: 'g',
      partId: 'lead',
      startTick: 0,
      spanTicks: TAG_ROLL_PPQ,
      actualNotes: 3,
      normalNotes: 2,
      slots: [{ midi: 60 }, { midi: 64 }, { midi: 67 }],
    }
    const next = resliceDraftSlots(draft, {
      actualNotes: 6,
      normalNotes: 4,
      spanTicks: TAG_ROLL_PPQ,
    })
    expect(next.slots).toHaveLength(6)
    expect(next.slots.slice(0, 3).map((s) => s.midi)).toEqual([60, 64, 67])
    expect(next.slots.slice(3).every((s) => s.midi == null)).toBe(true)
    expect(next.spanTicks).toBe(TAG_ROLL_PPQ)
  })
})
