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
  it('implies I for tonic melody in C major', () => {
    const cands = inferImpliedChordsFromMelody({
      melodyMidi: 60, // C
      tonality: 0,
      mode: 'major',
      limit: 3,
    })
    expect(cands.length).toBeGreaterThanOrEqual(1)
    expect(cands[0]!.rootPc).toBe(0)
    expect(['major', 'seventh']).toContain(cands[0]!.natureId)
    expect(cands[0]!.roman === 'I' || cands[0]!.roman === 'I7').toBe(true)
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

  it('builds analysis stacks only for uncovered bare moments', () => {
    const existing = [
      stack(0, 480, { tenor: 67, lead: 64, bari: 60, bass: 48 }, 'major'),
    ]
    const implied = impliedStacksForBareMelody({
      moments: [
        { startTick: 0, durationTicks: 480, midi: 64 },
        { startTick: 480, durationTicks: 480, midi: 67 },
      ],
      existingStacks: existing,
      tonality: 0,
      mode: 'major',
    })
    expect(implied.every((s) => s.startTick !== 0)).toBe(true)
    expect(implied.some((s) => s.startTick === 480)).toBe(true)
    expect(implied[0]!.midi).toBeNull()
    expect(implied[0]!.natureId).not.toBe('unknown')
  })

  it('detects coverage by sounding harmony stack', () => {
    const stacks = [stack(0, 960, { tenor: 67, lead: 64, bari: 60, bass: 48 })]
    expect(melodyOnsetCoveredByStack(0, stacks)).toBe(true)
    expect(melodyOnsetCoveredByStack(480, stacks)).toBe(true)
    expect(melodyOnsetCoveredByStack(960, stacks)).toBe(false)
  })
})
