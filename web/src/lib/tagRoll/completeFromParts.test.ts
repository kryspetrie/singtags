import { describe, expect, it } from 'vitest'
import { createSequentialIdGenerator } from '../../adapters/system/systemServices'
import {
  completeFromPartsToNotes,
  filterLockableDetectedHoles,
  hasSparseHarmonyInScope,
  mergeTickIntervals,
  resolveCompleteFromPartsRange,
  tickInIntervals,
} from './completeFromParts'
import { createEmptyTagRollProject } from './normalize'
import { TAG_ROLL_PPQ } from './types'

describe('resolveCompleteFromPartsRange / intervals', () => {
  it('merges overlapping spans and does not hull distant ones', () => {
    const range = resolveCompleteFromPartsRange({
      sketchSpans: [
        { startTick: 0, endTick: 480 },
        { startTick: 2000, endTick: 2480 },
        { startTick: 400, endTick: 600 },
      ],
    })
    expect(range).toEqual([
      { startTick: 0, endTick: 600 },
      { startTick: 2000, endTick: 2480 },
    ])
    expect(tickInIntervals(1000, range)).toBe(false)
    expect(tickInIntervals(2200, range)).toBe(true)
  })

  it('mergeTickIntervals collapses adjacent/overlapping', () => {
    expect(
      mergeTickIntervals([
        { startTick: 0, endTick: 100 },
        { startTick: 100, endTick: 200 },
        { startTick: 50, endTick: 80 },
      ]),
    ).toEqual([{ startTick: 0, endTick: 200 }])
  })
})

describe('filterLockableDetectedHoles', () => {
  it('drops unknown quality and out-of-range holes', () => {
    const holes = [
      { id: 'a', startTick: 0, endTick: 480, rootPc: 0, quality: 'seventh' },
      { id: 'b', startTick: 480, endTick: 960, rootPc: 0, quality: 'unknown' },
      { id: 'c', startTick: 2000, endTick: 2480, rootPc: 5, quality: 'major' },
    ]
    const kept = filterLockableDetectedHoles(holes, [{ startTick: 0, endTick: 1000 }])
    expect(kept.map((h) => h.id)).toEqual(['a'])
  })
})

describe('completeFromPartsToNotes', () => {
  it('locks Sketch and fills empty parts while preserving sung Bass', () => {
    const project = createEmptyTagRollProject({ title: 'sparse' })
    const lead = project.parts.find((p) => p.name === 'Lead')!
    const bass = project.parts.find((p) => p.name === 'Bass')!
    project.tonality = 0
    project.notes = [
      {
        id: 'm1',
        partId: lead.id,
        midi: 60,
        startTick: 0,
        durationTicks: TAG_ROLL_PPQ,
      },
      {
        id: 'bs1',
        partId: bass.id,
        midi: 48,
        startTick: 0,
        durationTicks: TAG_ROLL_PPQ,
      },
    ]

    const result = completeFromPartsToNotes({
      project,
      detectHoles: [
        { id: 'd1', startTick: 0, endTick: TAG_ROLL_PPQ, rootPc: 0, quality: 'seventh' },
      ],
      profile: 'sai11',
      idGen: createSequentialIdGenerator(1),
    })

    expect(result.filled).toBe(1)
    expect(result.skipped).toBe(0)
    expect(result.sketch.some((s) => s.locked && s.quality === 'seventh')).toBe(true)
    expect(result.notes.find((n) => n.id === 'bs1')?.midi).toBe(48)
    expect(result.notes.some((n) => n.partId !== lead.id && n.partId !== bass.id)).toBe(true)
    expect(result.items[0]).toMatchObject({ kind: 'filled', label: expect.stringMatching(/C7|C/) })
  })

  it('fills each shorter overlap under a held melody note', () => {
    const project = createEmptyTagRollProject({ title: 'overlap' })
    const lead = project.parts.find((p) => p.name === 'Lead')!
    const bass = project.parts.find((p) => p.name === 'Bass')!
    const tenor = project.parts.find((p) => p.name === 'Tenor')!
    const bari = project.parts.find((p) => p.name === 'Bari')!
    project.tonality = 0
    project.tonalityMode = 'major'
    const q = TAG_ROLL_PPQ
    project.notes = [
      { id: 'm1', partId: lead.id, midi: 65, startTick: 0, durationTicks: q * 2 },
      { id: 'bs1', partId: bass.id, midi: 55, startTick: 0, durationTicks: q },
      { id: 'bs2', partId: bass.id, midi: 53, startTick: q, durationTicks: q },
    ]

    const result = completeFromPartsToNotes({
      project,
      profile: 'bhs_extended',
      idGen: createSequentialIdGenerator(1),
    })

    const leadNote = result.notes.find((n) => n.id === 'm1')
    expect(leadNote?.durationTicks).toBe(q * 2)
    for (const partId of [tenor.id, bari.id]) {
      const written = result.notes
        .filter((n) => n.partId === partId)
        .sort((a, b) => a.startTick - b.startTick)
      expect(written.map((n) => n.startTick)).toEqual([0, q])
      expect(written.map((n) => n.durationTicks)).toEqual([q, q])
    }
    expect(result.notes.filter((n) => n.partId === bass.id)).toHaveLength(2)
    expect(result.filled).toBe(2)
    expect(result.items.map((item) => (item.kind === 'filled' ? item.label : item.kind))).toEqual([
      'G7',
      'F7',
    ])
  })

  it('revoices a tenor leap larger than a fifth without moving lead or bass', () => {
    const project = createEmptyTagRollProject({ title: 'leap' })
    const lead = project.parts.find((p) => p.name === 'Lead')!
    const bass = project.parts.find((p) => p.name === 'Bass')!
    const tenor = project.parts.find((p) => p.name === 'Tenor')!
    project.tonality = 0
    project.tonalityMode = 'major'
    const q = TAG_ROLL_PPQ
    project.notes = [
      { id: 'm1', partId: lead.id, midi: 64, startTick: 0, durationTicks: q * 2 },
      { id: 'm2', partId: lead.id, midi: 65, startTick: q * 2, durationTicks: q },
      { id: 'b1', partId: bass.id, midi: 59, startTick: 0, durationTicks: q },
      { id: 'b2', partId: bass.id, midi: 57, startTick: q, durationTicks: q },
      { id: 'b3', partId: bass.id, midi: 57, startTick: q * 2, durationTicks: q },
    ]

    const result = completeFromPartsToNotes({
      project,
      profile: 'bhs_extended',
      idGen: createSequentialIdGenerator(1),
    })

    expect(result.notes.filter((n) => n.partId === bass.id).map((n) => n.midi)).toEqual([59, 57, 57])
    expect(result.notes.find((n) => n.id === 'm1')?.midi).toBe(64)
    const line = result.notes
      .filter((n) => n.partId === tenor.id)
      .sort((a, b) => a.startTick - b.startTick)
    expect(line.length).toBeGreaterThan(1)
    for (let i = 1; i < line.length; i++) {
      expect(Math.abs(line[i]!.midi - line[i - 1]!.midi)).toBeLessThanOrEqual(7)
    }
    for (const note of line) {
      expect(note.midi).toBeGreaterThan(64)
      expect(note.midi).toBeLessThanOrEqual(77)
    }
  })

  it('revoices filled bass and bari when tenor and lead were sung', () => {
    const project = createEmptyTagRollProject({ title: 'leap-bass' })
    const lead = project.parts.find((p) => p.name === 'Lead')!
    const tenor = project.parts.find((p) => p.name === 'Tenor')!
    const bari = project.parts.find((p) => p.name === 'Bari')!
    const bass = project.parts.find((p) => p.name === 'Bass')!
    project.tonality = 0
    project.tonalityMode = 'major'
    const q = TAG_ROLL_PPQ
    project.notes = [
      { id: 'm1', partId: lead.id, midi: 64, startTick: 0, durationTicks: q },
      { id: 'm2', partId: lead.id, midi: 65, startTick: q, durationTicks: q },
      { id: 'm3', partId: lead.id, midi: 64, startTick: q * 2, durationTicks: q },
      { id: 't1', partId: tenor.id, midi: 76, startTick: 0, durationTicks: q },
      { id: 't2', partId: tenor.id, midi: 77, startTick: q, durationTicks: q },
      { id: 't3', partId: tenor.id, midi: 76, startTick: q * 2, durationTicks: q },
    ]

    const result = completeFromPartsToNotes({
      project,
      profile: 'bhs_extended',
      idGen: createSequentialIdGenerator(1),
    })

    expect(result.notes.filter((n) => n.partId === tenor.id).map((n) => n.midi)).toEqual([76, 77, 76])
    expect(result.notes.filter((n) => n.id.startsWith('m')).map((n) => n.midi)).toEqual([64, 65, 64])
    const bassLine = result.notes
      .filter((n) => n.partId === bass.id)
      .sort((a, b) => a.startTick - b.startTick)
    const bariLine = result.notes
      .filter((n) => n.partId === bari.id)
      .sort((a, b) => a.startTick - b.startTick)
    expect(bassLine.length).toBeGreaterThan(1)
    for (let i = 1; i < bassLine.length; i++) {
      const leap = Math.abs(bassLine[i]!.midi - bassLine[i - 1]!.midi)
      expect(leap <= 7 || leap === 12).toBe(true)
    }
    for (let i = 1; i < bariLine.length; i++) {
      expect(Math.abs(bariLine[i]!.midi - bariLine[i - 1]!.midi)).toBeLessThanOrEqual(9)
    }
  })

  it('Detected-only locks Sketch without inventing TTBB', () => {
    const project = createEmptyTagRollProject({ title: 'detect-only' })
    const lead = project.parts.find((p) => p.name === 'Lead')!
    project.notes = [
      {
        id: 'm1',
        partId: lead.id,
        midi: 60,
        startTick: 0,
        durationTicks: TAG_ROLL_PPQ,
      },
    ]

    const result = completeFromPartsToNotes({
      project,
      detectHoles: [
        { id: 'd1', startTick: 0, endTick: TAG_ROLL_PPQ, rootPc: 0, quality: 'major' },
      ],
      profile: 'sai11',
      idGen: createSequentialIdGenerator(1),
    })

    expect(result.locked).toBe(1)
    expect(result.filled).toBe(0)
    expect(result.sketch.some((s) => s.locked && s.quality === 'major')).toBe(true)
    expect(result.notes.filter((n) => n.partId !== lead.id)).toHaveLength(0)
    expect(result.items[0]?.kind).toBe('locked')
  })

  it('skips unrecognized moments and does not invent Sketch majors', () => {
    const project = createEmptyTagRollProject({ title: 'oov' })
    const lead = project.parts.find((p) => p.name === 'Lead')!
    const bass = project.parts.find((p) => p.name === 'Bass')!
    project.notes = [
      {
        id: 'm1',
        partId: lead.id,
        midi: 60,
        startTick: 0,
        durationTicks: TAG_ROLL_PPQ,
      },
      {
        id: 'bs1',
        partId: bass.id,
        midi: 49, // C#
        startTick: 0,
        durationTicks: TAG_ROLL_PPQ,
      },
    ]

    const result = completeFromPartsToNotes({
      project,
      profile: 'sai11',
      idGen: createSequentialIdGenerator(1),
    })

    expect(result.filled).toBe(0)
    expect(result.skipped).toBe(1)
    expect(result.items[0]?.kind).toBe('skipped')
    expect(result.sketch).toHaveLength(0)
    expect(result.notes.filter((n) => n.partId !== lead.id && n.partId !== bass.id)).toHaveLength(0)
  })

  it('falls back to sparse ID when Detected hole quality is unknown', () => {
    const project = createEmptyTagRollProject({ title: 'hole-fallback' })
    const lead = project.parts.find((p) => p.name === 'Lead')!
    const tenor = project.parts.find((p) => p.name === 'Tenor')!
    const bass = project.parts.find((p) => p.name === 'Bass')!
    project.notes = [
      {
        id: 'm1',
        partId: lead.id,
        midi: 60,
        startTick: 0,
        durationTicks: TAG_ROLL_PPQ,
      },
      {
        id: 't1',
        partId: tenor.id,
        midi: 64,
        startTick: 0,
        durationTicks: TAG_ROLL_PPQ,
      },
      {
        id: 'bs1',
        partId: bass.id,
        midi: 48,
        startTick: 0,
        durationTicks: TAG_ROLL_PPQ,
      },
    ]

    const result = completeFromPartsToNotes({
      project,
      detectHoles: [
        { id: 'd1', startTick: 0, endTick: TAG_ROLL_PPQ, rootPc: 0, quality: 'unknown' },
      ],
      profile: 'sai11',
      idGen: createSequentialIdGenerator(1),
    })

    // Unknown hole ignored; sparse C–E–C IDs as major and fills Bari.
    expect(result.skipped).toBe(0)
    expect(result.filled).toBe(1)
    expect(result.notes.find((n) => n.id === 'bs1')?.midi).toBe(48)
    expect(result.notes.find((n) => n.id === 't1')?.midi).toBe(64)
    expect(result.items[0]).toMatchObject({ kind: 'filled', filledParts: ['Bari'] })
  })

  it('respects interval union (skips gap between selected spans)', () => {
    const project = createEmptyTagRollProject({ title: 'range' })
    const lead = project.parts.find((p) => p.name === 'Lead')!
    const bass = project.parts.find((p) => p.name === 'Bass')!
    const gap = TAG_ROLL_PPQ * 4
    project.notes = [
      {
        id: 'm1',
        partId: lead.id,
        midi: 60,
        startTick: 0,
        durationTicks: TAG_ROLL_PPQ,
      },
      {
        id: 'bs1',
        partId: bass.id,
        midi: 48,
        startTick: 0,
        durationTicks: TAG_ROLL_PPQ,
      },
      {
        id: 'm2',
        partId: lead.id,
        midi: 62,
        startTick: gap,
        durationTicks: TAG_ROLL_PPQ,
      },
      {
        id: 'bs2',
        partId: bass.id,
        midi: 50,
        startTick: gap,
        durationTicks: TAG_ROLL_PPQ,
      },
    ]

    const result = completeFromPartsToNotes({
      project,
      range: [
        { startTick: 0, endTick: TAG_ROLL_PPQ * 2 },
        { startTick: gap, endTick: gap + TAG_ROLL_PPQ },
      ],
      detectHoles: [
        { id: 'd1', startTick: 0, endTick: TAG_ROLL_PPQ, rootPc: 0, quality: 'major' },
        {
          id: 'd2',
          startTick: gap,
          endTick: gap + TAG_ROLL_PPQ,
          rootPc: 2,
          quality: 'major',
        },
      ],
      profile: 'sai11',
      idGen: createSequentialIdGenerator(1),
    })

    expect(result.filled + result.locked + result.skipped).toBe(2)
    expect(result.items.every((i) => i.startTick === 0 || i.startTick === gap)).toBe(true)
  })

  it('hasSparseHarmonyInScope detects covering Bass', () => {
    const project = createEmptyTagRollProject({ title: 'sparse-scope' })
    const lead = project.parts.find((p) => p.name === 'Lead')!
    const bass = project.parts.find((p) => p.name === 'Bass')!
    project.notes = [
      {
        id: 'm1',
        partId: lead.id,
        midi: 60,
        startTick: 0,
        durationTicks: TAG_ROLL_PPQ,
      },
      {
        id: 'bs1',
        partId: bass.id,
        midi: 48,
        startTick: 0,
        durationTicks: TAG_ROLL_PPQ,
      },
    ]
    expect(hasSparseHarmonyInScope({ project })).toBe(true)
    expect(
      hasSparseHarmonyInScope({
        project,
        range: [{ startTick: 1000, endTick: 2000 }],
      }),
    ).toBe(false)
  })
})
