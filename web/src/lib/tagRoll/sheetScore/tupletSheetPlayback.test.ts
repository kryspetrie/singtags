/**
 * @vitest-environment happy-dom
 *
 * Sheet tuplet numbers (VexFlow bracket) + playback tick placement for containers.
 */
import { describe, expect, it } from 'vitest'
import { createEmptyTagRollProject } from '../normalize'
import { createTupletContainer, memberTicksForTuplet } from '../tupletContainers'
import { applyTupletDraft, type TupletEditorDraft } from '../tupletEditor'
import { assignSheetStaves } from './assignStaves'
import { buildSheetRhythm } from './rhythmLayout'
import { attachSheetTuplets, tryTupletMemberAtom } from './sheetTuplets'
import { TAG_ROLL_PPQ } from '../types'

function tripletDraft(partId: string): TupletEditorDraft {
  return {
    tupletId: 'tup1',
    partId,
    startTick: 0,
    spanTicks: TAG_ROLL_PPQ,
    actualNotes: 3,
    normalNotes: 2,
    slots: [{ midi: 60 }, { midi: 64 }, { midi: 67 }],
  }
}

describe('tuplet sheet + playback', () => {
  it('divides a quarter into three equal playback slices (not binary eighths)', () => {
    const slices = memberTicksForTuplet(0, TAG_ROLL_PPQ, 3)
    expect(slices).toEqual([
      { startTick: 0, durationTicks: 160 },
      { startTick: 160, durationTicks: 160 },
      { startTick: 320, durationTicks: 160 },
    ])
    // Binary eighths would be 0 / 240 — wrong for triplets.
    expect(slices.map((s) => s.startTick)).not.toEqual([0, 240])
  })

  it('keeps triplet atoms as one engraved glyph (no binary split)', () => {
    const atom = tryTupletMemberAtom(160, TAG_ROLL_PPQ)
    expect(atom).not.toBeNull()
    expect(atom!.ticks).toBe(160)
  })

  it('applyTupletDraft writes notes at triplet ticks with group tags', () => {
    const lead = createEmptyTagRollProject().parts.find((p) => p.name === 'Lead')!
    const tuplet = createTupletContainer({
      id: 'tup1',
      partId: lead.id,
      startTick: 0,
      spanTicks: TAG_ROLL_PPQ,
      actualNotes: 3,
      normalNotes: 2,
    })
    let n = 0
    const out = applyTupletDraft([], [tuplet], tripletDraft(lead.id), {
      newNoteId: () => `n${++n}`,
    })
    expect(out.notes.map((x) => x.startTick)).toEqual([0, 160, 320])
    expect(out.notes.every((x) => x.durationTicks === 160)).toBe(true)
    expect(out.notes.every((x) => x.tuplet?.groupId === 'tup1')).toBe(true)
  })

  it('buildSheetRhythm stamps actualNotes/normalNotes/index for bracket attach', () => {
    const p = createEmptyTagRollProject({ title: 'T' })
    const lead = p.parts.find((x) => x.name === 'Lead')!
    const tuplet = createTupletContainer({
      id: 'tup1',
      partId: lead.id,
      startTick: 0,
      spanTicks: TAG_ROLL_PPQ,
      actualNotes: 3,
      normalNotes: 2,
    })
    let n = 0
    const { notes, tuplets } = applyTupletDraft([], [tuplet], tripletDraft(lead.id), {
      newNoteId: () => `n${++n}`,
    })
    const assignment = assignSheetStaves(p.parts, 'ttbb', {
      melodyPartId: lead.id,
      notes,
    })
    const events = buildSheetRhythm({
      assignment,
      notes,
      lengthTicks: TAG_ROLL_PPQ * 4,
      timeSignature: p.timeSignature,
      ppq: TAG_ROLL_PPQ,
      tuplets,
    })
    const withTup = events.filter((e) => e.concertMidi != null && e.tuplet)
    expect(withTup).toHaveLength(3)
    expect(withTup.every((e) => e.tuplet!.actualNotes === 3 && e.tuplet!.normalNotes === 2)).toBe(
      true,
    )
    expect(withTup.map((e) => e.tuplet!.index).sort((a, b) => a - b)).toEqual([0, 1, 2])
  })

  it('attachSheetTuplets creates a top bracket with numNotes=3 (the “3” above)', () => {
    const tupletCalls: { options: Record<string, unknown> }[] = []
    const factory = {
      Tuplet: (args: { options: Record<string, unknown> }) => {
        tupletCalls.push(args)
        return {}
      },
    }
    const mkNote = () => ({ isRest: () => false })
    attachSheetTuplets(
      factory as never,
      [mkNote(), mkNote(), mkNote()] as never,
      [0, 1, 2].map((index) => ({
        tuplet: { id: 42, actualNotes: 3, normalNotes: 2, index },
      })) as never,
    )
    expect(tupletCalls).toHaveLength(1)
    expect(tupletCalls[0]!.options).toMatchObject({
      numNotes: 3,
      notesOccupied: 2,
      bracketed: true,
      location: 1, // VexFlow LOCATION_TOP → ┌─── 3 ───┐
    })
  })
})
