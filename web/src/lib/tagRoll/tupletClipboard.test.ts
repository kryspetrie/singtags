/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { createEmptyTagRollProject } from './normalize'
import { applyNoteClipboardAtPlayhead } from './pasteClipboard'
import { TAG_ROLL_PPQ } from './types'
import {
  clipboardTupletsAtPlayhead,
  tupletToClipboard,
  tupletsToClipboard,
} from './tupletClipboard'

describe('tupletClipboard', () => {
  it('copies container + members relative to container start', () => {
    const unit = tupletToClipboard(
      {
        id: 'tup-a',
        partId: 'lead',
        startTick: 480,
        spanTicks: TAG_ROLL_PPQ,
        actualNotes: 3,
        normalNotes: 2,
      },
      [
        {
          id: 'n1',
          partId: 'lead',
          midi: 60,
          startTick: 480,
          durationTicks: 160,
          tuplet: { groupId: 'tup-a', actualNotes: 3, normalNotes: 2 },
        },
        {
          id: 'n2',
          partId: 'lead',
          midi: 64,
          startTick: 640,
          durationTicks: 160,
          tuplet: { groupId: 'tup-a', actualNotes: 3, normalNotes: 2 },
        },
        {
          id: 'other',
          partId: 'lead',
          midi: 67,
          startTick: 0,
          durationTicks: 120,
        },
      ],
    )
    expect(unit).toEqual({
      startTick: 0,
      spanTicks: TAG_ROLL_PPQ,
      partId: 'lead',
      actualNotes: 3,
      normalNotes: 2,
      members: [
        { midi: 60, startTick: 0, durationTicks: 160, partId: 'lead' },
        { midi: 64, startTick: 160, durationTicks: 160, partId: 'lead' },
      ],
    })
  })

  it('anchors multiple containers to the earliest start', () => {
    const units = tupletsToClipboard(
      [
        {
          id: 'b',
          partId: 'lead',
          startTick: 960,
          spanTicks: TAG_ROLL_PPQ,
          actualNotes: 3,
          normalNotes: 2,
        },
        {
          id: 'a',
          partId: 'lead',
          startTick: 480,
          spanTicks: TAG_ROLL_PPQ,
          actualNotes: 3,
          normalNotes: 2,
        },
      ],
      [],
    )
    expect(units?.map((u) => u.startTick)).toEqual([0, 480])
  })

  it('pastes with a new groupId and same relative pitches', () => {
    const p = createEmptyTagRollProject({ title: 't' })
    const lead = p.parts.find((x) => x.name === 'Lead')!
    p.view.playheadTick = 960
    p.tuplets = [
      {
        id: 'old',
        partId: lead.id,
        startTick: 0,
        spanTicks: TAG_ROLL_PPQ,
        actualNotes: 3,
        normalNotes: 2,
      },
    ]
    p.notes = [
      {
        id: 'n1',
        partId: lead.id,
        midi: 60,
        startTick: 0,
        durationTicks: 160,
        tuplet: { groupId: 'old', actualNotes: 3, normalNotes: 2 },
      },
      {
        id: 'n2',
        partId: lead.id,
        midi: 64,
        startTick: 160,
        durationTicks: 160,
        tuplet: { groupId: 'old', actualNotes: 3, normalNotes: 2 },
      },
    ]

    const clip = {
      notes: [] as const,
      spanTicks: TAG_ROLL_PPQ,
      tuplets: [tupletToClipboard(p.tuplets[0]!, p.notes)],
    }

    let i = 0
    const applied = applyNoteClipboardAtPlayhead(p, clip, () => `n${++i}`, {
      newTupletId: () => 'tup-new',
    })
    expect(applied).not.toBeNull()
    expect(applied!.createdTupletIds).toEqual(['tup-new'])
    const pasted = applied!.project.tuplets.find((t) => t.id === 'tup-new')!
    expect(pasted).toMatchObject({
      startTick: 960,
      spanTicks: TAG_ROLL_PPQ,
      actualNotes: 3,
      normalNotes: 2,
      partId: lead.id,
    })
    const members = applied!.project.notes.filter((n) => n.tuplet?.groupId === 'tup-new')
    expect(members).toHaveLength(2)
    expect(members.map((n) => ({ midi: n.midi, startTick: n.startTick }))).toEqual([
      { midi: 60, startTick: 960 },
      { midi: 64, startTick: 1120 },
    ])
    expect(members.every((n) => n.tuplet?.groupId === 'tup-new')).toBe(true)
    expect(applied!.project.tuplets.some((t) => t.id === 'old')).toBe(true)
  })

  it('rejects paste that would overlap an existing tuplet', () => {
    const p = createEmptyTagRollProject({ title: 't' })
    const lead = p.parts.find((x) => x.name === 'Lead')!
    p.view.playheadTick = 0
    p.tuplets = [
      {
        id: 'old',
        partId: lead.id,
        startTick: 0,
        spanTicks: TAG_ROLL_PPQ,
        actualNotes: 3,
        normalNotes: 2,
      },
    ]
    const placed = clipboardTupletsAtPlayhead(
      p,
      [
        {
          startTick: 0,
          spanTicks: TAG_ROLL_PPQ,
          partId: lead.id,
          actualNotes: 3,
          normalNotes: 2,
          members: [],
        },
      ],
      0,
      { newNoteId: () => 'n', newTupletId: () => 'tup-x' },
    )
    expect(placed).toBeNull()
  })

  it('pastes an empty tuplet band', () => {
    const p = createEmptyTagRollProject({ title: 't' })
    const lead = p.parts.find((x) => x.name === 'Lead')!
    p.view.playheadTick = 480
    const applied = applyNoteClipboardAtPlayhead(
      p,
      {
        notes: [],
        tuplets: [
          {
            startTick: 0,
            spanTicks: TAG_ROLL_PPQ,
            partId: lead.id,
            actualNotes: 5,
            normalNotes: 4,
            members: [],
          },
        ],
        spanTicks: TAG_ROLL_PPQ,
      },
      () => 'n',
      { newTupletId: () => 'tup-empty' },
    )
    expect(applied?.createdTupletIds).toEqual(['tup-empty'])
    expect(applied?.project.notes).toHaveLength(0)
    expect(applied?.project.tuplets[0]).toMatchObject({
      id: 'tup-empty',
      startTick: 480,
      actualNotes: 5,
      normalNotes: 4,
    })
  })
})
