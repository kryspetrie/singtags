import { describe, expect, it } from 'vitest'
import { candidatesForMelodyNote } from './harmonize'
import {
  buildMelodyLockedProposal,
  findSameRootColorNature,
  proposePassingUnderSketch,
  sketchContainsLead,
  type PassingListCandidates,
} from './passingUnderSketch'

const listCandidates: PassingListCandidates = (opts) => candidatesForMelodyNote(opts)

const C_MAJOR_SKETCH = {
  id: 'hs1',
  startTick: 0,
  endTick: 1920,
  rootPc: 0,
  natureId: 'major',
}

describe('sketchContainsLead', () => {
  it('C/E/G fit C major; A and F do not', () => {
    expect(sketchContainsLead('major', 0, 60)).toBe(true) // C
    expect(sketchContainsLead('major', 0, 64)).toBe(true) // E
    expect(sketchContainsLead('major', 0, 67)).toBe(true) // G
    expect(sketchContainsLead('major', 0, 69)).toBe(false) // A
    expect(sketchContainsLead('major', 0, 65)).toBe(false) // F
  })
})

describe('findSameRootColorNature', () => {
  it('A over C major → sixth', () => {
    expect(
      findSameRootColorNature({
        rootPc: 0,
        coveringNatureId: 'major',
        leadMidi: 69,
        profile: 'sai11',
      }),
    ).toBe('sixth')
  })

  it('F over C major has no same-root PCF color', () => {
    expect(
      findSameRootColorNature({
        rootPc: 0,
        coveringNatureId: 'major',
        leadMidi: 65,
        profile: 'sai11',
      }),
    ).toBeNull()
  })
})

describe('proposePassingUnderSketch', () => {
  it('skips chord-tone Lead under Sketch', () => {
    const mismatches = proposePassingUnderSketch({
      sketchSpans: [C_MAJOR_SKETCH],
      melody: [{ id: 'm1', midi: 64, startTick: 0, durationTicks: 480, role: 'pmn' }],
      tonality: 0,
      profile: 'sai11',
      listCandidates,
    })
    expect(mismatches).toHaveLength(0)
  })

  it('A over C major → same-root sixth, not a new root', () => {
    const mismatches = proposePassingUnderSketch({
      sketchSpans: [C_MAJOR_SKETCH],
      melody: [{ id: 'm1', midi: 69, startTick: 480, durationTicks: 240, role: 'smn' }],
      tonality: 0,
      profile: 'sai11',
      listCandidates,
    })
    expect(mismatches).toHaveLength(1)
    const m = mismatches[0]!
    expect(m.proposal.kind).toBe('sameRootColor')
    expect(m.proposal.rootPc).toBe(0)
    expect(m.proposal.natureId).toBe('sixth')
    expect(m.proposal.layer).toBe('primary')
    expect(m.coveringSketchId).toBe('hs1')
  })

  it('F over C major → melody-locked home tones (Lead forced to F)', () => {
    const mismatches = proposePassingUnderSketch({
      sketchSpans: [C_MAJOR_SKETCH],
      melody: [{ id: 'm1', midi: 65, startTick: 480, durationTicks: 240, role: 'smn' }],
      tonality: 0,
      profile: 'sai11',
      listCandidates,
    })
    expect(mismatches).toHaveLength(1)
    const m = mismatches[0]!
    // Prefer keep-home over SCF when same-root color is unavailable.
    expect(m.proposal.kind).toBe('melodyLockedVariant')
    expect(m.proposal.rootPc).toBe(0)
    expect(m.proposal.midi.lead).toBe(65)
  })

  it('buildMelodyLockedProposal forces Lead MIDI onto a home shell', () => {
    const proposal = buildMelodyLockedProposal({
      note: {
        id: 'm1',
        midi: 65,
        startTick: 480,
        durationTicks: 240,
        role: 'smn',
      },
      span: C_MAJOR_SKETCH,
      cands: [],
    })
    expect(proposal).not.toBeNull()
    expect(proposal!.kind).toBe('melodyLockedVariant')
    expect(proposal!.rootPc).toBe(0)
    expect(proposal!.midi.lead).toBe(65)
  })

  it('ignores melody outside Sketch spans', () => {
    const mismatches = proposePassingUnderSketch({
      sketchSpans: [C_MAJOR_SKETCH],
      melody: [{ id: 'm1', midi: 65, startTick: 2000, durationTicks: 240, role: 'smn' }],
      tonality: 0,
      profile: 'sai11',
      listCandidates,
    })
    expect(mismatches).toHaveLength(0)
  })

  it('lists SMN before PMN at the same tick', () => {
    const mismatches = proposePassingUnderSketch({
      sketchSpans: [C_MAJOR_SKETCH],
      melody: [
        { id: 'pmn', midi: 65, startTick: 480, durationTicks: 120, role: 'pmn' },
        { id: 'smn', midi: 69, startTick: 480, durationTicks: 120, role: 'smn' },
      ],
      tonality: 0,
      profile: 'sai11',
      listCandidates,
    })
    expect(mismatches.length).toBeGreaterThanOrEqual(2)
    expect(mismatches[0]!.melodyNoteId).toBe('smn')
  })
})
