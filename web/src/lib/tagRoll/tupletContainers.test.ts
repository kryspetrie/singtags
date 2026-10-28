/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { createEmptyTagRollProject, normalizeTagRollProject } from './normalize'
import { TAG_ROLL_PPQ } from './types'
import type { TagRollNote, TagRollTuplet } from './types'
import {
  assertNoTupletOverlap,
  clampMembersToTupletSpan,
  createTupletContainer,
  deleteTupletContainer,
  memberTicksForTuplet,
  migrateTupletsFromNotes,
  isTupletMemberNote,
  noteBelongsToTuplet,
  notesForTuplet,
  repairOverlappingTuplets,
  syncMemberTupletTags,
  TUPLET_PRESETS,
} from './tupletContainers'

describe('tupletContainers', () => {
  it('normalize empty project has tuplets: []', () => {
    const p = createEmptyTagRollProject()
    expect(p.tuplets).toEqual([])
    const round = normalizeTagRollProject(p)
    expect(round!.tuplets).toEqual([])
  })

  it('normalize round-trips a tuplet container', () => {
    const p = createEmptyTagRollProject()
    const lead = p.parts.find((x) => x.name === 'Lead')!.id
    const tuplet = createTupletContainer({
      id: 'tup_test1',
      partId: lead,
      startTick: 0,
      spanTicks: TAG_ROLL_PPQ,
      actualNotes: 3,
      normalNotes: 2,
    })
    const next = normalizeTagRollProject({ ...p, tuplets: [tuplet] })
    expect(next!.tuplets).toHaveLength(1)
    expect(next!.tuplets[0]).toMatchObject({
      id: 'tup_test1',
      partId: lead,
      startTick: 0,
      spanTicks: TAG_ROLL_PPQ,
      actualNotes: 3,
      normalNotes: 2,
    })
  })

  it('memberTicksForTuplet 3:2 slices sum to spanTicks', () => {
    const slices = memberTicksForTuplet(0, TAG_ROLL_PPQ, 3)
    expect(slices).toHaveLength(3)
    expect(slices.reduce((s, x) => s + x.durationTicks, 0)).toBe(TAG_ROLL_PPQ)
    expect(slices[0]!.startTick).toBe(0)
    expect(slices[1]!.startTick).toBe(slices[0]!.durationTicks)
    expect(slices[2]!.startTick + slices[2]!.durationTicks).toBe(TAG_ROLL_PPQ)
  })

  it('memberTicksForTuplet 6:4 slices sum to spanTicks', () => {
    const span = TAG_ROLL_PPQ
    const slices = memberTicksForTuplet(480, span, 6)
    expect(slices).toHaveLength(6)
    expect(slices.reduce((s, x) => s + x.durationTicks, 0)).toBe(span)
    expect(slices[0]!.startTick).toBe(480)
  })

  it('assertNoTupletOverlap rejects same-part overlap', () => {
    const lead = 'lead'
    const a = createTupletContainer({
      partId: lead,
      startTick: 0,
      spanTicks: TAG_ROLL_PPQ,
    })
    const b = createTupletContainer({
      partId: lead,
      startTick: TAG_ROLL_PPQ / 2,
      spanTicks: TAG_ROLL_PPQ,
    })
    expect(assertNoTupletOverlap([a], b)).toBe(false)
    expect(assertNoTupletOverlap([a], { ...b, partId: 'bass' })).toBe(true)
    expect(
      assertNoTupletOverlap([a], {
        partId: lead,
        startTick: TAG_ROLL_PPQ,
        spanTicks: TAG_ROLL_PPQ,
      }),
    ).toBe(true)
  })

  it('repairOverlappingTuplets keeps earlier container', () => {
    const lead = 'lead'
    const a = createTupletContainer({
      id: 'a',
      partId: lead,
      startTick: 0,
      spanTicks: TAG_ROLL_PPQ,
    })
    const b = createTupletContainer({
      id: 'b',
      partId: lead,
      startTick: 100,
      spanTicks: TAG_ROLL_PPQ,
    })
    expect(repairOverlappingTuplets([b, a]).map((t) => t.id)).toEqual(['a'])
  })

  it('migrateTupletsFromNotes synthesizes containers from note.tuplet', () => {
    const partId = 'lead'
    const groupId = 'legacy_g1'
    const third = Math.round(TAG_ROLL_PPQ / 3)
    const notes: TagRollNote[] = [
      {
        id: 'n1',
        partId,
        midi: 60,
        startTick: 0,
        durationTicks: third,
        tuplet: { groupId, actualNotes: 3, normalNotes: 2 },
      },
      {
        id: 'n2',
        partId,
        midi: 64,
        startTick: third,
        durationTicks: third,
        tuplet: { groupId, actualNotes: 3, normalNotes: 2 },
      },
      {
        id: 'n3',
        partId,
        midi: 67,
        startTick: third * 2,
        durationTicks: TAG_ROLL_PPQ - third * 2,
        tuplet: { groupId, actualNotes: 3, normalNotes: 2 },
      },
    ]
    const migrated = migrateTupletsFromNotes(notes, [])
    expect(migrated).toHaveLength(1)
    expect(migrated[0]).toMatchObject({
      id: groupId,
      partId,
      startTick: 0,
      spanTicks: TAG_ROLL_PPQ,
      actualNotes: 3,
      normalNotes: 2,
    })
  })

  it('normalize migrates note.tuplet-only projects', () => {
    const p = createEmptyTagRollProject()
    const lead = p.parts.find((x) => x.name === 'Lead')!.id
    const groupId = 'mig_g'
    const third = Math.round(TAG_ROLL_PPQ / 3)
    const notes: TagRollNote[] = [
      {
        id: 'a',
        partId: lead,
        midi: 60,
        startTick: 0,
        durationTicks: third,
        tuplet: { groupId, actualNotes: 3, normalNotes: 2 },
      },
      {
        id: 'b',
        partId: lead,
        midi: 62,
        startTick: third,
        durationTicks: third,
        tuplet: { groupId, actualNotes: 3, normalNotes: 2 },
      },
      {
        id: 'c',
        partId: lead,
        midi: 64,
        startTick: third * 2,
        durationTicks: TAG_ROLL_PPQ - third * 2,
        tuplet: { groupId, actualNotes: 3, normalNotes: 2 },
      },
    ]
    const next = normalizeTagRollProject({ ...p, notes, tuplets: [] })
    expect(next!.tuplets).toHaveLength(1)
    expect(next!.tuplets[0]!.id).toBe(groupId)
  })

  it('deleteTupletContainer removes members by default', () => {
    const t = createTupletContainer({
      id: 'g',
      partId: 'lead',
      startTick: 0,
      spanTicks: TAG_ROLL_PPQ,
    })
    const notes: TagRollNote[] = [
      {
        id: 'n1',
        partId: 'lead',
        midi: 60,
        startTick: 0,
        durationTicks: 160,
        tuplet: { groupId: 'g', actualNotes: 3, normalNotes: 2 },
      },
      { id: 'n2', partId: 'lead', midi: 62, startTick: 480, durationTicks: 240 },
    ]
    const out = deleteTupletContainer([t], notes, 'g')
    expect(out.tuplets).toEqual([])
    expect(out.notes.map((n) => n.id)).toEqual(['n2'])
  })

  it('syncMemberTupletTags updates ratio on group members', () => {
    const notes: TagRollNote[] = [
      {
        id: 'n1',
        partId: 'lead',
        midi: 60,
        startTick: 0,
        durationTicks: 160,
        tuplet: { groupId: 'g', actualNotes: 3, normalNotes: 2 },
      },
    ]
    const synced = syncMemberTupletTags(notes, {
      id: 'g',
      actualNotes: 6,
      normalNotes: 4,
    })
    expect(synced[0]!.tuplet).toEqual({
      groupId: 'g',
      actualNotes: 6,
      normalNotes: 4,
    })
  })

  it('clampMembersToTupletSpan trims notes past the container', () => {
    const t: TagRollTuplet = createTupletContainer({
      id: 'g',
      partId: 'lead',
      startTick: 0,
      spanTicks: TAG_ROLL_PPQ,
    })
    const notes: TagRollNote[] = [
      {
        id: 'n1',
        partId: 'lead',
        midi: 60,
        startTick: TAG_ROLL_PPQ - 50,
        durationTicks: 200,
        tuplet: { groupId: 'g', actualNotes: 3, normalNotes: 2 },
      },
    ]
    const clamped = clampMembersToTupletSpan(notes, t)
    expect(clamped[0]!.startTick + clamped[0]!.durationTicks).toBe(TAG_ROLL_PPQ)
    expect(notesForTuplet(clamped, 'g')).toHaveLength(1)
  })

  it('exposes triplet / sextuplet presets', () => {
    expect(TUPLET_PRESETS.triplet).toEqual({ actualNotes: 3, normalNotes: 2 })
    expect(TUPLET_PRESETS.sextuplet).toEqual({ actualNotes: 6, normalNotes: 4 })
  })

  it('dim preview helper associates members by groupId', () => {
    const n: TagRollNote = {
      id: 'n1',
      partId: 'lead',
      midi: 60,
      startTick: 0,
      durationTicks: 160,
      tuplet: { groupId: 'g', actualNotes: 3, normalNotes: 2 },
    }
    expect(isTupletMemberNote(n)).toBe(true)
    expect(noteBelongsToTuplet(n, 'g')).toBe(true)
    expect(noteBelongsToTuplet(n, 'other')).toBe(false)
  })
})
