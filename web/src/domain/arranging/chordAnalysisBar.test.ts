/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  absoluteChordLabel,
  buildChordAnalysisSegments,
  listNatureNameCandidates,
} from './chordAnalysisBar'
import type { ChordStack } from './types'

function stack(
  startTick: number,
  rootPc: number,
  natureId: string,
  midi?: ChordStack['midi'],
): ChordStack {
  return {
    id: `s${startTick}`,
    startTick,
    durationTicks: 480,
    rootPc,
    natureId,
    voicing: '1513',
    spread: false,
    layer: 'primary',
    scfGroup: null,
    pillarId: null,
    midi: midi ?? { bass: 48, bari: 52, lead: 55, tenor: 60 },
    ruleTags: [],
  }
}

describe('chordAnalysisBar', () => {
  it('labels absolute names and dual romans', () => {
    const segs = buildChordAnalysisSegments({
      stacks: [
        stack(0, 2, 'seventh', { bass: 50, bari: 53, lead: 57, tenor: 60 }), // D7
        stack(480, 7, 'major', { bass: 43, bari: 47, lead: 50, tenor: 55 }), // G
      ],
      tonality: 0,
      preferFlats: true,
    })
    expect(segs).toHaveLength(2)
    expect(segs[0]!.name).toBe('D7')
    expect(segs[0]!.romanOptions.length).toBeGreaterThanOrEqual(1)
    // D7 → G often V7/V with alt II7
    expect(segs[0]!.romanOptions.some((r) => r.includes('V7') || r === 'II7')).toBe(true)
    expect(segs[0]!.locked).toBe(true)
  })

  it('honors display overrides when in options', () => {
    const segs = buildChordAnalysisSegments({
      stacks: [stack(0, 2, 'seventh')],
      tonality: 0,
      preferFlats: true,
      overrides: { '0': { roman: 'II7' } },
    })
    const opts = segs[0]!.romanOptions
    if (opts.includes('II7')) {
      expect(segs[0]!.displayRoman).toBe('II7')
    }
  })

  it('locks name options for known coach stacks', () => {
    const segs = buildChordAnalysisSegments({
      stacks: [stack(0, 7, 'seventh')],
      tonality: 0,
      preferFlats: true,
      nameCandidatesByTick: new Map([
        [0, [{ rootPc: 2, natureId: 'm7', label: 'Dm7' }]],
      ]),
    })
    expect(segs[0]!.nameOptions).toEqual([absoluteChordLabel(7, 'seventh', true)])
  })

  it('lists alternate absolute names for ambiguous MIDI', () => {
    const cands = listNatureNameCandidates({
      midi: { bass: 50, bari: 53, lead: 57, tenor: 60 },
      profile: 'sai11',
      tonality: 0,
      preferFlats: true,
      limit: 3,
    })
    expect(cands.length).toBeGreaterThanOrEqual(1)
    expect(cands[0]!.label.length).toBeGreaterThan(0)
  })

  it('marks bare-melody stacks as implied (unlocked)', () => {
    const segs = buildChordAnalysisSegments({
      stacks: [
        {
          id: 'imp0',
          startTick: 0,
          durationTicks: 480,
          rootPc: 0,
          natureId: 'major',
          voicing: '',
          spread: false,
          layer: 'primary',
          scfGroup: null,
          pillarId: null,
          midi: null,
          ruleTags: [],
        },
      ],
      tonality: 0,
      preferFlats: true,
    })
    expect(segs[0]!.implied).toBe(true)
    expect(segs[0]!.locked).toBe(false)
    expect(segs[0]!.name).toBe('C')
  })

  it('labels dominant ninths as 7(9)', () => {
    expect(absoluteChordLabel(10, 'ninth', false)).toBe('A#7(9)')
    expect(absoluteChordLabel(10, 'ninth', true)).toBe('Bb7(9)')
  })

  it('spells ♭VII with flats even when project prefers sharps', () => {
    // C major, root Bb/A# (pc 10) is ♭VII — must be Bb, not A#
    expect(
      absoluteChordLabel(10, 'ninth', false, { tonality: 0, tonalityMode: 'major' }),
    ).toBe('Bb7(9)')
  })
})
