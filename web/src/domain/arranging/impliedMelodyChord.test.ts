/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  inferImpliedChordsFromMelody,
  impliedStacksForBareMelody,
  melodyOnsetCoveredByStack,
} from './impliedMelodyChord'
import type { ChordStack } from './types'

function stack(
  startTick: number,
  durationTicks: number,
  midi: ChordStack['midi'],
  natureId = 'major',
): ChordStack {
  return {
    id: `s${startTick}`,
    startTick,
    durationTicks,
    rootPc: 0,
    natureId,
    voicing: '1513',
    spread: false,
    layer: 'primary',
    scfGroup: null,
    pillarId: null,
    midi,
    ruleTags: [],
  }
}

describe('impliedMelodyChord', () => {
  it('implies I major (not I7) for tonic melody in C major', () => {
    const cands = inferImpliedChordsFromMelody({
      melodyMidi: 60, // C
      tonality: 0,
      mode: 'major',
      limit: 3,
    })
    expect(cands.length).toBeGreaterThanOrEqual(1)
    expect(cands[0]!.rootPc).toBe(0)
    expect(cands[0]!.natureId).toBe('major')
    expect(cands[0]!.roman).toBe('I')
  })

  it('implies V or V7 for B (leading tone) in C major', () => {
    const cands = inferImpliedChordsFromMelody({
      melodyMidi: 59, // B
      tonality: 0,
      mode: 'major',
      limit: 3,
    })
    expect(cands.some((c) => c.rootPc === 7 && (c.natureId === 'major' || c.natureId === 'seventh'))).toBe(
      true,
    )
    expect(cands[0]!.roman === 'V' || cands[0]!.roman === 'V7' || cands[0]!.roman.includes('vii')).toBe(
      true,
    )
  })

  it('implies i for tonic melody in A minor', () => {
    const cands = inferImpliedChordsFromMelody({
      melodyMidi: 57, // A
      tonality: 9,
      mode: 'minor',
      limit: 2,
    })
    expect(cands[0]!.rootPc).toBe(9)
    expect(cands[0]!.roman === 'i' || cands[0]!.roman === 'i7').toBe(true)
  })

  it('implies V7 (not I) when melody is ^5 resolving to ^1', () => {
    const cands = inferImpliedChordsFromMelody({
      melodyMidi: 67, // G = ^5 in C
      tonality: 0,
      mode: 'major',
      nextMelodyMidi: 60, // C = ^1
      limit: 3,
    })
    expect(cands[0]!.rootPc).toBe(7)
    expect(cands[0]!.natureId).toBe('seventh')
    expect(cands[0]!.roman).toBe('V7')
    expect(cands[0]!.cadenceHint?.id).toBe('auth_v7_i')
  })

  it('implies V7 when melody is ^7 resolving to ^1', () => {
    const cands = inferImpliedChordsFromMelody({
      melodyMidi: 59, // B
      tonality: 0,
      mode: 'major',
      nextMelodyMidi: 60,
      limit: 3,
    })
    expect(cands[0]!.rootPc).toBe(7)
    expect(cands[0]!.natureId === 'seventh' || cands[0]!.natureId === 'major').toBe(true)
    expect(cands[0]!.cadenceHint?.id).toBe('lead_tone_v7')
  })

  it('implies I7 when tonic melody aims at ^4 (I7→IV)', () => {
    const cands = inferImpliedChordsFromMelody({
      melodyMidi: 60,
      tonality: 0,
      mode: 'major',
      nextMelodyMidi: 65,
      limit: 3,
    })
    expect(cands[0]!.rootPc).toBe(0)
    expect(cands[0]!.natureId).toBe('seventh')
    expect(cands[0]!.cadenceHint?.id).toBe('primary_dom7')
  })

  it('builds analysis stacks only for uncovered bare moments', () => {
    const existing = [
      stack(0, 480, { tenor: 67, lead: 64, bari: 60, bass: 48 }, 'major'),
    ]
    const implied = impliedStacksForBareMelody({
      moments: [
        { startTick: 0, durationTicks: 480, midi: 64 },
        { startTick: 480, durationTicks: 480, midi: 65 },
      ],
      existingStacks: existing,
      tonality: 0,
      mode: 'major',
    })
    expect(implied.every((s) => s.startTick !== 0)).toBe(true)
    expect(melodyOnsetCoveredByStack(0, existing)).toBe(true)
  })
})
