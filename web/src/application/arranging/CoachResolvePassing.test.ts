import { describe, expect, it } from 'vitest'
import { createEmptyArrangement } from '../../domain/arranging/types'
import {
  countPassingUnderSoftSketch,
  planResolvePassingUnderSketch,
  planTagRollPassingStacks,
  proposalToCandidate,
  scanPassingUnderSketch,
} from './CoachResolvePassing'
import type { SoftSuggestContext } from './suggestHomeRoot'

const idGen = {
  next: (prefix: string) => `${prefix}-1`,
}

const softC: SoftSuggestContext = {
  sketchSpans: [
    {
      startTick: 0,
      endTick: 1920,
      rootPc: 0,
      natureId: 'major',
      locked: true,
    },
  ],
}

describe('CoachResolvePassing', () => {
  it('scan finds A over C major Sketch', () => {
    const p = createEmptyArrangement('t')
    p.melody = [
      {
        id: 'm1',
        midi: 69,
        startTick: 480,
        durationTicks: 240,
        role: 'smn',
      },
    ]
    p.tonality = 0
    p.contestProfile = 'sai11'
    const mismatches = scanPassingUnderSketch({
      melody: p.melody,
      soft: softC,
      tonality: 0,
      profile: 'sai11',
    })
    expect(mismatches).toHaveLength(1)
    expect(mismatches[0]!.proposal.natureId).toBe('sixth')
  })

  it('planResolvePassingUnderSketch yields Apply ops without needing pillars', () => {
    const p = createEmptyArrangement('t')
    p.melody = [
      {
        id: 'm1',
        midi: 65,
        startTick: 480,
        durationTicks: 240,
        role: 'smn',
      },
    ]
    p.tonality = 0
    p.contestProfile = 'sai11'
    const ops = planResolvePassingUnderSketch({
      project: p,
      soft: softC,
      idGen,
    })
    expect(ops.length).toBe(1)
    // F over C: prefer home+melody (primary) over SCF passing.
    expect(ops[0]!.mismatch.proposal.kind).toBe('melodyLockedVariant')
    expect(ops[0]!.candidate.layer).toBe('primary')
    expect(ops[0]!.candidate.midi.lead).toBe(65)
    expect(ops[0]!.note.id).toBe('m1')
  })

  it('skips Apply when stack already contains Lead', () => {
    const p = createEmptyArrangement('t')
    p.melody = [
      {
        id: 'm1',
        midi: 69,
        startTick: 480,
        durationTicks: 240,
        role: 'smn',
      },
    ]
    p.tonality = 0
    p.contestProfile = 'sai11'
    p.stacks = [
      {
        id: 'stk1',
        startTick: 480,
        durationTicks: 240,
        rootPc: 0,
        natureId: 'sixth',
        voicing: '1516',
        spread: false,
        layer: 'primary',
        scfGroup: null,
        pillarId: null,
        midi: { tenor: 72, lead: 69, bari: 64, bass: 48 },
        ruleTags: [],
      },
    ]
    const ops = planResolvePassingUnderSketch({
      project: p,
      soft: softC,
      idGen,
    })
    expect(ops).toHaveLength(0)
  })

  it('planTagRollPassingStacks returns pitches; Sketch ids preserved in mismatch', () => {
    const ops = planTagRollPassingStacks({
      sketch: [
        {
          id: 'hs1',
          startTick: 0,
          endTick: 1920,
          rootPc: 0,
          quality: 'major',
          locked: true,
        },
      ],
      melody: [
        { id: 'm1', midi: 69, startTick: 480, durationTicks: 240, role: 'smn' },
      ],
      tonality: 0,
      profile: 'sai11',
    })
    expect(ops).toHaveLength(1)
    expect(ops[0]!.natureId).toBe('sixth')
    expect(ops[0]!.pitches.lead % 12).toBe(9)
    expect(ops[0]!.mismatch.coveringSketchId).toBe('hs1')
  })

  it('countPassingUnderSoftSketch skips stacks that already contain Lead', () => {
    expect(
      countPassingUnderSoftSketch({
        melody: [
          {
            id: 'm1',
            midi: 69,
            startTick: 480,
            durationTicks: 240,
            role: 'smn',
          },
        ],
        soft: softC,
        stacks: [
          {
            id: 'stk1',
            startTick: 480,
            durationTicks: 240,
            rootPc: 0,
            natureId: 'sixth',
            voicing: '1516',
            spread: false,
            layer: 'primary',
            scfGroup: null,
            pillarId: null,
            midi: { tenor: 72, lead: 69, bari: 64, bass: 48 },
            ruleTags: [],
          },
        ],
      }),
    ).toBe(0)
    expect(
      countPassingUnderSoftSketch({
        melody: [
          {
            id: 'm1',
            midi: 69,
            startTick: 480,
            durationTicks: 240,
            role: 'smn',
          },
        ],
        soft: softC,
        stacks: [],
      }),
    ).toBe(1)
  })

  it('proposalToCandidate keeps layer and midi', () => {
    const ops = planTagRollPassingStacks({
      sketch: [
        {
          id: 'hs1',
          startTick: 0,
          endTick: 1920,
          rootPc: 0,
          quality: 'major',
          locked: true,
        },
      ],
      melody: [
        { id: 'm1', midi: 65, startTick: 480, durationTicks: 240, role: 'smn' },
      ],
      tonality: 0,
      profile: 'sai11',
    })
    const c = proposalToCandidate(ops[0]!.mismatch.proposal)
    expect(ops[0]!.mismatch.proposal.kind).toBe('melodyLockedVariant')
    expect(c.layer).toBe('primary')
    expect(c.midi).toEqual(ops[0]!.mismatch.proposal.midi)
    expect(c.midi.lead).toBe(65)
  })
})
