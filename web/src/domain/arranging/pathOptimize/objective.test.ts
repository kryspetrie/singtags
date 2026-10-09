/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { createEmptyArrangement, type ChordStack } from '../types'
import {
  incompleteFinalCost,
  meanRing,
  muddyBassCost,
  nonTonicFinalCost,
  scorePath,
} from './objective'
import { weightsFromRisk } from './types'

function stack(
  partial: Partial<ChordStack> & Pick<ChordStack, 'id' | 'natureId' | 'rootPc'>,
): ChordStack {
  return {
    startTick: 0,
    durationTicks: 480,
    layer: 'primary',
    voicing: '1513',
    spread: false,
    scfGroup: null,
    pillarId: null,
    midi: null,
    ruleTags: [],
    ...partial,
  }
}

describe('pathOptimize objective ring polarity', () => {
  it('meanRing scores major/seventh higher than dim/aug', () => {
    const ringing = [
      stack({ id: 'a', natureId: 'major', rootPc: 0 }),
      stack({ id: 'b', natureId: 'seventh', rootPc: 7 }),
    ]
    const muddy = [
      stack({ id: 'a', natureId: 'dim', rootPc: 0 }),
      stack({ id: 'b', natureId: 'aug', rootPc: 7 }),
    ]
    expect(meanRing(ringing)).toBeGreaterThan(meanRing(muddy))
  })

  it('scorePath prefers ringing majors over high-tier natures at Basic', () => {
    const base = createEmptyArrangement('ring')
    base.melody = [
      { id: 'm0', midi: 60, startTick: 0, durationTicks: 480, role: 'pmn' },
      { id: 'm1', midi: 62, startTick: 480, durationTicks: 480, role: 'smn' },
    ]
    const midi = { bass: 48, bari: 55, lead: 60, tenor: 67 }
    // Both paths end on tonic home so nonTonicFinal doesn’t dominate the comparison.
    const homeMidi = { bass: 48, bari: 52, lead: 60, tenor: 70 }
    const majorPath = {
      ...base,
      stacks: [
        stack({
          id: 's0',
          natureId: 'major',
          rootPc: 0,
          startTick: 0,
          midi,
        }),
        stack({
          id: 's1',
          natureId: 'seventh',
          rootPc: 0,
          startTick: 480,
          midi: homeMidi,
        }),
      ],
    }
    const dimPath = {
      ...base,
      stacks: [
        stack({
          id: 's0',
          natureId: 'dim',
          rootPc: 0,
          startTick: 0,
          midi,
        }),
        stack({
          id: 's1',
          natureId: 'seventh',
          rootPc: 0,
          startTick: 480,
          midi: homeMidi,
        }),
      ],
    }
    const w = weightsFromRisk(0.2)
    expect(scorePath(majorPath, w)).toBeGreaterThan(scorePath(dimPath, w))
  })

  it('muddyBassCost penalizes bass below TTBB floor', () => {
    const low = [
      stack({
        id: 'a',
        natureId: 'major',
        rootPc: 0,
        midi: { bass: 36, bari: 48, lead: 60, tenor: 67 },
      }),
    ]
    const ok = [
      stack({
        id: 'a',
        natureId: 'major',
        rootPc: 0,
        midi: { bass: 48, bari: 55, lead: 60, tenor: 67 },
      }),
    ]
    expect(muddyBassCost(low)).toBeGreaterThan(muddyBassCost(ok))
  })

  it('incompleteFinalCost prefers root-doubled major finales over I7', () => {
    const base = createEmptyArrangement('final')
    base.tonality = 0
    const triadFinal = {
      ...base,
      stacks: [
        stack({
          id: 's0',
          natureId: 'major',
          rootPc: 0,
          startTick: 0,
          // C major with root doubled (C–G–C–E)
          midi: { bass: 48, bari: 55, lead: 60, tenor: 64 },
        }),
      ],
    }
    const thirdDoubleFinal = {
      ...base,
      stacks: [
        stack({
          id: 's0',
          natureId: 'major',
          rootPc: 0,
          startTick: 0,
          // Doubled 3rd — manuals call this ugly
          midi: { bass: 52, bari: 55, lead: 64, tenor: 60 },
        }),
      ],
    }
    const seventhFinal = {
      ...base,
      stacks: [
        stack({
          id: 's0',
          natureId: 'seventh',
          rootPc: 0,
          startTick: 0,
          // C7: C–E–G–B♭ — four distinct pitch classes
          midi: { bass: 48, bari: 52, lead: 67, tenor: 70 },
        }),
      ],
    }
    expect(incompleteFinalCost(triadFinal)).toBe(0)
    expect(incompleteFinalCost(thirdDoubleFinal)).toBeGreaterThan(incompleteFinalCost(triadFinal))
    expect(incompleteFinalCost(seventhFinal)).toBeGreaterThanOrEqual(9)
    const w = weightsFromRisk(0.2)
    expect(scorePath(triadFinal, w)).toBeGreaterThan(scorePath(seventhFinal, w))
  })

  it('nonTonicFinalCost penalizes hanging V7 endings', () => {
    const base = createEmptyArrangement('hang')
    base.tonality = 0
    const v7Final = {
      ...base,
      stacks: [
        stack({
          id: 's0',
          natureId: 'seventh',
          rootPc: 7,
          startTick: 0,
          midi: { bass: 43, bari: 50, lead: 59, tenor: 62 },
        }),
      ],
    }
    const iFinal = {
      ...base,
      stacks: [
        stack({
          id: 's0',
          natureId: 'seventh',
          rootPc: 0,
          startTick: 0,
          midi: { bass: 48, bari: 52, lead: 67, tenor: 70 },
        }),
      ],
    }
    expect(nonTonicFinalCost(v7Final)).toBeGreaterThan(10)
    expect(nonTonicFinalCost(iFinal)).toBe(0)
    const w = weightsFromRisk(0.2)
    expect(scorePath(iFinal, w)).toBeGreaterThan(scorePath(v7Final, w))
  })
})
